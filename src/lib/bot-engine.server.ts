// The execution engine: turns an incoming Telegram message into a reply,
// following the bot's spec. Runs entirely inside this app (no VPS).

import { normalizeSpec, type Action, type BotSpec, type Handler } from "./bot-spec";

export type IncomingMessage = {
  text: string;
  firstName: string;
  chatId: string;
};

export type EngineResult = {
  text: string;
  buttons?: string[][];
  handler: string;
};

export function pickHandler(spec: BotSpec, text: string): Handler | undefined {
  const handlers = spec.handlers ?? [];
  const lower = text.trim().toLowerCase();
  const command = lower.startsWith("/") ? lower.slice(1).split(/[\s@]/)[0] : undefined;

  for (const handler of handlers) {
    const t = handler.trigger;
    if (!t) continue;
    if (t.type === "command" && command && command === t.value.replace(/^\//, "").toLowerCase())
      return handler;
    if (t.type === "keywords" && t.values?.some((k) => lower.includes(k.toLowerCase())))
      return handler;
    if (t.type === "regex") {
      try {
        if (new RegExp(t.pattern, "i").test(text)) return handler;
      } catch {
        /* ignore invalid pattern */
      }
    }
    if (t.type === "any" && !command) return handler;
  }
  return handlers.find((h) => h.trigger?.type === "fallback");
}

function args(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return trimmed;
  const parts = trimmed.split(/\s+/);
  return parts.slice(1).join(" ");
}

function render(
  template: string,
  msg: IncomingMessage,
  extra: Record<string, string> = {},
): string {
  const vars: Record<string, string> = {
    text: msg.text,
    args: args(msg.text),
    first_name: msg.firstName,
    chat_id: msg.chatId,
    ...extra,
  };
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

function withSecrets(template: string, secrets: Record<string, string>): string {
  return template.replace(
    /\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g,
    (_m, key: string) => secrets[key] ?? "",
  );
}

const MATH_ALLOWED = /^[0-9+\-*/%^().,\s]+$/;

function calculate(expression: string): string {
  const cleaned = expression
    .replace(/[×x]/gi, "*")
    .replace(/÷/g, "/")
    .replace(/,/g, ".")
    .replace(/=/g, "")
    .trim();
  if (!cleaned || !MATH_ALLOWED.test(cleaned)) {
    return "Je n'ai pas compris le calcul. Exemple : 12 * (3 + 4)";
  }
  try {
    // eslint-disable-next-line no-new-func
    const value = new Function(`"use strict"; return (${cleaned.replace(/\^/g, "**")});`)() as
      number | undefined;
    if (typeof value !== "number" || !Number.isFinite(value)) return "Calcul impossible.";
    return `${cleaned} = ${Math.round(value * 1e10) / 1e10}`;
  } catch {
    return "Calcul impossible.";
  }
}

async function callAi(
  system: string,
  userText: string,
  options: { model?: string; apiKey?: string },
): Promise<string> {
  const usingUserKey = Boolean(options.apiKey);
  const endpoint = usingUserKey
    ? "https://api.openai.com/v1/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";
  const key = options.apiKey ?? process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Aucune clé IA disponible.");

  const model = usingUserKey ? (options.model ?? "gpt-4o-mini") : "openai/gpt-6-astra";
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system || "Tu es un assistant Telegram utile et concis." },
      { role: "user", content: userText || "Bonjour" },
    ],
  };
  if (!usingUserKey) body["reasoning_effort"] = "low";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`IA indisponible [${response.status}]: ${detail.slice(0, 300)}`);
  }
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return payload.choices?.[0]?.message?.content?.trim() || "Je n'ai pas de réponse pour l'instant.";
}

async function runAction(
  action: Action,
  msg: IncomingMessage,
  secrets: Record<string, string>,
): Promise<string> {
  switch (action.type) {
    case "reply":
      return render(action.text ?? "", msg);
    case "choice": {
      const options = action.options ?? [];
      if (!options.length) return "…";
      return render(options[Math.floor(Math.random() * options.length)]!, msg);
    }
    case "calc":
      return calculate(args(msg.text) || msg.text);
    case "ai": {
      const apiKey = action.useSecret ? secrets[action.useSecret] : undefined;
      if (action.useSecret && !apiKey) {
        return `Clé manquante : ajoute « ${action.useSecret} » dans les secrets du bot.`;
      }
      return await callAi(render(action.system ?? "", msg), msg.text, {
        ...(apiKey ? { apiKey } : {}),
        ...(action.model ? { model: action.model } : {}),
      });
    }
    case "http": {
      const url = withSecrets(render(action.url ?? "", msg), secrets);
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(action.headers ?? {})) {
        headers[k] = withSecrets(render(v, msg), secrets);
      }
      const init: RequestInit = { method: action.method ?? "GET", headers };
      if (action.body && (action.method ?? "GET") !== "GET") {
        headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
        init.body = withSecrets(render(action.body, msg), secrets);
      }
      const response = await fetch(url, init);
      const raw = (await response.text()).slice(0, 6000);
      if (!response.ok)
        return `Le service externe a répondu ${response.status} : ${raw.slice(0, 200)}`;
      if (!action.format) return raw.slice(0, 3500);
      return await callAi(
        `${render(action.format, msg)}\nRéponds en texte court, prêt à envoyer sur Telegram.`,
        `Données brutes:\n${raw}`,
        {},
      );
    }
    default:
      return "Cette action n'est pas encore supportée.";
  }
}

export async function runBot(
  specInput: unknown,
  msg: IncomingMessage,
  secrets: Record<string, string> = {},
): Promise<EngineResult> {
  const spec = normalizeSpec(specInput);
  const isStart = msg.text.trim().toLowerCase().startsWith("/start");
  const hasStartHandler = spec.handlers.some(
    (h) => h.trigger?.type === "command" && h.trigger.value.replace(/^\//, "") === "start",
  );
  if (isStart && !hasStartHandler && spec.welcome) {
    return { text: render(spec.welcome, msg), handler: "welcome" };
  }
  const handler = pickHandler(spec, msg.text);

  if (!handler) {
    if (isStart && spec.welcome) {
      return { text: render(spec.welcome, msg), handler: "welcome" };
    }
    return {
      text: spec.welcome
        ? render(spec.welcome, msg)
        : "Ce bot n'a pas encore de logique. Décris son comportement dans le studio.",
      handler: "none",
    };
  }

  try {
    const text = await runAction(handler.action, msg, secrets);
    return {
      text,
      ...(handler.buttons ? { buttons: handler.buttons } : {}),
      handler: handler.id || handler.trigger.type,
    };
  } catch (error) {
    console.error(error);
    return {
      text: `Erreur pendant l'exécution : ${error instanceof Error ? error.message : String(error)}`,
      handler: handler.id || "error",
    };
  }
}
