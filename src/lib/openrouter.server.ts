// Shared OpenRouter client: 3 powerful free models, 3 keys, automatic fallback.

export const FREE_MODELS = [
  "nex-agi/nex-n2.5-pro:free",
  "dots-studio/dots-3-note-preview:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
] as const;

function keys(): string[] {
  return [
    process.env["OPENROUTER_KEY_1"],
    process.env["OPENROUTER_KEY_2"],
    process.env["OPENROUTER_KEY_3"],
  ].filter((k): k is string => Boolean(k));
}

export type ChatMessage = { role: string; content: string };

/** Calls OpenRouter, trying each free model with each available key. */
export async function openRouterChat(
  messages: ChatMessage[],
  options: { apiKey?: string; model?: string; maxTokens?: number } = {},
): Promise<string> {
  const candidateKeys = options.apiKey ? [options.apiKey] : keys();
  if (!candidateKeys.length) throw new Error("Aucune clé IA configurée.");
  const models = options.model ? [options.model] : [...FREE_MODELS];

  let lastError = "IA indisponible.";
  for (const model of models) {
    for (const key of candidateKeys) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            messages,
            ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
          }),
          // A stuck free model should hand over to the next one instead of hanging.
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
