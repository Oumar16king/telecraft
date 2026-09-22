// Shared (client-safe) description of a bot's behaviour.

export type Trigger =
  | { type: "command"; value: string }
  | { type: "keywords"; values: string[] }
  | { type: "regex"; pattern: string }
  | { type: "any" }
  | { type: "fallback" };

export type Action =
  | { type: "reply"; text: string }
  | { type: "choice"; options: string[] }
  | { type: "calc" }
  | { type: "ai"; system: string; useSecret?: string; model?: string }
  | {
      type: "http";
      method?: "GET" | "POST";
      url: string;
      headers?: Record<string, string>;
      body?: string;
      format?: string;
    };

export type Handler = {
  id: string;
  label?: string;
  description?: string;
  trigger: Trigger;
  action: Action;
  buttons?: string[][];
};

export type BotSpec = {
  persona?: string;
  welcome?: string;
  commands?: { command: string; description: string }[];
  requiredSecrets?: { key: string; description: string }[];
  handlers: Handler[];
};

export const emptySpec: BotSpec = { handlers: [] };

export function normalizeSpec(input: unknown): BotSpec {
  const raw = (input ?? {}) as Partial<BotSpec>;
  return {
    ...(raw.persona ? { persona: raw.persona } : {}),
    ...(raw.welcome ? { welcome: raw.welcome } : {}),
    commands: Array.isArray(raw.commands) ? raw.commands : [],
    requiredSecrets: Array.isArray(raw.requiredSecrets) ? raw.requiredSecrets : [],
    handlers: Array.isArray(raw.handlers) ? raw.handlers : [],
  };
}

export function describeTrigger(trigger: Trigger): string {
  switch (trigger.type) {
    case "command":
      return `/${trigger.value.replace(/^\//, "")}`;
    case "keywords":
      return trigger.values.join(", ");
    case "regex":
      return `motif ${trigger.pattern}`;
    case "any":
      return "tout message";
    default:
      return "sinon";
  }
}

export function describeAction(action: Action): string {
  switch (action.type) {
    case "reply":
      return "réponse fixe";
    case "choice":
      return "réponse aléatoire";
    case "calc":
      return "calcul";
    case "ai":
      return action.useSecret ? `IA (clé ${action.useSecret})` : "IA intégrée";
    case "http":
      return "appel API externe";
    default:
      return "action";
  }
}
