CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.medical_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL UNIQUE,
  file_type text,
  file_size bigint,
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.medical_documents TO authenticated;
GRANT ALL ON public.medical_documents TO service_role;

ALTER TABLE public.medical_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own medical documents" ON public.medical_documents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own medical documents" ON public.medical_documents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own medical documents" ON public.medical_documents
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own medical documents" ON public.medical_documents
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX medical_documents_user_id_idx ON public.medical_documents(user_id);

CREATE TRIGGER medical_documents_updated_at
  BEFORE UPDATE ON public.medical_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users read own medical library files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'medical-library' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own medical library files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'medical-library' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own medical library files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'medical-library' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own medical library files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'medical-library' AND auth.uid()::text = (storage.foldername(name))[1]);