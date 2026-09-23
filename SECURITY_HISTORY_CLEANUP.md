# Git History Security Cleanup

Do not rewrite history without explicit owner approval, a verified backup, and coordination
with every collaborator. Rewriting changes commit IDs and requires all clones and open branches
to be replaced or carefully rebased.

## Affected paths

- `backend/data/users.json` in commit history contained personal email addresses and plaintext passwords.
- `backend/data/uploads/**` has contained 16 uploaded PDF, DOCX, PPT, PPTX, and text files.

## Required review before cleanup

1. Create and verify an offline mirror backup of all refs.
2. Determine whether uploaded documents contain student data, unpublished work, licensed books,
   assessment content, or institution-confidential information.
3. Treat every historical plaintext password as compromised. Force password resets and rotate any
   reused credentials; review authentication and access logs where available.
4. Notify collaborators of the maintenance window and require fresh clones afterward.

## Recommended procedure

Use `git filter-repo` from a clean mirror clone to remove the two path groups from every ref.
Review the rewritten object database, run secret scanning, expire reflogs, and force-push only
after owner approval. Coordinate separately with the Git hosting provider because cached forks,
pull requests, releases, and artifacts may retain old objects. Never run this procedure directly
against the only copy of the repository.

History cleanup reduces future exposure but cannot retract files already cloned or downloaded.
