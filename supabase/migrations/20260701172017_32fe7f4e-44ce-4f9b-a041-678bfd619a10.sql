
CREATE TABLE public.tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  category text,
  content text NOT NULL,
  target_audience text,
  status text NOT NULL DEFAULT 'Draft',
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tips TO authenticated;
GRANT ALL ON public.tips TO service_role;

ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tips" ON public.tips
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX tips_user_created_idx ON public.tips (user_id, created_at DESC);
CREATE INDEX tips_tags_gin_idx ON public.tips USING GIN (tags);

CREATE OR REPLACE FUNCTION public.tips_validate_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('Draft','Published','Archived') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tips_before_write
BEFORE INSERT OR UPDATE ON public.tips
FOR EACH ROW EXECUTE FUNCTION public.tips_validate_status();
