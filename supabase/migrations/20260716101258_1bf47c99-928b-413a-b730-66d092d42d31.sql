CREATE TABLE public.categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  descr TEXT DEFAULT ''
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE categories_id_seq TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.books (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  isbn TEXT DEFAULT '',
  cat_id INT REFERENCES public.categories(id),
  pub_year INT DEFAULT 2024,
  qty INT DEFAULT 1,
  available INT DEFAULT 1,
  cover_url TEXT DEFAULT ''
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE books_id_seq TO authenticated;
GRANT ALL ON public.books TO service_role;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.students (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  student_id TEXT UNIQUE NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  address TEXT DEFAULT ''
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE students_id_seq TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.book_issues (
  id SERIAL PRIMARY KEY,
  book_id INT REFERENCES public.books(id),
  student_id INT REFERENCES public.students(id),
  issue_date DATE DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  return_date DATE,
  status TEXT DEFAULT 'Issued'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_issues TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE book_issues_id_seq TO authenticated;
GRANT ALL ON public.book_issues TO service_role;
ALTER TABLE public.book_issues ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fines (
  id SERIAL PRIMARY KEY,
  issue_id INT REFERENCES public.book_issues(id),
  student_id INT REFERENCES public.students(id),
  amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Unpaid'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fines TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE fines_id_seq TO authenticated;
GRANT ALL ON public.fines TO service_role;
ALTER TABLE public.fines ENABLE ROW LEVEL SECURITY;

CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;

CREATE POLICY "Admins manage books" ON public.books FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage students" ON public.students FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage issues" ON public.book_issues FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage fines" ON public.fines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.has_any_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'::public.app_role)
$$;
GRANT EXECUTE ON FUNCTION public.has_any_admin() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'::public.app_role) THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.bootstrap_admin() TO authenticated;

CREATE POLICY "Admins manage library-images"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'library-images' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'library-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Public read library-images"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'library-images');