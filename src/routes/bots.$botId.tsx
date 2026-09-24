import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Bot,
  Brain,
  ChevronUp,
  Copy,
  Download,
  FileCode,
  FilePlus,
  FileSearch,
  FileX,
  Globe,
  History,
  KeyRound,
  Link2,
  List,
  MessageSquare,
  RotateCcw,
  Send,
  Square,
  Trash2,
  TriangleAlert,
  FolderTree,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  connectTelegram,
  disconnectTelegram,
  exportBotZip,
  restoreVersion,
} from "@/lib/studio.functions";

export const Route = createFileRoute("/bots/$botId")({
  head: () => ({
    meta: [
      { title: "Studio — Telecraft" },
      {
        name: "description",
        content:
          "Discute avec l'IA qui code ton bot Telegram en direct, gère ses fichiers, ses clés et ses versions.",
      },
      { property: "og:title", content: "Studio — Telecraft" },
      {
        property: "og:description",
        content: "L'IA code ton bot Telegram en direct devant toi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

type Tab = "files" | "secrets" | "connection" | "versions" | "logs";

const TABS: { id: Tab; label: string; icon: typeof FolderTree }[] = [
  { id: "files", label: "Fichiers", icon: FolderTree },
  { id: "secrets", label: "Clés", icon: KeyRound },
  { id: "connection", label: "Connexion", icon: Link2 },
  { id: "versions", label: "Versions", icon: History },
  { id: "logs", label: "Journal", icon: MessageSquare },
];

function Studio() {
  const { botId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("files");
  const zip = useServerFn(exportBotZip);

  const { data: bot, isLoading } = useQuery({
    queryKey: ["bot", botId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bots")
        .select("id, name, description, bot_username, webhook_status, telegram_token")
        .eq("id", botId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const download = useMutation({
    mutationFn: async () => await zip({ data: { botId } }),
    onSuccess: ({ filename, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <p className="p-10 text-sm text-muted-foreground">Chargement…</p>;
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

  const online = bot.webhook_status === "active";

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link to="/" className="rounded-lg p-2 text-muted-foreground hover:bg-accent" aria-label="Retour">
          <ArrowLeft className="size-4" />
        </Link>
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{bot.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`size-1.5 rounded-full ${online ? "bg-primary" : "bg-muted-foreground/40"}`} />
            {bot.bot_username ? `@${bot.bot_username} · ` : ""}
            {online ? "En ligne" : "Hors ligne"}
          </p>
        </div>
        <button
          onClick={() => download.mutate()}
          disabled={download.isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-60"
        >
          <Download className="size-4" />
          <span className="hidden sm:inline">Télécharger .zip</span>
        </button>
      </header>

      <main className="grid min-h-0 flex-1 lg:grid-cols-[1fr_420px]">
        <VibeChat botId={botId} />
        <section className="flex min-h-0 flex-col border-t border-border lg:border-t-0 lg:border-l">
          <div className="flex gap-1 overflow-x-auto border-b border-border p-2">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
                  tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                }`}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "files" && <Files botId={botId} />}
            {tab === "versions" && <Versions botId={botId} />}
            {tab === "secrets" && <Secrets botId={botId} />}
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

/* ------------------------------ chat ------------------------------ */

type Activity = { type: string; label: string; detail: string | null };
type Turn = {
  key: string;
  user: string;
  activities: Activity[];
  answer: string;
  live?: boolean;
  liveReasoning?: string;
};

const ICONS: Record<string, typeof Brain> = {
  thought: Brain,
  read: FileSearch,
  write: FilePlus,
  delete: FileX,
  list: List,
  search: Globe,
  error: TriangleAlert,
};

function ActivityRow({ a }: { a: Activity }) {
  const [open, setOpen] = useState(false);
  const Icon = a.label.startsWith("Modifié") ? FileCode : (ICONS[a.type] ?? FileCode);
  return (
    <div className="text-xs">
      <button
        onClick={() => a.detail && setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-muted-foreground hover:bg-accent"
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{a.label}</span>
        {a.detail && <ChevronUp className={`size-3.5 shrink-0 transition ${open ? "" : "rotate-180"}`} />}
      </button>
      {open && a.detail && (
        <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-muted p-2.5 font-mono text-[11px] whitespace-pre-wrap text-foreground">
          {a.detail}
        </pre>
      )}
    </div>
  );
}

function VibeChat({ botId }: { botId: string }) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [live, setLive] = useState<Turn | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const { data: history } = useQuery({
    queryKey: ["studio", botId],
    queryFn: async () => {
      const [{ data: msgs, error }, { data: events }] = await Promise.all([
        supabase
          .from("studio_messages")
          .select("id, role, content, turn_id, created_at")
          .eq("bot_id", botId)
          .order("created_at", { ascending: true }),
        supabase
          .from("studio_events")
          .select("turn_id, seq, type, label, detail")
          .eq("bot_id", botId)
          .order("created_at", { ascending: true })
          .order("seq", { ascending: true }),
      ]);
      if (error) throw error;
      const turns: Turn[] = [];
      const byTurn = new Map<string, Turn>();
      for (const m of msgs ?? []) {
        const k = m.turn_id ?? m.id;
        let t = byTurn.get(k);
        if (!t) {
          t = { key: k, user: "", activities: [], answer: "" };
          byTurn.set(k, t);
          turns.push(t);
        }
        if (m.role === "user") t.user = m.content;
        else t.answer = m.content;
      }
      for (const e of events ?? []) {
        byTurn.get(e.turn_id)?.activities.push({ type: e.type, label: e.label, detail: e.detail });
      }
      return turns;
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [history?.length, live]);

  const busy = !!live;

  const submit = async () => {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    const turn: Turn = { key: "live", user: message, activities: [], answer: "", live: true, liveReasoning: "" };
    setLive(turn);
    const update = (fn: (t: Turn) => Turn) => setLive((prev) => (prev ? fn(prev) : prev));
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/studio/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ botId, message }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(res.status === 401 ? "Session expirée." : "Erreur du serveur.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6)) as {
            t: string; v?: string; ms?: number; detail?: string; type?: string; label?: string;
          };
          if (ev.t === "text") update((t) => ({ ...t, answer: t.answer + (ev.v ?? "") }));
          else if (ev.t === "reasoning") update((t) => ({ ...t, liveReasoning: (t.liveReasoning ?? "") + (ev.v ?? "") }));
          else if (ev.t === "thought")
            update((t) => ({
              ...t,
              liveReasoning: "",
              activities: [
                ...t.activities,
                { type: "thought", label: `Réfléchi pendant ${Math.max(1, Math.round((ev.ms ?? 0) / 1000))} s`, detail: ev.detail ?? null },
              ],
            }));
          else if (ev.t === "action")
            update((t) => ({
              ...t,
              answer: "",
              activities: [...t.activities, { type: ev.type ?? "", label: ev.label ?? "", detail: ev.detail ?? null }],
            }));
          else if (ev.t === "final") update((t) => ({ ...t, answer: ev.v ?? t.answer }));
          else if (ev.t === "error") toast.error(ev.v ?? "Erreur");
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") toast.error((error as Error).message);
    } finally {
      abortRef.current = null;
      await queryClient.invalidateQueries({ queryKey: ["studio", botId] });
      void queryClient.invalidateQueries({ queryKey: ["files", botId] });
      void queryClient.invalidateQueries({ queryKey: ["versions", botId] });
      setLive(null);
    }
  };

  const turns = [...(history ?? []), ...(live ? [live] : [])];

  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 p-5">
          {!turns.length && (
            <div className="rounded-xl border border-border p-5 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Décris ton bot.</p>
              <p className="mt-1">
                Ex. « Fais de ce bot le gestionnaire de mon canal : diffusion, sondages, ban/unban,
                anti-spam » ou « Ajoute l'action “en train d'écrire” avant chaque réponse ».
              </p>
            </div>
          )}
          {turns.map((t) => (
            <div key={t.key} className="space-y-3">
              {t.user && (
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
                  {t.user}
                </div>
              )}
              {!!t.activities.length && (
                <div className="space-y-0.5 border-l-2 border-border pl-2">
                  {t.activities.map((a, i) => (
                    <ActivityRow key={i} a={a} />
                  ))}
                </div>
              )}
              {t.live && !t.answer && (
                <div className="text-xs text-muted-foreground">
                  <span className="animate-pulse">{t.liveReasoning ? "Réflexion en cours…" : "Au travail…"}</span>
                  {t.liveReasoning && (
                    <p className="mt-1 line-clamp-3 italic">{t.liveReasoning.slice(-400)}</p>
                  )}
                </div>
              )}
              {t.answer && <div className="text-sm leading-relaxed whitespace-pre-wrap">{t.answer}</div>}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-border p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-input bg-background p-2 focus-within:border-primary">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={2}
            disabled={busy}
            placeholder={busy ? "L'IA travaille…" : "Écris à l'IA…"}
            className="flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none disabled:opacity-60"
          />
          {busy ? (
            <button
              onClick={() => abortRef.current?.abort()}
              className="grid size-9 place-items-center rounded-lg bg-foreground text-background"
              aria-label="Stop"
            >
              <Square className="size-3.5" />
            </button>
          ) : (
            <button
              onClick={() => void submit()}
              disabled={!input.trim()}
              className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
              aria-label="Envoyer"
            >
              <Send className="size-4" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ files ------------------------------ */

function Files({ botId }: { botId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { data: files } = useQuery({
    queryKey: ["files", botId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bot_files")
        .select("id, path, content")
        .eq("bot_id", botId)
        .order("path");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!files?.length) {
    return <p className="text-sm text-muted-foreground">Aucun fichier. Demande à l'IA de créer ton bot.</p>;
  }
  const current = files.find((f) => f.path === selected) ?? files[0];

  return (
    <div className="space-y-3">
      <ul className="space-y-0.5 text-sm">
        {files.map((f) => (
          <li key={f.id}>
            <button
              onClick={() => setSelected(f.path)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs ${
                current?.path === f.path ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <FileCode className="size-3.5 shrink-0" />
              <span className="truncate">{f.path}</span>
            </button>
          </li>
        ))}
      </ul>
      {current && (
        <pre className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-[11px] leading-relaxed">
          {current.content}
        </pre>
      )}
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
    return (
      <p className="text-sm text-muted-foreground">Aucune version enregistrée pour l'instant.</p>
    );
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

function Secrets({ botId }: { botId: string }) {
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
