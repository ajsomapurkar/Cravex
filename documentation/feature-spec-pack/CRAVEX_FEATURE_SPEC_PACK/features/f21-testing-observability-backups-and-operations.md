# F21 — Testing, Observability, Backups and Operations

**Priority:** P0–P1  
**Current state:** Some test/reporting and operational tables exist; production proof and backup auth need work  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for testing, observability, backups and operations, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

Repository includes `scripts/verify_package.py` and `documentation/PHASE45_BROWSER_TEST_REPORT.md`. Browser smoke covered key navigation, synthetic role sessions, Resources and Evidence Packs; this is not a full E2E/security/performance suite. Live schema includes `audit_log`, `usage_events`, `provider_health`, `ai_jobs`; Supabase advisors identify issues. The active `db-backup` function accepts a caller-controlled `x-cron-trigger: true` path OR a secret and uses a hardcoded fallback secret when `BACKUP_SECRET` is absent — treat this as critical until verified and fixed.

## 3. Scope

- Unit, integration, E2E, security/RLS, migration, performance/load and accessibility smoke tests.
- Synthetic test dataset for every role and two or more colleges.
- Structured correlation IDs across frontend/API/DB/worker/provider.
- Alert on error rates, queue age, AI quotas, failed delivery, storage processing, backup failures and abnormal access.
- Backup authorization via verified scheduler identity or strong secret-only alternative; fail closed when secret is missing. Remove public trust in caller-controlled cron header.
- Automated backup verification and documented restore rehearsal.
- Incident checklist and release/change log.

## 4. Required workflows

Deploy → run health checks → synthetic role logins → key read/write smoke tests → verify queue/notifications and dashboard refresh → compare error/latency metrics → alert on failures. Backup job emits signed/audited result and independently monitored completion.

## 5. Data and API implications

Add test harness / CI workflow; use synthetic IDs. Keep structured logs free of OTPs/tokens/PII. Record backup manifest, start/end, row counts/checksum and destination. Do not store backup artifacts publicly. Trace long-running AI/file jobs with correlation IDs.

## 6. Authorization and audit requirements

Operations dashboards and logs have their own access policy. Backup function must reject if secrets missing; `x-cron-trigger=true` from any caller cannot be accepted as proof. Disable or restrict public execution grants on privileged RPCs. Rotate any exposed secrets after review.

## 7. Backward-compatibility and change-safety rules

Do not treat successful page render as readiness. Use a release gate that requires automated tests, schema migration status, current advisor review, backup verification and a role-based smoke. Maintain old/new API contract coverage during rollouts.

## 8. Tests required

- Backup endpoint auth negative tests (no header, forged cron header, wrong secret, missing secret).
- Restore into isolated project and validate schema + record counts.
- CI E2E covers each role and core flow.
- AI and document queues recover after worker restart.
- Logs include correlation IDs, exclude secrets and alert correctly.

## 9. Acceptance criteria

- [ ] Backup is authenticated, secretless deployment fails closed, and restore was tested.
- [ ] Automated tests gate release; smoke test roles and core workflows.
- [ ] Operational alerts detect failures quickly.
- [ ] Current Supabase security/performance findings are tracked to closure.

## 10. Dependencies

F01 and F20 first; then all workflows. Keep operational readiness as a release gate, not a later cleanup.

## 11. Rollout plan

Fix backup auth before depending on it for migration safety. Establish staging tests and restore rehearsal, then incrementally add feature-level E2E tests to CI.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
