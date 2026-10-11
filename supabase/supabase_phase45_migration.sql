-- Cravex Phase 4–5 additive migration. Review in staging first.
-- This migration assumes Phase 1 RLS hardening is already complete.
create table if not exists resources (
  id uuid primary key default gen_random_uuid(), college_id uuid not null references colleges(id) on delete cascade,
  title text not null, description text, file_path text, subject_id uuid references subjects(id) on delete set null,
  branch text default 'All', division text default 'All', semester integer, uploaded_by text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','archived')),
  created_at timestamptz not null default now(), approved_at timestamptz, approved_by text
);
create table if not exists resource_requests (
  id uuid primary key default gen_random_uuid(), college_id uuid not null references colleges(id) on delete cascade,
  requested_by text not null, resource_id uuid references resources(id) on delete set null,
  query text not null, status text not null default 'open' check (status in ('open','fulfilled','closed')),
  created_at timestamptz not null default now(), fulfilled_at timestamptz
);
create table if not exists risk_cases (
  id uuid primary key default gen_random_uuid(), college_id uuid not null references colleges(id) on delete cascade,
  student_phone text not null, student_name text, branch text, division text, semester integer,
  risk_type text not null check (risk_type in ('attendance','marks','combined')),
  score numeric not null default 0, reason text, status text not null default 'open' check (status in ('open','in_progress','resolved','dismissed')),
  owner_phone text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), resolved_at timestamptz
);
create table if not exists evidence_packs (
  id uuid primary key default gen_random_uuid(), college_id uuid not null references colleges(id) on delete cascade,
  title text not null, academic_year text not null, branch text, semester integer, period_start date, period_end date,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','rejected')),
  generated_by text, generated_at timestamptz not null default now(), approved_by text, approved_at timestamptz,
  payload jsonb not null default '{}'::jsonb
);
create table if not exists evidence_approvals (
  id uuid primary key default gen_random_uuid(), college_id uuid not null references colleges(id) on delete cascade,
  evidence_pack_id uuid not null references evidence_packs(id) on delete cascade, reviewer_phone text not null,
  decision text not null check (decision in ('approved','rejected','changes_requested')), comment text, created_at timestamptz not null default now()
);
create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(), college_id uuid not null references colleges(id) on delete cascade,
  event_type text not null, provider text, units numeric default 1, estimated_cost numeric default 0,
  external_id text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), unique(college_id, external_id)
);
create index if not exists resources_college_status_idx on resources(college_id,status,created_at desc);
create index if not exists risk_cases_college_status_idx on risk_cases(college_id,status,score desc);
create index if not exists evidence_packs_college_status_idx on evidence_packs(college_id,status,generated_at desc);
create index if not exists usage_events_college_created_idx on usage_events(college_id,created_at desc);
-- Apply tenant RLS policies only after confirming the membership helper from Phase 1.
-- alter table resources enable row level security; ...
