ALTER TABLE public.students ADD COLUMN IF NOT EXISTS address text DEFAULT '';
ALTER TABLE public.book_issues ADD COLUMN IF NOT EXISTS return_date date;