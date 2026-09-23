# Migration 001 Runbook

Scope: `backend/migrations/001_security_baseline.sql`. Apply to a dedicated staging project first. It adds only `users.auth_version`; it deletes or rewrites no data. Live notifications already have per-recipient read state and need no migration.

## Preconditions and backup

1. Confirm the Supabase project reference and environment label with two people. Never infer environment from a local `.env`.
2. Record row counts for `users` and `notifications`; verify notification `id` is BIGINT and user `id` is TEXT.
3. Take a Supabase backup/PITR checkpoint appropriate to the plan. For projects without PITR, create and verify an encrypted logical backup (`pg_dump`) and record its restore command/location.
4. Capture current schema/catalog output and application release SHA. Schedule a low-traffic window: `ALTER TABLE` takes a table lock, although adding a constant-default integer on supported PostgreSQL versions is normally brief.

## Staging execution

Open the staging SQL Editor, re-confirm the project reference, and execute the complete versioned file as one reviewed change. Do not paste fragments from documentation. Then verify:

```sql
select auth_version, count(*) from public.users group by auth_version;
select column_name, data_type, column_default, is_nullable from information_schema.columns
where table_schema='public' and table_name='users' and column_name='auth_version';
```

Run backend unit tests, the explicitly gated staging integration test, and the Playwright security suite. Confirm login, suspension/role revocation, registration state, notification ownership, quiz timing/autosave, and material authorization.

## Rollback

Preferred rollback is application rollback while leaving the additive `auth_version` column in place; it is backward compatible. If removal is explicitly approved and dependency checks show no consumers:

```sql
alter table public.users drop column if exists auth_version;
```

Dropping the column loses revocation counters. Never use that rollback after counters have changed without exporting them and approving the loss. Restore the backup only for corruption or a failed irreversible recovery plan.
