# Existing Feature Inventory — What to Keep, What to Verify

Status must be assigned based on evidence, not only presence of a menu or table.

## Observed foundations to retain

| Area | Evidence | Status decision |
|---|---|---|
| Netlify landing page and dashboard route | `website/index.html`, `website/pages/dashboard.html`, `netlify.toml`, deployment docs | Keep; smoke-test each release |
| Role-aware navigation | Phase 4–5 browser report: Master, College Admin, HOD, Teacher synthetic sessions | UI foundation only; re-test actual authorization |
| Colleges/users/students | Live schema tables and current dashboard queries | Keep; security and lifecycle require work |
| Departments/HOD linkage | `departments.hod_user_id`, `users.department_id` | Keep; Principal/HOD lifecycle incomplete |
| Subjects/assignments | `subjects`, `subject_assignments`, `class_teacher_assignments` | Keep; assignment history and timetable linkage need completion |
| Attendance | `attendance_sessions`, `attendance_logs`, `attendance_records` | Keep; secure access, correction workflow, schedule linkage and aggregates require validation |
| Marks and audit | `student_marks`, `marks_audit_log`, `update_mark_with_audit` | Keep; IA definitions, approval/freeze and secure access need work |
| Lesson plans | `lesson_plan_topics`, `lesson_plan_progress`, `process-lesson-plan` | Keep; RLS disabled, approval and delivery evidence need work |
| CO/PO foundations | `course_outcomes`, `course_learning_objectives`, `co_po_mapping`, `subject_profile` | Keep; RLS disabled on all four and attainment workflow incomplete |
| Document processing | `uploaded_files`, `documents`, `doc_chunks`, `process-pdf` | Keep; storage/access/processing lifecycle needs hardening |
| Announcements/notices | `announcements`, `smart_notices`, `outbound_messages` | Keep; actual recipient, delivery and acknowledgement workflow needs proof |
| Risk Monitor/Evidence Packs | UI views and synthetic browser smoke notes | Do not rebuild blindly; verify data persistence/source linkage |
| AI queue and quotas | `ai_jobs`, `college_quotas`, `provider_health`, `usage_events`, `response_cache`, `rate_limits` | Keep; queue fairness/load tests/security required |
| Audit logs | `audit_log`, `marks_audit_log` | Keep; policies and full event coverage require review |

## Not confirmed as production-complete

- Principal role and UI/backend workflow.
- A dedicated versioned timetable model with conflict detection and live propagation.
- Central Admin Console that controls dashboard modules and academic configuration from one source.
- Complete HOD approval and course-file review lifecycle.
- End-to-end IA submission, HOD verification, Principal final review and controlled freeze/unfreeze.
- Approved/versioned CO/PO attainment formula and report generation.
- Dedicated Classroom mappings, sync status and branch-scoped AI retrieval.
- Production-scale Gemini queue behavior under agreed concurrent load.
- Complete automated CI/E2E, cross-tenant security suite and restore rehearsal.

## Rule for moving status to “complete”

A feature is complete only after: (1) UI operation succeeds, (2) data persists, (3) API/database authorization is enforced, (4) audit/history behavior is correct, (5) failure/retry states are correct, and (6) tests run against the implemented workflow. Attach the test result or PR/commit link to the feature file.
