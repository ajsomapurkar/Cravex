# Live Repository and Supabase Audit Snapshot

**Inspection date:** 11 October 2026  
**GitHub:** [`ajsomapurkar/Cravex`](https://github.com/ajsomapurkar/Cravex), `main`  
**Reviewed tree SHA:** `84cb3f5d9f4fd6b60e62f0f51596efa494bdd32d`  
**Supabase project ref:** `gkuzoywsftjxnxzlufiy`  
**Inspection type:** Read-only metadata/schema/policy/advisor inspection; no write operations performed.

## Repository findings

- Dashboard is concentrated in `website/pages/dashboard.html` (about 217 KB in reviewed tree). Avoid growing this into a larger monolith; extract code incrementally while preserving `/dashboard`, Netlify publish settings and current navigation.
- Base `supabase/schema.sql` has legacy statements that disable RLS. It is not safe as a live migration.
- Multiple lesson-plan schemas and deployed Edge Function snapshots exist; function snapshots can be older than the active project versions.
- The inspected repo tree had no `supabase/migrations/` directory. This must be reconciled with the live migration history before feature schema work.
- `documentation/PHASE45_BROWSER_TEST_REPORT.md` shows successful selected route/render/navigation smoke tests with synthetic sessions; not full persistence/authorization proof.
- `TEMPORARY_SECURITY_STATUS.md` explicitly labels the setup test-data-only pending security hardening.

## Connected Supabase findings

- Status reported active/healthy, PostgreSQL 17, region `ap-south-1`.
- 21 recorded migrations; latest shown `20260818142600 production_safety_additive_001`.
- Live role check permits `master`, `college_admin`, `hod`, `teacher`, `student`; **does not include `principal`**.
- Tables `lesson_plan_topics`, `lesson_plan_progress`, `course_outcomes`, `course_learning_objectives`, `co_po_mapping`, `subject_profile` report `rls_enabled=false`.
- Security Advisor reports policies existing on those six tables while RLS is disabled.
- Current policy query found **37 policies assigned to `anon` across 17 tables**, including broad `USING (true)` reads and in several cases unrestricted insert/update/delete on academic/user/admin data. RLS being enabled on a table is not enough when policies allow anonymous access.
- Security Advisor reports 3 `SECURITY DEFINER` functions executable by `anon` and `authenticated`: `acquire_ai_lock`, `rls_auto_enable`, `trigger_process_pdf`. Each needs least-privilege review.
- Security Advisor also reports 9 functions with mutable search path and `vector` in `public`.
- Performance Advisor reports 16 foreign keys without covering indexes, 48 unused indexes and two duplicate-index groups. Do not mass-add/drop based on this finding alone.
- Live Edge Functions: `smooth-function` v358, `process-pdf` v64, `send-otp` v15, `db-backup` v12, `process-lesson-plan` v12, `support-dashboard` v6, `ai-worker` v5. `verify_jwt` is false on all listed functions except `support-dashboard`, but some endpoints implement custom auth; review each individually.
- The current live `db-backup` source accepts a caller-supplied `x-cron-trigger: true` path or a secret and has fallback `cravex-backup-2026` when `BACKUP_SECRET` is absent. This is a critical open issue until the actual runtime and scheduler are verified and the unauthenticated path is removed.

## Known table foundations

| Domain | Existing live tables / structures | Notes |
|---|---|---|
| Organization/users | `colleges`, `departments`, `users` | Principal missing from role constraint |
| Student | `students`, `parent_contacts`, `parent_links` | Existing identity includes phone fields; normalize carefully |
| Subjects/assignments | `subjects`, `subject_assignments`, `class_teacher_assignments` | Some semester/branch/component/batch fields exist |
| Attendance | `attendance_sessions`, `attendance_logs`, `attendance_records` | Schedule linkage/correction/audit flow must be verified |
| Marks | `student_marks`, `marks_audit_log`, `update_mark_with_audit` | Assessment/freeze/approval workflow not established complete |
| Lesson plans/OBE | `lesson_plan_topics`, `lesson_plan_progress`, `course_outcomes`, `course_learning_objectives`, `co_po_mapping`, `subject_profile` | Six critical RLS-disabled tables include all in this row |
| Resource/AI retrieval | `uploaded_files`, `documents`, `doc_chunks`, `manual_embeddings` | Anonymous read policies on some source/content tables |
| Messaging | `announcements`, `smart_notices`, `outbound_messages`, `ai_alerts`, `support_escalations` | Delivery/read states and targeting need verification |
| AI operations | `ai_jobs`, `college_quotas`, `provider_health`, `usage_events`, `response_cache`, `rate_limits` | Scaling foundations exist; load behavior not proven |
| Governance/audit | `audit_log`, `marks_audit_log` | Access policies and full action coverage need review |

## Critical actions

1. Restrict or remove broad anonymous policies and verify deny-by-default behavior.
2. Fix the disabled-RLS academic tables with correctly scoped policies; test authenticated access before enablement.
3. Remove public execution of privileged SECURITY DEFINER RPCs unless intentionally public and hardened.
4. Fix `db-backup` authentication: fail closed without a strong configured secret or verified scheduler mechanism; `x-cron-trigger=true` alone cannot authenticate a caller.
5. Establish reliable backup and restore rehearsal before schema migrations.
6. Reconcile repo migration history with live schema before the first feature migration.
7. Add Principal and timetable models only through reviewed, staged, additive migrations.
8. Recheck advisors and tests after every schema/policy migration.

## Remediation links

- [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [RLS disabled in public schema advisor](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public)
- [Policy exists while RLS disabled](https://supabase.com/docs/guides/database/database-linter?lint=0007_policy_exists_rls_disabled)
- [Public execution of SECURITY DEFINER functions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Mutable function search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
- [Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
- [Duplicate indexes](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index)

## Limits of this audit

This is a point-in-time, read-only review of the inspected GitHub tree and connected Supabase metadata/schema/policies/advisors. It is not a penetration test, full line-by-line review of every active Edge Function, production load test or proof of all user workflows. Verify again before implementing or deploying any change.
