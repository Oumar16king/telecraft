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

const SPEC_GUIDE = `Tu es l'architecte d'un studio de "vibe coding" pour bots Telegram.
Tu traduis une demande en langage naturel en une SPEC JSON exécutée par un moteur maison.

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
- Variables disponibles dans les textes : {{text}}, {{args}}, {{first_name}}, {{chat_id}}. Les clés tierces : {{secrets.NOM}}.
- "ai" sans "useSecret" utilise l'IA intégrée de la plateforme. Avec "useSecret", la clé de l'utilisateur est utilisée.
- Les bots peuvent être de tout genre : calcul, prédiction, météo, gestion de groupe, quiz, support, etc. N'impose pas un chatbot IA.
- Ordonne les handlers du plus spécifique au plus générique, termine par un "fallback" quand c'est utile.
- Déclare dans requiredSecrets chaque clé tierce nécessaire.
- Conserve et fais évoluer la spec existante au lieu de tout réécrire, sauf demande contraire.

Réponds STRICTEMENT avec un objet JSON :
{ "reply": "explication courte en français de ce que tu viens de construire",
  "spec": { ...la spec complète... } }`;

function extractJson(raw: string): { reply?: string; spec?: unknown } {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Réponse IA illisible.");
  return JSON.parse(candidate.slice(start, end + 1)) as { reply?: string; spec?: unknown };
}

async function chat(messages: { role: string; content: string }[]): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY manquante.");
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "openai/gpt-6-astra", reasoning_effort: "low", messages }),
  });
  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 429) throw new Error("Trop de requêtes IA, réessaie dans un instant.");
    if (response.status === 402)
      throw new Error(
        "Crédits IA épuisés pour cet espace de travail. Ajoute des crédits pour continuer.",
      );
    throw new Error(`IA indisponible [${response.status}] ${detail.slice(0, 300)}`);
  }
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return payload.choices?.[0]?.message?.content ?? "";
}

export const buildBotLogic = createServerFn({ method: "POST" })
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

    const raw = await chat([
      { role: "system", content: SPEC_GUIDE },
      {
        role: "user",
        content: `Bot : ${bot.name}\nDescription : ${bot.description ?? "—"}\nClés déjà enregistrées : ${(secrets ?? []).map((s) => s.key).join(", ") || "aucune"}\nSpec actuelle :\n${JSON.stringify(bot.spec ?? { handlers: [] })}`,
      },
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: data.message },
    ]);

    const parsed = extractJson(raw);
    const spec: BotSpec = normalizeSpec(parsed.spec);
    const reply = parsed.reply ?? "Spec mise à jour.";

    await supabase.from("bots").update({ spec }).eq("id", data.botId);
    await supabase.from("studio_messages").insert([
      { bot_id: data.botId, user_id: userId, role: "user", content: data.message },
      { bot_id: data.botId, user_id: userId, role: "assistant", content: reply },
    ]);

    return { reply, spec };
  });

export const simulateMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { botId: string; text: string }) => ({
    botId: input.botId,
    text: (input.text ?? "").slice(0, 2000),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: bot } = await supabase
      .from("bots")
      .select("id, spec")
      .eq("id", data.botId)
      .maybeSingle();
    if (!bot) throw new Error("Bot introuvable.");

    const { data: secretRows } = await supabase
      .from("bot_secrets")
      .select("key, value")
      .eq("bot_id", data.botId);
    const secrets = Object.fromEntries((secretRows ?? []).map((s) => [s.key, s.value]));

    const { runBot } = await import("./bot-engine.server");
    const result = await runBot(
      bot.spec,
      { text: data.text, firstName: "Testeur", chatId: "simulateur" },
      secrets,
    );

    await supabase.from("bot_messages").insert([
      {
        bot_id: data.botId,
        user_id: userId,
        chat_id: "simulateur",
        telegram_user: "Testeur",
        direction: "in",
        text: data.text,
        simulated: true,
      },
      {
        bot_id: data.botId,
        user_id: userId,
        chat_id: "simulateur",
        direction: "out",
        text: result.text,
        handler: result.handler,
        simulated: true,
      },
    ]);

    return result;
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
