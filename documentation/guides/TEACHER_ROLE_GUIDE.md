# Role Guide — Teacher / Faculty

**Priority:** P1 core academic workflow  
**Live role:** `teacher` in DB; **F05 dark Teaching Workspace** in dashboard. End-to-end auth and RLS are **not production-ready (F01).**

## 1. Purpose

One workspace for **currently assigned** subjects, classes, and students: timetable, attendance, lesson plans, IA marks, course files, CO mapping, and follow-up — without institution-wide admin powers.

## 2. UI in repo

- `website/assets/js/teacher/teacher-module.js`, `teacher-console.css`
- QA: **`91999191995`** / OTP **`123456`**
- **My classes** (from `subject_assignments`), **Submissions** (course files + demo marks submit), links to roster / lesson plan / marks

## 3. Implementation status

| Area | Status |
|------|--------|
| My classes list | Shipped |
| Submission status (resources + demo marks) | Partial — localStorage for marks; HOD approve/return on `resources` |
| Lesson plan / attendance / marks pages | Existing dashboard pages; not assignment-gated server-side |
| Timetable (published) | Not started (F06) |
| HOD review comments on lesson plans | Not started (F12) |
| Marks draft → submit → return → resubmit | Demo only (F10) |
| CO/PO, Classroom, chatbot | Partial / F15–F16 |

## 4. Permissions (target)

- Read/write only for **assigned** subjects/classes.
- No role/assignment/schedule changes; no other teachers’ private data.
- No silent edits to finalized marks/attendance — correction workflow only.

## 5. Implementation order

1. P0: teacher identity + assignments + RLS on lesson-plan/OBE tables.  
2. P1: timetable + roster linkage.  
3. P1: lesson plans + HOD review.  
4. P1: attendance + IA marks workflow.  
5. P1: course files + restricted papers.  
6. P2: CO/PO, Classroom, analytics.

## 6. Acceptance criteria (target)

- [ ] Cannot access unassigned subject/student via ID tampering.
- [ ] Lesson-plan and HOD comments persist end-to-end.
- [ ] Attendance reconciles with sessions; corrections audited.
- [ ] Marks validate, submit/return/freeze, authorized correction.
- [ ] Question papers restricted until release.
