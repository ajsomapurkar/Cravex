-- F03 Principal governance (additive). Apply on staging before production.
-- Meetings, action items, and optional acting HOD delegation on departments.

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS acting_hod_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acting_hod_until date;

CREATE TABLE IF NOT EXISTS public.institution_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
  title text NOT NULL,
  scheduled_at timestamptz,
  location_or_link text,
  agenda text,
  minutes text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.institution_meeting_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.institution_meetings(id) ON DELETE CASCADE,
  description text NOT NULL,
  owner_phone text,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS institution_meetings_college_sched_idx
  ON public.institution_meetings (college_id, scheduled_at DESC);

CREATE TABLE IF NOT EXISTS public.principal_decision_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected', 'returned', 'escalated')),
  comment text,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_phone text,
  actor_role text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS principal_decision_audit_college_idx
  ON public.principal_decision_audit (college_id, created_at DESC);

ALTER TABLE public.institution_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_meeting_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.principal_decision_audit ENABLE ROW LEVEL SECURITY;
