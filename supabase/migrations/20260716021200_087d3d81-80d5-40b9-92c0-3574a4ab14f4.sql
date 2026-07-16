
CREATE TABLE public.categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  descr TEXT DEFAULT ''
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE categories_id_seq TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all" ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.books (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  isbn TEXT DEFAULT '',
  cat_id INT REFERENCES public.categories(id),
  pub_year INT DEFAULT 2024,
  qty INT DEFAULT 1,
  available INT DEFAULT 1
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE books_id_seq TO authenticated;
GRANT ALL ON public.books TO service_role;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all" ON public.books FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.students (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  student_id TEXT UNIQUE NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  image_url TEXT DEFAULT ''
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE students_id_seq TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all" ON public.students FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.book_issues (
  id SERIAL PRIMARY KEY,
  book_id INT REFERENCES public.books(id),
  student_id INT REFERENCES public.students(id),
  issue_date DATE DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'Issued'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_issues TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE book_issues_id_seq TO authenticated;
GRANT ALL ON public.book_issues TO service_role;
ALTER TABLE public.book_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all" ON public.book_issues FOR ALL TO authenticated USING (true) WITH CHECK (true);

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
CREATE POLICY "auth all" ON public.fines FOR ALL TO authenticated USING (true) WITH CHECK (true);
