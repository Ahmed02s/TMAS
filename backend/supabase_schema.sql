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

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_levels_order ON levels("order");
CREATE INDEX IF NOT EXISTS idx_courses_level_program ON courses(level, program);
CREATE INDEX IF NOT EXISTS idx_materials_course ON materials(course);
CREATE INDEX IF NOT EXISTS idx_quizzes_status ON quizzes(status);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_material_reads_student ON material_reads(student_id);
CREATE INDEX IF NOT EXISTS idx_material_reads_material ON material_reads(material_id);
