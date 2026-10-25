# Role Guide — Principal

**Priority:** P1 academic governance; depends on P0 security  
**Live status:** **Not yet allowed by the live `public.users_role_check` constraint.** Do not enable Principal login until schema, trusted role helpers, policies, API checks and UI are updated together.

## 1. Purpose

The Principal has institution-wide academic oversight within their own college: department leadership, academic calendars, high-level approvals, institutional meetings/callouts, performance monitoring, quality assurance and escalations. Principal access does not equal platform-owner access.

## 2. Existing foundation

- `departments.hod_user_id` can help identify department ownership.
- `announcements`, `smart_notices`, `outbound_messages`, `audit_log`, `marks_audit_log`, analytics-related source tables and support escalations provide partial building blocks.
- The inspected UI has a legacy Master selector, but the planned product roles are only College Admin, Principal, HOD and Teacher. Do not treat the legacy selector as a role requirement; retire or restrict it as part of the role migration.
- No complete Principal approval/meeting workflow was confirmed; a dedicated timetable model was not established in the inspected public schema.

## 3. Dashboard modules required

### Institutional overview
- College summary by academic year, semester, branch and department.
- Syllabus coverage planned versus completed; overdue lesson plans and missing course evidence.
- Attendance trends, internal-assessment completion and pending marks submissions.
- Faculty allocation/workload, timetable conflict summary, lab/room utilization and unresolved escalations.
- Student academic-risk and remediation status with access limited to legitimate institutional duties.

### HOD and department leadership
- Add/assign/deactivate HOD for a department within the college, with effective date and reason.
- Appoint temporary acting HOD, defining exact scope and expiry.
- Review department readiness, pending approvals, overdue actions and audit observations.
- Prevent duplicate active HOD assignments unless explicitly permitted and logged.

### Approvals and academic governance
- Review only the items routed to Principal by applicable regulation/institution policy.
- See source record, supporting evidence, previous decisions and audit trail.
- Approve, return with mandatory comments, or escalate; never accept a blind status toggle.
- Review final marks submissions/freeze status where required by the institution's VTU process.
- Approve institutional timetable revisions only when the policy requires Principal approval; otherwise retain visibility without blocking department operations.
- Control high-impact configuration changes via preview, effective date and approval trail.

### Meeting scheduler and callouts
- Schedule principal/HOD/faculty/committee meetings with agenda, participants, link/location, start/end, minutes, action items, owners and due dates.
- Send callouts by college, department, role, section or specific authorized recipients.
- Preview the recipient count and target scope before sending; track delivery/acknowledgement where supported.
- Maintain meeting decisions and action follow-ups; notifications must not be the only record of a decision.

### Academic quality and reporting
- View IQAC/academic audit readiness, missing evidence and corrective-action closure.
- Review CO/PO/PSO summaries generated from approved calculation rules.
- Export authorized institution reports with the academic year, filters, data timestamp and audit event.
- Monitor repeated syllabus delays, low assessment completion and unclosed interventions without exposing unrelated sensitive content.

## 4. Principal permissions

- College scope for institutional dashboards and reports.
- HOD assignment/delegation within own college.
- Approval/freeze abilities explicitly tied to configured academic workflow steps.
- No platform tenant creation, global AI quota management, global deployment control or implicit service-role access.
- No self-elevation to College Admin and no access to deployment-level/platform credentials.

## 5. Data/API and migration needs

- Add `principal` to role handling through a reviewed additive migration, after searching all app checks, SQL helpers, policies, generated types and Edge Functions.
- Prefer normalized scoped role assignments if one person may hold multiple roles, but only after a compatibility assessment; do not casually replace `users.role` in one step.
- Reuse `departments.hod_user_id` if it meets effective-date and audit requirements; otherwise extend with assignment history instead of overwriting history.
- Reuse announcement/outbox infrastructure for callouts where possible.
- Add meeting/participant/minutes/action-item tables only after checking for an existing equivalent.
- Use approval records that link to the exact source entity and version; store decision, reviewer, timestamp and comments.

## 6. Main workflow

`Dashboard → approval/alert queue → inspect evidence and scope → approve/return/escalate → record audit → notify responsible owner → follow up until closed`.

## 7. Implementation order

1. P0 security and scope; confirm authenticated Principal identity.
2. Add role compatibly across database, policy helpers, APIs and front end.
3. Principal dashboard with real institution-scoped metrics.
4. HOD assignment/delegation and meeting/action workflow.
5. Timetable/marks approval steps according to verified institutional policy.
6. IQAC, OBE analytics, exports and escalations.

## 8. Acceptance criteria

- [ ] Principal can access only their college and authorized academic data.
- [ ] Principal can assign HODs and acting HODs with effective dates, expiry and audit.
- [ ] Approval sequence cannot skip required HOD review or change finalized records without an explicit correction flow.
- [ ] Meetings preserve agenda, minutes and follow-up actions.
- [ ] Callouts resolve recipients server-side and cannot be broadened with client-supplied targets.
- [ ] Reports disclose filters/data-as-of time and match authorized source rows.
