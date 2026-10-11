-- ================================================================
-- CRAVEX — LESSON PLAN, PART 2: VTU-STYLE FIELDS
-- Run AFTER lesson_plan_schema.sql. Purely additive — safe to run
-- on a database that already has lesson_plan_topics/progress.
-- ================================================================

-- ── COURSE OUTCOMES (master list per subject) ─────────────────────────
-- Defined once per subject: CO1, CO2... with description and Bloom's
-- level, matching the VTU course-outcome format. Topics reference
-- these by co_code (free text, e.g. "CO2" or "CO2, CO3").
CREATE TABLE IF NOT EXISTS course_outcomes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id    UUID REFERENCES colleges(id) ON DELETE CASCADE,
  subject_id    UUID REFERENCES subjects(id) ON DELETE CASCADE,
  co_code       TEXT NOT NULL,           -- e.g. 'CO1'
  description   TEXT NOT NULL,           -- e.g. 'Describe core database concepts and architecture'
  blooms_level  TEXT,                    -- e.g. 'L1, L2'
  order_index   INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE course_outcomes DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_co_subject ON course_outcomes(subject_id, order_index);

-- ── LESSON PLAN TOPICS: add VTU-style columns ─────────────────────────
ALTER TABLE lesson_plan_topics ADD COLUMN IF NOT EXISTS week_number     INTEGER;
ALTER TABLE lesson_plan_topics ADD COLUMN IF NOT EXISTS planned_hours   NUMERIC(4,1);
ALTER TABLE lesson_plan_topics ADD COLUMN IF NOT EXISTS teaching_method TEXT;   -- e.g. 'Chalk & Board', 'PPT / Slides', 'Live Coding / ICT'
ALTER TABLE lesson_plan_topics ADD COLUMN IF NOT EXISTS assessment      TEXT;   -- e.g. 'Quiz on Architecture', 'CIE Test 1'

-- ── COVERAGE SUMMARY VIEW: now also tracks hours ─────────────────────
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
  )                                                                 AS coverage_percent,
  COALESCE(SUM(lpt.planned_hours), 0)                              AS total_hours,
  COALESCE(SUM(lpt.planned_hours) FILTER (WHERE lpp.status = 'completed'), 0) AS hours_delivered
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
WHERE table_schema = 'public' AND table_name = 'course_outcomes';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'lesson_plan_topics'
  AND column_name IN ('week_number','planned_hours','teaching_method','assessment');
