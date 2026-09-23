// Runs a bot's real code (its own files) against an incoming Telegram update.

export type BotFile = { path: string; content: string };

export type BotStore = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: (prefix?: string) => Promise<{ key: string; value: unknown }[]>;
};

export type RunOutcome = {
  ok: boolean;
  error?: string;
  logs: string[];
  calls: { method: string; ok: boolean; detail?: string }[];
};

const TIMEOUT_MS = 25_000;

function normalize(path: string): string {
  return path.replace(/^\.\//, "").replace(/^\/+/, "");
}

function resolvePath(from: string, request: string): string {
  if (!request.startsWith(".")) return normalize(request);
  const base = normalize(from).split("/").slice(0, -1);
  for (const part of request.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") base.pop();
    else base.push(part);
  }
  return base.join("/");
}

function createTelegramApi(token: string, calls: RunOutcome["calls"]) {
  const call = async (method: string, payload: Record<string, unknown> = {}) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: unknown;
      description?: string;
      parameters?: { retry_after?: number };
    };
    calls.push({
      method,
      ok: Boolean(body.ok),
      ...(body.ok ? {} : { detail: body.description ?? `HTTP ${response.status}` }),
    });
    if (!body.ok) {
      const error = new Error(`Telegram ${method}: ${body.description ?? response.status}`);
      Object.assign(error, { retryAfter: body.parameters?.retry_after });
      throw error;
    }
    return body.result;
  };

  const target = { call } as Record<string, unknown>;
  return new Proxy(target, {
    get(obj, prop: string) {
      if (prop in obj) return obj[prop];
      if (typeof prop !== "string") return undefined;
      return (payload: Record<string, unknown> = {}) => call(prop, payload);
    },
  });
}

/** Loads the bot's files as CommonJS modules and calls handleUpdate. */
export async function runBotUpdate(options: {
  files: BotFile[];
  token: string;
  secrets: Record<string, string>;
  store: BotStore;
  update: unknown;
}): Promise<RunOutcome> {
  const logs: string[] = [];
  const calls: RunOutcome["calls"] = [];
  const byPath = new Map(options.files.map((f) => [normalize(f.path), f.content]));

  const entry = ["bot.js", "index.js", "main.js"].find((p) => byPath.has(p));
  if (!entry) {
    return { ok: false, error: "Le projet n'a pas de fichier bot.js.", logs, calls };
  }

  const cache = new Map<string, Record<string, unknown>>();
  const sandboxConsole = {
    log: (...parts: unknown[]) => logs.push(parts.map(String).join(" ")),
    error: (...parts: unknown[]) => logs.push(`erreur: ${parts.map(String).join(" ")}`),
    warn: (...parts: unknown[]) => logs.push(`attention: ${parts.map(String).join(" ")}`),
  };

  const load = (path: string): Record<string, unknown> => {
    const candidates = [path, `${path}.js`, `${path}/index.js`, `${path}.json`];
    const found = candidates.find((c) => byPath.has(c));
    if (!found) throw new Error(`Fichier introuvable : ${path}`);
    const cached = cache.get(found);
    if (cached) return cached;
    const source = byPath.get(found)!;
    const moduleObject: { exports: Record<string, unknown> } = { exports: {} };
    cache.set(found, moduleObject.exports);
    if (found.endsWith(".json")) {
      moduleObject.exports = JSON.parse(source) as Record<string, unknown>;
      cache.set(found, moduleObject.exports);
      return moduleObject.exports;
    }
    const require = (request: string) => load(resolvePath(found, request));
    // eslint-disable-next-line no-new-func
    const factory = new Function(
      "module",
      "exports",
      "require",
      "console",
      `"use strict";\n${source}`,
    ) as (
      module: { exports: Record<string, unknown> },
      exports: Record<string, unknown>,
      require: (request: string) => Record<string, unknown>,
      console: unknown,
    ) => void;
    factory(moduleObject, moduleObject.exports, require, sandboxConsole);
    cache.set(found, moduleObject.exports);
    return moduleObject.exports;
  };

  try {
    const exported = load(entry);
    const handler = (exported["handleUpdate"] ?? exported["default"]) as
      | ((update: unknown, api: unknown, env: unknown) => unknown)
      | undefined;
    if (typeof handler !== "function") {
      return { ok: false, error: "bot.js n'exporte pas handleUpdate.", logs, calls };
    }

    const api = createTelegramApi(options.token, calls);
    const env = {
      secrets: options.secrets,
      store: options.store,
      log: (...parts: unknown[]) => logs.push(parts.map(String).join(" ")),
    };

    await Promise.race([
      Promise.resolve(handler(options.update, api, env)),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("Temps d'exécution dépassé (25 s).")), TIMEOUT_MS),
      ),
    ]);
    return { ok: true, logs, calls };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      logs,
      calls,
    };
  }
}
