# Private Material Storage Migration

Current material rows contain `file_url`/`pdf_url`; the application now authorizes material routes, but an already-public object URL can bypass the API. Production storage has not been changed.

## Safe staged plan

1. Inventory buckets, object paths, MIME types, sizes, duplicates and broken URLs. Export the `materials` table and take a storage backup.
2. Add nullable `object_key` and `pdf_object_key` columns in a versioned additive migration. Do not remove URL columns.
3. Create a private staging bucket with MIME/size limits. Upload copies under non-guessable, normalized keys such as `courses/<course-id>/materials/<material-id>/<filename>`.
4. Backfill object keys in batches with a checkpoint table. Hash/size-compare every source and destination. URLs that cannot be parsed become manual-review records, not deletions.
5. Change authorized download/PDF endpoints to issue short-lived signed URLs (recommended 60–300 seconds), after course/enrollment/assignment checks. Never return service credentials.
6. Dual-read: prefer object key/private bucket, fall back to the old URL during a measured compatibility window. New uploads write private objects and keys only.
7. Validate student enrollment, lecturer assignment, admin access, range/PDF requests, expiry, revoked access, malicious filenames, oversized files and content-type mismatch.
8. After logs show no fallback reads and a restore drill succeeds, make the old bucket private. Retain old columns for rollback until a later approved cleanup.

Rollback switches reads to old URLs and leaves copied objects in place. Do not delete old objects or URL columns in this phase.
