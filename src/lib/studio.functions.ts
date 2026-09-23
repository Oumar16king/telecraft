import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProjectFile = { path: string; content: string };

/* ------------------------------ files ------------------------------ */

export const listBotFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { botId: string }) => ({ botId: input.botId }))
  .handler(async ({ data, context }) => {
    const { data: files } = await context.supabase
      .from("bot_files")
      .select("id, path, content, updated_at")
      .eq("bot_id", data.botId)
      .order("path", { ascending: true });
    return files ?? [];
  });

export const saveBotFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { botId: string; path: string; content: string }) => {
    const path = input.path?.trim().replace(/^\/+/, "");
    if (!path) throw new Error("Chemin de fichier manquant.");
    return { botId: input.botId, path, content: input.content ?? "" };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("bot_files")
      .select("id")
      .eq("bot_id", data.botId)
      .eq("path", data.path)
      .maybeSingle();
    if (existing) {
      await supabase.from("bot_files").update({ content: data.content }).eq("id", existing.id);
    } else {
      await supabase.from("bot_files").insert({
        bot_id: data.botId,
        user_id: userId,
        path: data.path,
        content: data.content,
      });
    }
    return { ok: true };
  });

export const deleteBotFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { botId: string; path: string }) => ({
    botId: input.botId,
    path: input.path,
  }))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("bot_files")
      .delete()
      .eq("bot_id", data.botId)
      .eq("path", data.path);
    return { ok: true };
  });

/* ------------------------------ versions ------------------------------ */

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
      .select("id, version, files")
      .eq("id", data.versionId)
      .maybeSingle();
    if (!version) throw new Error("Version introuvable.");

    const files = (Array.isArray(version.files) ? version.files : []) as ProjectFile[];
    await supabase.from("bot_files").delete().eq("bot_id", data.botId);
    if (files.length) {
      await supabase.from("bot_files").insert(
        files.map((f) => ({
          bot_id: data.botId,
          user_id: userId,
          path: f.path,
          content: f.content,
        })),
      );
    }

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
      files: files as unknown as never,
    });

    return { ok: true, version: version.version, files: files.length };
  });

/* ------------------------------ export .zip ------------------------------ */

const READ_ME = (name: string) => `# ${name}

Bot Telegram exporté depuis Telecraft.

## Installation

1. \`npm install\`
2. Crée un fichier \`.env\` :

\`\`\`
TELEGRAM_TOKEN=le_token_de_ton_bot
\`\`\`

3. \`npm start\` (le lanceur utilise le long polling, aucun serveur web nécessaire).

## Structure

- \`bot.js\` : point d'entrée, exporte \`handleUpdate(update, api, env)\`.
- \`commands/\` et \`lib/\` : la logique du bot.
- \`run.js\` : lanceur autonome (polling + mémoire persistante dans \`store.json\`).
`;

const RUNNER = `// Lanceur autonome : long polling Telegram + mémoire persistante sur disque.
const fs = require("fs");
const path = require("path");
const bot = require("./bot.js");

const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) throw new Error("TELEGRAM_TOKEN manquant.");
const BASE = "https://api.telegram.org/bot" + TOKEN + "/";
const STORE_FILE = path.join(__dirname, "store.json");

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return {};
  }
}
function writeStore(data) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
}

const store = {
  async get(key) {
    return readStore()[key];
  },
  async set(key, value) {
    const data = readStore();
    data[key] = value;
    writeStore(data);
  },
  async delete(key) {
    const data = readStore();
    delete data[key];
    writeStore(data);
  },
  async list(prefix = "") {
    return Object.entries(readStore())
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => ({ key, value }));
  },
};

async function call(method, payload = {}) {
  const response = await fetch(BASE + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!body.ok) throw new Error("Telegram " + method + ": " + body.description);
  return body.result;
}

const api = new Proxy({ call }, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return (payload = {}) => call(prop, payload);
  },
});

const env = { secrets: process.env, store, log: console.log };

(async () => {
  await call("deleteWebhook", { drop_pending_updates: false });
  let offset = 0;
  console.log("Bot en écoute…");
  for (;;) {
    try {
      const updates = await call("getUpdates", { offset, timeout: 30 });
      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          await bot.handleUpdate(update, api, env);
        } catch (error) {
          console.error("handleUpdate:", error.message);
        }
      }
    } catch (error) {
      console.error("polling:", error.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
})();
`;

export const exportBotZip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { botId: string }) => ({ botId: input.botId }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: bot } = await supabase
      .from("bots")
      .select("id, name")
      .eq("id", data.botId)
      .maybeSingle();
    if (!bot) throw new Error("Bot introuvable.");

    const { data: files } = await supabase
      .from("bot_files")
      .select("path, content")
      .eq("bot_id", data.botId);

    const slug =
      bot.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "bot-telegram";

    const entries: ProjectFile[] = [...(files ?? [])];
    if (!entries.some((f) => f.path === "package.json")) {
      entries.push({
        path: "package.json",
        content: `${JSON.stringify(
          {
            name: slug,
            version: "1.0.0",
            private: true,
            main: "bot.js",
            scripts: { start: "node run.js" },
          },
          null,
          2,
        )}\n`,
      });
    }
    if (!entries.some((f) => f.path === "README.md")) {
      entries.push({ path: "README.md", content: READ_ME(bot.name) });
    }
    if (!entries.some((f) => f.path === "run.js")) {
      entries.push({ path: "run.js", content: RUNNER });
    }

    const { createZip, toBase64 } = await import("./zip.server");
    return { filename: `${slug}.zip`, base64: toBase64(createZip(entries)) };
  });

/* ------------------------------ telegram ------------------------------ */

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
      .maybeSingle();
    if (!bot) throw new Error("Bot introuvable.");
    if (!bot.telegram_token) throw new Error("Ajoute d'abord le token BotFather de ton bot.");

    const api = `https://api.telegram.org/bot${bot.telegram_token}`;
    const me = (await (await fetch(`${api}/getMe`)).json()) as {
      ok: boolean;
      description?: string;
      result?: { username?: string };
    };
    if (!me.ok) throw new Error(`Token refusé par Telegram : ${me.description ?? "inconnu"}`);

    const webhookUrl = `${publicOrigin()}/api/public/bots/${bot.id}/webhook`;
    const hook = (await (
      await fetch(`${api}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: bot.webhook_secret,
          allowed_updates: [
            "message",
            "edited_message",
            "channel_post",
            "edited_channel_post",
            "callback_query",
            "inline_query",
            "chat_member",
            "my_chat_member",
            "chat_join_request",
            "poll",
            "poll_answer",
          ],
          drop_pending_updates: true,
        }),
      })
    ).json()) as { ok: boolean; description?: string };
    if (!hook.ok)
      throw new Error(`Telegram a refusé le webhook : ${hook.description ?? "inconnu"}`);

    await supabase
      .from("bots")
      .update({ webhook_status: "active", bot_username: me.result?.username ?? null })
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
      .maybeSingle();
    if (!bot?.telegram_token) throw new Error("Bot introuvable.");
    await fetch(`https://api.telegram.org/bot${bot.telegram_token}/deleteWebhook`, {
      method: "POST",
    });
    await supabase.from("bots").update({ webhook_status: "inactive" }).eq("id", bot.id);
    return { ok: true };
  });
