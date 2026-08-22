-- Run once in the Supabase SQL Editor before deploying the matching backend release.
CREATE TABLE IF NOT EXISTS public.quiz_answer_drafts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quiz_id BIGINT NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.quiz_integrity_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quiz_id BIGINT NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  violation_number INTEGER NOT NULL DEFAULT 0 CHECK (violation_number BETWEEN 0 AND 3),
  details JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_answer_drafts_student
  ON public.quiz_answer_drafts(student_id);

CREATE INDEX IF NOT EXISTS idx_quiz_integrity_events_attempt
  ON public.quiz_integrity_events(quiz_id, student_id, occurred_at);
