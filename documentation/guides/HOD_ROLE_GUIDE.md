# Role Guide — HOD (Head of Department)

**Priority:** P1 core academic operations  
**Live role:** `hod` in `users_role_check`; scope via `users.department_id` and `departments.hod_user_id`. **RLS and department enforcement are not production-complete (F01).**

## 1. Purpose

The HOD coordinates department teaching delivery, allocations, timetable, lesson-plan review, internal assessment, course files, student intervention and academic quality — **one assigned department per college**.

## 2. UI in repo

- Dark **F04 HOD Console**: `website/assets/js/hod/hod-module.js`, `hod-console.css`
- QA: **`91999191994`** / OTP **`123456`**
- Nav: My department, **Review queue**, Dept meetings, lesson plans, marks, students, etc.

## 3. Implementation status (2026-10-11)

| Feature area | Status |
|--------------|--------|
| Department home (`mydept`) | Shipped — roster, teachers, subjects |
| Review queue (pending resources) | Shipped — approve / return / escalate |
| Dept KPIs (faculty, queue, syllabus avg) | Shipped — from live tables where present |
| Dept meetings | Shipped — localStorage (DB optional via migration) |
| Faculty allocation / workload / conflicts | Partial — existing assignment UI in dept page |
| Timetable draft/publish | Not started (F06) |
| Lesson-plan review workflow | Not started (F12) |
| IA/marks verify & freeze | Partial — marks page; no state machine (F10) |
| CO/PO, IQAC packs | Partial — existing analytics/evidence UI |
| Department-scoped RLS | Not started (F01) |

## 4. Permission boundaries

- HOD manages **assigned department(s) only** within their college.
- Cannot self-assign as HOD of another department, create Principal, or cross college.
- Final institution approval stays with Principal when policy requires it.

## 5. Implementation order (from spec)

1. P0: RLS + department scoping on lesson-plan/CO/PO tables.  
2. P1: assignments, timetable, lesson-plan review, course files.  
3. P1: IA/marks verification and freeze.  
4. P2: OBE, risk, meetings audit packs.

## 6. Acceptance criteria (target)

- [ ] HOD sees only assigned department data (server-enforced).
- [ ] Timetable clash checks before publish.
- [ ] Lesson-plan review persists with teacher notification.
- [ ] Marks transitions audited; corrections via explicit workflow.
- [ ] Audit packs backed by source records.
