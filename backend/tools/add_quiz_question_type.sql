-- Run once in the Supabase SQL Editor. New and regenerated questions will then retain
-- their MCQ / True-False / Fill-in-the-Blank / Short-Answer type and correct timer.
ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'MCQ';

-- This backfill is safe because True/False rows are structurally identifiable.
UPDATE public.quiz_questions
SET question_type = 'True/False'
WHERE question_type = 'MCQ'
  AND jsonb_array_length(options) = 2
  AND options @> '["True", "False"]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_quiz_questions_type
  ON public.quiz_questions(question_type);
