-- Supabase/Postgres schema for the TMAS backend
-- Run this in your Supabase SQL editor or via psql.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  status TEXT NOT NULL DEFAULT 'active',
  level TEXT,
  program TEXT,
  institution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_resets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email verification (added for the register -> verify-email -> login gate flow).
-- The backfill UPDATE grandfathers in every account that existed before this migration ran
-- (all of them predate email verification existing at all) — only accounts created AFTER
-- this migration are subject to the new-account default of FALSE and the login gate.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users SET email_verified = TRUE WHERE email_verified = FALSE;

CREATE TABLE IF NOT EXISTS email_verifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS levels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  level TEXT,
  program TEXT,
  lecturer TEXT,
  progress INTEGER,
  materials INTEGER,
  quizzes_total INTEGER,
  quizzes_done INTEGER,
  avg_score INTEGER,
  color TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS materials (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  course TEXT,
  lecturer TEXT,
  size TEXT,
  uploaded TEXT,
  status TEXT,
  quiz_generated BOOLEAN DEFAULT FALSE,
  -- Public Storage URL of a PPTX/PPT's converted PDF (see backend/app/services/office_convert.py
  -- + the LibreOffice-based backend/Dockerfile). NULL for PDFs themselves and for any PPTX
  -- uploaded before this feature existed, or converted on a deployment without LibreOffice —
  -- both cases fall back to the existing client-side JSZip PPTX reader unchanged.
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NOTE: the actual deployed table (created before this file existed, so `CREATE TABLE IF
-- NOT EXISTS` below is a no-op against it) uses `available_from`/`available_until` instead
-- of `open_date`/`close_date`. backend/app/routers/quizzes.py's _prepare_quiz_write /
-- _normalize_quiz_row translate between the two at the read/write boundary, so this file is
-- written to match the REAL column names — keep it that way, since a fresh database created
-- from this script needs to match what the code actually writes to.
CREATE TABLE IF NOT EXISTS quizzes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  course TEXT,
  questions INTEGER,
  time_limit INTEGER,
  passing_score INTEGER,
  attempts INTEGER,
  due_date TEXT,
  available_from TEXT,
  available_until TEXT,
  status TEXT,
  difficulty TEXT,
  tier TEXT NOT NULL DEFAULT 'Foundational',
  material_id BIGINT REFERENCES materials(id),
  material_ids JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  correct TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  out_of INTEGER NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'F',
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'completed',
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NOTE: the actual deployed table (created before this file existed) has NEVER had
-- scroll_percent/time_spent_seconds/completed — its real columns are id, student_id,
-- material_id, course, material_name, read_at, read_count. The ALTER statements below were
-- always no-ops against it, so every scroll/time telemetry write from materials.py has been
-- silently degrading to just recording `read_at` since this table's telemetry feature was
-- first written. Run the ALTER statements further down (not yet applied) to fix this for
-- real — see the migration proposed alongside the material_page_reads table below.
CREATE TABLE IF NOT EXISTS material_reads (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id TEXT NOT NULL,
  material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  course TEXT,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scroll_percent INTEGER NOT NULL DEFAULT 0,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (student_id, material_id)
);

-- Safe to re-run against an existing table created before scroll/time telemetry was added.
ALTER TABLE material_reads ADD COLUMN IF NOT EXISTS scroll_percent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE material_reads ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE material_reads ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Added for the paginated PDF reader (PdfReader.tsx) and resume-reading: `last_page`/
-- `total_pages` let GET /api/materials/{id}/last-page tell the reader where to reopen.
-- Backend code already degrades gracefully if these aren't present yet (see
-- backend/app/routers/materials.py: record_page_read / get_material_last_page), so applying
-- this is optional for the app to keep working, but required for resume-reading to persist.
ALTER TABLE material_reads ADD COLUMN IF NOT EXISTS last_page INTEGER;
ALTER TABLE material_reads ADD COLUMN IF NOT EXISTS total_pages INTEGER;

-- New: granular per-page read tracking for PDFs, separate from the single-row-per-material
-- summary in material_reads above. Lets a lecturer eventually see exactly which pages a
-- student reached, not just an overall scroll percentage.
CREATE TABLE IF NOT EXISTS material_page_reads (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id TEXT NOT NULL,
  material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  view_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE (student_id, material_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_levels_order ON levels("order");
CREATE INDEX IF NOT EXISTS idx_courses_level_program ON courses(level, program);
CREATE INDEX IF NOT EXISTS idx_materials_course ON materials(course);
CREATE INDEX IF NOT EXISTS idx_quizzes_status ON quizzes(status);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_material_reads_student ON material_reads(student_id);
CREATE INDEX IF NOT EXISTS idx_material_reads_material ON material_reads(material_id);
CREATE INDEX IF NOT EXISTS idx_material_page_reads_student_material ON material_page_reads(student_id, material_id);
