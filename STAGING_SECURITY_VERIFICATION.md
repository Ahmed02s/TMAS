# Staging Security Verification

Status: **not executed** — no dedicated staging Supabase project or test identities were available on 2026-09-23. The configured project was treated as production. Evidence must include timestamp, staging project reference, release SHA, tester and sanitized request/response logs.

## Test data

Create unique disposable users: unverified student, Student A/B in different courses, verified student, pending/approved/suspended lecturer, assigned/unassigned lecturer and admin. Create two courses, enroll only the intended students, assign only the intended lecturers, and add material, quiz, attempt, notification and reading records. Prefix all data with a run ID and clean up in reverse dependency order.

## Acceptance matrix

| Scenario | Expected |
|---|---|
| Anonymous protected course/material/content/progress/quiz/result/notification routes | 401 |
| Student A supplies Student B IDs or resource IDs | 403/404; no read/write/inference |
| Student accesses unenrolled course/material | 403 |
| Assigned vs unassigned lecturer mutations | assigned succeeds; unassigned 403 |
| Student/lecturer calls admin endpoints | 403 |
| Student registration/login before verification | registration has no token; login 403 |
| Pending lecturer verified but unapproved | login/protected access 403 |
| Approved lecturer | assigned operations succeed |
| Suspend user or change role after token issue | old token loses privilege immediately |
| Notification creation | student 403; lecturer only assigned-course students; admin explicit targets |
| Notification read | User A update cannot alter User B row |
| Material download/PDF/content/read | requires enrollment/assignment/admin; public object URL risk separately recorded |
| Quiz timing/autosave/retry/integrity/scoring | existing authoritative behavior preserved |
| Password reset/verification | raw token absent from DB; reuse/expiry rejected; reset revokes old token |
| CORS | configured exact origin accepted; arbitrary and preview origins denied |
| Headers | API and SPA headers present without breaking assets/API calls |

Commands after staging migration:

```text
cd backend && python -m pytest -q
cd backend && set TMAS_TEST_ENV=staging && python -m pytest -q -m integration
set E2E_API_URL=https://<staging-api> && npm run test:e2e
npx tsc --noEmit
npm run build
npm audit --omit=dev
```

Do not put staging secrets in shell history, screenshots, test reports or CI logs. Use environment-scoped secret storage and disposable credentials.
