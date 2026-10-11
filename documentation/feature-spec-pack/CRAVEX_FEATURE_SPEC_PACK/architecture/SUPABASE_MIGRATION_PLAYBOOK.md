# Supabase Change and Migration Playbook

## Current reviewed baseline (11 Oct 2026)

- Project ref: `gkuzoywsftjxnxzlufiy`; PostgreSQL 17; region `ap-south-1`.
- Live migration ledger: 21 entries; latest `20260818142600 production_safety_additive_001`.
- The inspected GitHub tree did not show a dedicated `supabase/migrations/` directory.
- `supabase/schema.sql` contains legacy `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` statements. Never run it against the connected live project.
- Live Edge Functions and versions reported: `smooth-function` v358, `process-pdf` v64, `send-otp` v15, `db-backup` v12, `process-lesson-plan` v12, `support-dashboard` v6, `ai-worker` v5. Several repo snapshots are older; compare active code before any deploy.

## Safe workflow

1. Confirm target project ref and environment.
2. Capture database backup and verify that restoration is possible; do not rely on an endpoint with unverified authentication.
3. Export the live schema/policies/grants/functions/triggers/extensions/storage policies and migration list.
4. Compare repo schema files and migration history against live state. Record differences before deciding which changes to codify.
5. Author one forward-only migration per coherent domain, with a descriptive timestamped filename.
6. Review constraints, RLS/policies, grants, functions, trigger side effects, locks and expected data volume.
7. Apply to staging/dev and run migrations plus automated tests.
8. Validate before/after row counts, constraints, relationship gaps and computed outputs.
9. Generate/refresh frontend database types, review compile failures and run E2E.
10. Apply to production only with approved backup, explicit target project ref, owner approval and rollback/forward-fix plan.
11. Re-run Supabase advisors; document resolved or accepted findings with reason and remediation links.
12. Verify application health and update this baseline.

## Example migration naming

`supabase/migrations/20261011140000_add_timetable_versions.sql`

The timestamp above is only a naming example; use the actual authoring timestamp and do not invent/retroactively forge historical migration versions.

## Migration patterns

### Add a new field

- Add it nullable or with a safe default.
- Deploy code that can tolerate null and write the new field.
- Backfill in bounded batches.
- Verify non-null/completeness and add constraints in a later migration if needed.

### Rename/replace data model

- Add replacement column/table.
- Dual-write with transaction consistency if necessary.
- Backfill and compare old/new values.
- Switch reads under a feature flag.
- Monitor.
- Remove legacy path in a later release only when dependency scan proves safe.

### Add a new role

- Update database role constraint and trusted helper/policy functions first in a reviewed migration.
- Update backend authorization/permissions and tests.
- Update role creation/invitation flow.
- Update UI after backend accepts role.
- Test every existing role and reject escalation.

### Enable RLS on an existing exposed table

- Inventory all current policies and grants.
- Design correct tenant + role + subject/assignment-scoped policies.
- Create test fixtures and verify desired role access.
- In one reviewed transaction/release, enable RLS with correct policy set so there is no accidental open window.
- Test anon denial and service-role intended behavior.
- Do not simply enable RLS and assume previous policies now work; a number of current tables have policies that are not enforced because RLS is disabled.

## Required PR/migration template

- Purpose and affected features
- Exact project/environment scope
- Tables/functions/policies/views/triggers/storage objects affected
- Data backfill plan and expected counts
- Authorization model and negative tests
- Lock/runtime impact estimate
- Forward-fix/rollback plan
- Staging migration and test evidence
- Supabase advisor output after change
- Function version comparison (if applicable)

## Never do these

- Do not run the base `schema.sql` against the current database.
- Do not copy/paste live-only SQL into production without a tracked migration.
- Do not disable RLS to resolve frontend permission errors.
- Do not add blanket `USING (true)`/`WITH CHECK (true)` policies to unblock a feature.
- Do not trust a user ID, college ID, role or subject ID supplied by the browser without checking authorization.
- Do not deploy older Edge Function snapshots without a live-source diff and an intentional release.
- Do not mass-delete unused indexes based only on advisor output; inspect actual workload and query plans.
