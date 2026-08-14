ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_method text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS reminder_offset text NOT NULL DEFAULT '1_day',
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_error text;

CREATE INDEX IF NOT EXISTS appointments_reminder_due_idx
  ON public.appointments (appointment_date)
  WHERE reminder_sent_at IS NULL AND reminder_method <> 'none';