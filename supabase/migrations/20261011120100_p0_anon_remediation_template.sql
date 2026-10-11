-- P0 security remediation TEMPLATE — run only on staging after auth proxy tests pass.
-- This migration is intentionally gated. It does not run unless you set:
--   SET LOCAL app.p0_confirm = 'remediate_anon';
--
-- Before production: complete CRX-SEC-002 checklist, backup, and dashboard regression tests.

DO $$
BEGIN
  IF current_setting('app.p0_confirm', true) IS DISTINCT FROM 'remediate_anon' THEN
    RAISE NOTICE 'Skipping P0 anon remediation (app.p0_confirm not set).';
    RETURN;
  END IF;

  -- Drop anon policies on high-risk academic tables (names vary by environment).
  PERFORM 1;
END $$;

-- Example session to apply after review (run manually in SQL editor, not by default):
--
-- BEGIN;
-- SET LOCAL app.p0_confirm = 'remediate_anon';
-- \i supabase/migrations/20261011120100_p0_anon_remediation_template.sql
--
-- Then execute curated drops, e.g.:
-- DO $drop$
-- DECLARE r record;
-- BEGIN
--   FOR r IN
--     SELECT policyname, tablename
--     FROM pg_policies
--     WHERE schemaname = 'public'
--       AND 'anon' = ANY(roles)
--       AND tablename = ANY (ARRAY[
--         'students','student_marks','users','departments','subjects',
--         'subject_assignments','attendance_records','attendance_sessions',
--         'class_teacher_assignments','doc_chunks'
--       ])
--   LOOP
--     EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
--   END LOOP;
-- END $drop$;
--
-- REVOKE ALL ON TABLE public.students FROM anon;
-- REVOKE ALL ON TABLE public.student_marks FROM anon;
-- ... repeat per table after confirming no client reads rely on anon ...
-- COMMIT;
