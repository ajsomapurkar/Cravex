-- ================================================================
-- CRAVEX — LESSON PLAN (OBE) ADD-ON SCHEMA
-- Safe to run on your EXISTING database. Does not touch any
-- existing table. Run this once in the Supabase SQL Editor,
-- AFTER schema.sql has already been applied.
-- ================================================================

-- ── LESSON PLAN TOPICS ────────────────────────────────────────────────
-- The syllabus broken into topics, in teaching order. Shared across
-- every teacher/division that teaches this subject (same subject_id),
-- since the syllabus content itself doesn't change per section.
CREATE TABLE IF NOT EXISTS lesson_plan_topics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id    UUID REFERENCES colleges(id) ON DELETE CASCADE,
  subject_id    UUID REFERENCES subjects(id) ON DELETE CASCADE,
  module_name   TEXT,
  topic_name    TEXT NOT NULL,
  co_code       TEXT,
  order_index   INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE lesson_plan_topics DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_lpt_subject ON lesson_plan_topics(subject_id, order_index);
CREATE INDEX IF NOT EXISTS idx_lpt_college ON lesson_plan_topics(college_id);

-- ── LESSON PLAN PROGRESS ──────────────────────────────────────────────
-- Completion is tracked per subject_assignment (i.e. per teacher +
-- division), NOT per subject, since two teachers on the same subject
-- in different divisions move at different paces.
-- session_date = the date the teacher says they actually covered it
-- (can be backdated). completed_at = when they logged it (audit trail).
CREATE TABLE IF NOT EXISTS lesson_plan_progress (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id               UUID REFERENCES lesson_plan_topics(id) ON DELETE CASCADE,
  subject_assignment_id  UUID REFERENCES subject_assignments(id) ON DELETE CASCADE,
  status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  session_date           DATE,
  completed_at           TIMESTAMPTZ,
  marked_via             TEXT DEFAULT 'web',
  updated_by             TEXT,
  UNIQUE(topic_id, subject_assignment_id)
);
ALTER TABLE lesson_plan_progress DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_lpp_assignment ON lesson_plan_progress(subject_assignment_id, status);
CREATE INDEX IF NOT EXISTS idx_lpp_topic ON lesson_plan_progress(topic_id);

-- ── COVERAGE SUMMARY VIEW ─────────────────────────────────────────────
-- One row per teacher+subject+division, with a live coverage %.
-- Powers the admin/HOD overview, and is ready for the WhatsApp bot
-- ("today's plan") to query later.
DROP VIEW IF EXISTS lesson_plan_summary;
CREATE VIEW lesson_plan_summary AS
SELECT
  sa.id                AS subject_assignment_id,
  sa.college_id,
  sa.teacher_phone,
  sa.subject_id,
  s.name               AS subject_name,
  s.code               AS subject_code,
  sa.branch,
  sa.semester,
  sa.division,
  COUNT(lpt.id)                                                    AS total_topics,
  COUNT(lpp.id) FILTER (WHERE lpp.status = 'completed')            AS completed_topics,
  ROUND(
    COUNT(lpp.id) FILTER (WHERE lpp.status = 'completed')::NUMERIC
    * 100.0 / NULLIF(COUNT(lpt.id), 0), 1
  )                                                                 AS coverage_percent
FROM subject_assignments sa
JOIN subjects s ON s.id = sa.subject_id
LEFT JOIN lesson_plan_topics lpt
  ON lpt.subject_id = sa.subject_id AND lpt.is_active = true
LEFT JOIN lesson_plan_progress lpp
  ON lpp.topic_id = lpt.id AND lpp.subject_assignment_id = sa.id
GROUP BY sa.id, sa.college_id, sa.teacher_phone, sa.subject_id,
         s.name, s.code, sa.branch, sa.semester, sa.division;

-- ================================================================
-- VERIFY
-- ================================================================
SELECT table_name, 'OK' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('lesson_plan_topics', 'lesson_plan_progress');
