# F05 — Teacher Dashboard and Faculty Workspace

**Priority:** P1  
**Current state:** Role-aware UI demonstrated; full academic workflow not proven  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for teacher dashboard and faculty workspace, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

The browser regression report showed teacher-appropriate navigation and synthetic role switching. Live schema includes faculty users, subject assignments, class-teacher assignments, attendance, marks, lesson plan and CO/PO foundational tables. UI rendering is not proof all flows persist securely.

## 3. Scope

- My classes/subjects, branch/section/batch, current timetable and changes.
- Student roster and profile for assigned classes only.
- Lecture-level lesson plans, actual delivered topics and evidence.
- Attendance for scheduled sessions; authorized correction requests.
- IA/assessment setup, marks entry, validation and submission to HOD.
- CO mapping, question mapping and outcome attainment views where configured.
- Course file and material uploads (PPTs, notes, lab manuals, assignments, question papers).
- Meetings, reminders, student mentoring, remediation and practical batch records.
- Submission status, HOD comments, version history and exports.

## 4. Required workflows

Teacher opens assigned subject → chooses course/section and academic period → plans and records teaching → records attendance against schedule → creates assessment and enters marks → validates → submits → receives approved/returned status → performs authorized corrections if returned.

## 5. Data and API implications

Use stable `user.id`, `subject.id`, `subject_assignment.id`, `student.id`, session and assessment IDs. Existing `teacher_phone` columns are legacy compatibility references; do not expand phone-number identity into new tables. Consider migration to user UUID in additive steps, retaining legacy fields while backfilling and validating.

## 6. Authorization and audit requirements

Teacher scope comes from verified user identity plus active assignment; never accept an arbitrary teacher ID or client-supplied role as proof. Teachers must not change timetable masters, role assignments, published rule versions or finalized marks without the defined correction workflow.

## 7. Backward-compatibility and change-safety rules

Do not remove phone-based columns or existing dashboard queries until a dual-read/write migration and data reconciliation is complete. Preserve current navigation and login experience during feature rollout. Do not allow frontend defaults to become authoritative course rules.

## 8. Tests required

- Teacher A cannot load Teacher B students/classes by changing query params.
- No duplicate attendance session for the same scheduled lecture.
- Marks outside max/allowed ranges are rejected.
- Failed saves do not show success; retry does not duplicate records.
- Lesson/material upload can be traced to correct subject/semester/branch.

## 9. Acceptance criteria

- [x] Dark **Faculty Workspace** with my-classes list from `subject_assignments` and submission status UI (`teacher-module.js`, QA `91999191995`).
- [ ] Teacher can carry out assigned-subject work end-to-end with server-enforced scope.
- [ ] Schedule, attendance, marks and lessons share the same assignment/course identity.
- [ ] Save/submit/error/review states are explicit and audited (beyond demo localStorage).
- [ ] Historical records are protected from silent edits.

## 10. Dependencies

F01, F02, F06, F09, F10, F11, F12, F13, F14, F15.

## 11. Rollout plan

Deliver one workflow slice at a time: assignments → schedule → lesson/attendance → assessment → course file → OBE reports. Keep existing modules working between releases.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
