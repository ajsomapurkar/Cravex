# Role Model and Permission Matrix — Four Product Roles

**Priority:** P0 foundation  
**Product login roles in scope:** College Admin, Principal, HOD, Teacher.

## 1. Product-role decision

Cravex will expose exactly four in-app roles: `college_admin`, `principal`, `hod`, and `teacher`. Do not build a Student login/dashboard or a separate Master Admin login as part of this feature plan. Student records remain academic data administered by authorized staff. Platform operations, deployment credentials and cross-environment maintenance are handled outside this college-facing role model.

The connected database currently has a `public.users_role_check` that permits legacy values `master` and `student`, while it does not yet permit `principal`. This is a schema mismatch, not the desired product-role list. Before rollout, audit existing accounts and references, decide whether legacy `master` accounts are mapped to a scoped College Admin or deactivated, and deactivate any legacy `student` login accounts if present. Do not delete rows from `students`, `student_marks`, attendance or academic history when changing login-role support. Apply the change through reviewed, additive/reversible migrations.

The existing `departments`, `users.department_id`, `departments.hod_user_id`, `subjects.department_id`, `subject_assignments`, and `class_teacher_assignments` provide useful foundations, but do not prove scope enforcement is complete.

The connected Supabase audit found broad anonymous policies and six public-schema academic tables with RLS disabled. Security remediation is P0 before real academic records are used. See F01 and the live audit.

## 2. Role intent

- **College Admin (`college_admin`):** Operational setup and user/master-data management inside one college. This role is not automatically the Principal and does not automatically approve final academic records.
- **Principal (`principal`):** Institution-wide academic governance for one college: assign/manage HODs, oversee academic operations, handle institution-level approvals where policy requires them, and track compliance. This role does not confer platform-operator privileges.
- **HOD (`hod`):** Department-level academic operations within the assigned department(s) and college: faculty/subject allocation, timetable, lesson-plan review, assessment verification and department quality.
- **Teacher (`teacher`):** Teaching and assessment operations for currently assigned subjects, sections and practical batches.

There is no Student login role in scope. A student is a record/entity to which staff-managed enrolment, attendance, marks, resources and mentoring records relate. There is no Parent/Guardian login role in scope either.

## 3. Default scope hierarchy

`college → department/programme → academic year/semester → branch/section/batch → subject/session/student record`

Every read/export/mutation must resolve allowed scope from a trusted identity and current assignments. Never accept `college_id`, `department_id`, role, teacher phone or student phone from the browser as proof of authorization.

## 4. Capability matrix

| Capability | College Admin | Principal | HOD | Teacher |
|---|---|---|---|---|
| College profile/settings | Manage approved operational settings | View/approve academic settings by policy | Department settings only if delegated | No |
| Create/deactivate college users | Yes, scoped; cannot grant Principal without policy/approval | Manage HOD assignments; may initiate staff changes by policy | No | No |
| Assign HOD to department | Operational setup only if institution policy permits | Yes, own college; record effective dates/history | No | No |
| Faculty/subject allocation | Manage reference data or delegate by policy | Oversight | Yes, own department | View own assignments |
| Publish timetable | Configure calendar/policies; publish only if explicitly authorized | Institution approval where college policy requires it | Draft/review/publish department schedules within scope | View assigned schedule |
| Lesson-plan editing/review | No routine academic edits | Oversight | Review/return/approve for department | Own assigned subjects |
| Attendance | Administrative correction only via explicit workflow | Oversight/approved exception path | Review department and authorized corrections | Mark assigned sessions; request corrections |
| Marks entry | No routine entry | Institution approval/correction only if assigned by policy | Verify/return/freeze as configured | Assigned assessments before freeze |
| Final marks submission | Monitor process; no automatic approval | Verify/finalize where VTU/college workflow requires it | Department verification | Submit and correct returned drafts |
| CO/PO/PSO | Manage master configuration only if delegated | Approve institution methodology/targets | Review department/course mappings | Draft mapping and attach assessment evidence |
| College-wide meetings/callouts | Operational notices | Yes, own college | Department audience | Assigned/student audience only |
| Student records | College scope | College scope for legitimate duties | Assigned department scope | Assigned classes/subjects only |
| Audit logs | College operational scope | College academic scope | Relevant department actions | Own actions/submissions |
| Change own role/scope | Never self-elevate | Never self-elevate | Never self-elevate | Never self-elevate |

This matrix is a default. Institutions can delegate explicit capabilities through reviewed configuration, but configuration must not bypass backend authorization or required approval separation.

## 5. Authorization and workflow invariants

1. Use stable user IDs and explicit membership/assignment records; replace phone-string joins only through a staged compatibility migration.
2. Every sensitive server/database operation validates role **and** college/department/class/subject scope.
3. Enforce deny-by-default RLS for browser-accessible tables. Service-role access belongs only in trusted server/Edge Function code and must never be shipped to clients.
4. Restrict privileged `SECURITY DEFINER` functions to the intended caller and pin safe `search_path` values.
5. Use explicit workflow states for marks, lesson plans and timetable publishing. A user cannot set an approval/frozen state without permission for that transition.
6. Audit actor, target scope, action, outcome, timestamp, correlation ID and safe before/after metadata. Redact tokens, OTPs, secrets and unnecessary student PII.
7. Where independent approval is required, prevent the same user from authoring and finally approving a high-impact change.
8. Role removal, department transfer, user deactivation and delegation expiry must affect subsequent requests and invalidate stale permission state.
9. No dashboard selection, URL, localStorage value, or user-supplied role/college ID is proof of identity or authorization.

## 6. Implementation contract

- Complete F01 authentication/tenant isolation and F20 migration/release safety before expanding role capabilities.
- Standardize the actual auth/session contract. Do not assume `auth.uid()` is sufficient while custom OTP/session flows are in use unless verified.
- Add the `principal` role through a reviewed migration after checking every check constraint, helper, policy, Edge Function, query and UI role condition.
- Retire the legacy product use of `master` and `student` only after auditing existing accounts and references; don't remove student academic records.
- Use central permission definitions for feature visibility, and server/database enforcement for all access.
- Keep operations requiring platform-level secrets and deployment access outside the four in-app roles.

## 7. Acceptance tests

- Every sensitive action is tested as College Admin, Principal, HOD, Teacher and unauthenticated.
- College A cannot read or modify College B data, even with manipulated identifiers.
- HOD of Department A cannot access Department B records unless explicitly assigned.
- Teacher cannot write for an unassigned subject or alter another teacher's finalized marks.
- Principal cannot silently grant platform/deployment privileges or self-elevate.
- College Admin cannot grant themselves Principal or bypass academic approval rules.
- Legacy `master`/`student` account handling is covered by migration tests and does not delete academic history.
- Deactivated/expired users lose access; prior sessions cannot retain elevated scope.
- Approval transitions and rejected privilege checks are observable in audit/security logs.
