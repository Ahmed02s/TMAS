# AI Tutor

Material-grounded AI Tutor integrated into the Student Material Reader (Option C from the
pre-implementation evaluation, plus light personalization). Direct context injection —
**no RAG, embeddings, or vector database.**

## Architecture

```
PdfReader.tsx (owns currentPage/numPages — single source of truth)
   │  onPageChange(page, numPages)
   ▼
MaterialViewer.tsx (forwards the callback, no state of its own)
   │
   ▼
Student.tsx (readerPage state — a read-only mirror, not a second tracker)
   │  renders alongside the reader
   ▼
AiTutorPanel.tsx (Ask / Explain this page / Summarize / Practice questions)
   │  POST /api/materials/{id}/tutor  { student_id, action, question?, current_page? }
   ▼
backend/app/routers/materials.py: ai_tutor()
   │  1. auth (get_current_claims) + rate limit (12/60s, app.core.rate_limit)
   │  2. _verify_acting_as_self (reused from quizzes.py)
   │  3. course-access check: _student_level_program + _is_course_allowed_for_student
   │     (reused from quizzes.py — materials has no separate enrollments table)
   │  4. _get_material_tutor_context() — cached per-page/full-text extraction
   │  5. _build_tutor_context_block() — current page > neighbors > whole material
   │  6. _get_student_course_performance_summary() — light personalization
   ▼
app/services/llm.py: call_llm()  (Groq -> Gemini -> OpenAI cascade, same providers/
   fallback order as AI quiz generation, extracted into a shared service)
```

## Endpoint

`POST /api/materials/{material_id}/tutor`

```json
// request
{ "student_id": "...", "action": "ask" | "explain_page" | "summarize" | "practice",
  "question": "...",       // required only for action="ask"
  "current_page": 12 }     // optional; ignored for non-paginated materials

// response
{ "success": true, "action": "explain_page", "answer": "...",
  "source": { "material_id": 19, "page": 12 } | null,
  "practice_questions": [ ... ] }  // only present for action="practice"
```

Auth: `Authorization: Bearer <token>` (attached automatically by the existing
`installAuthFetch()` window.fetch patch — no frontend changes needed for this).

## The four actions

- **Ask** — free-text question, answered from the current page/material content.
- **Explain this page** — plain-language explanation of the current page.
- **Summarize** — key concepts/definitions/relationships on the current page.
- **Practice questions** — 3 ungraded questions via `_generate_practice_questions()`,
  which calls the *existing* AI quiz-generation function (`quizzes._generate_question`)
  directly. Nothing is persisted to `quizzes`/`quiz_questions` — these never enter the
  official quiz bank, a lecturer's published assessments, or a student's grades. Each
  question is tagged `"source": "AI Practice"` and the UI labels them accordingly.

## Material context: page-aware extraction with caching

`_get_material_tutor_context()` resolves and extracts text once per material, cached
in-memory per process (`_TUTOR_TEXT_CACHE`, keyed by `material_id`) — a material's content
never changes after upload, so re-extracting on every question would be wasted work.

- **Real PDFs**: `quizzes._extract_pdf_pages()` (new — pypdf, page-boundary-preserving,
  alongside the existing whole-document `_extract_text_from_pdf()` used by quiz generation).
- **PPTX/PPT converted to PDF at upload** (`office_convert.py`): read from the *converted*
  PDF (`material.pdf_url`, fetched from Supabase Storage — the local temp copy is deleted
  right after upload) so page numbers match exactly what `PdfReader.tsx` shows the student.
- **Everything else** (docx, plain pptx without LibreOffice conversion, txt/md): the
  existing whole-document `_extract_text_from_file()`, no page concept — the tutor always
  falls back to the whole material for these.

Context priority per request: **current page → neighboring pages (if the current page has
no extractable text, e.g. an image-only slide) → whole material** (`_build_tutor_context_block`).

## Page synchronization

`PdfReader.tsx` already tracks `currentPage`/`numPages` via its existing
`IntersectionObserver` (used for reading telemetry). A new `onPageChange` prop fires
whenever that state changes — a read-only signal flowing *out* of the existing tracker, not
a second one. `MaterialViewer` forwards it unchanged; `Student.tsx` stores the latest value
and passes it into `AiTutorPanel`, which sends it as `current_page` on every request. Non-PDF
materials never call this (no page concept), so the tutor transparently falls back to the
whole material for those.

## Personalization (light, by design)

`_get_student_course_performance_summary()` runs one query against `quiz_attempts` (joined
with `quizzes` by course) for the student's completed attempts in that course, and produces
a single sentence: average score, pass count, and a tone hint. The prompt explicitly
instructs the model **not** to claim specific topic-level weaknesses — TMAS doesn't store
per-topic question tagging, so anything more granular would mean inventing data.

## Grounding rules

Enforced via the system prompt: prioritize the material content provided, never fabricate
lecturer content or invent page numbers, state plainly when something isn't in the material
(before optionally answering from general knowledge), and never present general knowledge as
if it came from the lecturer's material. Verified against a live material — see the "Ask"
example in testing below, where the model correctly declined and offered general knowledge
separately.

## Security

- Full JWT auth required (`get_current_claims`, not the optional variant used by
  telemetry beacons) — this triggers real LLM cost per call, unlike passive telemetry.
- `_verify_acting_as_self` (reused from `quizzes.py`) — a student can only run the tutor as themselves.
- Course-access check reuses `quizzes._is_course_allowed_for_student` (level/program vs.
  course code) — the same eligibility model already enforced for quizzes; materials.py has
  no stricter existing check to reuse instead.
- Rate limited via the existing `app.core.rate_limit.rate_limiter` (`ai-tutor`, 12 requests/60s).
- LLM API keys never leave the backend — `call_llm()` runs entirely server-side.

## Environment variables

None new. Reuses `QROK_API_KEY`/`QROK_API_URL` (or `GROQ_API_KEY`/`GROQ_API_URL`),
`GEMINI_API_KEY`, `OPENAI_API_KEY` — the same variables AI quiz generation already uses.

## Testing

- `backend/tests/test_ai_tutor_logic.py` — pure-logic unit tests (context-priority
  selection, truncation, per-page PDF extraction failure modes, action-set integrity).
  Follows the existing convention in this repo of unit-testing logic below the
  network/LLM-calling layer rather than mocking providers.
- Manually smoke-tested end-to-end against live Supabase data and a live LLM call:
  page-context switching (explain_page on page 1 vs. page 5 of a real PDF produced
  different, correctly-scoped answers), `ask` grounding-refusal behavior, PPTX-converted
  material extraction via `pdf_url`, practice-question generation, student-identity
  mismatch (403), invalid action (400), and rate limiting (429 after the configured limit).
- Full existing backend suite (66 tests, including the pre-existing 57) still passes after
  the `_call_llm_for_questions` refactor — confirms AI quiz generation is unaffected.
- Frontend: `tsc --noEmit` and `vite build` both clean; `AiTutorPanel` builds as its own
  lazy-loaded chunk (~6.5kB), consistent with the existing portal/material-viewer
  code-splitting. Visually verified (headless Chrome) at desktop (side panel) and mobile
  (bottom sheet) widths — no overlapping text or broken layout.

## Deliberately deferred (future work)

Per the approved scope, none of the following are implemented:

1. **RAG / embeddings / vector database (pgvector)** — course materials are single lecture
   documents, not a large corpus; direct context injection covers the "understand what the
   student is currently reading" requirement without new retrieval infrastructure. Worth
   revisiting only if the tutor needs to answer across *many* materials in a course at once.
2. **Advanced/topic-level learning-gap recommendations** — would require per-topic question
   tagging that doesn't exist in the schema (`quiz_questions` has no topic/concept column).
3. **Advanced personalization / adaptive learning paths / knowledge graphs.**
4. **Persistent AI conversation history** — the tutor is stateless per request by design.
5. **Lecturer-facing AI analytics** — this feature is student-facing only.
