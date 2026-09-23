// Streaming endpoint for the studio chat: server-sent events, one per agent action.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/studio/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { userClientFromRequest } = await import("@/lib/supabase-user.server");
        const auth = await userClientFromRequest(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json().catch(() => ({}))) as {
          botId?: string;
          message?: string;
        };
        const botId = body.botId;
        const message = body.message?.trim().slice(0, 6000);
        if (!botId || !message) return new Response("Bad request", { status: 400 });

        const { runAgent } = await import("@/lib/studio-agent.server");
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          async start(controller) {
            const send = (payload: unknown) =>
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            try {
              for await (const event of runAgent({
                supabase: auth.supabase,
                userId: auth.userId,
                botId,
                message,
                signal: request.signal,
              })) {
                send(event);
              }
            } catch (error) {
              send({ t: "error", v: error instanceof Error ? error.message : String(error) });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            connection: "keep-alive",
          },
        });
      },
    },
  },
});
