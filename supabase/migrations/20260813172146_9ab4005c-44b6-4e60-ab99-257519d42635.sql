ALTER TABLE public.health_records
  ADD COLUMN IF NOT EXISTS record_type text,
  ADD COLUMN IF NOT EXISTS record_date date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_type text;

CREATE TABLE IF NOT EXISTS public.health_record_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id uuid not null references public.health_records(id) on delete cascade,
  summary text,
  key_findings jsonb not null default '[]'::jsonb,
  values jsonb not null default '[]'::jsonb,
  abnormal jsonb not null default '[]'::jsonb,
  simple_explanation text,
  doctor_questions jsonb not null default '[]'::jsonb,
  urgent_note text,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_record_analyses TO authenticated;
GRANT ALL ON public.health_record_analyses TO service_role;
ALTER TABLE public.health_record_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own record analyses" ON public.health_record_analyses
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS health_record_analyses_record_idx ON public.health_record_analyses(record_id, created_at DESC);