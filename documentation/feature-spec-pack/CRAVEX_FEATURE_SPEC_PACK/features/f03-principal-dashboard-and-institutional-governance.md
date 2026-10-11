# F03 — Principal Dashboard and Institutional Governance

**Priority:** P1  
**Current state:** Principal role is not included in the live users role constraint  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for principal dashboard and institutional governance, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

The live `public.users_role_check` allows `master`, `college_admin`, `hod`, `teacher`, and `student`; `principal` is not included. `departments.hod_user_id` provides a starting point for department ownership. Existing announcements and audit tables offer partial building blocks.

## 3. Scope

- Institution-level overview across approved branches/departments.
- Create/assign/deactivate HODs and manage temporary acting HOD delegation with effective dates.
- Grant scoped permissions through approved permission templates; do not grant platform-owner rights.
- Approve institution-level policies and timetable changes when college policy requires it.
- Review IA/marks submission status and perform final verification/freeze where the applicable VTU process and institution policy require it.
- Schedule meetings/calls: attendees, agenda, meeting link/location, minutes, action items, due dates and completion.
- Publish callouts/announcements by college, branch, department, role, section or targeted recipients.
- Review academic quality, audit status, overdue submissions, student support escalations and reports.

## 4. Required workflows

Principal opens an approval queue → sees source record plus evidence and change history → approve, return with comments, or escalate → system records decision and notifies owner. Principal creating an HOD is an account + department-scope change with confirmation and audit, not just a role dropdown edit.

## 5. Data and API implications

Add the `principal` role through a reviewed migration and update trusted authorization helpers/policies. Consider normalized role assignments if users can hold multiple scoped roles; do not force a disruptive redesign without assessing current code. Add meeting/agenda/action-item records only if no existing fit is found. Preserve event/announcement integration with existing tables where practical.

## 6. Authorization and audit requirements

Principal: own college institution scope, configured actions. HOD: own department. Teacher: assigned classes. Master: platform scope. Principal cannot mutate trusted identity claims directly or self-elevate. Approval separation-of-duty should prevent the same actor from making and finally approving high-risk changes when policy requires independent review.

## 7. Backward-compatibility and change-safety rules

Existing users remain valid during role constraint migration. Add new role support before UI begins writing it. Do not change every role in data as a side effect. Keep department scope and college scope explicit. Do not treat a callout as an authorization grant.

## 8. Tests required

- Principal creates/updates HOD and a teacher cannot do so.
- Scope tests prove Principal sees only own college.
- Meeting creation, attendee notification, minutes and action closure persist end-to-end.
- Marks approval sequence cannot skip HOD verification where required.
- Audit history accurately records before/after and actor.

## 9. Acceptance criteria

- [ ] `principal` is recognized by the app, database constraints, API and policies consistently.
- [ ] Principal has institution dashboard, HOD management, meetings/callouts and approval queue.
- [ ] No automatic platform-master privilege.
- [ ] Approval actions are audited, scoped and reversible only through explicit correction paths.

## 10. Dependencies

F01 security, F02 config/permissions, F06 timetable, F14 notifications, F17 audit/evidence, F18 reporting.

## 11. Rollout plan

Deploy role/permission schema compatibly first, then backend checks, then UI, then enable Principal accounts with a feature flag after role tests pass.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
