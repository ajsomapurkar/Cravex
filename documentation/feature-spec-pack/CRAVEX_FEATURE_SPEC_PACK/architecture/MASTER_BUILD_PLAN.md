# Cravex — Production Build Plan and Safe Change Strategy

**Document status:** Implementation blueprint / source-of-truth plan  
**Last verified:** 11 October 2026  
**Repository:** [`ajsomapurkar/Cravex`](https://github.com/ajsomapurkar/Cravex)  
**Branch reviewed:** `main`  
**Reviewed repository tree SHA:** `84cb3f5d9f4fd6b60e62f0f51596efa494bdd32d`  
**Connected Supabase project:** `gkuzoywsftjxnxzlufiy` (`ap-south-1`, PostgreSQL 17; project status reported `ACTIVE_HEALTHY`)  
**Purpose:** Define what already exists, what must be completed or built, and how to change the application and Supabase without accidentally breaking existing features or production data.

> **Critical status:** The current project must remain test-data-only until the security issues in this document are remediated and verified. This document is a plan, not permission to run a full schema reset or deploy migrations. No database changes were made as part of this review.

---

## 1. Goals and non-negotiable engineering rules

Cravex should become a VTU-aligned academic operations platform with connected Principal, HOD, Teacher and student-facing workflows. Admin-managed settings should be authoritative: changes that are configuration should flow through shared APIs/data and appear on all affected dashboards without editing each dashboard separately.

The system must remain safe to extend. New features must not overwrite older academic records, bypass role checks, fork the schema between environments, or make a single oversized dashboard harder to maintain.

### Non-negotiable rules

1. **Do not rerun `supabase/schema.sql` on the connected/live project.** It contains legacy `DISABLE ROW LEVEL SECURITY` statements and is a schema snapshot/bootstrap script, not a safe production migration.
2. **Do not edit deployed Supabase functions by redeploying an old snapshot.** In particular, the connected project reports current active function versions that are newer than several copies stored in the repository. Read and compare live code before deployment.
3. **Database changes must be versioned migrations.** Every schema, policy, index, function or trigger change must be an explicit migration file reviewed and tested against a staging/dev database.
4. **Prefer additive changes first.** Add new columns/tables/indexes, backfill and verify, switch application reads/writes, and only then remove deprecated elements in a separate release after proving they are unused.
5. **No browser-only authorization.** Hiding menu items is not permission enforcement. Sensitive operations must be authorized in the database policy or by a server-side function that validates the caller.
6. **Every change must have a regression test.** Existing dashboard routes, login/OTP, attendance, marks, lesson-plan processing, resource access, evidence packs, risk monitoring, notices, exports and integrations must be tested for regressions.
7. **Do not silently rewrite history.** Timetable revisions affect future schedule records by default. Finalized marks and historical attendance require a separately authorized correction path and audit trail.
8. **No secrets in frontend code, Markdown, commits or Netlify assets.** Use Supabase secrets / deployment environment settings, rotate exposed credentials, and scan before release.
9. **The database is authoritative.** Realtime events notify clients to refetch; they must not be treated as the only delivery mechanism or source of truth.
10. **No feature is marked “complete” because a screen renders.** Completion means persistence, authorization, error handling, audit history, tests and a verified end-to-end workflow.

---

## 2. What was inspected

### GitHub repository

Inspected the `main` tree and relevant documentation/schema files in [`ajsomapurkar/Cravex`](https://github.com/ajsomapurkar/Cravex), including:

- `README.md`
- `TEMPORARY_SECURITY_STATUS.md`
- `supabase/schema.sql`
- `supabase/supabase_phase45_migration.sql`
- `supabase/lesson_plan_schema.sql`, `lesson_plan_schema_v2.sql`, and `lesson_plan_schema_v3.sql`
- `supabase/deployed-functions/*`
- `website/pages/dashboard.html`
- `documentation/PHASE45_BROWSER_TEST_REPORT.md`
- `documentation/CODE_REVIEW_COMPREHENSIVE.md`
- `documentation/IMPLEMENTATION_GUIDE.md`
- `scripts/verify_package.py`
- `netlify.toml` and `NETLIFY_DEPLOYMENT.md`

The current UI is a static Netlify site, with the dashboard concentrated in `website/pages/dashboard.html` (approximately 217 KB in the inspected tree). The repository includes handoff docs and a package verification script, but the inspected tree does not show a dedicated `supabase/migrations/` directory, frontend test suite or CI workflow. Browser regression notes demonstrate selected UI routes and synthetic role switching; they do not prove every mutation persists correctly or that access control is secure.

### Supabase project

Read-only inspection of the connected project reported:

- Project is active/healthy; PostgreSQL 17.
- **21 recorded migrations**, latest listed as `20260818142600 production_safety_additive_001`.
- Active Edge Functions: `smooth-function` v358, `process-pdf` v64, `send-otp` v15, `db-backup` v12, `process-lesson-plan` v12, `support-dashboard` v6, and `ai-worker` v5.
- `verify_jwt` is false for all the listed functions except `support-dashboard`. Some functions implement their own token/secret checks; this setting must be reviewed function-by-function, not changed blindly.
- Supabase Security Advisor has current findings detailed in §4.
- Supabase Performance Advisor reports unindexed foreign keys, unused indexes and duplicate indexes detailed in §4.

The repository and live project have drifted. The live project has migrations and deployed function versions that are not represented as a clean, authoritative migration/deployment history in the repository. Reconcile them before adding features.

---

## 3. Existing foundations — retain and verify rather than rebuild blindly

Status labels:

- **Exists** — table/code or a tested UI foundation was observed.
- **Partial / verify** — a base implementation exists but a complete production workflow was not proven.
- **Missing / not found** — a dedicated table/workflow was not found in the inspected public schema or current UI inventory. Confirm against any unlisted external service before deciding implementation details.

| Area | What exists now | What must still be verified/completed |
|---|---|---|
| Landing site and dashboard route | Netlify site; `/dashboard` and `website/pages/dashboard.html`; `netlify.toml` selects `website/` as publish directory | Deployment configuration, caching/security headers and smoke test after each release |
| Role-aware UI | Master, College Admin, HOD and Teacher UI states; student role exists in database constraint; selected role-specific menus were smoke-tested | Add Principal role end-to-end; do not trust a client-side role selection/session |
| Colleges / users / students | `colleges`, `users`, `students` | Secure provisioning, stable identity links, bulk-import validation, enrollment history and tenant isolation |
| Departments / HOD mapping | `departments` with `hod_user_id`; `users.department_id` | Safe HOD create/change/deactivate workflow, acting HOD delegation and effective dates |
| Subjects / faculty assignment | `subjects`, `subject_assignments`, `class_teacher_assignments` | Assignment history, faculty load checks, department and class scope, timetable link |
| Attendance | `attendance_sessions`, `attendance_logs`, `attendance_records` | Schedule-generated sessions, correction/approval workflow, historical immutability, eligibility rules per scheme |
| Marks | `student_marks`, `marks_audit_log`, `update_mark_with_audit` | Assessment definitions, maximum/weight validation, approval/freeze states, Principal review, controlled amendment workflow |
| Lesson-plan topics / progress | `lesson_plan_topics`, `lesson_plan_progress`; lesson-plan processing function | Map to timetable/lecture, syllabus version, actual delivery evidence, HOD comments/approval and backlog escalation |
| CO/PO data | `course_outcomes`, `course_learning_objectives`, `co_po_mapping`, `subject_profile` | Protect data with RLS; assessment/question-to-CO mapping, calculation versioning, attainment results and audit-ready reporting |
| Documents / knowledge base | `documents`, `doc_chunks`, `manual_embeddings`, `uploaded_files`, `process-pdf` | Secure file/object access, clear source-to-chunk mapping, scoped retrieval and retention/deletion behaviour |
| Notices / communication | `announcements`, `smart_notices`, `outbound_messages`; WhatsApp-related functions | Recipient delivery/read status, role targeting, idempotency, reminders, retries and escalation lifecycle |
| Evidence packs / academic risk | Evidence Packs and Risk Monitor views exist in the browser test report | Verify persisted records, real source links, workflow states, user ownership and report export correctness |
| AI jobs / quotas / resilience | `ai_jobs`, `college_quotas`, `provider_health`, `usage_events`, `response_cache`, `rate_limits`; `ai-worker` | Load tests, queue limits, per-user fairness, deduplication, provider quota handling, retry backoff and alerting |
| Audit logging | `audit_log` and `marks_audit_log` | Secure access, consistent events for permission/configuration/timetable/approval changes, retention and export controls |

### Live roles constraint

The live `public.users_role_check` currently permits `master`, `college_admin`, `hod`, `teacher`, `student`. **It does not permit `principal`.** The main repository schema also uses an older, different role set in places. Adding Principal is therefore a coordinated application + policy + schema change, not just a new dashboard page.

---

## 4. Supabase findings — remediation register

These were observed during read-only inspection on 11 October 2026. Re-run the advisors after remediation because the results can change.

### P0 — security blockers before real student data

#### S-001: Unconditional anonymous policies across academic data

The live database has **37 `anon` policies across 17 public tables**. Examples include unconditional reads of `students`, `student_marks`, `users`, `departments`, `subjects`, `subject_assignments`, `attendance_records`, `attendance_sessions`, `doc_chunks` and uploaded file metadata. Some tables permit anonymous inserts, updates or deletes, including `student_marks`, `students`, `users`, `departments`, `subjects`, `subject_assignments` and `class_teacher_assignments`.

**Required action:** inventory every policy; replace broad access with deny-by-default policies or route the action through an authenticated Edge Function. Keep only intentionally public, minimal endpoints such as OTP request/verification and strictly validate, rate-limit and audit them. Do not assume that “RLS enabled” means a table is secure if its policy says `true`.

Reference: [Supabase database linter — RLS policies](https://supabase.com/docs/guides/database/database-linter).

#### S-002: RLS is disabled on six academic tables

Security Advisor reports RLS disabled on:

- `public.subject_profile`
- `public.course_outcomes`
- `public.course_learning_objectives`
- `public.co_po_mapping`
- `public.lesson_plan_progress`
- `public.lesson_plan_topics`

These tables already have some `jwt_*` policies but RLS is off, meaning those policies are not enforcing access.

**Required action:** implement and test the actual access path first, then enable RLS with correct policies in a migration. Do not simply toggle RLS and deploy: the current app uses custom OTP/session behaviour plus direct Supabase queries, so existing direct queries may stop working or continue using an inappropriate `anon` policy unless the auth path is migrated correctly.

Reference: [Supabase linter — RLS disabled in public](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public).

#### S-003: Backup Edge Function has an unsafe authentication path

The active `db-backup` function reports `verify_jwt=false`. The inspected deployed implementation accepts an `x-cron-trigger: true` header as sufficient to take the cron path and also contains a fallback backup secret in code. A caller-controlled header is not proof that the caller is a trusted scheduler.

**Required action:** treat this as urgent. Remove the caller-controlled cron bypass; remove any hardcoded fallback secret; rotate the backup secret; use a strong Supabase function secret for manual invocation and a trusted scheduler mechanism with its own authentication. Limit backup access and avoid returning database contents to arbitrary callers. Verify successful backups and restore procedure after fixing it.

Do not copy secret values into this document, Git commits or client code.

#### S-004: Publicly executable SECURITY DEFINER functions

Security Advisor reports three `SECURITY DEFINER` functions callable by `anon` and `authenticated`: `acquire_ai_lock`, `rls_auto_enable`, and `trigger_process_pdf`.

**Required action:** examine execute grants and intended callers. Revoke `EXECUTE` from `PUBLIC`, `anon` and/or `authenticated` unless explicitly required; use a narrow role or authenticated server function. Confirm `search_path` safety and input validation. Be especially careful with functions that invoke HTTP calls or use service credentials.

Reference: [Supabase linter — SECURITY DEFINER executable](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

#### S-005: Auth contract needs to be made consistent

The repository states that the dashboard uses a browser-visible public/anon key and direct Supabase queries, and that login restoration/session lifecycle is incomplete. Some processing functions validate a custom signed session token; that is different from using a Supabase Auth JWT for direct PostgREST/RLS authorization.

**Choose and document one supported model:**

- **Preferred option A:** use Supabase Auth users with server-issued identity and trusted claims/metadata, with tenant/role policies that read trusted JWT claims; or
- **Option B:** retain custom OTP sessions but proxy all sensitive operations through Edge Functions that verify the signed token and derive user/college/role on the server. Do not accept role or college scope directly from the request body. In this model, direct browser writes to protected tables must be removed or strictly limited.

Either model needs session expiry, revocation/rotation, brute-force controls, CSRF/CORS review where applicable, and tests for College A vs College B access.

#### S-006: Authenticated RLS tables with no policies

Security Advisor reports RLS enabled with no policies on `audit_log`, `auth_otps`, `outbound_messages`, `parent_links`, `tenant_phone_numbers`, and `usage_events`.

This may be the correct deny-by-default behaviour for client access. Confirm only the intended service-role/server functions can read or write them. Do not add blanket authenticated policies to “make it work.”

#### S-007: Backup and function secrets / endpoint review

The listed Edge Functions have `verify_jwt=false` except `support-dashboard`. Some have custom auth by design (`send-otp`, processing functions, webhook/worker routes), but each endpoint must prove authentication in its own code. Create a function inventory with endpoint purpose, caller, auth method, rate limits, CORS origins, secrets, data touched and logging requirements. Preserve webhook-specific validation where required; do not blindly switch every function to JWT verification without understanding its caller.

#### S-008: Run a complete credential and Git-history scan

The repository's existing comprehensive code-review document flags hardcoded credentials as a concern. A targeted scan of the supplied source snapshot did not find common Google/OpenAI/WhatsApp bearer-key formats, but that is not a complete secret audit and does not prove the Git history is clean. Run GitHub secret scanning or an approved secret scanner across every tracked file and commit history. Rotate/revoke any real credentials found, remove them from current source, and replace with environment secrets. Do not rely on deleting a key from the latest file: a credential committed previously can remain exposed in Git history.

### P1 — data integrity / operability findings

- Nine functions were reported with mutable `search_path`; pin `search_path` explicitly and review `SECURITY DEFINER` functions.
- `vector` is installed in the `public` schema; review the Supabase recommendation to move extensions where compatible with existing vector queries and migrations.
- Performance Advisor reports **16 foreign keys without covering indexes**. Add indexes only after query and write-cost review.
- It reports **48 unused indexes** and **two duplicate-index groups**. Do not mass-delete these; usage statistics may reflect a low-traffic or newly deployed project. Inspect query plans and workload over a representative interval first.
- `lesson_plan_progress` has multiple permissive SELECT policies for `authenticated`; consolidate only after comparing the combined behaviour and tests.

References:

- [Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
- [Unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)
- [Duplicate indexes](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index)
- [Mutable function search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)

---

## 5. Main feature gaps to build

### 5.1 Principal console

- Add an explicit Principal role and user lifecycle (invite/activate/deactivate/replace/acting Principal where college policy allows).
- Add scoped permission assignment. Separate institution owner/master, College Admin, Principal, HOD, Teacher, student and parent privileges; do not conflate Principal with platform owner.
- Add institution overview: branches, departments, teaching completion, attendance exceptions, assessment completion, academic risks and pending approvals.
- Add delegated approval workflows for final marks submissions and other institutional approvals according to college policy.
- Add institution-wide meeting schedule, agenda, minutes, action items, due dates, attendees and follow-up status.
- Add announcements/callouts targeting institution, branch, department, role, section or individual; track send/delivery/read where channel supports it.
- Add academic audit/IQAC evidence readiness, corrective actions, owner, due date and closure approval.
- Add audit trail and reversible configuration history for permissions, roles and settings.
- Add exports that contain only records the Principal is permitted to access.

**Acceptance criteria:** Principal can add/assign an HOD, change scoped permissions, publish an authorized announcement, schedule a meeting, inspect pending approvals and see the audited result. A Principal cannot grant platform-master privileges or view another college.

### 5.2 Live timetable and schedule operations

No dedicated timetable version/slot/room model was found in the inspected public schema. Build this as a domain, not as a collection of ad-hoc dashboard fields.

- Academic-year/semester timetable versions with `draft`, `pending_approval`, `published`, `superseded` states.
- Timetable slots connected to branch, section, subject, component (theory/tutorial/lab), practical batch, teacher, room/lab, period and effective date range.
- Conflict detection for teacher, student section, room/lab, overlapping batches and unavailable slots.
- HOD review/publish flow; Principal approval only when configured by institutional policy.
- Publish events that notify affected dashboard sessions; refetch canonical rows after event receipt/reconnect.
- Automated schedule updates for teachers, students, attendance session creation, upcoming-class widgets and reminders.
- Substitution, cancellation, extra class, room change, lab batch change and emergency timetable revision flows.
- Version comparison, history, actor/reason, approvals and rollback to a previous published timetable.
- Protect completed/closed attendance. Only alter past schedules/attendance through an explicit correction workflow.

**Acceptance criteria:** changing a future timetable slot and publishing updates only affected teachers/students/rooms, sends scoped notifications, logs before/after values and preserves completed historical records. Conflicting schedules cannot publish unless an authorized documented override exists.

### 5.3 Teacher academic workspace

- Assigned subjects/classes/sections/batches from authorized data, with effective dates and assignment history.
- Lesson plan by subject, unit, topic, lecture and date; map each topic to COs and estimated hours.
- Planned vs actual coverage, teaching method, resources used, actual delivery date, evidence and delay reason.
- HOD submission/review/return/approval with comments, status and version history.
- Timetable-linked attendance, student list, permitted correction requests and shortage reporting.
- Assessment definitions by applicable VTU scheme/semester, configurable assessment types, maxima, weights, dates and eligibility logic.
- IA marks entry with out-of-range/missing-value checks, draft/submitted/returned/approved/frozen status, immutable audit trail and authorized corrections.
- Question paper and valuation-scheme repository by assessment, version, author, reviewer, access level and retention period.
- Course file: lesson plans, PPTs, notes, assignment sheets, lab manuals, records of syllabus coverage, papers and related evidence.
- Laboratory workflow: practical batches, experiment completion, lab attendance, practical marks and lab record evidence.
- CO/PO/PSO mapping at course/question/assessment level; configurable attainment formula/version and institution-approved targets.
- Student assignments, evaluation, mentoring, remediation and follow-up records, limited to assigned students.
- Meetings, reminders, assignment deadlines, academic calendar and timetable-change notifications.
- Google Classroom link, status, mapped branch/subject/section, sync timestamp and integration error.
- Exportable subject reports, class attendance and marks lists, syllabus progress and CO attainment.

**Acceptance criteria:** a Teacher cannot edit unassigned classes or another teacher’s finalized marks; every marks correction requires a reason and appropriate approval; one subject’s course file is accessible only to authorized users.

### 5.4 HOD department operations

- Faculty/subject/class allocation; workload and timetable conflict checks.
- Manage department timetable and publish approved revisions.
- View all department lesson plans; approve/return with comments; monitor syllabus backlog and delivered instructional hours.
- Review course files, question papers, valuation schemes and academic evidence.
- Verify IA marks, return errors, freeze department submission and track Principal verification.
- Review subject performance, attendance anomalies, at-risk students, mentoring and remedial actions.
- Maintain department meetings, minutes, action items and due dates.
- Maintain CO/PO reports and department IQAC/audit evidence.
- View scoped teacher assignments and audit history; temporary acting HOD must expire automatically.

**Acceptance criteria:** HOD sees only the assigned department. No HOD can self-approve a Principal-only stage. Changing the assigned HOD takes effect immediately for new actions without erasing old approval history.

### 5.5 Other academic domains

Add/complete only after validating the applicable college policy and VTU scheme:

- Academic calendar, regulatory/scheme versions and effective dates.
- Room/lab/equipment inventory if in scope.
- Student enrollment, branch/section transfer, subject registration and progression history.
- Assessment question bank, moderation, valuation schemes, paper access restrictions and examination evidence.
- Notifications/reminders, read receipts, delivery retry and escalation engine.
- IQAC/academic audit checklists, observations, corrective actions and closure proofs.
- Parent-linked data access and consent/verification, only if this feature is required.
- Timetable, academic, attendance, assessment and workload reporting.

### 5.6 Google Classroom and Gemini

**Google Classroom**

- Add a `classroom_mappings`/integration domain (or equivalent) for a stable internal subject/class ID, institution, branch, semester, section, Classroom ID, owner, granted scopes, active state and sync metadata.
- Resolve link permissions and provider access; do not assume that a URL alone provides access.
- Link resources when possible rather than copying entire files into Cravex storage; maintain access-aware metadata and clearly defined retention/deletion behaviour.
- Restrict chatbot retrieval by college, branch, semester, subject, section and user’s effective role/assignment.

**Gemini / AI reliability**

- Keep requests bounded by per-user and per-college rate limits; queue when concurrency/quota is reached instead of telling all users to retry later.
- Add exponential backoff with jitter, bounded retries, idempotency keys, duplicate-request suppression and clear retryable vs permanent error classification.
- Use caching only for appropriately scoped queries; never allow one college/user to receive another tenant’s cached answer.
- Limit uploaded document size, chunk sizes, context size and output token budgets; avoid resending whole documents each request.
- Track provider/model, tokens/units, latency, retries, failure reason and estimated cost without logging secrets or sensitive academic content unnecessarily.
- Use circuit breakers/fallback providers with clear success/failure semantics; provide a graceful temporary-unavailable response without losing queued work.
- Load test using defined concurrency targets and provider limits verified at implementation time.

---

## 6. Target architecture and separation of concerns

Keep the UI, domain workflows, data access and infrastructure changes separate. A change to timetable rendering must not require changing marks logic; a new role must not require duplicating every API query.

### Logical architecture

```text
Role dashboards (Principal / HOD / Teacher / Student / College Admin)
                     |
          Shared UI modules + typed client
                     |
        Domain API / Edge Function layer
   (identity, permission checks, validation, audit)
                     |
       Supabase Postgres + RLS + RPCs
                     |
      Realtime events -> clients refetch canonical data
                     |
  Storage / Google Classroom / Gemini / WhatsApp
```

### Boundary rules

- **UI:** presentation, form state and user feedback. It does not define the security boundary or calculate privileged access from local storage.
- **Domain layer:** academic workflow rules, transition validation, assignment resolution and schema validation.
- **API/Edge Functions:** validate identity, scope, operation, request body and idempotency; execute privileged mutations; write audit events.
- **Postgres:** foreign keys, uniqueness, constraints, transactions, data policy, RLS and safe RPCs. Database is the source of truth for committed state.
- **Realtime:** invalidation/notification only. On event loss/reconnect, fetch latest canonical state.
- **Integrations:** adapters behind stable internal interfaces. Vendor-specific IDs and errors do not leak across all UI components.
- **Configuration:** versioned records with an effective time; do not scatter settings as constants in HTML/JS files.

### Gradual frontend refactor

The current dashboard is a large static HTML implementation. Do not rewrite everything at once. Preserve the current route/entry point while extracting domain code in small increments into tested modules (for example `website/assets/js/auth/`, `academics/`, `timetable/`, `marks/`, `permissions/`, `integrations/`, and shared UI modules). Keep one route/facade per existing view until parity tests pass. Avoid having multiple independent query implementations for the same table.

### Suggested repository organization

```text
/
├── README.md
├── netlify.toml
├── website/                         # Netlify publish root only
│   ├── index.html
│   ├── pages/dashboard.html         # retained entry during gradual refactor
│   └── assets/js/                   # modular client code, no secrets
├── supabase/
│   ├── config.toml                  # add if adopting Supabase CLI workflow
│   ├── migrations/                  # new authoritative, ordered migration history
│   ├── functions/                   # choose one canonical source per function
│   ├── tests/                       # database/RLS/integration tests where practical
│   └── archive/                     # optional, clearly labelled historical snapshots
├── documentation/
│   ├── CRAVEX_BUILD_PLAN_SAFE_CHANGE_STRATEGY.md
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── ROLE_PERMISSION_MATRIX.md
│   ├── RUNBOOKS.md
│   └── release/                     # migration/release notes
├── tests/
│   ├── e2e/
│   ├── security/
│   └── fixtures/                    # synthetic data only
└── scripts/
    ├── verify_package.py
    └── migration_checks/            # lint, drift and release safety checks
```

This is a **target structure**, not an instruction to move/rename every file in one commit. Before adopting the Supabase CLI workflow, reconcile the existing 21 remote migration records with local migration files. Do not fabricate historical migration contents or mark migrations as applied just to make the CLI appear clean.

---

## 7. Database migration strategy — how to avoid breaking Supabase

### 7.1 Establish one source of truth

- Treat the connected database migration history as production history.
- Treat `supabase/schema.sql` and old schema snapshots as historical/bootstrap reference only until a verified reconstruction is complete.
- Create `supabase/migrations/` for future timestamped migrations after reconciling remote history.
- Keep exactly one canonical source for each deployed Edge Function. Mark stale copies as snapshots in names/docs; never deploy them just because they are in the repo.
- Store project-specific secrets only in Supabase secrets/secure CI settings, not SQL migrations.

### 7.2 Every database change follows this procedure

1. **Describe the change.** Document target behaviour, affected tables/functions/policies, tenant scope, historical-data impact, rollout and rollback.
2. **Read current state.** Inspect table columns, constraints, indexes, policies, grants, triggers, function definitions and remote migration history.
3. **Take a verified backup.** Confirm it can be restored in a non-production environment before a high-risk migration.
4. **Write a new migration.** Do not edit an already-applied migration; do not replace the remote database with the base schema.
5. **Apply to isolated dev/staging first.** Run with a representative synthetic dataset. For risky auth/RLS changes, test both allowed and forbidden access paths.
6. **Backfill separately when large.** Keep schema change and long-running data transformations separate where possible; support retry/resume.
7. **Run checks.** Schema diff, migration dry run where available, RLS tests, regression tests, advisor scan and performance/query-plan review.
8. **Deploy compatible application code.** Use an expand/contract release so old and new app versions can coexist during rollout.
9. **Apply production migration in a controlled window.** Record migration ID, result, backup reference, approver and release SHA.
10. **Verify after deployment.** Check data invariants, function logs, dashboard flows, advisor output and errors.
11. **Rollback deliberately.** Prefer forward-fix for irreversible/data migrations. Use a down migration only if it is safe and tested; never restore a full database snapshot without understanding data loss.

### 7.3 Expand/contract example

For adding a Principal role or new timetable structure:

1. Add nullable/new tables/columns and constraints that do not break current reads.
2. Deploy server code that understands the new fields while old paths still work.
3. Backfill/assign valid scope data; check for orphaned rows and duplicate assignments.
4. Add and test strict policies and permission enforcement.
5. Switch the UI/workflows to the new domain.
6. Observe usage and error metrics.
7. Only after parity is proved, remove deprecated paths or old columns in a separate migration.

### 7.4 RLS migration rules

- Never apply `ENABLE ROW LEVEL SECURITY` in isolation without tested policies and an end-to-end verified auth model.
- For every exposed table, explicitly list allowed operations and roles; default deny.
- Test `SELECT`, `INSERT`, `UPDATE`, and `DELETE` separately. `USING` and `WITH CHECK` must prevent users from moving rows to another `college_id`/branch/subject scope.
- Test master/platform-owner scope separately from institution Principal, HOD and Teacher scopes.
- Tables with no client policy should stay inaccessible from clients unless a specific approved access case exists. A service-role policy is not a substitute for safe function authentication.
- Avoid trusting `college_id`, `role`, `teacher_phone`, `changed_by` or similar identity/scope fields sent by the browser; derive them from verified server-side identity/assignments.
- Keep any public anon role limited to narrowly scoped public operations; no broad reads/writes to academic tables.

### 7.5 Supabase migration protection checklist

- [ ] Remote migration list saved and reconciled to repository.
- [ ] Latest production schema captured as a review artifact.
- [ ] Backup and restore validated.
- [ ] Migration tested on clean local/dev schema and a staging clone where available.
- [ ] Policies and grants reviewed before and after migration.
- [ ] All function secrets exist in the target environment; no fallback secrets in code.
- [ ] Existing deployed function versions compared before deploy.
- [ ] Netlify and dashboard smoke tests pass.
- [ ] Supabase security/performance advisors checked.
- [ ] Rollback or forward-fix procedure documented.

---

## 8. Safe handling of live configuration and approvals

All role dashboards read from one central configuration and domain API. A change to configuration is stored as an audited new version; the change service publishes an event after the database transaction commits. Affected clients invalidate/refetch data. If a client misses the event, the next refresh/reconnect still returns the latest version.

Separate these concepts:

- **Draft configuration:** only authorized editors/reviewers see it.
- **Published configuration:** effective for the intended scope and time.
- **Historical configuration:** read-only prior versions for audit and comparison.
- **Record correction:** an explicit correction with reason, approver and audit trail; not a side effect of a configuration edit.

Examples:

- Editing a future timetable updates future schedules and reminders after publication.
- Editing the timetable does not rewrite past attendance.
- Changing a subject assignment controls future access but preserves historical authorship and approval history.
- Changing a permission takes effect on the next server-authorized request and should invalidate active client caches/sessions as appropriate.
- Changing an assessment rule affects new/draft assessments unless a supervised scheme migration is approved for existing assessments.

---

## 9. Build phases and exit criteria

### Phase 0 — Security containment and project baseline (**P0**)

- Fix backup-function caller bypass and remove hardcoded secret fallback; rotate relevant secret.
- Remove broad anon policies and secure public RPC/SECURITY DEFINER grants after a controlled auth rollout plan.
- Choose and document Supabase Auth JWT vs custom-session/API-proxy model.
- Resolve RLS-disabled tables with policies tested in staging.
- Reconcile repo vs remote migrations and function versions; create a protected backup/restore procedure.
- Add role/tenant isolation tests.

**Exit:** no untrusted anonymous access to academic data; no unauthenticated backup path; safe verified session model; test data only until then.

### Phase 1 — Central academic configuration and permissions (**P1**)

- Make organization/branch/department/programme/academic-year/semester/subject data authoritative.
- Add Principal role and hierarchy only after `users_role_check`, claim helpers, Edge Functions, policies, UI and tests agree.
- Add policy-driven role/capability mapping and audit every change.
- Build the Admin Console configuration APIs and version history.

**Exit:** roles and settings are stored once; server-side access reflects new settings; no role is granted additional scope by changing frontend state.

### Phase 2 — Timetable and institutional coordination (**P1**)

- Implement versioned draft/review/publish timetable model and conflict validation.
- Add room/lab/batch/teacher/section allocation.
- Implement live invalidation, notifications, substitutions/cancellations and history.
- Add Principal/HOD meeting schedules, callouts and follow-up actions.

**Exit:** published changes appear consistently and promptly in all affected dashboards; historical records remain intact.

### Phase 3 — Teacher teaching and assessments (**P1**)

- Complete lesson-plan/syllabus coverage with HOD review.
- Link attendance to published timetable sessions.
- Implement assessment definitions and IA marks state machine.
- Complete restricted question-paper, valuation-scheme and course-file storage.
- Add student mentoring/remedial outcomes and reports.

**Exit:** end-to-end class → lesson → delivery evidence → attendance → assessment → marks approval works in the correct scope.

### Phase 4 — HOD/Principal quality and OBE (**P1/P2**)

- Implement CO/PO/PSO mappings and versioned attainment calculation.
- Build HOD verification/freeze and Principal verification/finalization where policy requires.
- Add IQAC/academic audit evidence, observations, corrective actions and closure.
- Build institution/department reports and controlled exports.

**Exit:** reports reconcile to source records and every approval/correction has an audit trail.

### Phase 5 — Integrations and scale (**P2**)

- Add Google Classroom mappings, scoped sync and resource links.
- Improve Gemini queue/retry/backoff/cache/provider health and cost monitoring.
- Add idempotency, quotas, rate limits, observability, integration alerts and load tests.

**Exit:** agreed concurrency tests pass; provider quotas/errors are handled without losing accepted jobs or leaking tenant context.

### Phase 6 — Production pilot and rollout

- Run role-based end-to-end tests, cross-college isolation tests and accessibility checks.
- Verify data import/export and restore from backup.
- Run timed timetable concurrency tests, marks correction/freeze tests, and AI load tests.
- Pilot using synthetic or approved test data; onboard real academic records only after formal security acceptance.

**Exit:** signed acceptance checklist, rollback plan and operations runbook.

---

## 10. Test plan and definition of done

### Security / tenancy

- Anonymous users cannot read/write student, marks, attendance, users, departments, subjects, files, documents, logs or quotas.
- College A users cannot read, mutate, infer or retrieve College B rows/files/embeddings/cache entries.
- A Teacher cannot change their own role, college, teacher assignment, marks approver or audit actor identity.
- An HOD can act only within assigned department(s); acting assignment expires and revoked permissions stop working.
- Principal does not implicitly have platform-master powers.
- `SECURITY DEFINER` functions cannot be invoked by unintended roles.
- Backup function cannot be triggered by a spoofed header and rejects requests without a secure authorization path.
- OTP, sessions, file-processing and AI functions have tested rate limits and expiration.

### Academic workflow

- A timetable cannot publish with duplicate room, teacher or section slots unless a documented override policy permits it.
- Timetable publish propagates to every affected dashboard and notification recipient.
- A lost Realtime event is recovered by refresh/reconnect.
- Past attendance stays unchanged after future timetable edits.
- Marks reject values below zero or above configured maximum; missing/duplicate entries are highlighted.
- Once frozen/finalized, marks cannot be changed except through a privileged audited correction path.
- HOD can return/review/freeze department submissions; Principal-level stage cannot be self-approved by a Teacher/HOD.
- Lesson plan coverage, actual teaching evidence and HOD comments remain traceable across revisions.
- CO/PO attainment calculations are reproducible from versioned rules and approved source assessments.
- Exported evidence reports contain correct, permitted data and do not leak other departments/colleges.

### Reliability / regression

- Existing navigation routes render without synchronous JavaScript errors.
- Existing OTP/session flow, upload/processing functions, Resources, Evidence Packs, Risk Monitor, Marks, Attendance, Notices, Analytics and Knowledge Base continue working.
- Repeated requests are idempotent where appropriate.
- Provider 429/5xx/timeouts, invalid uploads and network interruption produce safe recovery behaviour.
- Schema migration and backup/restore tests pass.
- Security/performance advisors are reviewed after every relevant migration.

**Definition of done:** code merged, migration reviewed/applied through the approved path, access tests passed, browser/E2E regression passed, operational logs reviewed, docs updated, and rollback/forward-fix path known.

---

## 11. Initial engineering tickets

Recommended starting backlog, in priority order:

| ID | Priority | Ticket | Dependencies |
|---|---|---|---|
| CRX-SEC-001 | P0 | Remove `db-backup` unauthenticated cron-header bypass and hardcoded fallback secret | Secret rotation; backup/restore validation |
| CRX-SEC-002 | P0 | Audit and remediate all 37 broad `anon` policies | Agreed auth architecture; staging tests |
| CRX-SEC-003 | P0 | Enable RLS safely on six unprotected academic tables | Policy tests; custom-session vs Supabase Auth decision |
| CRX-SEC-004 | P0 | Restrict unintended public EXECUTE grants on SECURITY DEFINER functions | Function caller inventory |
| CRX-PLAT-001 | P0 | Reconcile live migration history and canonical Edge Function sources with GitHub | Schema/function diff; backup |
| CRX-PLAT-002 | P1 | Add repeatable Supabase migration workflow and CI checks | CRX-PLAT-001 |
| CRX-AUTH-001 | P1 | Implement trusted scoped authorization and Principal role end-to-end | CRX-SEC-002/003; role matrix |
| CRX-ADMIN-001 | P1 | Build central configuration service and audit history | CRX-AUTH-001 |
| CRX-TIME-001 | P1 | Build timetable versions, slots, conflicts, publish and rollback | CRX-ADMIN-001 |
| CRX-TIME-002 | P1 | Propagate timetable revisions to teacher/student/room/reminder views | CRX-TIME-001; notification layer |
| CRX-ACADEMIC-001 | P1 | Complete Teacher lesson plan/syllabus coverage and HOD review | CRX-AUTH-001; academic schema review |
| CRX-MARKS-001 | P1 | Implement assessment model and marks state machine | CRX-AUTH-001; scheme config |
| CRX-HOD-001 | P1 | Add HOD faculty allocation, approvals, meetings and department overview | CRX-ADMIN-001 |
| CRX-PRIN-001 | P1 | Add Principal approvals, institution callouts and academic overview | CRX-AUTH-001; marks workflow |
| CRX-OBE-001 | P2 | Complete assessment-to-CO mapping, attainment and report versioning | CRX-MARKS-001; approved formula |
| CRX-IQAC-001 | P2 | Add academic audit, corrective actions and evidence closure | Evidence pack review |
| CRX-INT-001 | P2 | Add Classroom mappings and scoped chatbot resource retrieval | CRX-AUTH-001; file access model |
| CRX-AI-001 | P2 | Queue, retry, deduplicate and load-test Gemini requests | Existing `ai_jobs`/quota review |
| CRX-TEST-001 | P0 | Add automated RLS, authorization and cross-college regression suite | CRX-SEC tickets |

---

## 12. Immediate next steps

1. **Do not change academic schema yet.** First fix/contain the unsafe backup path and plan authentication/RLS remediation.
2. Export and review the live schema, role constraints, policies, function definitions, grants, triggers, migration history and Storage policies. Save a dated audit artifact (exclude secrets and student content).
3. Reconcile the live migrations with the repository; create a canonical migrations/function structure without pretending old remote migrations exist locally if they do not.
4. Establish a staging target with synthetic data and a tested backup/restore path.
5. Implement security tests and resolve P0 findings before inviting real institutions.
6. Only then add Principal, timetable and Admin Console workflows in the phase order above.

---

## 13. References

- GitHub repository: https://github.com/ajsomapurkar/Cravex
- Supabase RLS guide: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase database linter — RLS disabled: https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public
- Supabase database linter — public executable SECURITY DEFINER functions: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- Supabase database linter — mutable search path: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
- Supabase database linter — unindexed foreign keys: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- Supabase database linter — duplicate indexes: https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index
- VTU academic calendar: https://vtu.ac.in/en/academic-calendar/
- VTU B.E./B.Tech regulations: https://vtu.ac.in/be-btech/
- VTU IQAC: https://vtu.ac.in/iqac/

---

## Change log

- **2026-10-11:** Initial build and safe-change plan created after read-only review of GitHub `main`, the supplied handoff, connected Supabase migration/table/function metadata, and Supabase security/performance advisors. No GitHub or Supabase changes were applied by this review.
