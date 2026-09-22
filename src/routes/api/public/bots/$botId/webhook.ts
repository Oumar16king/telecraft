// One webhook per bot: Telegram posts updates here and the engine answers.
import { createFileRoute } from "@tanstack/react-router";

type TelegramUpdate = {
  message?: {
    chat?: { id?: number };
    from?: { first_name?: string; username?: string };
    text?: string;
  };
  edited_message?: TelegramUpdate["message"];
};

export const Route = createFileRoute("/api/public/bots/$botId/webhook")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: bot } = await supabaseAdmin
          .from("bots")
          .select("id, user_id, spec, telegram_token, webhook_secret")
          .eq("id", params.botId)
          .maybeSingle();

        if (!bot) return new Response("Not found", { status: 404 });

        const secret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (secret !== bot.webhook_secret) return new Response("Unauthorized", { status: 401 });

        const update = (await request.json()) as TelegramUpdate;
        const message = update.message ?? update.edited_message;
        const chatId = message?.chat?.id;
        if (!chatId) return Response.json({ ok: true, ignored: true });

        const text = message?.text ?? "";
        const firstName = message?.from?.first_name ?? "ami";

        const { data: secretRows } = await supabaseAdmin
          .from("bot_secrets")
          .select("key, value")
          .eq("bot_id", bot.id);
        const secrets = Object.fromEntries((secretRows ?? []).map((s) => [s.key, s.value]));

        const { runBot } = await import("@/lib/bot-engine.server");
        const result = await runBot(
          bot.spec,
          { text, firstName, chatId: String(chatId) },
          secrets,
        );

        if (bot.telegram_token && result.text) {
          const payload: Record<string, unknown> = {
            chat_id: chatId,
            text: result.text.slice(0, 4000),
          };
          if (result.buttons?.length) {
            payload["reply_markup"] = {
              keyboard: result.buttons.map((row) => row.map((label) => ({ text: label }))),
              resize_keyboard: true,
            };
          }
          const sent = await fetch(`https://api.telegram.org/bot${bot.telegram_token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!sent.ok) console.error(`sendMessage failed [${sent.status}]: ${await sent.text()}`);
        }

        await supabaseAdmin.from("bot_messages").insert([
          {
            bot_id: bot.id,
            user_id: bot.user_id,
            chat_id: String(chatId),
            telegram_user: message?.from?.username ?? firstName,
            direction: "in",
            text,
          },
          {
            bot_id: bot.id,
            user_id: bot.user_id,
            chat_id: String(chatId),
            direction: "out",
            text: result.text,
            handler: result.handler,
          },
        ]);

        return Response.json({ ok: true });
      },
    },
  },
});
