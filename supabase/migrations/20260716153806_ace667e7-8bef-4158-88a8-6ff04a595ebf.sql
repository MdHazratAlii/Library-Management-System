-- Auto-grant admin role to the very first user who signs up.
-- Safe because it only fires when no admin exists yet; after that, no one
-- can self-promote (user_roles has no INSERT policy for authenticated users).

CREATE OR REPLACE FUNCTION public.grant_admin_to_first_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'::public.app_role
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_first_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_first_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_admin_to_first_user();