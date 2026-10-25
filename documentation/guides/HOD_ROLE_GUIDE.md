# Role Guide — HOD (Head of Department)

**Priority:** P1 core academic operations  
**Live role:** `hod` exists; `users.department_id` and `departments.hod_user_id` are present. Department-scoped end-to-end authorization still needs testing.

## 1. Purpose

The HOD coordinates a department's teaching delivery, teacher/course allocation, timetable, lesson-plan review, internal assessment, course files, student intervention and academic quality.

## 2. Existing foundation

- HOD UI regression notes showed My Department, Students, Sessions, Lesson Plan, Risk Monitor, Marks, Communication, Knowledge, Analytics, Resources and Evidence Packs.
- `departments`, `users.department_id`, `departments.hod_user_id`, `subjects.department_id`, `subject_assignments`, `class_teacher_assignments` exist.
- Lesson-plan/OBE tables exist but are among the six live tables with RLS disabled. Several menus were smoke-tested, but source-backed approval and persistence workflows are not established as complete.

## 3. Required features

### Department home
- Department roster: faculty, programmes, branches, semesters, sections and subjects.
- Pending queue for lesson plans, marks, timetable approvals, question papers, course files and audit actions.
- Readiness indicators with clear denominators, last-updated timestamp and drill-down to authorized records.

### Faculty and subject allocation
- Assign faculty to subject, branch, semester, section, theory/tutorial/lab component and practical batch.
- Track workload, effective dates, substitutions and allocation history.
- Detect teacher/section/room conflicts and unavailable slots.
- Validate assignments against department scope and approved master data.

### Timetable management
- Create a department draft or edit a controlled copy of the current timetable.
- Validate clashes across faculty, sections, laboratories/rooms and practical batches.
- Approve/publish department timetable where policy grants authority; submit to Principal for approval where required.
- Publish versioned changes and notify only affected users.
- Preserve past attendance; changes to completed sessions use correction workflow.

### Lesson plans and syllabus progress
- Review teacher plans at subject/unit/topic/lecture level.
- Approve, return with comments or request a revision; keep each revision and decision.
- Compare planned vs actual coverage, teaching hours and syllabus backlog.
- Verify uploaded PPTs, notes, lab manuals and class evidence against the plan.
- Assign and track corrective actions for late coverage.

### IA, marks and question papers
- Review IA question papers and valuation schemes under controlled access.
- Monitor entry completion and missing/out-of-range marks.
- Verify submitted marks, return with reasons, and freeze department submissions when policy permits.
- Escalate to Principal for final verification/freeze where required.
- Correct marks only through explicit correction requests and audit records.

### CO/PO/PSO and student support
- Review subject CO definitions, CO-to-PO/PSO mappings and approved attainment outputs.
- Identify weak outcomes, low attendance and academic-risk cases.
- Assign remedial sessions/mentors and track actions to a defined outcome.
- Restrict student-level details to the department and legitimate academic purpose.

### Course files, meetings and audits
- Define required course-file checklist and due dates for department subjects.
- Check evidence links and versions; identify missing resources and failed processing.
- Schedule departmental meetings, record minutes, owners and follow-up actions.
- Compile department IQAC/audit evidence, observations and closure records.

## 4. Data/API considerations

Start from current assignments, subjects, lesson-plan topic/progress, attendance, marks, CO/PO and resource tables. Before new schema, confirm if current `component`/`batch` fields meet requirements. Ensure each teaching/approval object has a stable college and department/course linkage. Avoid relying on text `teacher_phone` alone for long-term relations; migrate gradually to stable user IDs with compatibility tests.

## 5. Permission boundaries

- HOD may manage only assigned department(s) within their college.
- HOD cannot assign themselves as another department's HOD, create a Principal, change college-wide roles, or access another department without an explicit assignment.
- HOD must not access another department by swapping a department or subject ID.
- Marks and lesson-plan approval is limited to assigned department; final institution-level approval remains separate when required.

## 6. Implementation order

1. P0: RLS and department scoping, especially lesson-plan/CO/PO tables.
2. P1: faculty/subject assignment and timetable publishing.
3. P1: lesson-plan review and course-file evidence.
4. P1: IA/marks verification, return and freeze.
5. P1/P2: OBE, risk interventions, meetings and audit packs.

## 7. Acceptance criteria

- [ ] HOD sees only their assigned department and its scoped classes.
- [ ] Assignment/timetable clash checks prevent invalid publish unless an authorized override is recorded.
- [ ] Lesson-plan review status and comments persist and notify the teacher.
- [ ] Marks cannot skip required transitions; correction history is preserved.
- [ ] CO/PO reports reference a versioned calculation method and source assessments.
- [ ] Audit pack items are derived from actual records; missing source evidence is not presented as complete.
