# TMAS backend

TMAS uses React/TypeScript/Vite → FastAPI → PostgreSQL/Supabase → Supabase Storage, with
server-side AI providers and SendGrid email.

## Local development

1. Create and activate a Python 3.12 virtual environment.
2. Run `pip install -r requirements.txt pytest`.
3. Create `backend/.env`; never commit it.
4. Run `uvicorn main:app --reload --host 0.0.0.0 --port 8000` from `backend/`.
5. Run the web app with `npm run dev` from the repository root.

Required production configuration includes `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`JWT_SECRET`, `FRONTEND_URL`, and exact `CORS_ORIGINS`. Email uses `SENDGRID_API_KEY`,
`EMAIL_FROM`, `EMAIL_FROM_NAME`, and `CONTACT_EMAIL`. AI uses `QROK_API_KEY`/`GROQ_API_KEY`
with optional Gemini/OpenAI fallbacks. Values must come from the deployment secret manager.

## Authentication and authorization

Registration creates an account but does not create an application session. Students must
verify email before login. Lecturers must verify email and receive administrator approval.
JWTs identify the session, while every protected request reloads current user role, status,
email-verification state, and session version from the database. Suspending or changing a
user therefore takes effect without waiting for JWT expiry.

Students may access only their own records and enrolled courses. Lecturers may access only
assigned courses. Administrators have explicit administrative access. Backend checks are
authoritative; frontend role state is never a security boundary.

## Materials and storage

Material metadata, download, converted PDF, extracted content, and progress endpoints require
authentication and course access. Existing public Storage objects remain compatible, but the
bucket should be migrated to private access during a coordinated maintenance window:

1. Inventory every `materials.file_url`/`pdf_url` and verify a backup.
2. Change the bucket to private in a staging project first.
3. Replace public URLs with stable object keys and generate short-lived signed URLs only after
   backend authorization.
4. Backfill keys, validate every file, then deploy the private-bucket reader.
5. Retain a rollback export until all formats have been opened successfully.

Do not make the production bucket private before signed-URL support and data reconciliation.

## Service role and future RLS

The backend currently uses one server-only Supabase service-role client. It must never be sent
to a browser. All request handlers must authenticate and authorize before privileged reads or
writes. RLS is not enabled by this phase because the deployed schema must first be reconciled.

Before enabling RLS: inventory the live schema, separate ordinary and administrative clients,
define policies for users/enrollments/assignments/materials/quizzes/attempts/notifications,
test every role in staging, and retain server-side checks as defense in depth.

## Database migrations

SQL migrations are ordered in `backend/migrations/`. Review, back up, and apply them in staging
before production. `001_security_baseline.sql` is additive and creates session-version and
per-recipient notification-read support.

## Validation

- Backend: `python -m pytest -q`
- TypeScript: `npx tsc --noEmit`
- Frontend build: `npm run build`
- Runtime dependency audit: `npm audit --omit=dev`
