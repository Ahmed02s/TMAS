# Supabase Access Model

The backend currently creates one global Supabase client from the service-role key. Calls occur in `core/security.py`, `core/authorization.py`, `core/course_assignments.py` and every router except purely static code. Because service role bypasses RLS, every route must authorize before querying or mutating data.

## Classification

| Class | Current examples | Target |
|---|---|---|
| Public/anonymous | registration/login/verification/reset in `routers/auth.py`; public metadata in `routers/public.py`; contact submission | Narrow repository methods, rate limits, selected columns, strict validation; anon/RPC access only where a reviewed policy supports it. |
| Authenticated self/service operations | dashboards, enrollments, materials, reading, attempts, results, notifications | Central repository/service methods that require an authoritative principal and include ownership/course predicates in each query. |
| Privileged administrative | user approval/status, academic/course administration, seeding | Dedicated admin service methods, admin dependency, audit event, and no callable production seed route. |
| External-resource privileged | Storage upload/sign/delete, AI and email | Server-only adapters with course/admin authorization, quotas, structured audit metadata and redacted logs. |

## Refactor boundary

Create `repositories/` for database queries and `services/` for authorization-aware workflows. Keep the service-role client private to that layer; routers receive principals and call explicit methods such as `get_material_for_principal` rather than composing unrestricted queries. Add a separately named anon client only for operations designed and tested for RLS. Centralize storage signing and object deletion. This is incremental: move one workflow with regression tests at a time.

Before reducing service-role use, verify policies against the real schema, decide how backend identity reaches PostgreSQL, and test all three roles. Merely swapping the key would break current requests and is not an authorization design.
