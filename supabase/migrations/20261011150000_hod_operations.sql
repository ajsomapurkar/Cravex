-- F04 HOD department operations — audit trail (additive)

CREATE TABLE IF NOT EXISTS public.hod_decision_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  source_type text NOT NULL,
  source_id uuid,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected', 'returned', 'escalated')),
  comment text,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_phone text,
  actor_role text NOT NULL DEFAULT 'hod',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hod_decision_audit_dept_idx
  ON public.hod_decision_audit (department_id, created_at DESC);

ALTER TABLE public.hod_decision_audit ENABLE ROW LEVEL SECURITY;
