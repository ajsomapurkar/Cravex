# F09 — Attendance and Eligibility

**Priority:** P1  
**Current state:** Attendance tables exist; scheduling, correction and secure access need completion  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for attendance and eligibility, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

Live schema has `attendance_sessions`, `attendance_logs`, and legacy `attendance_records`. Sessions include subject, teacher phone, branch, semester, division, date, period, component and batch. `attendance_records` appears to store a legacy overall percentage. Anonymous read policies exist on attendance sessions/records.

## 3. Scope

- Create attendance session from published timetable slot or authorized extra class.
- Mark present/absent/late/excused; prevent duplicate student/session records.
- Show roster scoped to class assignment.
- Submit and close session; correction request after close with reason and authorization.
- Recalculate totals/percentages from source records; flag discrepancies from legacy aggregate.
- Eligibility and shortage rules by scheme/effective date; reminders and mentoring referral.
- Attendance report by student, subject, section, date range and semester.

## 4. Required workflows

Scheduled class → create/open session → roster loaded → teacher marks records → validate expected roster/counts → save → close → aggregate/report refresh. Corrections after close require a reason and permitted reviewer; keep old and new values in audit history.

## 5. Data and API implications

Retain existing tables initially. Consider user/student UUID foreign keys in additive fashion. Ensure uniqueness for (session, student) uses stable student ID where feasible. Use `attendance_records` only as a compatibility/read model until authoritative aggregation is reconciled. Add correction audit data if `audit_log` is insufficient.

## 6. Authorization and audit requirements

Teacher can mark attendance only for assigned sessions. HOD can review department records and authorize corrections within policy. Principal can oversee, not silently bulk-edit. Closed/completed history should be immutable except audited correction. Never use a client-supplied `teacher_phone` as authorization proof.

## 7. Backward-compatibility and change-safety rules

Timetable change affects future sessions only by default. Existing session records remain intact. Backfill/recalculate aggregates in batches with before/after comparison. Keep old aggregate read path until parity is proven, then switch readers separately.

## 8. Tests required

- Duplicate marks are prevented under concurrent requests.
- Roster mismatch, missing student and invalid status tests.
- Post-close edit requires authorization/reason and creates audit row.
- Percentages recalculate from source without double-counting.
- Eligibility threshold follows applicable effective scheme.

## 9. Acceptance criteria

- [ ] Attendance is linked to class schedule, teacher assignment and stable student identity.
- [ ] Historical records are preserved; all corrections are traceable.
- [ ] Attendance aggregates reconcile with detail records.
- [ ] Anonymous and cross-tenant reads/writes are denied.

## 10. Dependencies

F01, F02, F05, F06, F07, F08, F14.

## 11. Rollout plan

Run reconciliation on synthetic/approved test records, add indexes based on queries, release session-based workflow, and retire aggregate-only write paths after parity checks.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
