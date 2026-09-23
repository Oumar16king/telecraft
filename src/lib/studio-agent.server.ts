// The Telecraft agent loop: streams reasoning/text, calls file tools, records activity.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { systemPrompt } from "./agent-knowledge";
import { streamAssistantTurn, openRouterChat, type ChatMessage } from "./openrouter.server";

export type AgentEvent =
  | { t: "text"; v: string }
  | { t: "reasoning"; v: string }
  | { t: "thought"; ms: number; detail: string }
  | { t: "action"; type: string; label: string; detail: string }
  | { t: "done" }
  | { t: "error"; v: string };

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "Liste tous les fichiers du projet du bot.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Lit le contenu complet d'un fichier du projet.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Crée ou remplace un fichier avec son contenu COMPLET.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Supprime un fichier du projet.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Recherche une information à jour sur le web.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description: "Termine le travail avec un résumé pour l'utilisateur.",
      parameters: {
        type: "object",
        properties: { summary: { type: "string" }, label: { type: "string" } },
        required: ["summary"],
      },
    },
  },
];

type Ctx = {
  supabase: SupabaseClient<Database>;
  userId: string;
  botId: string;
  message: string;
  signal?: AbortSignal;
};

export async function* runAgent(ctx: Ctx): AsyncGenerator<AgentEvent> {
  const { supabase, userId, botId } = ctx;
  const turnId = crypto.randomUUID();
  let seq = 0;

  const record = async (event: {
    type: string;
    label: string;
    detail?: string;
    durationMs?: number;
  }) => {
    seq += 1;
    await supabase.from("studio_events").insert({
      bot_id: botId,
      user_id: userId,
      turn_id: turnId,
      seq,
      type: event.type,
      label: event.label,
      detail: event.detail ?? null,
      duration_ms: event.durationMs ?? null,
    });
  };

  const { data: bot } = await supabase
    .from("bots")
    .select("id, name, description, bot_username, webhook_status")
    .eq("id", botId)
    .maybeSingle();
  if (!bot) {
    yield { t: "error", v: "Bot introuvable." };
    return;
  }

  await supabase.from("studio_messages").insert({
    bot_id: botId,
    user_id: userId,
    role: "user",
    content: ctx.message,
    turn_id: turnId,
  });

  const loadFiles = async () => {
    const { data } = await supabase
      .from("bot_files")
      .select("path, content")
      .eq("bot_id", botId)
      .order("path");
    return data ?? [];
  };

  const files = await loadFiles();
  const { data: secrets } = await supabase.from("bot_secrets").select("key").eq("bot_id", botId);
  const { data: history } = await supabase
    .from("studio_messages")
    .select("role, content")
    .eq("bot_id", botId)
    .order("created_at", { ascending: true })
    .limit(24);

  const context = `# Projet actuel
Bot : ${bot.name}${bot.bot_username ? ` (@${bot.bot_username})` : ""}
Description : ${bot.description ?? "—"}
Connexion Telegram : ${bot.webhook_status === "active" ? "en ligne" : "hors ligne"}
Clés disponibles dans env.secrets : ${(secrets ?? []).map((s) => s.key).join(", ") || "aucune"}
Fichiers existants :
${files.length ? files.map((f) => `- ${f.path} (${f.content.length} caractères)`).join("\n") : "(projet vide — crée bot.js)"}`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(context) },
    ...(history ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-12)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];
  if (messages[messages.length - 1]?.content !== ctx.message) {
    messages.push({ role: "user", content: ctx.message });
  }

  let changed = false;
  let label = ctx.message.slice(0, 80);
  let finalText = "";

  for (let step = 0; step < 14; step += 1) {
    let text = "";
    let reasoning = "";
    let calls: { id: string; name: string; arguments: string }[] = [];
    const startedAt = Date.now();

    try {
      for await (const event of streamAssistantTurn(
        { messages, tools: TOOLS, temperature: 0.3 },
        ctx.signal,
      )) {
        if (event.type === "reasoning") {
          reasoning += event.text;
          yield { t: "reasoning", v: event.text };
        } else if (event.type === "text") {
          text += event.text;
          yield { t: "text", v: event.text };
        } else {
          calls = event.calls;
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await record({ type: "error", label: "Erreur IA", detail });
      yield { t: "error", v: detail };
      return;
    }

    if (reasoning.trim()) {
      const ms = Date.now() - startedAt;
      await record({
        type: "thought",
        label: `Réfléchi pendant ${Math.max(1, Math.round(ms / 1000))} s`,
        detail: reasoning,
        durationMs: ms,
      });
      yield { t: "thought", ms, detail: reasoning };
    }

    if (!calls.length) {
      finalText = text.trim() || finalText;
      break;
    }

    messages.push({
      role: "assistant",
      content: text,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: "function" as const,
        function: { name: c.name, arguments: c.arguments },
      })),
    });

    let finished = false;
    for (const call of calls) {
      let args: Record<string, string> = {};
      try {
        args = JSON.parse(call.arguments || "{}") as Record<string, string>;
      } catch {
        args = {};
      }
      let result = "";

      if (call.name === "list_files") {
        const current = await loadFiles();
        result = current.length
          ? current.map((f) => f.path).join("\n")
          : "(aucun fichier pour l'instant)";
        await record({ type: "list", label: "Listé les fichiers", detail: result });
        yield { t: "action", type: "list", label: "Listé les fichiers", detail: result };
      } else if (call.name === "read_file") {
        const path = (args["path"] ?? "").replace(/^\/+/, "");
        const { data: file } = await supabase
          .from("bot_files")
          .select("content")
          .eq("bot_id", botId)
          .eq("path", path)
          .maybeSingle();
        result = file?.content ?? `Fichier introuvable : ${path}`;
        await record({ type: "read", label: `Lu ${path}`, detail: result });
        yield { t: "action", type: "read", label: `Lu ${path}`, detail: result };
      } else if (call.name === "write_file") {
        const path = (args["path"] ?? "").replace(/^\/+/, "");
        const content = args["content"] ?? "";
        if (!path) {
          result = "Chemin manquant.";
        } else {
          const { data: existing } = await supabase
            .from("bot_files")
            .select("id")
            .eq("bot_id", botId)
            .eq("path", path)
            .maybeSingle();
          if (existing) {
            await supabase.from("bot_files").update({ content }).eq("id", existing.id);
          } else {
            await supabase
              .from("bot_files")
              .insert({ bot_id: botId, user_id: userId, path, content });
          }
          changed = true;
          result = `Enregistré ${path} (${content.length} caractères).`;
          const verb = existing ? "Modifié" : "Créé";
          await record({ type: "write", label: `${verb} ${path}`, detail: content });
          yield { t: "action", type: "write", label: `${verb} ${path}`, detail: content };
        }
      } else if (call.name === "delete_file") {
        const path = (args["path"] ?? "").replace(/^\/+/, "");
        await supabase.from("bot_files").delete().eq("bot_id", botId).eq("path", path);
        changed = true;
        result = `Supprimé ${path}.`;
        await record({ type: "delete", label: `Supprimé ${path}`, detail: path });
        yield { t: "action", type: "delete", label: `Supprimé ${path}`, detail: path };
      } else if (call.name === "web_search") {
        const query = args["query"] ?? "";
        try {
          result = await openRouterChat(
            [
              {
                role: "user",
                content: `Recherche sur le web et réponds de façon factuelle et concise (avec sources) : ${query}`,
              },
            ],
            { plugins: [{ id: "web" }] },
          );
        } catch (error) {
          result = `Recherche impossible : ${error instanceof Error ? error.message : String(error)}`;
        }
        await record({
          type: "search",
          label: `Recherche web : ${query}`,
          detail: result,
        });
        yield { t: "action", type: "search", label: `Recherche web : ${query}`, detail: result };
      } else if (call.name === "finish") {
        finalText = args["summary"] ?? text.trim();
        if (args["label"]) label = args["label"];
        finished = true;
        result = "ok";
      } else {
        result = `Outil inconnu : ${call.name}`;
      }

      messages.push({ role: "tool", tool_call_id: call.id, content: result.slice(0, 20000) });
    }

    if (finished) break;
  }

  if (!finalText) finalText = "C'est fait.";

  if (changed) {
    const snapshot = await loadFiles();
    const { data: last } = await supabase
      .from("bot_versions")
      .select("version")
      .eq("bot_id", botId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    await supabase.from("bot_versions").insert({
      bot_id: botId,
      user_id: userId,
      version: (last?.version ?? 0) + 1,
      label,
      files: snapshot as unknown as never,
    });
  }

  await supabase.from("studio_messages").insert({
    bot_id: botId,
    user_id: userId,
    role: "assistant",
    content: finalText,
    turn_id: turnId,
  });

  if (!finalText.trim().length) yield { t: "text", v: finalText };
  yield { t: "done" };
}
