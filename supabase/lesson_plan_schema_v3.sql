-- ================================================================
-- CRAVEX — LESSON PLAN, PART 3: HOD-FORMAT FIELDS
-- Run AFTER lesson_plan_schema.sql and lesson_plan_schema_v2.sql.
-- Purely additive — safe to run on a database that already has
-- lesson_plan_topics / lesson_plan_progress / course_outcomes.
--
-- Adds what the actual HOD lesson-plan doc (e.g. BAD402_LessonPlan.docx)
-- has that we didn't: Planned Date + Remarks per topic-progress row,
-- a Subject Profile block (credits, L:T:P:S, CIE/SEE, textbooks, CLOs),
-- and a CO-PO Mapping Matrix (CO1..CO5 x PO1..PO11, level 1/2/3).
-- ================================================================

-- ── LESSON PLAN PROGRESS: add Planned Date + Remarks ──────────────────
-- session_date already = "Engaged Date" in the HOD doc.
ALTER TABLE lesson_plan_progress ADD COLUMN IF NOT EXISTS planned_date DATE;
ALTER TABLE lesson_plan_progress ADD COLUMN IF NOT EXISTS remarks      TEXT;

-- ── SUBJECT PROFILE (one row per subject) ─────────────────────────────
-- The header block of the HOD doc: course title, credits, L:T:P:S,
-- CIE/SEE/total marks, exam hours, assessment tools, textbooks,
-- reference books, prerequisites and CLOs (Course Learning Objectives —
-- distinct from Course Outcomes, which stay in course_outcomes).
CREATE TABLE IF NOT EXISTS subject_profile (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id          UUID REFERENCES colleges(id) ON DELETE CASCADE,
  subject_id          UUID UNIQUE REFERENCES subjects(id) ON DELETE CASCADE,
  course_title        TEXT,
  ltps                TEXT,             -- raw e.g. '3:0:2:0'
  total_theory_hours  INTEGER,          -- e.g. 40
  total_lab_note      TEXT,             -- e.g. '8-10 Lab Sessions' (kept as text — not a clean number)
  credits             INTEGER,
  cie_marks           INTEGER,
  see_marks           INTEGER,
  total_marks         INTEGER,
  exam_hours          INTEGER,
  assessment_tools    TEXT,             -- free text, e.g. 'CIE (15M) + Assignment (10M) + Lab Records (15M) + Lab Exam (10M)'
  textbooks           JSONB DEFAULT '[]'::jsonb,     -- array of strings
  reference_books     JSONB DEFAULT '[]'::jsonb,     -- array of strings
  prerequisites       JSONB DEFAULT '[]'::jsonb,     -- array of strings
  clos                JSONB DEFAULT '[]'::jsonb,     -- array of {code, description}
  course_coordinator  TEXT,
  updated_by          TEXT,
  updated_at          TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE subject_profile DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sp_subject ON subject_profile(subject_id);

-- ── CO-PO MAPPING MATRIX ───────────────────────────────────────────────
-- One row per (course_outcome, PO). level is 1/2/3 (NBA scale) or NULL
-- for '-' (no correlation). PO1..PO11 are the standard NBA POs.
CREATE TABLE IF NOT EXISTS co_po_mapping (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id    UUID REFERENCES colleges(id) ON DELETE CASCADE,
  subject_id    UUID REFERENCES subjects(id) ON DELETE CASCADE,
  co_id         UUID REFERENCES course_outcomes(id) ON DELETE CASCADE,
  po_code       TEXT NOT NULL,          -- 'PO1'..'PO11'
  level         INTEGER CHECK (level IN (1,2,3)),   -- NULL = '-' (no correlation)
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(co_id, po_code)
);
ALTER TABLE co_po_mapping DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_copo_subject ON co_po_mapping(subject_id);
CREATE INDEX IF NOT EXISTS idx_copo_co ON co_po_mapping(co_id);

-- ================================================================
-- VERIFY
-- ================================================================
SELECT table_name, 'OK' AS status
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('subject_profile', 'co_po_mapping');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'lesson_plan_progress' AND column_name IN ('planned_date', 'remarks');
