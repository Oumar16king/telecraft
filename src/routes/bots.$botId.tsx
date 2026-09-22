import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Key,
  Link2,
  Loader2,
  Play,
  Radio,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TopBar } from "./index";
import {
  describeAction,
  describeTrigger,
  normalizeSpec,
  type BotSpec,
} from "@/lib/bot-spec";
import {
  buildBotLogic,
  connectTelegram,
  disconnectTelegram,
  simulateMessage,
} from "@/lib/studio.functions";

export const Route = createFileRoute("/bots/$botId")({
  head: () => ({
    meta: [
      { title: "Studio du bot — BotForge Studio" },
      {
        name: "description",
        content:
          "Construis la logique de ton bot Telegram en langage naturel, teste-la dans le simulateur et gère ses clés.",
      },
      { property: "og:title", content: "Studio du bot — BotForge Studio" },
      {
        property: "og:description",
        content: "Vibe coding, simulateur de chat Telegram et gestion des secrets pour ton bot.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

type Tab = "logic" | "simulator" | "secrets" | "connection" | "logs";

function Studio() {
  const { botId } = Route.useParams();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("simulator");

  const { data: bot } = useQuery({
    queryKey: ["bot", botId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bots")
        .select("*")
        .eq("id", botId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const spec: BotSpec = normalizeSpec(bot?.spec);

  if (!bot) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <p className="p-10 text-sm text-muted-foreground">Chargement du bot…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Tous mes bots
        </Link>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">{bot.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {bot.description ?? "Pas de description"}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${
              bot.webhook_status === "active"
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <Radio className="size-3.5" />
            {bot.webhook_status === "active"
              ? `En ligne${bot.bot_username ? ` · @${bot.bot_username}` : ""}`
              : "Hors ligne"}
          </span>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <VibeChat botId={botId} onBuilt={() => queryClient.invalidateQueries()} />

          <section className="rounded-2xl border border-border bg-card">
            <nav className="flex flex-wrap gap-1 border-b border-border p-2 text-sm">
              {(
                [
                  ["simulator", "Simulateur"],
                  ["logic", "Logique"],
                  ["secrets", "Clés"],
                  ["connection", "Connexion"],
                  ["logs", "Journal"],
                ] as [Tab, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setTab(value)}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    tab === value
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="p-4">
              {tab === "simulator" && <Simulator botId={botId} />}
              {tab === "logic" && <LogicPreview spec={spec} />}
              {tab === "secrets" && <Secrets botId={botId} spec={spec} />}
              {tab === "connection" && <Connection bot={bot} />}
              {tab === "logs" && <Logs botId={botId} />}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function VibeChat({ botId, onBuilt }: { botId: string; onBuilt: () => void }) {
  const build = useServerFn(buildBotLogic);
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const { data: messages } = useQuery({
    queryKey: ["studio", botId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studio_messages")
        .select("id, role, content, created_at")
        .eq("bot_id", botId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  const send = useMutation({
    mutationFn: async (message: string) => await build({ data: { botId, message } }),
    onSuccess: () => {
      setInput("");
      queryClient.invalidateQueries({ queryKey: ["studio", botId] });
      queryClient.invalidateQueries({ queryKey: ["bot", botId] });
      onBuilt();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "L'IA n'a pas pu construire la logique"),
  });

  return (
    <section className="flex min-h-[560px] flex-col rounded-2xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="size-4 text-primary" />
        <p className="font-display text-sm font-semibold">Studio · décris ton bot</p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!messages?.length && (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Exemples de demandes :</p>
            <ul className="space-y-2">
              {[
                "Fais un bot calculatrice : /calc 12*(3+4) et il répond le résultat.",
                "Bot météo : /meteo Paris via l'API OpenWeather avec ma clé OPENWEATHER_KEY.",
                "Bot de prédiction fun : /predire donne une prédiction du jour au hasard.",
                "Bot d'accueil de groupe avec règles et boutons.",
              ].map((example) => (
                <li key={example}>
                  <button
                    onClick={() => setInput(example)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-left hover:border-primary/50 hover:text-foreground"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages?.map((message) => (
          <div
            key={message.id}
            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              message.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {message.content}
          </div>
        ))}
        {send.isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Construction de la logique…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (input.trim()) send.mutate(input.trim());
        }}
        className="flex gap-2 border-t border-border p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ex : ajoute /horaires qui renvoie nos horaires d'ouverture"
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={send.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          <Send className="size-4" />
        </button>
      </form>
    </section>
  );
}

function LogicPreview({ spec }: { spec: BotSpec }) {
  if (!spec.handlers.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune logique pour l'instant. Décris ton bot dans le studio.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {spec.welcome && (
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">/start</p>
          <p className="mt-1 text-sm">{spec.welcome}</p>
        </div>
      )}
      {spec.handlers.map((handler) => (
        <div key={handler.id} className="rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-sm font-semibold">
              {handler.label ?? handler.id}
            </p>
            <code className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {describeTrigger(handler.trigger)}
            </code>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{describeAction(handler.action)}</p>
        </div>
      ))}
    </div>
  );
}

function Simulator({ botId }: { botId: string }) {
  const simulate = useServerFn(simulateMessage);
  const [text, setText] = useState("/start");
  const [thread, setThread] = useState<{ from: "user" | "bot"; text: string }[]>([]);

  const run = useMutation({
    mutationFn: async (message: string) => await simulate({ data: { botId, text: message } }),
    onMutate: (message) => setThread((prev) => [...prev, { from: "user", text: message }]),
    onSuccess: (result) => setThread((prev) => [...prev, { from: "bot", text: result.text }]),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Le simulateur a échoué"),
  });

  return (
    <div>
      <div className="h-[380px] space-y-2 overflow-y-auto rounded-xl bg-[color-mix(in_oklch,var(--primary)_8%,var(--background))] p-3">
        {!thread.length && (
          <p className="pt-24 text-center text-sm text-muted-foreground">
            Faux chat Telegram : envoie un message pour tester ton bot.
          </p>
        )}
        {thread.map((message, index) => (
          <div
            key={index}
            className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
              message.from === "user"
                ? "ml-auto rounded-br-sm bg-primary text-primary-foreground"
                : "rounded-bl-sm bg-card text-card-foreground"
            }`}
          >
            {message.text}
          </div>
        ))}
        {run.isPending && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> le bot écrit…
          </p>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) run.mutate(text.trim());
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          placeholder="/start"
        />
        <button
          type="submit"
          disabled={run.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          <Play className="size-4" />
        </button>
      </form>
    </div>
  );
}

function Secrets({ botId, spec }: { botId: string; spec: BotSpec }) {
  const queryClient = useQueryClient();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const { data: secrets } = useQuery({
    queryKey: ["secrets", botId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bot_secrets")
        .select("id, key")
        .eq("bot_id", botId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Session expirée");
      const { error } = await supabase
        .from("bot_secrets")
        .upsert(
          { bot_id: botId, user_id: userId, key: key.trim().toUpperCase(), value: value.trim() },
          { onConflict: "bot_id,key" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      setKey("");
      setValue("");
      queryClient.invalidateQueries({ queryKey: ["secrets", botId] });
      toast.success("Clé enregistrée");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Échec"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bot_secrets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["secrets", botId] }),
  });

  return (
    <div className="space-y-4">
      {spec.requiredSecrets?.length ? (
        <div className="rounded-xl border border-border p-3 text-sm">
          <p className="font-medium">Clés attendues par ce bot</p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {spec.requiredSecrets.map((secret) => (
              <li key={secret.key}>
                <code className="text-foreground">{secret.key}</code> — {secret.description}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="NOM_DE_LA_CLE"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="password"
          placeholder="Valeur de la clé"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={() => save.mutate()}
          disabled={!key.trim() || !value.trim() || save.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          <Key className="size-4" /> Enregistrer
        </button>
      </div>

      <ul className="space-y-2">
        {secrets?.map((secret) => (
          <li
            key={secret.id}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
          >
            <code>{secret.key}</code>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>••••••••</span>
              <button
                onClick={() => remove.mutate(secret.id)}
                className="rounded p-1 hover:bg-destructive/15 hover:text-destructive"
                aria-label="Supprimer la clé"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Connection({
  bot,
}: {
  bot: { id: string; telegram_token: string | null; webhook_status: string };
}) {
  const queryClient = useQueryClient();
  const connect = useServerFn(connectTelegram);
  const disconnect = useServerFn(disconnectTelegram);
  const [token, setToken] = useState(bot.telegram_token ?? "");

  const saveToken = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("bots")
        .update({ telegram_token: token.trim() })
        .eq("id", bot.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bot", bot.id] });
      toast.success("Token enregistré");
    },
  });

  const activate = useMutation({
    mutationFn: async () => await connect({ data: { botId: bot.id } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["bot", bot.id] });
      toast.success(
        result.username ? `@${result.username} est en ligne` : "Bot connecté à Telegram",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Activation impossible"),
  });

  const stop = useMutation({
    mutationFn: async () => await disconnect({ data: { botId: bot.id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bot", bot.id] });
      toast.success("Bot mis hors ligne");
    },
  });

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-medium">Token BotFather</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Crée un bot avec @BotFather sur Telegram et colle ici le token qu'il te donne.
        </p>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="123456789:AA..."
          className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
        />
        <button
          onClick={() => saveToken.mutate()}
          disabled={!token.trim() || saveToken.isPending}
          className="mt-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-60"
        >
          Enregistrer le token
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => activate.mutate()}
          disabled={activate.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          <Link2 className="size-4" />
          {bot.webhook_status === "active" ? "Reconnecter" : "Mettre en ligne"}
        </button>
        {bot.webhook_status === "active" && (
          <button
            onClick={() => stop.mutate()}
            className="rounded-lg border border-border px-3 py-2 hover:bg-accent"
          >
            Mettre hors ligne
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border p-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Adresse webhook</p>
        <div className="mt-1 flex items-center gap-2">
          <code className="flex-1 break-all text-xs">/api/public/bots/{bot.id}/webhook</code>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(
                `${window.location.origin}/api/public/bots/${bot.id}/webhook`,
              );
              toast.success("Copié");
            }}
            className="rounded p-1.5 hover:bg-accent"
            aria-label="Copier l'adresse"
          >
            <Copy className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Logs({ botId }: { botId: string }) {
  const { data: logs } = useQuery({
    queryKey: ["logs", botId],
    refetchInterval: 8000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bot_messages")
        .select("id, direction, text, handler, simulated, created_at, telegram_user")
        .eq("bot_id", botId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!logs?.length) {
    return <p className="text-sm text-muted-foreground">Aucun message pour l'instant.</p>;
  }

  return (
    <ul className="max-h-[420px] space-y-2 overflow-y-auto text-sm">
      {logs.map((log) => (
        <li key={log.id} className="rounded-lg border border-border p-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {log.direction === "in" ? `↓ ${log.telegram_user ?? "utilisateur"}` : "↑ bot"}
              {log.simulated ? " · simulation" : ""}
            </span>
            <span>{new Date(log.created_at).toLocaleTimeString("fr-FR")}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap">{log.text}</p>
        </li>
      ))}
    </ul>
  );
}
