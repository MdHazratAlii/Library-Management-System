
-- Shared trigger function to keep updated_at fresh on every row update.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- books
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS set_books_updated_at ON public.books;
CREATE TRIGGER set_books_updated_at
  BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- categories
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS set_categories_updated_at ON public.categories;
CREATE TRIGGER set_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- students
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS set_students_updated_at ON public.students;
CREATE TRIGGER set_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- book_issues
ALTER TABLE public.book_issues
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS set_book_issues_updated_at ON public.book_issues;
CREATE TRIGGER set_book_issues_updated_at
  BEFORE UPDATE ON public.book_issues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- fines
ALTER TABLE public.fines
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS set_fines_updated_at ON public.fines;
CREATE TRIGGER set_fines_updated_at
  BEFORE UPDATE ON public.fines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
