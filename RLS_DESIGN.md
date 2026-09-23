# RLS Design (Not Yet Enabled)

TMAS currently issues application HS256 JWTs and accesses Supabase with a service-role client. PostgreSQL therefore does not receive a Supabase-authenticated user identity, and service role bypasses RLS. Policies based on `auth.uid()` would not protect current backend calls.

## Prerequisites

- Reconcile constraints, functions, grants and existing policies from the live catalog.
- Choose an identity propagation model: migrate sessions to Supabase Auth JWTs; or use a non-bypass database role and transaction-scoped, server-set claims; or keep backend-only service role and acknowledge that RLS is defense-in-depth only for other clients.
- Prevent clients from setting database claim/session variables.
- Define authoritative helpers for current user, role, active/verified status, enrollment and lecturer assignment.

## Policy intent

- Users read/update a minimal self profile; admins have explicit reviewed operations.
- Students read courses/materials/quizzes through active enrollment and own attempts/progress/results/notifications.
- Lecturers access course resources only through `course_lecturers` and cannot assign themselves.
- Admin access is explicit and audited, not a broad client-side role claim.
- Storage object policies derive course/material ownership from metadata tables; buckets become private after dual-read migration.
- Email/reset tokens, AI credentials and operational tables are never directly client-readable.

Build policies in staging, test positive and negative cases with anon/authenticated/non-bypass roles, inspect query plans/indexes, and only then schedule production rollout with a disable-policy rollback. Do not enable RLS table-by-table in production while the application still depends on service-role behavior.
