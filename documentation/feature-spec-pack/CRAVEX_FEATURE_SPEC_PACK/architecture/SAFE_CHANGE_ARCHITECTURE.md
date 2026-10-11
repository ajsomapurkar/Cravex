# Safe Change Architecture and Engineering Contract

## 1. Architecture goals

Cravex should let institution administrators update configuration centrally while preserving predictable behavior across Principal, HOD, Teacher and student-facing dashboards. UI, backend and schema changes must ship as compatible slices, not as unrelated redesigns.

## 2. Source of truth

- **Database:** authoritative academic records, role assignments, published timetable, marks/attendance workflow states, configuration versions and audit history.
- **Server/API:** trusted authorization, validation, transaction boundaries, irreversible-action checks, integrations, rate limits and secrets.
- **Frontend:** renders permitted data and invokes supported operations; never trusted to decide the caller's role or scope.
- **Realtime events:** invalidation/notification signal. A client receiving an event refetches canonical state. On reconnect, compare version and refetch.
- **AI output:** untrusted draft/supporting output. It does not approve lesson plans, marks or policies.

## 3. Recommended modular boundaries

Keep modules separated by domain/service functions even if the first implementation remains a static HTML dashboard:

1. Identity and Authorization
2. Organization and Academic Configuration
3. Principal Governance
4. Department and Faculty Allocation
5. Timetable and Calendar
6. Students and Enrollment
7. Attendance
8. Lesson Planning and Syllabus Coverage
9. Assessment, Marks and Freeze Workflow
10. OBE and Attainment
11. Course Files and Resources
12. Meetings, Notices and Notifications
13. Google Classroom Adapter
14. AI Retrieval, Queue and Provider Adapters
15. Evidence, IQAC and Reporting
16. Audit/Observability/Backups

Avoid expanding the 200+ KB single `website/pages/dashboard.html` into an even larger monolith. Prefer gradual extraction into modules/assets/build output while preserving current routes and deployment behavior. Keep `netlify.toml` publish root expectations intact unless deployment config is intentionally changed.

## 4. Safe database evolution: expand/contract

For every change:

1. **Inventory:** inspect the live schema, policies, functions, views, triggers, storage rules and repo source. Do not rely only on old `schema.sql`.
2. **Design:** identify migration and API contracts, current writers/readers, data backfill, RLS and role scope.
3. **Expand:** add new nullable fields/tables/indexes or versions without removing the old path.
4. **Backfill:** run repeatable, bounded migration/backfill. Track rows and failures. Make it resumable where practical.
5. **Dual-validate:** compare old/new reads or computed totals on representative fixtures and current test data.
6. **Switch:** switch API/UI to the new model behind a feature flag; keep fallback only as long as documented.
7. **Observe:** monitor errors, query latency, missing relationships, event delivery and data parity.
8. **Contract later:** remove old paths only in a separate migration after confirming there are no users/dependencies.

Never use a destructive “rebuild everything” schema to deliver one feature. Never drop/rename a column in the same release that introduces the replacement unless a fully tested lockstep deployment is unavoidable.

## 5. Supabase migration governance

- Establish `supabase/migrations/` as the chosen repo convention if that is consistent with the current deployment workflow.
- Reconcile the live migration ledger before new migration files are added; it currently lists 21 migrations, latest `20260818142600 production_safety_additive_001`.
- Record the baseline schema, policy definitions, grants, RPC/function definitions, trigger definitions, extensions, and Storage policies.
- Do not mark historical migrations applied just because names appear similar; compare their actual SQL/effect.
- Never run `supabase/schema.sql` against the live project: it contains legacy RLS disabling statements.
- Treat Edge Function deploys separately from database migrations. The live project has newer function versions than several repo snapshots; diff deployed source before any redeploy.
- Update generated database types as part of the same PR as schema contracts.
- After migration: run tests and Supabase Security/Performance Advisors, document findings and links.

## 6. Role model

Proposed roles must remain distinct:

- `master`: platform-wide operations, not routine college academic approval.
- `college_admin`: institution setup and technical/administrative configuration as policy permits.
- `principal`: institution-level academic oversight/approval scope.
- `hod`: assigned department scope and department approvals.
- `teacher`: assigned subjects/classes and approved class operations.
- `student`: own profile and explicitly published learning records, if student self-service is enabled.
- `parent` (future if needed): only verified/consented linked student records.

The live role constraint currently lacks `principal`. Add it in a migration only after policy and app handling have been prepared. Never let a role value in the browser or request body self-authorize.

## 7. Live timetable event contract

A successful publish should atomically save the published timetable version and a durable event/outbox row. The event should include stable ID/version/scope and changed slot IDs, not confidential full row contents. Consumers:

- teacher timetable
- student/class/section timetable
- HOD department view
- Principal institutional view
- room/lab allocations
- upcoming-class reminders
- future scheduled attendance sessions

On a missed event, reconnect/refetch returns the latest published version. Timetable revisions affect future sessions by default; past attendance is not rewritten. In-flight edits use optimistic concurrency/version checks. Rollback creates a new revision so history remains intact.

## 8. API contract standards

- Use stable UUID/entity IDs, not display names/phone numbers, for new relationships.
- Validate schema, state transitions, assignment scope and expected version server-side.
- Return structured error codes for validation, permission denied, conflict, rate limited, retryable provider error and internal error.
- Use idempotency keys for imports, outbound messages, job creation and other retryable operations.
- Paginate large lists; avoid loading whole college/branch/semester data into a browser.
- Redact secrets/PII from logs; use correlation IDs.

## 9. UI contract standards

Every screen must handle loading, empty, permission denied, validation error, service error, retry, conflict/stale version and success. A Save button should only show success after the authoritative server confirms the write. When a config/role change is published, refresh affected queries; don't assume browser state remains authorized.

## 10. Release gates

A feature release requires:

- migration reviewed/applied to staging
- data parity/backfill report (if applicable)
- updated TypeScript/database types
- automated unit/integration/E2E tests
- role and cross-tenant negative tests
- current active function code comparison (if functions change)
- secrets scan
- backup verification and rollback/forward-fix notes
- Security Advisor + Performance Advisor review after DDL/policy changes
- smoke test of all existing routes and core login, attendance, marks, lesson-plan, resources, evidence and AI workflows
