-- =============================================================================
-- Library Pro — Complete Supabase Setup (single-file)
-- =============================================================================
-- Run this ONE file in the Supabase SQL Editor on a fresh project to provision:
--   • All tables (categories, books, students, book_issues, fines, user_roles)
--   • Enum type public.app_role
--   • RLS enabled + admin-only policies (via public.has_role)
--   • Helper RPCs: has_role, has_any_admin, bootstrap_admin
--   • Storage bucket `library-images` + RLS policies on storage.objects
--   • All required GRANTs for the Data API (anon / authenticated / service_role)
--
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE / DROP-IF-EXISTS
-- guards, so applying it to a partially-migrated project will heal it.
--
-- First admin: after running this file, sign up in the app; the first signed-in
-- user can call public.bootstrap_admin() to claim the admin role (the app does
-- this automatically on the auth page).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extensions
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 2. Roles enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- 3. Core tables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id     SERIAL PRIMARY KEY,
  name   TEXT NOT NULL,
  descr  TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.books (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  isbn       TEXT DEFAULT '',
  cat_id     INT REFERENCES public.categories(id),
  pub_year   INT DEFAULT 2024,
  qty        INT DEFAULT 1,
  available  INT DEFAULT 1,
  cover_url  TEXT DEFAULT ''
);
ALTER TABLE public.books      ADD COLUMN IF NOT EXISTS cover_url TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS public.students (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  student_id  TEXT UNIQUE NOT NULL,
  email       TEXT DEFAULT '',
  phone       TEXT DEFAULT '',
  image_url   TEXT DEFAULT '',
  address     TEXT DEFAULT ''
);
ALTER TABLE public.students   ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS public.book_issues (
  id           SERIAL PRIMARY KEY,
  book_id      INT REFERENCES public.books(id),
  student_id   INT REFERENCES public.students(id),
  issue_date   DATE DEFAULT CURRENT_DATE,
  due_date     DATE NOT NULL,
  return_date  DATE,
  status       TEXT DEFAULT 'Issued'
);
ALTER TABLE public.book_issues ADD COLUMN IF NOT EXISTS return_date DATE;

CREATE TABLE IF NOT EXISTS public.fines (
  id          SERIAL PRIMARY KEY,
  issue_id    INT REFERENCES public.book_issues(id),
  student_id  INT REFERENCES public.students(id),
  amount      NUMERIC DEFAULT 0,
  status      TEXT DEFAULT 'Unpaid'
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        public.app_role NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- -----------------------------------------------------------------------------
-- 4. GRANTs (Data API access — required in addition to RLS)
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.books       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_issues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fines       TO authenticated;
GRANT SELECT                          ON public.user_roles TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE categories_id_seq  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE books_id_seq       TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE students_id_seq    TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE book_issues_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE fines_id_seq       TO authenticated;

GRANT ALL ON public.categories,  public.books, public.students,
             public.book_issues, public.fines, public.user_roles TO service_role;

-- -----------------------------------------------------------------------------
-- 5. Row Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE public.categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles  ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 6. Security-definer role check (must exist before policies reference it)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Policies — admin-only for all library tables, self-read for user_roles
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "auth all"                 ON public.categories;
DROP POLICY IF EXISTS "auth all"                 ON public.books;
DROP POLICY IF EXISTS "auth all"                 ON public.students;
DROP POLICY IF EXISTS "auth all"                 ON public.book_issues;
DROP POLICY IF EXISTS "auth all"                 ON public.fines;
DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
DROP POLICY IF EXISTS "Admins manage books"      ON public.books;
DROP POLICY IF EXISTS "Admins manage students"   ON public.students;
DROP POLICY IF EXISTS "Admins manage issues"     ON public.book_issues;
DROP POLICY IF EXISTS "Admins manage fines"      ON public.fines;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "Admins manage categories" ON public.categories  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage books"      ON public.books       FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage students"   ON public.students    FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage issues"     ON public.book_issues FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage fines"      ON public.fines       FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 8. Bootstrap RPCs — first signed-in user can claim admin
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_any_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'::public.app_role)
$$;
GRANT EXECUTE ON FUNCTION public.has_any_admin() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'::public.app_role) THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (uid, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.bootstrap_admin() TO authenticated;

-- -----------------------------------------------------------------------------
-- 9. Storage bucket + RLS policies
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('library-images', 'library-images', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins manage library-images" ON storage.objects;
DROP POLICY IF EXISTS "Public read library-images"   ON storage.objects;

CREATE POLICY "Admins manage library-images"
  ON storage.objects FOR ALL TO authenticated
  USING      (bucket_id = 'library-images' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'library-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Public read library-images"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'library-images');

-- =============================================================================
-- Done. Verify with:  select * from public.has_any_admin();
-- =============================================================================