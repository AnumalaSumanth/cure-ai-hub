
ALTER TABLE public.tips
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_summary text;

-- Only one featured tip per user
CREATE UNIQUE INDEX IF NOT EXISTS tips_one_featured_per_user
  ON public.tips (user_id) WHERE is_featured = true;
