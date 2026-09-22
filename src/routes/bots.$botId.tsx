import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Bot,
  Copy,
  History,
  KeyRound,
  Link2,
  ListTree,
  MessageSquare,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  connectTelegram,
  disconnectTelegram,
  restoreVersion,
  sendStudioMessage,
} from "@/lib/studio.functions";
import { describeAction, describeTrigger, normalizeSpec, type BotSpec } from "@/lib/bot-spec";

export const Route = createFileRoute("/bots/$botId")({
  head: () => ({
    meta: [
      { title: "Studio — Telecraft" },
      {
        name: "description",
        content:
          "Discute avec l'IA pour construire la logique de ton bot Telegram, gère tes clés, mets-le en ligne et restaure n'importe quelle version.",
      },
      { property: "og:title", content: "Studio — Telecraft" },
      {
        property: "og:description",
        content: "Construis ton bot Telegram en discutant, avec historique des versions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

type Tab = "logic" | "versions" | "secrets" | "connection" | "logs";

const TABS: { id: Tab; label: string; icon: typeof ListTree }[] = [
  { id: "logic", label: "Logique", icon: ListTree },
  { id: "versions", label: "Versions", icon: History },
  { id: "secrets", label: "Clés", icon: KeyRound },
  { id: "connection", label: "Connexion", icon: Link2 },
  { id: "logs", label: "Journal", icon: MessageSquare },
];

function Studio() {
  const { botId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("logic");

  const { data: bot, isLoading } = useQuery({
    queryKey: ["bot", botId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bots")
        .select("id, name, description, bot_username, webhook_status, telegram_token, spec")
        .eq("id", botId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <p className="p-10 text-sm text-muted-foreground">Chargement…</p>;
  }
  if (!bot) {
    return (
      <div className="p-10">
        <p className="text-sm text-muted-foreground">Bot introuvable.</p>
        <Link to="/" className="mt-3 inline-block text-sm text-primary">
          Retour
        </Link>
      </div>
    );
  }

  const spec = normalizeSpec(bot.spec);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
          <Link
            to="/"
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
            aria-label="Retour"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{bot.name}</p>
            <p className="text-xs text-muted-foreground">
              {bot.bot_username ? `@${bot.bot_username} · ` : ""}
              {bot.webhook_status === "active" ? "En ligne" : "Hors ligne"}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[1fr_380px]">
        <VibeChat botId={botId} />

        <section className="rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap gap-1 border-b border-border p-2">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
                  tab === id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {tab === "logic" && <LogicPreview spec={spec} />}
            {tab === "versions" && <Versions botId={botId} />}
            {tab === "secrets" && <Secrets botId={botId} spec={spec} />}
            {tab === "connection" && (
              <Connection
                bot={{ id: bot.id, telegram_token: bot.telegram_token, webhook_status: bot.webhook_status }}
              />
            )}
            {tab === "logs" && <Logs botId={botId} />}
          </div>
        </section>
      </main>
    </div>
  );
}

function VibeChat({ botId }: { botId: string }) {
  const queryClient = useQueryClient();
  const send = useServerFn(sendStudioMessage);
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

  const ask = useMutation({
    mutationFn: async (message: string) => await send({ data: { botId, message } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["studio", botId] });
      if (result.mode === "build") {
        void queryClient.invalidateQueries({ queryKey: ["bot", botId] });
        void queryClient.invalidateQueries({ queryKey: ["versions", botId] });
        toast.success("Logique mise à jour");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = () => {
    const message = input.trim();
    if (!message || ask.isPending) return;
    setInput("");
    ask.mutate(message);
  };

  return (
    <section className="flex min-h-[560px] flex-col rounded-2xl border border-border bg-card">
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {!messages?.length && (
          <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
            Décris ce que ton bot doit faire. Exemples : « Quand on écrit /meteo Paris, donne la
            météo », « Ajoute un quiz de 3 questions », « Réponds bonjour au /start ». Tu peux aussi
            poser une simple question.
          </div>
        )}
        {messages?.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            {m.content}
          </div>
        ))}
        {ask.isPending && (
          <div className="max-w-[85%] rounded-xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
            Je réfléchis…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder="Écris à l'IA…"
          className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={submit}
          disabled={!input.trim() || ask.isPending}
          className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          aria-label="Envoyer"
        >
          <Send className="size-4" />
        </button>
      </div>
    </section>
  );
}

function LogicPreview({ spec }: { spec: BotSpec }) {
  if (!spec.handlers.length && !spec.welcome) {
    return (
      <p className="text-sm text-muted-foreground">
        Rien encore. Explique à l'IA ce que ton bot doit faire.
      </p>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      {spec.welcome && (
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">/start</p>
          <p className="mt-1 whitespace-pre-wrap">{spec.welcome}</p>
        </div>
      )}
      {spec.handlers.map((handler, index) => (
        <div key={handler.id || index} className="rounded-lg border border-border p-3">
          <p className="font-medium">{handler.label || handler.id || `Règle ${index + 1}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {describeTrigger(handler.trigger)} → {describeAction(handler.action)}
          </p>
        </div>
      ))}
    </div>
  );
}

function Versions({ botId }: { botId: string }) {
  const queryClient = useQueryClient();
  const restore = useServerFn(restoreVersion);

  const { data: versions } = useQuery({
    queryKey: ["versions", botId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bot_versions")
        .select("id, version, label, created_at")
        .eq("bot_id", botId)
        .order("version", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const apply = useMutation({
    mutationFn: async (versionId: string) => await restore({ data: { botId, versionId } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["bot", botId] });
      void queryClient.invalidateQueries({ queryKey: ["versions", botId] });
      toast.success(`Version ${result.version} restaurée`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!versions?.length) {
    return <p className="text-sm text-muted-foreground">Aucune version enregistrée pour l'instant.</p>;
  }

  return (
    <ul className="max-h-[420px] space-y-2 overflow-y-auto text-sm">
      {versions.map((v, index) => (
        <li key={v.id} className="rounded-lg border border-border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">
                Version {v.version}
                {index === 0 ? " · actuelle" : ""}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {v.label ?? "—"} · {new Date(v.created_at).toLocaleString("fr-FR")}
              </p>
            </div>
            {index !== 0 && (
              <button
                onClick={() => apply.mutate(v.id)}
                disabled={apply.isPending}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-60"
              >
                <RotateCcw className="size-3.5" /> Restaurer
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
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
        .order("key");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Session expirée.");
      const { error } = await supabase
        .from("bot_secrets")
        .upsert(
          { bot_id: botId, user_id: userId, key: key.trim(), value: value.trim() },
          { onConflict: "bot_id,key" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      setKey("");
      setValue("");
      void queryClient.invalidateQueries({ queryKey: ["secrets", botId] });
      toast.success("Clé enregistrée");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bot_secrets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["secrets", botId] }),
  });

  return (
    <div className="space-y-4 text-sm">
      {!!spec.requiredSecrets?.length && (
        <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          Clés attendues par la logique :{" "}
          {spec.requiredSecrets.map((s) => s.key).join(", ")}
        </div>
      )}

      <ul className="space-y-2">
        {secrets?.map((secret) => (
          <li
            key={secret.id}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
          >
            <code className="text-xs">{secret.key}</code>
            <button
              onClick={() => remove.mutate(secret.id)}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
              aria-label="Supprimer la clé"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
          placeholder="NOM_DE_LA_CLE"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="password"
          placeholder="valeur"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
        />
        <button
          onClick={() => save.mutate()}
          disabled={!key.trim() || !value.trim() || save.isPending}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          Enregistrer la clé
        </button>
      </div>
    </div>
  );
}

function Connection({
  bot,
}: {
  bot: { id: string; telegram_token: string | null; webhook_status: string | null };
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
      void queryClient.invalidateQueries({ queryKey: ["bot", bot.id] });
      toast.success("Token enregistré");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const activate = useMutation({
    mutationFn: async () => await connect({ data: { botId: bot.id } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["bot", bot.id] });
      toast.success(result.username ? `@${result.username} est en ligne` : "Bot en ligne");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const stop = useMutation({
    mutationFn: async () => await disconnect({ data: { botId: bot.id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bot", bot.id] });
      toast.success("Bot mis hors ligne");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-medium">Token BotFather</p>
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

      <div className="rounded-lg border border-border p-3">
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
        .select("id, direction, text, handler, created_at, telegram_user")
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
            </span>
            <span>{new Date(log.created_at).toLocaleTimeString("fr-FR")}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap">{log.text}</p>
        </li>
      ))}
    </ul>
  );
}
