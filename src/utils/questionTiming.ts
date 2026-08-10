// Anti-cheating: each question type gets a fixed, dedicated answering window enforced
// per-question in the student quiz UI, so a student can't sit on one question indefinitely
// to communicate with someone else. A quiz's overall time limit is derived by summing these
// rather than being picked freely by the lecturer. Mirrors QUESTION_TYPE_SECONDS in
// backend/app/routers/quizzes.py — keep both in sync.
export const QUESTION_TYPE_SECONDS: Record<string, number> = {
  'MCQ': 60,
  'True/False': 45,
  'Fill in the Blank': 45,
  'Short Answer': 90,
}

export function getQuestionSeconds(type?: string): number {
  return QUESTION_TYPE_SECONDS[type || 'MCQ'] ?? 60
}
