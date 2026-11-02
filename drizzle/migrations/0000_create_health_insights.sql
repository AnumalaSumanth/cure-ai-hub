CREATE TABLE public.health_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, DELETE ON public.health_insights TO authenticated;
GRANT ALL ON public.health_insights TO service_role;

ALTER TABLE public.health_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own insights"
  ON public.health_insights FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own insights"
  ON public.health_insights FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own insights"
  ON public.health_insights FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX health_insights_user_created_idx
  ON public.health_insights (user_id, created_at DESC);