
-- Restore admin-only RLS on library tables
DROP POLICY IF EXISTS "Authenticated manage categories"  ON public.categories;
DROP POLICY IF EXISTS "Authenticated manage books"       ON public.books;
DROP POLICY IF EXISTS "Authenticated manage students"    ON public.students;
DROP POLICY IF EXISTS "Authenticated manage book_issues" ON public.book_issues;
DROP POLICY IF EXISTS "Authenticated manage fines"       ON public.fines;
DROP POLICY IF EXISTS "Admins manage issues"             ON public.book_issues;

CREATE POLICY "Admins manage categories" ON public.categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage books" ON public.books
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage students" ON public.students
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage book_issues" ON public.book_issues
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage fines" ON public.fines
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Revoke public EXECUTE on has_role (used only inside RLS as SECURITY DEFINER)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

-- Storage: restrict anon reads to non-sensitive prefixes only (book covers).
-- Student photos live under students/ and must be fetched via signed URLs.
DROP POLICY IF EXISTS "library-images read" ON storage.objects;

CREATE POLICY "library-images read books" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'library-images'
    AND (
      (storage.foldername(name))[1] = 'books'
      OR auth.role() = 'authenticated'
    )
  );
