CREATE TABLE public.bot_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  version INTEGER NOT NULL,
  label TEXT,
  spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (bot_id, version)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_versions TO authenticated;
GRANT ALL ON public.bot_versions TO service_role;

ALTER TABLE public.bot_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own bot versions" ON public.bot_versions
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX bot_versions_bot_id_idx ON public.bot_versions (bot_id, version DESC);