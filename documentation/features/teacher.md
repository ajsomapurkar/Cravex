# Role Guide — Teacher / Faculty

**Priority:** P1 core academic workflow  
**Live role:** `teacher` exists; the dashboard has a role-specific UI foundation. End-to-end persistence, subject authorization and final-record protections require proof.

## 1. Purpose

A teacher needs one reliable workspace for the subjects, classes, batches and students currently assigned to them—from timetable and attendance through lesson planning, IA marks, course files, CO mapping and academic follow-up.

## 2. Existing foundation

- UI smoke report showed role-appropriate Teacher navigation and Resources/Evidence Packs.
- Live tables include `subject_assignments`, `class_teacher_assignments`, `attendance_sessions`, `attendance_logs`, `attendance_records`, `student_marks`, `marks_audit_log`, lesson-plan topic/progress, CO/PO mapping, `uploaded_files`, and `doc_chunks`.
- Six important lesson-plan/OBE tables report RLS disabled; no teacher data should be trusted until those and related anonymous policies are fixed.
- A full versioned timetable model was not established in the inspected public schema.

## 3. Features required

### My classes and timetable
- Show only current assignments: subject, course code, branch, semester, section, theory/tutorial/lab, batch, room and teaching period.
- Display live published timetable revisions, substitution/cancellation notices and next-class reminders.
- Make the timetable accessible on mobile and support print/export.
- Do not let teachers publish institution schedules unless explicitly delegated.

### Lesson plan and syllabus delivery
- Select subject and applicable academic year/scheme; use approved syllabus units/topics.
- Plan lecture/date/duration, topic, teaching method, CO mapping, resources and assessment activity.
- Record what was actually taught, date/time, hours, evidence, reason for delay and follow-up lesson.
- Upload PPTs, notes, assignments and teaching aids and link them to the session/topic.
- Submit plan/evidence to HOD; see approved/returned status, reviewer comments, due dates and version history.
- Compare planned vs actual syllabus completion with transparent calculations.

### Attendance
- Start attendance only for an authorized assigned class/session.
- Mark present/absent/late/excused according to configured policy, validate roster and prevent duplicate session records.
- View attendance percentage/shortage by student and subject; show the calculation period and eligible-session denominator.
- Request corrections with reason after a session is closed; do not silently edit finalized historical attendance.
- Export assigned-class attendance within policy.

### Assessments and marks
- See configured IA/assignment/practical assessment for assigned subject and scheme.
- Upload question paper, marking scheme/valuation scheme and answer/evaluation evidence with restricted access.
- Enter marks for eligible assigned students; validate values against configured maximum and mark missing entries clearly.
- Save draft, submit to HOD, review return comments, correct and resubmit.
- Once frozen/finalized, route changes through authorized correction request; retain old/new values, actor, reason and approvals.
- View class/subject mark distributions while protecting student privacy.

### CO/PO/PSO and improvement
- Maintain or propose CO definitions within the approved subject/scheme; submit for HOD review if required.
- Map assessment questions/components to COs with valid weights.
- View approved course attainment formula, targets, direct/indirect sources and results.
- Identify weak COs and record remedial teaching actions; do not modify institution-approved formulas without permission.

### Course file and resources
- Keep syllabus, approved lesson plan, delivery coverage, PPTs, notes, assignments, question papers, valuation schemes, lab manuals, practical records and assessment evidence linked to the subject and semester.
- Replace files through versioning; preserve evidence links and approved historical versions.
- See upload/processing status, retry safe failures and understand who can view a resource.
- Private papers are not available to students before authorized release.

### Student support, communication and reminders
- View only assigned student details needed for teaching.
- Create assignment feedback and record approved mentoring/remediation notes.
- Receive timetable changes, HOD comments, assessment deadlines, meetings and follow-up reminders.
- Send class/subject announcements to server-resolved recipients; no institution-wide broadcast by changing request parameters.

### Google Classroom and chatbot
- Open the approved classroom mapped to the exact college/branch/subject/section.
- View sync status and linked materials; avoid bulk re-uploading files when a permission-checked Classroom link suffices.
- Use the academic chatbot only with authorized course context; show temporary outage messages without losing user work.

## 4. Teacher permissions

- Read/write teaching records for assigned subjects/classes and effective dates only.
- Cannot change subject assignment, role, college/department scope or approved schedule.
- Cannot browse other teachers' private submissions or unrelated student records.
- Cannot change finalized marks/attendance outside the formal correction process.
- Cannot read restricted question papers/answer keys outside authorized workflow.

## 5. Data/API considerations

Reuse the existing domain models first, but compare actual columns/types and RLS before changes. The long-term model should link records by stable IDs (`user_id`, `student_id`, `subject_id`, `class/section_id`, `academic_year_id`, `assessment_id`, `session_id`) rather than phone/name strings where feasible. Implement changes additively, backfill in batches, dual-read/dual-write only for a defined transition period, and remove legacy fields only after usage is zero and rollback risk is accepted.

## 6. Implementation order

1. P0: secure teacher identity, subject assignments and the six RLS-disabled academic tables.
2. P1: published timetable and roster linkage.
3. P1: lesson plans, syllabus delivery and HOD review.
4. P1: attendance corrections and IA marks workflow.
5. P1: question papers/course files and controlled resource access.
6. P1/P2: CO/PO attainment, remediation, Classroom links and analytics.

## 7. Acceptance criteria

- [ ] A teacher cannot access an unassigned subject/student by changing IDs in the request.
- [ ] Schedule updates propagate to active dashboards and after reconnect; history is retained.
- [ ] Lesson-plan planned/actual coverage and HOD comments persist end-to-end.
- [ ] Attendance totals reconcile with session records and corrections are audited.
- [ ] Mark range validation, submit/return/freeze and authorized correction all work.
- [ ] Question papers remain restricted until release conditions are met.
- [ ] CO/PO reports match an institution-approved, versioned calculation rule.
