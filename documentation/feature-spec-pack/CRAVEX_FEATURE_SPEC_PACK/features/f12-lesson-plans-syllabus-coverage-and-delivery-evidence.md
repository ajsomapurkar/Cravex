# F12 — Lesson Plans, Syllabus Coverage and Delivery Evidence

**Priority:** P1  
**Current state:** Lesson-plan schema and processing function exist; progress/topics RLS is disabled live  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for lesson plans, syllabus coverage and delivery evidence, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

Live tables `lesson_plan_topics` (188 rows) and `lesson_plan_progress` (3 rows) exist; schema includes module/topic, CO, order/week, planned hours, teaching method, planned date, status, completed date and remarks. Processing function exists. RLS is disabled on both tables and Security Advisor flags them.

## 3. Scope

- Select course, cohort, section, academic year and effective scheme.
- Import/map approved syllabus units and topics; validate totals/teaching hours.
- Plan lectures linked to timetable slots, COs, method, resources and assessment.
- Record actual delivery date/topic and evidence (PPT, note, assignment, lab/recording link).
- Track planned versus completed hours and pending topic backlog.
- Submit lesson plan for HOD review; comments, resubmission, approval and revision history.
- Adjust plan after timetable revisions without deleting historic delivery evidence.

## 4. Required workflows

Teacher authors draft → submits version → HOD approves or returns with comments → approved plan is used to compare scheduled sessions with delivery → teacher records topic completion → overdue backlog alerts assigned → HOD reviews exceptions.

## 5. Data and API implications

Keep `lesson_plan_topics` and `lesson_plan_progress` while checking keys to subject assignments and timetable slots. Avoid relying on topic names alone. Add approval/version entities or columns only after confirming an adequate current workflow state does not exist. Preserve source-file ID and storage path metadata without storing duplicate file blobs.

## 6. Authorization and audit requirements

Teacher writes only on assigned subjects. HOD reviews only department scope. Plan approval and changes are audited. Protect all topic/progress tables with RLS. Do not allow AI-processed output to publish without human review if the output affects approved curriculum or academic records.

## 7. Backward-compatibility and change-safety rules

AI-generated lesson plan content should be a draft and idempotently tied to its uploaded source/job ID. Keep existing processing endpoint response compatible. RLS migration must be tested with legitimate authenticated access before enabling production UI.

## 8. Tests required

- Topics map to correct subject/scheme/assignment.
- Plan total hours reconcile to configured course hours.
- Timetable updates do not erase completed topic evidence.
- HOD return/re-submit/approve transition tests.
- Unauthorized direct table access denied; processing function auth verified.

## 9. Acceptance criteria

- [ ] Plan includes planned topics, actual delivery, CO mapping and evidence.
- [ ] HOD review lifecycle and backlog reporting work end-to-end.
- [ ] RLS enabled and authorized access verified for both lesson plan tables.
- [ ] AI output cannot silently overwrite approved plan/version.

## 10. Dependencies

F01, F02, F04, F05, F06, F07, F11, F13, F14, F17.

## 11. Rollout plan

Make RLS/policies correct, map present topic/progress data, add review workflow additively, and validate lesson-plan processing against deployed function version without redeploying stale repo copies.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
