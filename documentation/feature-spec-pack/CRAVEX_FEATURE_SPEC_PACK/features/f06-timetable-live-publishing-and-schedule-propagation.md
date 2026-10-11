# F06 — Timetable, Live Publishing and Schedule Propagation

**Priority:** P1 — major core feature  
**Current state:** No dedicated published timetable model was identified in the inspected public schema  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for timetable, live publishing and schedule propagation, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

`subjects`, `subject_assignments`, `class_teacher_assignments` and attendance sessions exist, including fields for branch/semester/division/batch/component in parts of the schema. However, there is no confirmed versioned timetable/slot/room model in the table inventory. Treat timetable support as new until verified elsewhere.

## 3. Scope

- Draft timetable by academic year, term, branch, section, subject, theory/tutorial/lab, batch, teacher, room/lab, day, start/end and effective dates.
- Detect teacher, class, room and lab conflicts; consider workload and unavailable slots.
- HOD review and publish; Principal approval only if college policy requires.
- Revision reason, before/after diff, version history and rollback.
- Publish event updates teachers, students, HOD and Principal schedules; future reminders; room/lab view; upcoming-class widgets; and future attendance session scheduling.
- Substitutions, cancellations, extra classes, room changes, merged sections and emergency changes.

## 4. Required workflows

Draft → validate → submit for approval → approve/return → publish → persist one authoritative published version → append change event/outbox → clients receive event and refetch → notify only affected recipients. On reconnect, clients compare latest version and refetch; the realtime event is not the source of truth.

## 5. Data and API implications

Design normalized `timetable_versions`, `timetable_slots`, `rooms`/`labs`, `timetable_change_events` or outbox equivalents only after checking existing models. Slots must reference stable IDs, not just strings. Include `published_at`, `published_by`, revision number, effective range and status. Use transaction-safe conflict validation, suitable exclusion/unique constraints where practical, and indexes based on real filters.

## 6. Authorization and audit requirements

Only authorized roles can create or publish. Avoid concurrent last-write-wins: use optimistic version checks or database transactions. Preserve historical attendance sessions and completed classes. Timetable updates must not mutate finalized attendance or marks. Write notification events transactionally via outbox or a reliable equivalent.

## 7. Backward-compatibility and change-safety rules

Preserve existing attendance-session creation and schedule views while the new timetable is introduced. If older schedule data exists in external files, import it with validation and keep the old read path until row parity is confirmed. Do not reinterpret old attendance sessions as timetable slots automatically without verified mapping.

## 8. Tests required

- Two editors change same version: stale update is rejected and latest data is shown.
- Teacher/time/room/section conflict tests.
- Publish changes schedule for every targeted role but no unrelated users.
- Realtime event loss or tab offline → reconnect refetches latest published version.
- Rollback produces a new auditable revision rather than deleting history.
- Past attendance, marks and historical calendar entries remain unchanged.

## 9. Acceptance criteria

- [ ] Published schedule is the sole source of future class schedule.
- [ ] A timetable upload/revision changes every relevant timetable view for assigned teachers/students/HOD/Principal.
- [ ] Conflicts block publishing or require an explicitly authorized override with reason.
- [ ] Versioning, audit trail, targeted notification and recovery from missed events work.

## 10. Dependencies

F01, F02, F03, F04, F05, F09, F14, F19, F20.

## 11. Rollout plan

Build schema and validation first; import existing timetable data if any; launch in draft-only mode; pilot one department; enable publish events after role/conflict tests; expand college-wide.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
