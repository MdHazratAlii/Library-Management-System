
-- Broaden table policies from admin-only to any authenticated user
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['books','categories','students','book_issues','fines'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage %1$s" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated manage %1$s" ON public.%1$s', t);
    EXECUTE format($p$CREATE POLICY "Authenticated manage %1$s" ON public.%1$s FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$, t);
  END LOOP;
END $$;

-- Storage policies for library-images bucket
DROP POLICY IF EXISTS "library-images read" ON storage.objects;
DROP POLICY IF EXISTS "library-images insert" ON storage.objects;
DROP POLICY IF EXISTS "library-images update" ON storage.objects;
DROP POLICY IF EXISTS "library-images delete" ON storage.objects;

CREATE POLICY "library-images read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'library-images');

CREATE POLICY "library-images insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'library-images');

CREATE POLICY "library-images update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'library-images')
  WITH CHECK (bucket_id = 'library-images');

CREATE POLICY "library-images delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'library-images');
