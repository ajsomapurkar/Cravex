# F04 — HOD Department Operations

**Priority:** P1  
**Current state:** Some HOD menu and department mapping exist; end-to-end approvals are unverified  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for hod department operations, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

The UI smoke report showed an HOD session with My Department, Students, Sessions, Lesson Plan, Risk Monitor, Marks, Communication, Knowledge, Analytics, Resources and Evidence Packs. An intentional empty state appears if no department is assigned. `departments.hod_user_id` and `users.department_id` are present in live schema.

## 3. Scope

- Department faculty roster and subject assignment management.
- Workload checks and faculty substitution workflow.
- Department timetable editing/review and publication within policy.
- Review/return/approve lesson plans and course-file evidence.
- Monitor syllabus coverage, planned/completed teaching hours and backlog.
- Review question papers and assessment plans; verify/freeze IA entries and return corrections.
- Review attendance shortages, subject performance, remediation and student intervention outcomes.
- Manage department meetings and action items.
- Generate department reports and IQAC/audit evidence.

## 4. Required workflows

Department overview → review queues grouped by overdue/at-risk/pending → open source record → approve/return with mandatory reason when returning → owner receives notification → HOD tracks closure. HOD reassignment needs effective dates and department handover.

## 5. Data and API implications

Leverage existing `departments`, assignments, lesson plan, marks audit and evidence foundations. Add approval state/actor/timestamp fields or event tables only where no reliable existing state exists. Use stable subject, assignment and department IDs. Avoid linking records by teacher phone or display text for new workflows.

## 6. Authorization and audit requirements

Enforce department and college scope for every query and mutation. HOD can only act on assigned department, unless an explicit temporary delegation is active. All returns, approvals, freezes and overrides require an audit event.

## 7. Backward-compatibility and change-safety rules

Keep existing HOD views and their empty states. New queries must not broaden results by omitting a department filter. If HOD assignment changes, past actions retain the original actor; access to historical records follows policy and should not be rewritten.

## 8. Tests required

- HOD A cannot access HOD B department records.
- Department with no HOD shows clear empty/setup state.
- Approval/return transition graph rejects invalid transitions.
- Workload and timetable conflict detection is deterministic.
- Notifications target only impacted faculty.

## 9. Acceptance criteria

- [x] HOD dark **Department Operations Console** with department-scoped nav (`hod-module.js`, QA `91999191994`).
- [x] Review queue for pending **resources** (approve/return with reason); department KPIs from live tables.
- [ ] HOD sees only assigned department data under enforced RLS (client filters by `department_id` today).
- [ ] Pending/returned/approved statuses fully audited via `hod_decision_audit` after migration apply.
- [ ] Timetable, lesson-plan approval graph, and workload checks (F06/F12).

## 10. Dependencies

F01, F02, F06, F10, F12, F13, F14, F17, F18.

## 11. Rollout plan

Wire HOD pages to existing tables first. Add minimal state only after finding no suitable field. Release each department workflow incrementally behind role permission flags.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
