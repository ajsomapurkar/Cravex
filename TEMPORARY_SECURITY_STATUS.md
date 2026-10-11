# Temporary security status — defer to end of build

**This package is connected for test/demo use, not cleared for real student records.** As requested, this ZIP does not change the connected Supabase database.

## Finding from the read-only review on 2026-10-10

Row-level security is enabled on the inspected tables, but several policies granted to the unauthenticated `anon` role use unconditional `true` predicates. Examples include broad reads on `students`, `student_marks`, `users`, `departments`, `subjects`, and other academic tables; some tables also permit anonymous inserts, updates, or deletes. RLS being enabled does not make those policies tenant-safe.

The current dashboard uses a browser-visible public anon key and direct Supabase queries. Consequently, anyone who can inspect the public site can make requests with that key and the permissions granted to `anon`. You said the current records are non-sensitive test data and asked to polish this at the end; this package keeps that existing setup.

## Before real student data

1. Replace unconditional `anon` policies with deny-by-default policies.
2. Use server-verified identity and college/role claims for Admin, HOD, Teacher, student, and parent actions; do not trust client-supplied role or college IDs.
3. Add and test tenant-scoped policies on every table and storage bucket. Test College A cannot read or modify College B.
4. Ensure service-role credentials remain only in Edge Functions; require authorization checks inside every function configured with platform JWT verification disabled.
5. Rotate any credentials that were exposed, and run a backup/restore rehearsal before the pilot.
6. Re-test OTP abuse limits, webhook replay/idempotency, private file access, and the full role matrix.

The base `supabase/schema.sql` contains legacy setup statements that disable RLS. Do not run it on the live project. Treat the SQL and old deployed-function snapshots as source material for review, not as an automatic production migration.

## Update 2026-10-10 (login + upload fixes)

- `send-otp` redeployed (v13): per-request CORS, allows cravex.co.in, www, and this site's Netlify URL/deploy previews only. Source copy updated in `supabase/deployed-functions/send-otp.index.ts`.
- `website/pages/dashboard.html`: keeps the OTP session token in memory and sends it (not the anon key) to `process-pdf` and `process-lesson-plan`.
- Action needed in Supabase: set secret `DASHBOARD_ORIGINS` = `https://cravex.co.in,https://www.cravex.co.in,https://chic-malasada-a53c0d.netlify.app` so upload functions accept Netlify.
- Still open: anon `true` policies / RLS gate above. Not cleared for real student data.
