
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS cover_url text DEFAULT '';

CREATE POLICY "Admins manage library-images"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'library-images' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'library-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Public read library-images"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'library-images');
