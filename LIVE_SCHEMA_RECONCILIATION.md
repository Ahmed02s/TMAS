# Live Schema Reconciliation

Date: 2026-09-23. Method: read-only PostgREST OpenAPI introspection of the configured Supabase project. The project was not labelled as staging, so no writes or migrations were performed. OpenAPI exposes tables and columns, but not a reliable inventory of primary/foreign keys, indexes, checks, triggers, functions, grants, RLS enablement, or policies. Those items remain **unverified** until SQL Editor or Management API access is provided.

## Reconciliation

| Area | Repository expectation | Observed live shape | Decision |
|---|---|---|---|
| `users` | core identity/account columns plus `auth_version` | core columns plus profile, approval and `institution_id`; no `auth_version` | Migration 001 adds only `auth_version`; retain live extras. |
| `courses` | id/code/name/level/program/lecturer | also `course_id`, `academic_level_id`, description, credits, semester, capacity, timestamps | Preserve. Later canonical migration work must choose one academic-level relationship. |
| `course_enrollments` | course/student/status/enrolled_at | also enrollment date, completion percentage, completion flag and timestamps | Preserve; authorization uses course/student/status. |
| `course_lecturers` | explicit course/lecturer assignment | present | Authoritative lecturer scope. |
| `materials` | course-owned files and extracted text | includes URLs, PDF URL, processing metadata, objectives/topics and public flag | Preserve; public URLs remain a storage migration risk. |
| reading | `material_reads`, `material_page_reads` | both present; `material_reads` also has name/count fields | Preserve telemetry. |
| quizzes | quiz, questions, attempts, drafts, integrity/review | present; live `quizzes` lacks repository `tier`, `material_id`, `material_ids` | Do not run the canonical schema blindly. Reconcile quiz feature columns separately before any quiz migration. |
| legacy quiz detail | not canonical | `question_options`, `quiz_results`, `student_answers` present | Treat as live legacy/compatibility tables; data-owner review required before retirement. |
| notifications | repository formerly assumed broadcast rows (`target_role`, `type`, `read`, text IDs) | per-recipient rows: BIGINT id, required `user_id`, `notification_type`, `is_read`, `read_at` | Application and canonical schema updated to live shape. Migration 001 uses BIGINT FK. |
| notification read state | repository formerly proposed a separate read ledger | live table already has one row per recipient with `is_read`/`read_at` | No new table is needed; avoid redundant schema. |

## Required SQL verification before staging approval

Run read-only catalog queries for PKs/FKs, unique/check constraints, indexes, triggers/functions, grants, `relrowsecurity`, and `pg_policies`. Compare the output to `backend/supabase_schema.sql`, save it as release evidence, and resolve every difference before production. The canonical SQL file is documentation/bootstrap material, not an approved migration for the live database.
