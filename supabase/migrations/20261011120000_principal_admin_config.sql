-- Phase 1 (additive): Principal role + Admin Console configuration domain
-- Apply on staging/dev first. Do NOT run supabase/schema.sql on production.
-- Depends on: public.colleges, public.users, public.departments (if present)

-- ── 1. Principal role on users ─────────────────────────────────────────────
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (
  role IN (
    'master',
    'admin',
    'college_admin',
    'principal',
    'hod',
    'teacher',
    'student'
  )
);

COMMENT ON CONSTRAINT users_role_check ON public.users IS
  'Institution roles include principal; master is represented as admin with null college_id in app layer.';

-- Optional capability flags (additive; defaults preserve current behaviour)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── 2. Institution configuration (versioned, audited) ───────────────────────
CREATE TABLE IF NOT EXISTS public.institution_config_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
  namespace text NOT NULL DEFAULT 'general',
  config_key text NOT NULL,
  description text,
  published_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (college_id, namespace, config_key)
);

CREATE TABLE IF NOT EXISTS public.institution_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.institution_config_entries(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'superseded')),
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from timestamptz,
  published_at timestamptz,
  published_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  change_summary text,
  UNIQUE (entry_id, version_number)
);

ALTER TABLE public.institution_config_entries
  DROP CONSTRAINT IF EXISTS institution_config_entries_published_version_id_fkey;

ALTER TABLE public.institution_config_entries
  ADD CONSTRAINT institution_config_entries_published_version_id_fkey
  FOREIGN KEY (published_version_id) REFERENCES public.institution_config_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.config_change_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
  entry_id uuid REFERENCES public.institution_config_entries(id) ON DELETE SET NULL,
  version_id uuid REFERENCES public.institution_config_versions(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (
    action IN ('create_draft', 'update_draft', 'publish', 'archive', 'rollback', 'read')
  ),
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_phone text,
  actor_role text,
  before_value jsonb,
  after_value jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS institution_config_entries_college_idx
  ON public.institution_config_entries (college_id, namespace);

CREATE INDEX IF NOT EXISTS institution_config_versions_entry_status_idx
  ON public.institution_config_versions (entry_id, status, version_number DESC);

CREATE INDEX IF NOT EXISTS config_change_audit_college_created_idx
  ON public.config_change_audit (college_id, created_at DESC);

-- Seed keys (empty published state) — safe idempotent inserts
INSERT INTO public.institution_config_entries (college_id, namespace, config_key, description)
SELECT c.id, v.namespace, v.config_key, v.description
FROM public.colleges c
CROSS JOIN (
  VALUES
    ('attendance', 'vtu_minimum_percent', 'VTU minimum attendance threshold (percent)'),
    ('marks', 'ia_weights', 'Internal assessment weight configuration'),
    ('notifications', 'parent_alerts', 'Parent alert toggles and thresholds'),
    ('academic', 'current_semester', 'Active semester label for dashboards')
) AS v(namespace, config_key, description)
ON CONFLICT (college_id, namespace, config_key) DO NOTHING;

-- ── 3. RLS: config domain deny-by-default for browser roles ─────────────────
ALTER TABLE public.institution_config_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_change_audit ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: access only via service role / Edge Functions.

-- ── 4. Helper: next version number ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.next_config_version_number(p_entry_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(version_number), 0) + 1
  FROM public.institution_config_versions
  WHERE entry_id = p_entry_id;
$$;

REVOKE ALL ON FUNCTION public.next_config_version_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_config_version_number(uuid) TO service_role;
