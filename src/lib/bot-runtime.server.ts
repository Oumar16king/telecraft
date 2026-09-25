// Runs a bot's real code (its own files) inside a QuickJS sandbox (WebAssembly).
// The hosting runtime forbids `new Function` / `eval`, so bot code is interpreted by QuickJS.
import { getQuickJSWASMModule, shouldInterruptAfterDeadline } from "@cf-wasm/quickjs";
import type { QuickJSContext, QuickJSHandle } from "@cf-wasm/quickjs";

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

// Guest-side bootstrap: CommonJS loader, Telegram api proxy, env, fetch, timers.
const BOOTSTRAP = String.raw`
const __call = (kind, args) => __host(kind, JSON.stringify(args === undefined ? null : args)).then((r) => (r === "" ? undefined : JSON.parse(r)));
const __fmt = (parts) => parts.map((p) => { if (typeof p === "string") return p; try { return JSON.stringify(p); } catch (e) { return String(p); } }).join(" ");
globalThis.console = {
  log: (...p) => __log("log", __fmt(p)),
  info: (...p) => __log("log", __fmt(p)),
  debug: (...p) => __log("log", __fmt(p)),
  warn: (...p) => __log("warn", __fmt(p)),
  error: (...p) => __log("error", __fmt(p)),
};
globalThis.setTimeout = (fn, ms, ...a) => { __call("sleep", ms || 0).then(() => fn(...a)); return 0; };
globalThis.clearTimeout = () => {};
globalThis.fetch = async (url, init) => {
  init = init || {};
  let body = init.body;
  if (body !== undefined && typeof body !== "string") body = JSON.stringify(body);
  const r = await __call("fetch", { url: String(url), method: init.method || "GET", headers: init.headers || {}, body });
  return {
    ok: r.status >= 200 && r.status < 300, status: r.status, statusText: r.statusText || "",
    headers: { get: (k) => r.headers[String(k).toLowerCase()] ?? null },
    text: async () => r.body, json: async () => JSON.parse(r.body),
  };
};
const __tg = (method, payload) => __call("tg", { method, payload: payload || {} });
const __api = new Proxy({ call: __tg }, { get(o, p) { if (p in o) return o[p]; if (typeof p !== "string" || p === "then") return undefined; return (payload) => __tg(p, payload); } });
const __env = {
  secrets: __secrets,
  log: (...p) => __log("log", __fmt(p)),
  store: {
    get: (key) => __call("store_get", { key }),
    set: (key, value) => __call("store_set", { key, value }),
    delete: (key) => __call("store_delete", { key }),
    list: (prefix) => __call("store_list", { prefix: prefix || "" }),
  },
};
const __cache = {};
const __resolve = (from, req) => {
  if (!req.startsWith(".")) return req.replace(/^\/+/, "");
  const base = from.split("/").slice(0, -1);
  for (const part of req.split("/")) { if (part === "." || part === "") continue; if (part === "..") base.pop(); else base.push(part); }
  return base.join("/");
};
const __load = (path) => {
  const found = [path, path + ".js", path + "/index.js", path + ".json"].find((c) => c in __modules);
  if (!found) throw new Error("Fichier introuvable : " + path);
  if (__cache[found]) return __cache[found].exports;
  const module = { exports: {} };
  __cache[found] = module;
  __modules[found](module, module.exports, (req) => __load(__resolve(found, req)));
  return module.exports;
};
globalThis.__run = async (entry, update) => {
  const ex = __load(entry);
  const handler = ex.handleUpdate || ex.default || (typeof ex === "function" ? ex : undefined);
  if (typeof handler !== "function") throw new Error("bot.js n'exporte pas handleUpdate.");
  await handler(update, __api, __env);
};
`;

function buildModules(files: Map<string, string>): string {
  const entries = [...files.entries()].map(([path, source]) => {
    const body = path.endsWith(".json")
      ? `module.exports = ${source.trim() || "null"};`
      : source;
    return `${JSON.stringify(path)}: function (module, exports, require) {\n${body}\n}`;
  });
  return `const __modules = {\n${entries.join(",\n")}\n};`;
}

async function telegram(token: string, method: string, payload: unknown, calls: RunOutcome["calls"]) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: unknown;
    description?: string;
  };
  calls.push({
    method,
    ok: Boolean(body.ok),
    ...(body.ok ? {} : { detail: body.description ?? `HTTP ${response.status}` }),
  });
  if (!body.ok) throw new Error(`Telegram ${method}: ${body.description ?? response.status}`);
  return body.result;
}

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
  if (!entry) return { ok: false, error: "Le projet n'a pas de fichier bot.js.", logs, calls };

  const QuickJS = await getQuickJSWASMModule();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(64 * 1024 * 1024);
  runtime.setMaxStackSize(1024 * 1024);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + TIMEOUT_MS));
  const vm: QuickJSContext = runtime.newContext();
  let disposed = false;

  const hostTask = async (kind: string, args: any): Promise<unknown> => {
    switch (kind) {
      case "tg":
        return telegram(options.token, String(args.method), args.payload, calls);
      case "store_get":
        return options.store.get(String(args.key));
      case "store_set":
        return options.store.set(String(args.key), args.value);
      case "store_delete":
        return options.store.delete(String(args.key));
      case "store_list":
        return options.store.list(String(args.prefix ?? ""));
      case "sleep":
        await new Promise((r) => setTimeout(r, Math.min(Number(args) || 0, 10_000)));
        return undefined;
      case "fetch": {
        const res = await fetch(String(args.url), {
          method: args.method,
          headers: args.headers,
          ...(args.body !== undefined && args.body !== null ? { body: args.body } : {}),
        });
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => (headers[k] = v));
        return { status: res.status, statusText: res.statusText, headers, body: await res.text() };
      }
      default:
        throw new Error(`Opération inconnue : ${kind}`);
    }
  };

  try {
    vm.newFunction("__log", (levelH, textH) => {
      const level = vm.getString(levelH);
      const text = vm.getString(textH);
      logs.push(level === "log" ? text : `${level === "error" ? "erreur" : "attention"}: ${text}`);
    }).consume((fn) => vm.setProp(vm.global, "__log", fn));

    vm.newFunction("__host", (kindH, argsH) => {
      const kind = vm.getString(kindH);
      const args = JSON.parse(vm.getString(argsH));
      const deferred = vm.newPromise();
      hostTask(kind, args)
        .then((value) => {
          if (disposed) return;
          vm.newString(value === undefined ? "" : JSON.stringify(value)).consume((h) =>
            deferred.resolve(h),
          );
        })
        .catch((error) => {
          if (disposed) return;
          vm.newError(error instanceof Error ? error.message : String(error)).consume((h) =>
            deferred.reject(h),
          );
        })
        .finally(() => {
          if (!disposed) runtime.executePendingJobs();
        });
      return deferred.handle;
    }).consume((fn) => vm.setProp(vm.global, "__host", fn));

    vm.newString(JSON.stringify(options.secrets)).consume((h) => vm.setProp(vm.global, "__secretsJson", h));

    const script = `const __secrets = JSON.parse(__secretsJson);\n${BOOTSTRAP}\n${buildModules(byPath)}\n__run(${JSON.stringify(entry)}, ${JSON.stringify(options.update ?? null)});`;
    const result = vm.evalCode(script, "bot-bundle.js");
    if (result.error) {
      const err = vm.dump(result.error);
      result.error.dispose();
      throw new Error(formatError(err));
    }
    const promiseHandle: QuickJSHandle = result.value;
    runtime.executePendingJobs();

    const native = vm.resolvePromise(promiseHandle);
    runtime.executePendingJobs();
    const settled = await Promise.race([
      native,
      new Promise<"timeout">((r) => setTimeout(() => r("timeout"), TIMEOUT_MS)),
    ]);
    promiseHandle.dispose();
    if (settled === "timeout") throw new Error("Temps d'exécution dépassé (25 s).");
    if (settled.error) {
      const err = vm.dump(settled.error);
      settled.error.dispose();
      throw new Error(formatError(err));
    }
    settled.value.dispose();
    return { ok: true, logs, calls };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), logs, calls };
  } finally {
    disposed = true;
    try {
      vm.dispose();
      runtime.dispose();
    } catch {
      // ignore leaks from pending host promises
    }
  }
}

function formatError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { name?: string; message?: string; stack?: string };
    return [e.name && e.message ? `${e.name}: ${e.message}` : e.message ?? JSON.stringify(err), e.stack]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1500);
  }
  return String(err);
}
