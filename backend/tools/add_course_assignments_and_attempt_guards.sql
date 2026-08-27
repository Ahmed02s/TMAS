-- Run once in Supabase SQL Editor before deploying the matching backend release.
-- It preserves today's inferred assignments, then makes future enrollment explicit.

CREATE TABLE IF NOT EXISTS public.course_enrollments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'withdrawn')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id)
);

-- CREATE TABLE IF NOT EXISTS does not repair an older, partially defined table.
-- Add columns introduced by this migration so it remains safe to rerun.
ALTER TABLE public.course_enrollments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.course_enrollments
  ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'course_enrollments_status_check'
      AND conrelid = 'public.course_enrollments'::regclass
  ) THEN
    ALTER TABLE public.course_enrollments
      ADD CONSTRAINT course_enrollments_status_check
      CHECK (status IN ('active', 'completed', 'withdrawn'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.course_lecturers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  lecturer_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, lecturer_id)
);

ALTER TABLE public.course_lecturers
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Older versions of these tables might not have their uniqueness constraints.
-- Unique indexes also provide valid conflict targets for the backfill below.
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_enrollments_course_student
  ON public.course_enrollments(course_id, student_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_lecturers_course_lecturer
  ON public.course_lecturers(course_id, lecturer_id);

-- Preserve current behavior by turning existing level/program matches into real rows.
INSERT INTO public.course_enrollments (course_id, student_id)
SELECT c.id, u.id
FROM public.courses c
JOIN public.users u
  ON lower(trim(u.role)) = 'student'
 AND lower(trim(coalesce(u.level, ''))) = lower(trim(coalesce(c.level, '')))
 AND (
   trim(coalesce(c.program, '')) = ''
   OR lower(trim(coalesce(u.program, ''))) = lower(trim(c.program))
 )
ON CONFLICT (course_id, student_id) DO NOTHING;

-- Existing courses store one or more lecturer names in a comma-separated text field.
INSERT INTO public.course_lecturers (course_id, lecturer_id)
SELECT DISTINCT c.id, u.id
FROM public.courses c
JOIN public.users u
  ON lower(trim(u.role)) = 'lecturer'
 AND position(lower(trim(u.name)) IN lower(coalesce(c.lecturer, ''))) > 0
ON CONFLICT (course_id, lecturer_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_course_enrollments_student
  ON public.course_enrollments(student_id, status);
CREATE INDEX IF NOT EXISTS idx_course_lecturers_lecturer
  ON public.course_lecturers(lecturer_id);

-- Collapse legacy duplicate active attempts before enforcing one active row per student/quiz.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY quiz_id, student_id
           ORDER BY attempted_at DESC NULLS LAST, id DESC
         ) AS row_number
  FROM public.quiz_attempts
  WHERE status = 'in_progress'
)
UPDATE public.quiz_attempts qa
SET status = 'missed',
    submission_reason = 'superseded_duplicate'
FROM ranked r
WHERE qa.id = r.id AND r.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_attempts_one_active
  ON public.quiz_attempts(quiz_id, student_id)
  WHERE status = 'in_progress';
