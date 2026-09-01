ALTER TABLE public.medicines
  ADD COLUMN IF NOT EXISTS strength text,
  ADD COLUMN IF NOT EXISTS times time[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS start_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS reminder_app boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_sms boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_lead_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

UPDATE public.medicines
SET times = ARRAY[reminder_time]::time[]
WHERE reminder_time IS NOT NULL AND (times IS NULL OR array_length(times, 1) IS NULL);

DROP TRIGGER IF EXISTS medicines_set_updated_at ON public.medicines;
CREATE TRIGGER medicines_set_updated_at BEFORE UPDATE ON public.medicines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.medicine_doses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medicine_id uuid NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  scheduled_time time NOT NULL,
  status text NOT NULL DEFAULT 'taken',
  taken_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (medicine_id, scheduled_date, scheduled_time)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.medicine_doses TO authenticated;
GRANT ALL ON public.medicine_doses TO service_role;

ALTER TABLE public.medicine_doses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own medicine doses" ON public.medicine_doses
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS medicine_doses_user_date_idx ON public.medicine_doses (user_id, scheduled_date);

DROP TRIGGER IF EXISTS medicine_doses_set_updated_at ON public.medicine_doses;
CREATE TRIGGER medicine_doses_set_updated_at BEFORE UPDATE ON public.medicine_doses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();