import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Bot } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — BotForge Studio" },
      {
        name: "description",
        content:
          "Connecte-toi à BotForge Studio pour créer tes bots Telegram en langage naturel, avec tes propres tokens.",
      },
      { property: "og:title", content: "Connexion — BotForge Studio" },
      {
        property: "og:description",
        content: "Crée et fais vivre tes bots Telegram en discutant avec l'IA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/" });
  }, [session, navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Compte créé. Vérifie ta boîte mail pour confirmer.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connexion impossible");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Connexion Google impossible");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
            <Bot className="size-6" />
          </span>
          <div>
            <p className="font-display text-lg font-semibold">BotForge Studio</p>
            <p className="text-sm text-muted-foreground">Vibe coding pour bots Telegram</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-primary/5">
          <h1 className="font-display text-2xl font-semibold">
            {mode === "signin" ? "Content de te revoir" : "Créer un compte"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tes tokens et clés restent liés à ton seul compte.
          </p>

          <button
            type="button"
            onClick={google}
            className="mt-6 w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition hover:bg-accent"
          >
            Continuer avec Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            ou
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="toi@exemple.com"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {mode === "signin" ? "Se connecter" : "Créer mon compte"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {mode === "signin" ? "Pas encore de compte ? S'inscrire" : "J'ai déjà un compte"}
          </button>
        </div>
      </div>
    </div>
  );
}
