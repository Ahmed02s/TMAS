-- Run once in Supabase SQL Editor before deploying the lecturer attempt-review UI.
ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS answers_recorded BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS submission_reason TEXT NOT NULL DEFAULT 'normal';

CREATE TABLE IF NOT EXISTS public.quiz_attempt_review_actions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id BIGINT REFERENCES public.quiz_attempts(id) ON DELETE SET NULL,
  quiz_id BIGINT NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('note_added', 'retry_granted')),
  note TEXT NOT NULL DEFAULT '',
  actor_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempt_review_actions_attempt
  ON public.quiz_attempt_review_actions(quiz_id, student_id, created_at);
