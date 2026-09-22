import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, LogOut, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Telecraft — Crée ton bot Telegram en discutant" },
      {
        name: "description",
        content:
          "Telecraft transforme une simple conversation en bot Telegram fonctionnel : calcul, météo, quiz, gestion de groupe. Ton token, tes clés, aucun serveur à gérer.",
      },
      { property: "og:title", content: "Telecraft — Crée ton bot Telegram en discutant" },
      {
        property: "og:description",
        content: "Décris ton bot, Telecraft l'écrit et le met en ligne. Chaque version est restaurable.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { session, loading } = useAuth();
  if (loading && !session) return <Landing />;
  return session ? <Dashboard /> : <Landing />;
}

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Brand />
        <Link
          to="/auth"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Commencer
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
          Crée ton bot Telegram en discutant
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          Donne le nom et le token de ton bot, explique ce qu'il doit faire. Telecraft écrit la
          logique en direct et la met en ligne. Chaque version reste restaurable.
        </p>
        <Link
          to="/auth"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" /> Créer mon bot
        </Link>

        <div className="mt-16 grid gap-4 text-left sm:grid-cols-3">
          {[
            ["Tous les genres", "Calcul, météo, quiz, prédiction, gestion de groupe."],
            ["Tes clés", "Ton token BotFather et tes clés API restent les tiennes."],
            ["Historique", "Reviens à n'importe quelle version précédente en un clic."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-xl border border-border bg-card p-5">
              <p className="font-medium">{title}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Bot className="size-4" />
      </span>
      <span className="font-display text-lg font-semibold">Telecraft</span>
    </div>
  );
}

function Dashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [token, setToken] = useState("");

  const { data: bots, isLoading } = useQuery({
    queryKey: ["bots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bots")
        .select("id, name, bot_username, webhook_status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Session expirée.");
      const { data, error } = await supabase
        .from("bots")
        .insert({ user_id: userId, name: name.trim(), telegram_token: token.trim() })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setOpen(false);
      setName("");
      setToken("");
      void queryClient.invalidateQueries({ queryKey: ["bots"] });
      void navigate({ to: "/bots/$botId", params: { botId: data.id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bots"] });
      toast.success("Bot supprimé");
    },
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Brand />
          <button
            onClick={() => void supabase.auth.signOut()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <LogOut className="size-3.5" /> Déconnexion
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold">Mes bots</h1>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            aria-label="Créer un bot"
          >
            <Plus className="size-5" />
          </button>
        </div>

        {isLoading ? (
          <p className="mt-8 text-sm text-muted-foreground">Chargement…</p>
        ) : !bots?.length ? (
          <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
            <p className="text-muted-foreground">Aucun bot pour l'instant.</p>
            <button
              onClick={() => setOpen(true)}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Créer mon premier bot
            </button>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {bots.map((bot) => (
              <li
                key={bot.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
              >
                <Link
                  to="/bots/$botId"
                  params={{ botId: bot.id }}
                  className="min-w-0 flex-1"
                >
                  <p className="truncate font-medium">{bot.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {bot.bot_username ? `@${bot.bot_username} · ` : ""}
                    {bot.webhook_status === "active" ? "En ligne" : "Hors ligne"}
                  </p>
                </Link>
                <button
                  onClick={() => remove.mutate(bot.id)}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
                  aria-label="Supprimer"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-lg font-semibold">Nouveau bot</h2>
            <label className="mt-5 block text-sm font-medium">Nom du bot</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mon assistant météo"
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <label className="mt-4 block text-sm font-medium">Token BotFather</label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AA..."
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Crée le bot avec @BotFather sur Telegram, puis colle ici le token qu'il te donne.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent"
              >
                Annuler
              </button>
              <button
                onClick={() => create.mutate()}
                disabled={!name.trim() || !token.trim() || create.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {create.isPending ? "Création…" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
