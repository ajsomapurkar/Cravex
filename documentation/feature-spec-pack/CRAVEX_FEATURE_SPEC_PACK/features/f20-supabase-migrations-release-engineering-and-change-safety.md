# F20 — Supabase Migrations, Release Engineering and Change Safety

**Priority:** P0 — foundation  
**Current state:** Repository/live project drift is confirmed  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for supabase migrations, release engineering and change safety, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

The GitHub `main` tree reviewed at SHA `84cb3f5d9f4fd6b60e62f0f51596efa494bdd32d` contains `supabase/schema.sql`, multiple lesson-plan schema snapshots and some deployed-function snapshots, but no dedicated `supabase/migrations/` directory was seen in the inspected tree. Live Supabase lists 21 migrations, latest `20260818142600 production_safety_additive_001`. Live function versions are significantly newer than some repo snapshots. `schema.sql` contains RLS-disabling statements.

## 3. Scope

- Establish a single migration source-of-truth in `supabase/migrations/<timestamp>_<name>.sql` (or the officially chosen CLI convention).
- Reconcile migration history and live schema without resetting production.
- Use a new development/staging branch/project; confirm exact target ref before changes.
- Add schema/policy/index/function/trigger changes via migration files; do not hand-edit dashboard DB without capturing migration.
- Separate migrations from function deployment; pin and diff active deployed functions before deploy.
- Generate updated TypeScript database types from known migration state.
- Add CI for migration lint, typecheck, static checks, test suite, secret scan and package verification.
- Use backup/restore rehearsal, deploy canary and rollback/forward-fix plan.

## 4. Required workflows

Code change → migration draft → static review → apply to ephemeral/dev database → run tests and advisors → deploy compatible backend → deploy frontend → verify health/metrics → widen rollout → record release and live migration version.

## 5. Data and API implications

Capture schema dumps, policies, grants, constraints, RPC definitions, triggers, extensions, storage policies and migration ledger. Record expected schema version. Reconcile live-only migrations/functions to source in explicit steps. Never invent a migration file retroactively and assume the history is equivalent without comparison.

## 6. Authorization and audit requirements

Only trusted operators can run migrations or deploy functions. Secret values are not stored in repo. CI must distinguish public configuration from secrets. Production migration approval requires identified project ID, backup status, rollback strategy and test evidence.

## 7. Backward-compatibility and change-safety rules

- Additive expand/contract: add nullable/new structures → dual write/read if required → backfill and reconcile → switch reads → stop legacy writes → remove old structures only in a later reviewed migration.
- Never run full bootstrap `schema.sql` against existing live DB.
- Never redeploy an older Edge Function snapshot just to align with repo; compare live code and source first.
- Do not roll back destructive DDL blindly; prefer forward-fix migration with tested data recovery path.

## 8. Tests required

- Clean database can build from migration chain.
- Existing staging database migrates without data loss.
- Migration twice/idempotency strategy tested as appropriate.
- Function source/deployed version inventory reconciled.
- Backup restore and deployment rollback rehearsal passed.
- CI blocks unauthorized schema/function changes and exposed secrets.

## 9. Acceptance criteria

- [ ] Repo and connected Supabase schema have a documented, reviewable source of truth.
- [ ] Every future change has a migration and test evidence.
- [ ] Deploying the website cannot accidentally alter the database.
- [ ] No destructive reset or unreviewed live schema edits are needed for ordinary feature work.

## 10. Dependencies

All feature specs depend on this discipline. Security remediation and Principal/timetable work must follow it.

## 11. Rollout plan

First archive current live metadata/schema and backups. Reconcile drift as a dedicated project. Introduce migrations only after baseline is agreed; keep initial feature migrations isolated by domain and release.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
