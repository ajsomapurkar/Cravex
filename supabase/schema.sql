-- ================================================================
-- CRAVEX v3 — COMPLETE IDEMPOTENT SCHEMA
-- Safe to run on NEW or EXISTING databases.
-- Run this as a single script in Supabase SQL Editor.
-- Strategy: DROP dependent views first → alter tables → recreate views
-- ================================================================

-- ── EXTENSIONS ───────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ================================================================
-- STEP 1: DROP VIEWS (prevents column type conflicts)
-- ================================================================
DROP VIEW IF EXISTS student_subject_attendance CASCADE;

-- ================================================================
-- STEP 2: CORE TABLES
-- ================================================================

-- ── COLLEGES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colleges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  location          TEXT,
  admin_phone       TEXT,
  affiliated_to     TEXT DEFAULT 'VTU',
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE colleges DISABLE ROW LEVEL SECURITY;

-- ── USERS (admins + teachers) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL DEFAULT 'Unknown',
  phone_number    TEXT NOT NULL UNIQUE,
  email           TEXT,
  role            TEXT NOT NULL CHECK (role IN ('master','admin','teacher')),
  college_id      UUID REFERENCES colleges(id) ON DELETE SET NULL,
  employee_id     TEXT,
  department_code TEXT,
  designation     TEXT DEFAULT 'Assistant Professor',
  qualification   TEXT,
  specialization  TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
-- Add new columns safely (won't fail if already exist)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS qualification TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS specialization TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_users_college_role ON users(college_id, role);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);

-- ── STUDENTS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL DEFAULT 'Unknown',
  phone_number  TEXT NOT NULL UNIQUE,
  college_id    UUID REFERENCES colleges(id) ON DELETE SET NULL,
  usn           TEXT,
  roll_number   TEXT,
  branch        TEXT,
  division      TEXT,
  semester      INTEGER CHECK (semester BETWEEN 1 AND 8),
  parent_phone  TEXT,
  parent_name   TEXT,
  email         TEXT,
  risk_score    NUMERIC DEFAULT 0,
  registered_by TEXT,
  is_active     BOOLEAN DEFAULT true,
  last_active   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE students DISABLE ROW LEVEL SECURITY;
ALTER TABLE students ADD COLUMN IF NOT EXISTS usn TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS roll_number TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS division TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS semester INTEGER;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS risk_score NUMERIC DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS registered_by TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_students_college ON students(college_id, branch, division, semester);
CREATE INDEX IF NOT EXISTS idx_students_phone ON students(phone_number);
CREATE INDEX IF NOT EXISTS idx_students_roll ON students(college_id, branch, semester, roll_number);

-- ── SUBJECTS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id   UUID REFERENCES colleges(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  code         TEXT,
  short_name   TEXT,
  branch       TEXT NOT NULL DEFAULT 'All',
  semester     INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 8),
  credits      INTEGER DEFAULT 4,
  subject_type TEXT DEFAULT 'theory',
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE subjects DISABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS short_name TEXT;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 4;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS subject_type TEXT DEFAULT 'theory';
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_subjects_college ON subjects(college_id, branch, semester);

-- ── SUBJECT ASSIGNMENTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subject_assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id     UUID REFERENCES colleges(id) ON DELETE CASCADE,
  teacher_phone  TEXT NOT NULL,
  subject_id     UUID REFERENCES subjects(id) ON DELETE CASCADE,
  branch         TEXT NOT NULL,
  semester       INTEGER NOT NULL,
  division       TEXT NOT NULL DEFAULT 'A',
  academic_year  TEXT DEFAULT to_char(now(),'YYYY'),
  is_active      BOOLEAN DEFAULT true,
  assigned_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(teacher_phone, subject_id, division, academic_year)
);
ALTER TABLE subject_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE subject_assignments ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT to_char(now(),'YYYY');
ALTER TABLE subject_assignments ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_sa_teacher ON subject_assignments(teacher_phone, college_id);
CREATE INDEX IF NOT EXISTS idx_sa_subject ON subject_assignments(subject_id);

-- ── ATTENDANCE SESSIONS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id      UUID REFERENCES colleges(id) ON DELETE CASCADE,
  subject_id      UUID REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_phone   TEXT NOT NULL,
  branch          TEXT NOT NULL,
  semester        INTEGER NOT NULL,
  division        TEXT NOT NULL DEFAULT 'A',
  session_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  period_number   INTEGER,
  total_students  INTEGER DEFAULT 0,
  present_count   INTEGER DEFAULT 0,
  absent_count    INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  closed_at       TIMESTAMPTZ
);
ALTER TABLE attendance_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS period_number INTEGER;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS notes TEXT;
CREATE INDEX IF NOT EXISTS idx_sess_college ON attendance_sessions(college_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_sess_subject ON attendance_sessions(subject_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_sess_teacher ON attendance_sessions(teacher_phone, status);

-- ── ATTENDANCE LOGS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  college_id     UUID REFERENCES colleges(id) ON DELETE CASCADE,
  student_phone  TEXT NOT NULL,
  student_name   TEXT,
  roll_number    TEXT,
  subject_id     UUID REFERENCES subjects(id) ON DELETE CASCADE,
  branch         TEXT,
  semester       INTEGER,
  division       TEXT,
  status         TEXT NOT NULL CHECK (status IN ('present','absent','late','excused')),
  marked_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, student_phone)
);
ALTER TABLE attendance_logs DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_logs_student ON attendance_logs(student_phone, subject_id);
CREATE INDEX IF NOT EXISTS idx_logs_session ON attendance_logs(session_id);

-- ── ATTENDANCE RECORDS (legacy overall %) ─────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number        TEXT NOT NULL,
  college_id          UUID REFERENCES colleges(id) ON DELETE CASCADE,
  student_name        TEXT,
  attendance_percent  NUMERIC,
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(phone_number, college_id)
);
ALTER TABLE attendance_records DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_att_rec ON attendance_records(college_id, attendance_percent);

-- ── STUDENT MARKS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_marks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number    TEXT NOT NULL,
  college_id      UUID REFERENCES colleges(id) ON DELETE CASCADE,
  subject         TEXT NOT NULL,
  subject_id      UUID REFERENCES subjects(id) ON DELETE SET NULL,
  test_type       TEXT DEFAULT 'IA',
  test_number     INTEGER DEFAULT 1,
  marks_obtained  NUMERIC NOT NULL,
  max_marks       NUMERIC DEFAULT 30,
  entered_by      TEXT,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(phone_number, college_id, subject, test_type, test_number)
);
ALTER TABLE student_marks DISABLE ROW LEVEL SECURITY;
ALTER TABLE student_marks ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL;
ALTER TABLE student_marks ADD COLUMN IF NOT EXISTS test_type TEXT DEFAULT 'IA';
ALTER TABLE student_marks ADD COLUMN IF NOT EXISTS entered_by TEXT;
CREATE INDEX IF NOT EXISTS idx_marks_student ON student_marks(phone_number, college_id);

-- ── PARENT CONTACTS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parent_contacts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_phone  TEXT NOT NULL,
  parent_phone   TEXT NOT NULL,
  parent_name    TEXT,
  relation       TEXT DEFAULT 'parent',
  college_id     UUID REFERENCES colleges(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_phone, college_id)
);
ALTER TABLE parent_contacts DISABLE ROW LEVEL SECURITY;

-- ── DOC CHUNKS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_chunks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content          TEXT NOT NULL,
  embedding        vector(768),
  college_id       UUID REFERENCES colleges(id) ON DELETE CASCADE,
  source           TEXT DEFAULT 'upload',
  source_file      TEXT,
  file_title       TEXT,
  subject_id       UUID REFERENCES subjects(id) ON DELETE SET NULL,
  target_branch    TEXT DEFAULT 'All',
  target_division  TEXT DEFAULT 'All',
  target_semester  INTEGER,
  uploaded_by      TEXT,
  upload_source    TEXT DEFAULT 'bot',
  chunk_index      INTEGER,
  created_at       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE doc_chunks DISABLE ROW LEVEL SECURITY;
ALTER TABLE doc_chunks ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE doc_chunks ADD COLUMN IF NOT EXISTS source_file TEXT;
ALTER TABLE doc_chunks ADD COLUMN IF NOT EXISTS file_title TEXT;
ALTER TABLE doc_chunks ADD COLUMN IF NOT EXISTS target_branch TEXT DEFAULT 'All';
ALTER TABLE doc_chunks ADD COLUMN IF NOT EXISTS target_division TEXT DEFAULT 'All';
ALTER TABLE doc_chunks ADD COLUMN IF NOT EXISTS target_semester INTEGER;
ALTER TABLE doc_chunks ADD COLUMN IF NOT EXISTS uploaded_by TEXT;
ALTER TABLE doc_chunks ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL;
ALTER TABLE doc_chunks ADD COLUMN IF NOT EXISTS upload_source TEXT DEFAULT 'bot';
ALTER TABLE doc_chunks ADD COLUMN IF NOT EXISTS chunk_index INTEGER;
CREATE INDEX IF NOT EXISTS idx_chunks_college ON doc_chunks(college_id, target_branch);

-- ── UPLOADED FILES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploaded_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id    UUID REFERENCES colleges(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,
  file_title    TEXT,
  subject_id    UUID REFERENCES subjects(id) ON DELETE SET NULL,
  branch        TEXT DEFAULT 'All',
  division      TEXT DEFAULT 'All',
  semester      INTEGER,
  uploaded_by   TEXT,
  upload_source TEXT DEFAULT 'bot',
  chunk_count   INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE uploaded_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS upload_source TEXT DEFAULT 'bot';
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_files_college ON uploaded_files(college_id, branch);

-- ── ANNOUNCEMENTS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id      UUID REFERENCES colleges(id) ON DELETE CASCADE,
  message         TEXT NOT NULL,
  title           TEXT,
  target_branch   TEXT DEFAULT 'All',
  sent_by         TEXT,
  recipients      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE announcements DISABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_branch TEXT DEFAULT 'All';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS sent_by TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS recipients INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_ann_college ON announcements(college_id, created_at DESC);

-- ── SESSIONS (bot flows + chat memory) ───────────────────────────────
CREATE TABLE IF NOT EXISTS pdf_upload_sessions (
  phone_number  TEXT PRIMARY KEY,
  session_data  JSONB NOT NULL DEFAULT '{}',
  session_type  TEXT DEFAULT 'flow',
  expires_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE pdf_upload_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_upload_sessions ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT 'flow';
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON pdf_upload_sessions(expires_at);

-- ── PROCESSED MESSAGES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS processed_messages (
  message_id  TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE processed_messages DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pm_created ON processed_messages(created_at);

-- ── RESPONSE CACHE ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS response_cache (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_hash  TEXT NOT NULL,
  answer         TEXT NOT NULL,
  college_id     UUID REFERENCES colleges(id) ON DELETE CASCADE,
  hit_count      INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(question_hash, college_id)
);
ALTER TABLE response_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE response_cache ADD COLUMN IF NOT EXISTS hit_count INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_cache_hash ON response_cache(question_hash, college_id);

-- ── RATE LIMITS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  phone_number   TEXT PRIMARY KEY,
  message_count  INTEGER DEFAULT 1,
  window_start   TIMESTAMPTZ DEFAULT now(),
  last_message   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE rate_limits DISABLE ROW LEVEL SECURITY;

-- ── VOICE LOGS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number  TEXT NOT NULL,
  college_id    UUID REFERENCES colleges(id) ON DELETE CASCADE,
  transcript    TEXT NOT NULL,
  response      TEXT,
  model_used    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE voice_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE voice_logs ADD COLUMN IF NOT EXISTS model_used TEXT;
CREATE INDEX IF NOT EXISTS idx_voice_phone ON voice_logs(phone_number, created_at DESC);

-- ================================================================
-- STEP 3: RECREATE VIEWS (after all table alterations)
-- ================================================================

-- Attendance summary — live view, always accurate, powers dashboard
CREATE OR REPLACE VIEW student_subject_attendance AS
SELECT
  al.student_phone,
  al.student_name::TEXT                                       AS student_name,
  al.subject_id,
  s.name::TEXT                                                AS subject_name,
  s.code::TEXT                                                AS subject_code,
  s.short_name::TEXT                                          AS subject_short,
  al.college_id,
  al.branch::TEXT                                             AS branch,
  al.semester::INTEGER                                        AS semester,
  al.division::TEXT                                           AS division,
  COUNT(*)                                                    AS total_classes,
  SUM(CASE WHEN al.status = 'present' THEN 1 ELSE 0 END)     AS present_count,
  SUM(CASE WHEN al.status = 'absent'  THEN 1 ELSE 0 END)     AS absent_count,
  ROUND(
    SUM(CASE WHEN al.status = 'present' THEN 1 ELSE 0 END)::NUMERIC
    * 100.0 / NULLIF(COUNT(*),0), 1
  )                                                           AS attendance_percent,
  CASE
    WHEN COUNT(*) = 0 THEN 'no_data'
    WHEN ROUND(SUM(CASE WHEN al.status='present' THEN 1 ELSE 0 END)::NUMERIC*100.0/COUNT(*),1) < 75 THEN 'at_risk'
    WHEN ROUND(SUM(CASE WHEN al.status='present' THEN 1 ELSE 0 END)::NUMERIC*100.0/COUNT(*),1) < 80 THEN 'warning'
    ELSE 'safe'
  END                                                         AS vtu_status
FROM attendance_logs al
JOIN subjects s ON s.id = al.subject_id
GROUP BY
  al.student_phone, al.student_name, al.subject_id,
  s.name, s.code, s.short_name,
  al.college_id, al.branch, al.semester, al.division;

-- ================================================================
-- STEP 4: SEMANTIC SEARCH FUNCTION
-- ================================================================
CREATE OR REPLACE FUNCTION match_doc_chunks(
  query_embedding  vector(768),
  match_college_id UUID,
  match_count      INT DEFAULT 8
)
RETURNS TABLE (
  id               UUID,
  content          TEXT,
  source_file      TEXT,
  file_title       TEXT,
  target_branch    TEXT,
  target_division  TEXT,
  target_semester  INTEGER,
  similarity       FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id, dc.content, dc.source_file, dc.file_title,
    dc.target_branch, dc.target_division, dc.target_semester,
    (1 - (dc.embedding <=> query_embedding))::FLOAT AS similarity
  FROM doc_chunks dc
  WHERE dc.college_id = match_college_id
    AND dc.embedding IS NOT NULL
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ================================================================
-- STEP 5: SEED DATA
-- ================================================================
INSERT INTO colleges (name, location, affiliated_to)
SELECT 'VTU Main Campus','Belagavi, Karnataka','VTU'
WHERE NOT EXISTS (SELECT 1 FROM colleges WHERE name='VTU Main Campus');

-- CHANGE PHONE NUMBER BELOW to your admin WhatsApp number
INSERT INTO users (name, phone_number, role, college_id)
SELECT 'Master Admin','917338169873','admin', NULL
WHERE NOT EXISTS (SELECT 1 FROM users WHERE phone_number='917338169873');

-- ================================================================
-- STEP 6: VERIFY
-- ================================================================
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns c
   WHERE c.table_name=t.table_name AND c.table_schema='public') AS col_count,
  'OK' AS status
FROM information_schema.tables t
WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
ORDER BY table_name;
