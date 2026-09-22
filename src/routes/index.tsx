import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Plus, Radio, Sparkles, Terminal, Trash2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BotForge Studio — Vibe coding pour bots Telegram" },
      {
        name: "description",
        content:
          "Crée n'importe quel bot Telegram en langage naturel : calcul, météo, prédiction, gestion de groupe. Ton token BotFather, tes clés, exécution hébergée sans VPS.",
      },
      { property: "og:title", content: "BotForge Studio — Vibe coding pour bots Telegram" },
      {
        property: "og:description",
        content:
          "Décris ton bot, l'IA écrit sa logique, la plateforme l'exécute. Un webhook par bot, zéro serveur à gérer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

type BotRow = {
  id: string;
  name: string;
  description: string | null;
  bot_username: string | null;
  webhook_status: string;
  updated_at: string;
};

function Home() {
  const { session } = useAuth();
  return session ? <Dashboard /> : <Landing />;
}

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent)]" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-display text-lg font-semibold">
          <Bot className="size-5 text-primary" /> BotForge Studio
        </div>
        <Link
          to="/auth"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Commencer
        </Link>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 pb-24">
        <p className="mt-16 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" /> Uniquement pour Telegram
        </p>
        <h1 className="mt-6 max-w-3xl font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
          Décris ton bot Telegram.
          <span className="block text-primary">Il existe deux minutes plus tard.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Colle ton token BotFather, discute en langage naturel, et la plateforme exécute la logique
          de ton bot pour toi. Calculatrice, météo, prédictions, modération de groupe, quiz, support —
          pas seulement des chatbots.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            to="/auth"
            className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Créer mon premier bot
          </Link>
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-border bg-card px-5 py-3 text-sm font-medium hover:bg-accent"
          >
            Obtenir un token BotFather
          </a>
        </div>

        <div className="mt-20 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Terminal,
              title: "Studio de vibe coding",
              body: "Tu écris l'intention, l'IA écrit les déclencheurs et les actions. Tu vois la logique se construire en direct.",
            },
            {
              icon: Zap,
              title: "Simulateur Telegram",
              body: "Teste chaque commande dans un faux chat avant d'activer le bot pour de vrai.",
            },
            {
              icon: Radio,
              title: "Exécution hébergée",
              body: "Une adresse webhook dédiée par bot. Aucun VPS, aucun déploiement à gérer.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-card p-6">
              <item.icon className="size-5 text-primary" />
              <h2 className="mt-4 font-display text-lg font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function Dashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: bots, isLoading } = useQuery({
    queryKey: ["bots"],
    queryFn: async (): Promise<BotRow[]> => {
      const { data, error } = await supabase
        .from("bots")
        .select("id, name, description, bot_username, webhook_status, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Session expirée");
      const { data, error } = await supabase
        .from("bots")
        .insert({
          user_id: userId,
          name: name.trim() || "Nouveau bot",
          description: description.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      setName("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["bots"] });
      navigate({ to: "/bots/$botId", params: { botId: id } });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Création impossible"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bots"] }),
  });

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="font-display text-3xl font-semibold">Mes bots</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chaque bot a son token, ses clés et sa propre adresse webhook.
        </p>

        <div className="mt-8 rounded-2xl border border-border bg-card p-5">
          <p className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Nouveau bot
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto]">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom du bot"
              className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex : bot météo pour mon groupe de randonnée"
              className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() => create.mutate()}
              disabled={create.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              <Plus className="size-4" /> Créer
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {bots?.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun bot pour l'instant.</p>
          )}
          {bots?.map((bot) => (
            <div
              key={bot.id}
              className="group rounded-2xl border border-border bg-card p-5 transition hover:border-primary/50"
            >
              <div className="flex items-start justify-between gap-3">
                <Link
                  to="/bots/$botId"
                  params={{ botId: bot.id }}
                  className="font-display text-lg font-semibold hover:text-primary"
                >
                  {bot.name}
                </Link>
                <button
                  onClick={() => remove.mutate(bot.id)}
                  className="rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                  aria-label="Supprimer le bot"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {bot.description ?? "Pas de description"}
              </p>
              <div className="mt-4 flex items-center gap-3 text-xs">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                    bot.webhook_status === "active"
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Radio className="size-3" />
                  {bot.webhook_status === "active" ? "En ligne" : "Hors ligne"}
                </span>
                {bot.bot_username && (
                  <span className="text-muted-foreground">@{bot.bot_username}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export function TopBar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!user) return;
  }, [user]);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2 font-display font-semibold">
          <Bot className="size-5 text-primary" /> BotForge Studio
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden text-muted-foreground sm:inline">{user?.email}</span>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
            className="rounded-lg border border-border px-3 py-1.5 hover:bg-accent"
          >
            Déconnexion
          </button>
        </div>
      </div>
    </header>
  );
}
