CREATE TABLE public.bot_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, path)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_files TO authenticated;
GRANT ALL ON public.bot_files TO service_role;
ALTER TABLE public.bot_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bot files" ON public.bot_files FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_bot_files_updated_at BEFORE UPDATE ON public.bot_files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.studio_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL,
  seq integer NOT NULL DEFAULT 0,
  type text NOT NULL,
  label text NOT NULL DEFAULT '',
  detail text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_events TO authenticated;
GRANT ALL ON public.studio_events TO service_role;
ALTER TABLE public.studio_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own studio events" ON public.studio_events FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX studio_events_bot_idx ON public.studio_events (bot_id, created_at);

CREATE TABLE public.bot_store (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_store TO authenticated;
GRANT ALL ON public.bot_store TO service_role;
ALTER TABLE public.bot_store ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage own bot store" ON public.bot_store FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bots b WHERE b.id = bot_store.bot_id AND b.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bots b WHERE b.id = bot_store.bot_id AND b.user_id = auth.uid()));

ALTER TABLE public.bot_versions ADD COLUMN files jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.studio_messages ADD COLUMN turn_id uuid;