// One webhook per bot: Telegram posts updates here and the bot's real code runs.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/bots/$botId/webhook")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: bot } = await supabaseAdmin
          .from("bots")
          .select("id, user_id, telegram_token, webhook_secret")
          .eq("id", params.botId)
          .maybeSingle();
        if (!bot) return new Response("Not found", { status: 404 });

        const secret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (secret !== bot.webhook_secret) return new Response("Unauthorized", { status: 401 });
        if (!bot.telegram_token) return Response.json({ ok: true, ignored: true });

        const update = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!update) return Response.json({ ok: true, ignored: true });

        const [{ data: files }, { data: secretRows }] = await Promise.all([
          supabaseAdmin.from("bot_files").select("path, content").eq("bot_id", bot.id),
          supabaseAdmin.from("bot_secrets").select("key, value").eq("bot_id", bot.id),
        ]);

        const store = {
          async get(key: string) {
            const { data } = await supabaseAdmin
              .from("bot_store")
              .select("value")
              .eq("bot_id", bot.id)
              .eq("key", key)
              .maybeSingle();
            return (data?.value as { v?: unknown } | null)?.v;
          },
          async set(key: string, value: unknown) {
            await supabaseAdmin
              .from("bot_store")
              .upsert(
                { bot_id: bot.id, key, value: { v: value } as never, updated_at: new Date().toISOString() },
                { onConflict: "bot_id,key" },
              );
          },
          async delete(key: string) {
            await supabaseAdmin.from("bot_store").delete().eq("bot_id", bot.id).eq("key", key);
          },
          async list(prefix = "") {
            const { data } = await supabaseAdmin
              .from("bot_store")
              .select("key, value")
              .eq("bot_id", bot.id)
              .like("key", `${prefix}%`);
            return (data ?? []).map((row) => ({
              key: row.key,
              value: (row.value as { v?: unknown } | null)?.v,
            }));
          },
        };

        const { runBotUpdate } = await import("@/lib/bot-runtime.server");
        const outcome = await runBotUpdate({
          files: files ?? [],
          token: bot.telegram_token,
          secrets: Object.fromEntries((secretRows ?? []).map((s) => [s.key, s.value])),
          store,
          update,
        });

        const message = (update["message"] ?? update["channel_post"] ?? update["edited_message"]) as
          | { chat?: { id?: number }; from?: { username?: string; first_name?: string }; text?: string }
          | undefined;
        const chatId = message?.chat?.id ? String(message.chat.id) : null;

        const rows: Record<string, unknown>[] = [
          {
            bot_id: bot.id,
            user_id: bot.user_id,
            chat_id: chatId,
            telegram_user: message?.from?.username ?? message?.from?.first_name ?? null,
            direction: "in",
            text: message?.text ?? Object.keys(update).filter((k) => k !== "update_id").join(", "),
          },
        ];
        for (const call of outcome.calls) {
          rows.push({
            bot_id: bot.id,
            user_id: bot.user_id,
            chat_id: chatId,
            direction: "out",
            text: call.ok ? call.method : `${call.method} — échec : ${call.detail}`,
            handler: call.method,
          });
        }
        if (!outcome.ok) {
          rows.push({
            bot_id: bot.id,
            user_id: bot.user_id,
            chat_id: chatId,
            direction: "out",
            text: `Erreur d'exécution : ${outcome.error}`,
            handler: "error",
          });
        }
        for (const log of outcome.logs.slice(0, 20)) {
          rows.push({
            bot_id: bot.id,
            user_id: bot.user_id,
            chat_id: chatId,
            direction: "out",
            text: log,
            handler: "log",
          });
        }
        await supabaseAdmin.from("bot_messages").insert(rows as never);

        return Response.json({ ok: true });
      },
    },
  },
});
