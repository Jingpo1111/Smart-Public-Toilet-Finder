-- Supabase hardening (safe on plain PostgreSQL too).
--
-- Supabase exposes the `public` schema through its auto-generated REST/GraphQL APIs and, by default,
-- grants table privileges to the `anon` and `authenticated` roles. ToiletGo KH never uses those APIs:
-- the browser talks only to the NestJS backend, which connects as the table owner through Prisma.
--
-- 1. Enable Row Level Security on every table with NO policies → anon/authenticated see nothing.
--    The table owner (the role that ran these migrations and that DATABASE_URL uses) bypasses RLS.
-- 2. Revoke the default grants from anon/authenticated where those roles exist.
--
-- Tables added by future migrations must also get `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
  END IF;
END $$;
