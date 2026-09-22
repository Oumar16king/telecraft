import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeSpec, type BotSpec } from "./bot-spec";

type BotRow = {
  id: string;
  name: string;
  description: string | null;
  telegram_token: string | null;
  webhook_secret: string;
  spec: unknown;
};

const SPEC_GUIDE = `Tu es l'assistant d'un studio de création de bots Telegram (comme Lovable, mais pour des bots).
L'utilisateur t'écrit en langage naturel. À TOI de décider :
- s'il demande une création / modification de logique → mode "build" : tu renvoies la spec complète mise à jour.
- s'il pose une simple question ou discute → mode "chat" : tu réponds seulement, sans toucher à la spec.

Schéma de la spec :
{
  "persona": string,
  "welcome": string,                       // réponse à /start
  "commands": [{ "command": "meteo", "description": "..." }],
  "requiredSecrets": [{ "key": "OPENWEATHER_KEY", "description": "..." }],
  "handlers": [
    {
      "id": "slug-unique",
      "label": "Nom lisible",
      "trigger": { "type": "command", "value": "meteo" }
              | { "type": "keywords", "values": ["salut","bonjour"] }
              | { "type": "regex", "pattern": "^[0-9+\\\\-*/() ]+$" }
              | { "type": "any" }
              | { "type": "fallback" },
      "action": { "type": "reply", "text": "Bonjour {{first_name}}" }
              | { "type": "choice", "options": ["A","B"] }
              | { "type": "calc" }
              | { "type": "ai", "system": "consignes", "useSecret": "OPENAI_API_KEY" }
              | { "type": "http", "method": "GET", "url": "https://api...?key={{secrets.MA_CLE}}&q={{args}}",
                  "headers": {"Authorization": "Bearer {{secrets.MA_CLE}}"},
                  "format": "Explique la météo en une phrase" },
      "buttons": [["Bouton 1","Bouton 2"]]
    }
  ]
}

Règles :
- Variables dans les textes : {{text}}, {{args}}, {{first_name}}, {{chat_id}}. Clés tierces : {{secrets.NOM}}.
- "ai" sans "useSecret" utilise l'IA intégrée de la plateforme.
- Les bots peuvent être de tout genre : calcul, prédiction, météo, gestion de groupe, quiz, support.
- Ordonne les handlers du plus spécifique au plus générique, termine par un "fallback" si utile.
- En mode "build", conserve et fais évoluer la spec existante au lieu de tout réécrire.
- "label" : titre court de la version (ex : "Ajout de /meteo").

Réponds STRICTEMENT avec un objet JSON :
{ "mode": "build" | "chat",
  "reply": "réponse courte en français",
  "label": "titre de la modification (mode build uniquement)",
  "spec": { ...spec complète... }   // seulement en mode build
}`;

function extractJson(raw: string): {
  mode?: string;
  reply?: string;
  label?: string;
  spec?: unknown;
} {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return { mode: "chat", reply: raw.trim() };
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as {
      mode?: string;
      reply?: string;
      label?: string;
      spec?: unknown;
    };
  } catch {
    return { mode: "chat", reply: raw.trim() };
  }
}

export const sendStudioMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { botId: string; message: string }) => {
    if (!input?.botId || !input?.message?.trim()) throw new Error("Message vide.");
    return { botId: input.botId, message: input.message.trim().slice(0, 4000) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: bot, error } = await supabase
      .from("bots")
      .select("id, name, description, spec")
      .eq("id", data.botId)
      .maybeSingle();
    if (error || !bot) throw new Error("Bot introuvable.");

    const { data: history } = await supabase
      .from("studio_messages")
      .select("role, content")
      .eq("bot_id", data.botId)
      .order("created_at", { ascending: true })
      .limit(20);

    const { data: secrets } = await supabase
      .from("bot_secrets")
      .select("key")
      .eq("bot_id", data.botId);

    const { openRouterChat } = await import("./openrouter.server");
    const raw = await openRouterChat([
      { role: "system", content: SPEC_GUIDE },
      {
        role: "user",
        content: `Bot : ${bot.name}\nDescription : ${bot.description ?? "—"}\nClés enregistrées : ${(secrets ?? []).map((s) => s.key).join(", ") || "aucune"}\nSpec actuelle :\n${JSON.stringify(bot.spec ?? { handlers: [] })}`,
      },
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: data.message },
    ]);

    const parsed = extractJson(raw);
    const isBuild = parsed.mode === "build" && parsed.spec;
    const reply = parsed.reply ?? (isBuild ? "Logique mise à jour." : "…");
    let spec: BotSpec | null = null;

    if (isBuild) {
      spec = normalizeSpec(parsed.spec);
      await supabase.from("bots").update({ spec }).eq("id", data.botId);

      const { data: last } = await supabase
        .from("bot_versions")
        .select("version")
        .eq("bot_id", data.botId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      await supabase.from("bot_versions").insert({
        bot_id: data.botId,
        user_id: userId,
        version: (last?.version ?? 0) + 1,
        label: parsed.label ?? data.message.slice(0, 80),
        spec,
      });
    }

    await supabase.from("studio_messages").insert([
      { bot_id: data.botId, user_id: userId, role: "user", content: data.message },
      { bot_id: data.botId, user_id: userId, role: "assistant", content: reply },
    ]);

    return { reply, spec, mode: isBuild ? "build" : "chat" };
  });

export const restoreVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { botId: string; versionId: string }) => ({
    botId: input.botId,
    versionId: input.versionId,
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: version } = await supabase
      .from("bot_versions")
      .select("id, version, spec, label")
      .eq("id", data.versionId)
      .maybeSingle();
    if (!version) throw new Error("Version introuvable.");

    await supabase.from("bots").update({ spec: version.spec }).eq("id", data.botId);

    const { data: last } = await supabase
      .from("bot_versions")
      .select("version")
      .eq("bot_id", data.botId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    await supabase.from("bot_versions").insert({
      bot_id: data.botId,
      user_id: userId,
      version: (last?.version ?? 0) + 1,
      label: `Retour à la version ${version.version}`,
      spec: version.spec,
    });

    return { ok: true, version: version.version };
  });

function publicOrigin(): string {
  const url = new URL(getRequest().url);
  const host = url.host
    .replace(/^id-preview--/, "project--")
    .replace(/^([^.]+)\.lovable\.app$/, (_m, sub: string) =>
      sub.startsWith("project--") && !sub.endsWith("-dev")
        ? `${sub}-dev.lovable.app`
        : `${sub}.lovable.app`,
    );
  return `https://${host}`;
}

export const connectTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { botId: string }) => ({ botId: input.botId }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: bot } = await supabase
      .from("bots")
      .select("id, telegram_token, webhook_secret")
      .eq("id", data.botId)
      .maybeSingle<BotRow>();
    if (!bot) throw new Error("Bot introuvable.");
    if (!bot.telegram_token) throw new Error("Ajoute d'abord le token BotFather de ton bot.");

    const api = `https://api.telegram.org/bot${bot.telegram_token}`;
    const meResponse = await fetch(`${api}/getMe`);
    const me = (await meResponse.json()) as {
      ok: boolean;
      description?: string;
      result?: { username?: string };
    };
    if (!me.ok) throw new Error(`Token refusé par Telegram : ${me.description ?? "inconnu"}`);

    const webhookUrl = `${publicOrigin()}/api/public/bots/${bot.id}/webhook`;
    const hookResponse = await fetch(`${api}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: bot.webhook_secret,
        allowed_updates: ["message", "edited_message", "callback_query"],
        drop_pending_updates: true,
      }),
    });
    const hook = (await hookResponse.json()) as { ok: boolean; description?: string };
    if (!hook.ok)
      throw new Error(`Telegram a refusé le webhook : ${hook.description ?? "inconnu"}`);

    await supabase
      .from("bots")
      .update({
        webhook_status: "active",
        bot_username: me.result?.username ?? null,
      })
      .eq("id", bot.id);

    return { username: me.result?.username ?? null, webhookUrl };
  });

export const disconnectTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { botId: string }) => ({ botId: input.botId }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: bot } = await supabase
      .from("bots")
      .select("id, telegram_token")
      .eq("id", data.botId)
      .maybeSingle<BotRow>();
    if (!bot?.telegram_token) throw new Error("Bot introuvable.");
    await fetch(`https://api.telegram.org/bot${bot.telegram_token}/deleteWebhook`, {
      method: "POST",
    });
    await supabase.from("bots").update({ webhook_status: "inactive" }).eq("id", bot.id);
    return { ok: true };
  });
