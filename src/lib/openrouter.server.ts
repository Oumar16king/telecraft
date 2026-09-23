// Telecraft's own brain: OpenRouter with 3 powerful free models and 3 keys.
// These keys belong to the platform (they build the bots); they are never given to a bot.

export const FREE_MODELS = [
  "thinkingmachines/inkling:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nex-agi/nex-n2.5-pro:free",
] as const;

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export function openRouterKeys(): string[] {
  return [
    process.env["OPENROUTER_KEY_1"],
    process.env["OPENROUTER_KEY_2"],
    process.env["OPENROUTER_KEY_3"],
  ].filter((k): k is string => Boolean(k));
}

export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_calls"; calls: ToolCall[] };

type StreamChunk = {
  choices?: {
    delta?: {
      content?: string | null;
      reasoning?: string | null;
      tool_calls?: {
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
  error?: { message?: string };
};

type RequestBody = {
  messages: ChatMessage[];
  tools?: unknown[];
  temperature?: number;
};

async function openStream(
  model: string,
  key: string,
  body: RequestBody,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "X-Title": "Telecraft",
    },
    body: JSON.stringify({
      model,
      stream: true,
      reasoning: { enabled: true },
      ...body,
    }),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenRouter ${response.status}: ${detail.slice(0, 300)}`);
  }
  return response;
}

/** Streams one assistant turn, trying each free model with each available key. */
export async function* streamAssistantTurn(
  body: RequestBody,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const keys = openRouterKeys();
  if (!keys.length) throw new Error("Aucune clé OpenRouter configurée.");

  let response: Response | undefined;
  let lastError = "IA indisponible.";
  for (const model of FREE_MODELS) {
    for (const key of keys) {
      try {
        response = await openStream(model, key, body, signal);
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    if (response) break;
  }
  if (!response?.body) throw new Error(lastError);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const pending = new Map<number, ToolCall>();
  let buffer = "";
  let done = false;

  while (!done) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      // OpenRouter sends ": OPENROUTER PROCESSING" keep-alive comments.
      if (!line || line.startsWith(":")) continue;
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        done = true;
        break;
      }
      let chunk: StreamChunk;
      try {
        chunk = JSON.parse(data) as StreamChunk;
      } catch {
        continue;
      }
      if (chunk.error?.message) throw new Error(chunk.error.message);
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.reasoning) yield { type: "reasoning", text: delta.reasoning };
      if (delta.content) yield { type: "text", text: delta.content };
      for (const call of delta.tool_calls ?? []) {
        const index = call.index ?? 0;
        const current = pending.get(index) ?? { id: "", name: "", arguments: "" };
        pending.set(index, {
          id: call.id ?? current.id,
          name: call.function?.name ?? current.name,
          arguments: current.arguments + (call.function?.arguments ?? ""),
        });
      }
    }
  }

  const calls = [...pending.values()].filter((c) => c.name);
  if (calls.length) yield { type: "tool_calls", calls };
}

/** Single non-streaming completion (used for short internal helpers). */
export async function openRouterChat(
  messages: ChatMessage[],
  options: { model?: string; plugins?: unknown[] } = {},
): Promise<string> {
  const keys = openRouterKeys();
  if (!keys.length) throw new Error("Aucune clé OpenRouter configurée.");
  const models = options.model ? [options.model] : [...FREE_MODELS];
  let lastError = "IA indisponible.";

  for (const model of models) {
    for (const key of keys) {
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            "X-Title": "Telecraft",
          },
          body: JSON.stringify({
            model,
            messages,
            ...(options.plugins ? { plugins: options.plugins } : {}),
          }),
          signal: AbortSignal.timeout(120_000),
        });
        const payload = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
          error?: { message?: string };
        };
        const text = payload.choices?.[0]?.message?.content?.trim();
        if (text) return text;
        lastError = payload.error?.message ?? `Réponse vide (${response.status}).`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
  }
  throw new Error(`IA indisponible : ${lastError}`);
}
