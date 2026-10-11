# F19 — Laboratories, Practical Batches and Resource Scheduling

**Priority:** P2  
**Current state:** Some schema supports lab component/batch but complete lab workflow is not confirmed  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for laboratories, practical batches and resource scheduling, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

Live `subject_assignments` and `attendance_sessions` include `component` and `batch`; `subjects` includes `subject_type` and `total_lab_sessions`. A standalone room/inventory/lab schedule was not identified in the inspected table inventory.

## 3. Scope

- Practical batch definitions and student membership.
- Lab rooms, capacity, equipment/availability where needed.
- Weekly practical timetable and instructor assignment.
- Experiment list tied to syllabus/CO and completion evidence.
- Practical attendance, marks, records/viva assessment and question/evaluation files.
- Lab substitution, room conflict and maintenance block.
- Lab usage and completion reports.

## 4. Required workflows

HOD defines lab/batches → timetable editor assigns room, time, instructor and batch → conflict checker validates capacity/resources → publish → teacher sees lab roster → takes practical attendance and records experiment/evaluation → HOD checks completion.

## 5. Data and API implications

Extend timetable slots with component/batch/room references or normalized lab/session tables based on domain review. Do not store batch only as free text if roster membership should be authoritative. Use stable student, assignment, room and slot IDs.

## 6. Authorization and audit requirements

Teacher sees assigned labs and enrolled batch only. HOD assigns resources for department. Room/lab capacity and equipment constraints enforced server-side. Practical marks follow same assessment freeze workflow as F10.

## 7. Backward-compatibility and change-safety rules

Keep theory-only subjects functioning. Make lab-specific fields optional for theory courses. Preserve practical history when batch membership changes; use effective dates for roster shifts.

## 8. Tests required

- Teacher/room/batch overlap conflict tests.
- Capacity and roster validation.
- Practical attendance and marks linked to correct slot/batch.
- Theory subjects remain unaffected by lab-specific schema additions.

## 9. Acceptance criteria

- [ ] Lab scheduling supports instructor, room, batch and effective date.
- [ ] Practical attendance/assessment evidence links to scheduled lab.
- [ ] Conflicts and room constraints are enforced.
- [ ] Existing theory workflows pass regression tests.

## 10. Dependencies

F01, F02, F05, F06, F09, F10, F13.

## 11. Rollout plan

Use additive nullable lab fields/related tables; pilot with one practical subject and ensure no change to existing theory course rows.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
