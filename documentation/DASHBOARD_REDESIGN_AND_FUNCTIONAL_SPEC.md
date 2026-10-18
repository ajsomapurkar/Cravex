# CRAVEX — Detailed Dashboard Redesign and Functional Change Specification

**Project:** Cravex Academic Management Platform  
**Primary roles:** College Admin, Principal, HOD and Teacher  
**Architecture:** Existing frontend + Supabase backend, extended incrementally  
**Objective:** Build genuinely role-specific dashboards with live academic updates, assignment-based permissions, meetings, timetable management, lab assessment, academic approvals and audit trails.

**Related docs:** [Feature tracker (F01–F21)](FEATURE_IMPLEMENTATION_TRACKER.md) · [Role model & permissions](ROLE_MODEL_AND_PERMISSION_MATRIX.md) · [Role guides](guides/) · [Feature spec pack](feature-spec-pack/CRAVEX_FEATURE_SPEC_PACK/README.md)

---

## Repository alignment (2026-10-18)

| Area | Spec requirement | Current repo / production |
|------|------------------|---------------------------|
| Four role UIs | Distinct dashboards, not badge-only | **Shipped (partial):** dark consoles — `college-admin-module.js`, `principal-module.js`, `hod-module.js`, `teacher-module.js`; workspace nav in `website/assets/js/ui/workspace.js` |
| Principal login | Connected to selector and flows | **In repo:** Principal tile + QA phone `91999191993`; not yet server-enforced end-to-end |
| College Admin | F02 config console | **Partial:** setup/readiness UI + `admin-console` edge function in repo; deploy migrations + RLS before pilot |
| Timetable F06 | Authoritative versioned model | **Not started** in schema (placeholder UI on Teacher console) |
| Meetings F14 | Persisted targeting + follow-up | **Partial:** Principal/HOD meeting UI + SQL migrations `20261011143000_*`, `20261011150000_*`; apply on Supabase staging |
| Assignments | Component/batch scopes | **Partial:** `subject_assignments` used in Teacher/HOD loaders; normalization + server checks **P1** |
| Security F01 | RLS + no anon academic writes | **Open:** template migration only; QA OTP bypass in `dashboard.html` / `send-otp` mirror — **remove or env-gate before real data** |
| Master Admin login | Out of four-role product model | **Legacy:** Master still on login for platform ops; align with [ROLE_MODEL_AND_PERMISSION_MATRIX.md](ROLE_MODEL_AND_PERMISSION_MATRIX.md) |

A rendered screen or demo localStorage flow is **not** proof of implementation. Complete when Supabase persistence, authorization, and cross-dashboard propagation match §11.

---

# 1. Current State and Scope

The existing dashboard provides foundations for student records, teacher accounts, departments, subject assignments, attendance, marks, lesson plans, risk monitoring, announcements, resources and academic analytics.

The following changes are required before considering the platform a complete academic management system:

- Separate the four roles into genuinely different working dashboards.
- Connect the Principal role to the login, dashboard navigation and backend permissions.
- Establish a single authoritative timetable and assignment system.
- Ensure timetable changes automatically propagate to all affected users.
- Introduce meeting creation, publication, audience targeting, notifications and action tracking.
- Support theory, practical, laboratory, batch-specific and other configured assessment activities.
- Allow assigned faculty and HODs to perform authorized academic tasks for their assigned subjects and labs.
- Complete role-based data isolation, approval workflows and audit history.
- Make Admin Console changes update all affected dashboards without separately modifying each dashboard.

**Important implementation baseline:** As of **2026-10-18**, the working copy on `main` includes **separate role console modules**, **Principal on the login selector**, QA whitelisted phones for staff roles, and **governance SQL migrations in repo** (principal/HOD audit). Production Netlify has deployed these UI layers; **live Supabase** may still lack applied migrations, dedicated timetable/meeting tables, and tightened RLS. Reconcile against your connected project before each migration tranche. Student profiles, marks and attendance remain staff-managed academic records. A Student login is not part of this scope.

# 2. Four Distinct Role Dashboards

Use a shared design system, but give each role its own information hierarchy, dashboard widgets, navigation and workflows. Changing only the title, colour or role badge is not sufficient.

## 2.1 College Admin Dashboard

**Purpose:** Manage the institution's platform configuration and operational setup.

### Required modules

1. **College configuration**
   - College profile, academic years and semesters.
   - Branches, departments, programmes, sections and subject catalogues.
   - Applicable VTU scheme and configurable academic rules.
   - Institution-level defaults and integration settings.

2. **User and faculty management**
   - Create and maintain faculty accounts.
   - Provision Principal and HOD accounts.
   - Activate, deactivate or archive accounts.
   - Manage department membership and account status.
   - Allow the Principal to make academic HOD assignments under the institution's permission model.

3. **Academic configuration**
   - Configure subject types, theory/lab components and batch structures.
   - Configure assessment types, permitted mark components and approval workflows.
   - Maintain institutional timetable rules and calendar settings.

4. **Configuration control**
   - Manage dashboard module visibility and available capabilities.
   - Manage integration configuration and Google Classroom mappings.
   - View configuration change history and integration health.

5. **Operational monitoring**
   - Identify missing academic configuration.
   - View unresolved system errors and failed notifications.
   - Monitor data imports, scheduled jobs and synchronization status.

**Acceptance criteria:** A College Admin can configure a college without modifying frontend code, and authorized changes become available to affected roles from the shared backend.

## 2.2 Principal Dashboard

**Purpose:** Provide institution-wide academic oversight, permissions, approvals and escalation management.

### Required modules

1. **Institution overview**
   - Department-wise academic readiness.
   - Attendance and academic-risk summaries.
   - Syllabus coverage and overdue lesson plans.
   - Marks submissions awaiting review.
   - Timetable conflicts and outstanding academic actions.

2. **HOD management**
   - Appoint or assign an HOD to a department.
   - Change department leadership with effective dates.
   - Reassign temporary acting HOD responsibilities.
   - Revoke or expire delegated access.
   - Review department-level pending work.

3. **Permissions**
   - Assign scoped permissions to HODs and faculty according to institutional policy.
   - Grant approved delegation for subject, department or lab operations.
   - Restrict permissions by department, subject, class, assignment and validity period.
   - Prevent the Principal from granting platform-owner privileges.

4. **Academic approvals**
   - Review designated final marks submissions.
   - View HOD verification and marks-freeze status.
   - Approve or return items when the configured academic workflow requires Principal approval.
   - Review authorized corrections and audit history.

5. **Timetable and academic calendar**
   - Review institution-wide schedules.
   - Approve or publish timetable revisions when required by policy.
   - Monitor academic-calendar deadlines.
   - View timetable conflicts and unresolved substitutions.

6. **Meetings and callouts**
   - Schedule college-wide or targeted meetings.
   - Send urgent announcements to selected departments, branches, HODs, teachers or academic groups.
   - Monitor notifications, attendance confirmations and acknowledgements.
   - Track meeting minutes, assigned action items and deadlines.

7. **Quality and reporting**
   - Monitor course-file and audit readiness.
   - Review CO/PO reports and academic interventions.
   - Export verified institutional reports.
   - Monitor unresolved corrective actions and overdue submissions.

**Acceptance criteria:** The Principal can oversee the institution and perform authorized approvals without receiving unrestricted Master Admin privileges.

## 2.3 HOD Dashboard

**Purpose:** Coordinate one department's academic activities, faculty, assessments and teaching schedules.

### Required modules

1. **Department overview**
   - Faculty and subject counts.
   - Today's classes, laboratories and department meetings.
   - Syllabus coverage by subject.
   - Pending lesson plans and course files.
   - Marks submissions requiring review.

2. **Faculty and assignment management**
   - View faculty in the department.
   - Assign subjects, sections, practical batches and laboratory components.
   - Monitor faculty workload and availability.
   - Resolve timetable conflicts.
   - Delegate approved academic tasks.

3. **Timetable management**
   - Prepare department timetable drafts.
   - Allocate subjects, faculty, sections, labs, rooms and time slots.
   - Validate collisions before publishing.
   - Publish authorized changes to affected teachers and classes.

4. **Lesson-plan review**
   - Review submitted lesson plans.
   - Approve or return plans with comments.
   - Monitor actual syllabus coverage and planned-versus-completed hours.
   - Identify course delivery delays and record corrective actions.

5. **Marks and assessment management**
   - Review IA and practical assessment definitions.
   - Review question papers and valuation schemes.
   - Verify marks entered by assigned faculty.
   - Return invalid submissions for correction.
   - Freeze departmental submissions where authorized.
   - Monitor pending Principal verification.

6. **Laboratory management**
   - Allocate lab faculty and batches.
   - Maintain practical schedules and experiment coverage.
   - Monitor lab attendance and practical assessment completion.
   - Allow the HOD to enter lab marks only when assigned to the assessment or explicitly granted the required permission.

7. **Meetings**
   - Schedule departmental meetings.
   - View college-wide meetings published to the department.
   - View subject-specific meetings for the department.
   - Invite faculty, record attendance, publish minutes and assign follow-up actions.

8. **Reports and quality assurance**
   - View department-level CO/PO reports.
   - Monitor attendance and academic interventions.
   - Review course-file evidence and audit readiness.
   - Export departmental reports and track corrective actions.

**Acceptance criteria:** An HOD can manage and review their department without accessing unrelated departments or changing institution-wide configuration beyond delegated authority.

## 2.4 Teacher Dashboard

**Purpose:** Provide a complete teaching workspace for assigned subjects, sections, practicals and laboratory batches.

### Required modules

1. **My teaching schedule**
   - Today's and weekly timetable.
   - Assigned theory classes and laboratory sessions.
   - Branch, semester, section, subject, room and batch details.
   - Substitutions, cancelled sessions and schedule-change notices.

2. **My subjects and assignments**
   - All active assigned subjects.
   - Each theory/lab component and its student roster.
   - Assigned laboratory batches.
   - Academic-year and semester context.

3. **Lesson plans**
   - Create and update lesson plans.
   - Map lessons to units, topics and course outcomes.
   - Record teaching methods, planned hours and learning resources.
   - Mark topics as taught.
   - Record actual coverage and explain delays.
   - Submit plans and evidence to the HOD.

4. **Attendance**
   - Open attendance from the actual scheduled session.
   - Select the correct subject, section or lab batch.
   - Record and validate attendance.
   - Submit corrections through the permitted process.
   - View attendance summaries for assigned students.

5. **Marks and assessments**
   - View assigned assessments.
   - Enter theory, IA, assignment, laboratory, practical and viva marks where configured.
   - Record marks for the correct subject, component, section and batch.
   - Map questions or components to course outcomes where required.
   - Validate maximum marks, missing entries and assessment rules.
   - Submit completed marks for HOD review.
   - Correct returned submissions and provide reasons for authorized changes.

6. **Course files and resources**
   - Upload PPTs, notes, lab manuals, assignments and question papers.
   - Associate material with the relevant course, semester, branch and batch.
   - View review status and missing-document reminders.

7. **Meetings and reminders**
   - View college-wide meetings addressed to all relevant staff.
   - View department meetings applicable to the teacher.
   - View subject-specific meetings for subjects assigned to the teacher.
   - View laboratory meetings for assigned lab components or batches.
   - Receive updates, acknowledge attendance, access agendas and view action items.

8. **Student support and reporting**
   - Maintain permitted mentoring records.
   - Assign or document remedial activities.
   - View academic-risk information for authorized students.
   - Export reports for assigned subjects and classes.

**Acceptance criteria:** A teacher can complete the academic work for their assignments without access to unrelated student rosters, subjects, marks or departments.

# 3. Assignment-Based Permissions — Critical Requirement

Permissions must not depend only on whether the logged-in user is a Teacher or HOD.

The application must check both the user's role and their active academic assignment.

For example, an HOD who is assigned to teach a laboratory batch should be able to perform the same permitted attendance, practical assessment, marks-entry and lesson-evidence tasks as any other faculty member assigned to that batch. Their HOD role additionally provides departmental review permissions; it must not remove their teaching capabilities.

Likewise, a faculty member assigned to a laboratory can enter marks for the relevant lab assessment even if that faculty member is not the theory instructor for the subject.

## 3.1 Assignment model

An academic assignment should identify:

- College and department.
- Academic year and semester.
- Branch and section/division.
- Subject.
- Component type: theory, tutorial, practical, laboratory or another configured type.
- Laboratory or practical batch.
- Assigned staff member.
- Assignment start/end dates and active status.
- Explicit capabilities or delegation where required.

Reuse the existing subject-assignment foundation wherever possible. Extend and normalize it rather than creating a parallel assignment system that can become inconsistent.

## 3.2 Permission evaluation

For every academic operation, evaluate:

1. Is the user authenticated and active?
2. Does the user belong to the correct college?
3. Is the user assigned to the relevant department, subject, section or lab batch?
4. Does the assignment grant the requested operation?
5. Is the assessment open, and is the operation allowed in its current status?
6. Does the requested change require additional HOD or Principal approval?

The frontend must hide unavailable actions, but the backend and database must independently enforce the same authorization rules.

## 3.3 Assignment examples

| Scenario | Expected access |
|---|---|
| Teacher assigned to a theory subject | Attendance, lesson plans, theory assessments and authorized theory marks |
| Teacher assigned to a laboratory batch | Lab attendance, experiment tracking, practical marks and lab evidence |
| Teacher assigned to theory and lab | Both sets of workflows, each limited to its assignment |
| HOD assigned as lab instructor | Lab instructor capabilities plus the HOD's separate departmental permissions |
| HOD not assigned to a lab but supervising its department | Review and oversight; no automatic unrestricted marks-entry permission |
| Faculty assigned temporarily as a substitute | Access for the approved assignment and effective dates |
| User removed from an assignment | No further editing rights for that assignment; history remains available to authorized reviewers |

# 4. Timetable Management and Live Updates

The timetable must become the authoritative source of scheduled academic sessions.

## 4.1 Publishing workflow

1. The authorized user creates a draft timetable.
2. The system validates faculty, section, room/lab and time conflicts.
3. The relevant HOD reviews it.
4. Principal approval is included only where institutional policy requires it.
5. The authorized user publishes a new version.
6. The system stores the publication and version history.
7. Every affected dashboard receives a change event and refetches the latest published data.
8. Notifications are sent to affected users.
9. Upcoming-session reminders and future attendance-session generation use the new timetable.
10. Completed attendance and historical records remain unchanged unless a controlled correction is approved.

## 4.2 Required behaviour

When a subject moves from Monday 10 AM in Lab 2 to Tuesday 11 AM in Lab 4, publishing must update:

- The assigned faculty member's calendar.
- The relevant student section's schedule.
- The applicable laboratory batch and room allocation.
- Upcoming-class displays and reminders.
- Related HOD department views.
- Meeting or notification context where appropriate.

The change must not silently rewrite completed attendance, submitted marks or historical timetable versions.

Use Supabase Realtime or an equivalent event mechanism for prompt updates, but the database remains the source of truth. Clients must refetch authoritative data on reconnect and handle missed events.

# 5. Meetings — Targeted Visibility and Academic Follow-up

Meeting management must be a real persisted workflow, not just a form on a dashboard.

## 5.1 Meeting creation

Authorized users should create meetings with:

- Title and description.
- Meeting type.
- Start/end date and time.
- Physical location or secure online meeting link.
- Agenda and optional attachments.
- Organizer.
- Target college, branch, department, subject, section, semester, lab batch or selected staff.
- Publication status.
- RSVP/attendance requirements.
- Follow-up action items and deadlines.

Support draft, published, cancelled and completed states, with edit history and notifications when meeting details change.

## 5.2 Meeting visibility rules

| Meeting audience | Principal | HOD | Teacher |
|---|---|---|---|
| College-wide staff meeting | Create/manage and view | View/respond | View/respond |
| Department meeting | View/oversight according to policy | Create/manage for own department | View/respond if invited or targeted |
| Branch-specific meeting | View institutionally | View when relevant to department | View when branch/class assignment matches |
| Subject-specific meeting | View/oversight according to policy | View for department subjects | View when assigned to that subject and targeted audience |
| Lab/practical meeting | View/oversight according to policy | View for the department | View when assigned to that lab/batch and targeted audience |
| Individually invited meeting | View if authorized | View if invited or authorized | View if invited |

A user's current assignment must be checked against the meeting's intended scope. Seeing a meeting does not automatically grant permission to edit it.

## 5.3 Meeting propagation example

The Principal schedules a department review for CSE. The CSE HOD sees it immediately in their meeting list. Teachers in the intended CSE audience receive it according to the audience rules. Other departments' teachers do not receive it.

The CSE HOD then schedules a laboratory assessment review for the Data Structures lab. Only the relevant faculty and other targeted department participants see that meeting. Staff assigned to that lab batch can receive relevant actions and assessment reminders.

At publication, create a traceable recipient/audience snapshot so later changes in staff assignments do not silently alter the historical invite list. Explicitly re-target or re-publish when the organizer intends to change the audience.

## 5.4 Meeting follow-up

- In-app notifications, with email/WhatsApp delivery where configured.
- RSVP or acknowledgement status.
- Meeting attendance records.
- Agenda and minutes.
- Action-item owner, due date and status.
- Reminders and overdue escalation.
- Audit history showing edits, cancellation and audience changes.

# 6. Marks, Lab Assessments and CO/PO

A marks-entry page must be driven by configurable assessment definitions and staff assignments.

## 6.1 Assessment configuration

Support institution-approved assessment types such as:

- IA theory tests.
- Assignments and quizzes.
- Laboratory internal assessments.
- Practical examinations.
- Experiment completion and experiment-wise evaluation.
- Practical viva.
- Project assessment or other configured components.

The applicable scheme must determine maximum marks, weights, assessment rules, CO mappings and any calculated totals. Do not hardcode a single VTU formula for all schemes.

## 6.2 Marks-entry workflow

1. The authorized academic user selects a subject and an assigned component/batch.
2. The system loads only the matching roster.
3. It loads the configured assessment and maximum marks.
4. The faculty member enters and validates marks.
5. The system flags missing, invalid or out-of-range entries.
6. The assessment is submitted for review.
7. HOD reviews, approves or returns it, where applicable.
8. Principal verification is performed when the institutional approval policy requires it.
9. Authorized finalization freezes the submission.
10. Subsequent changes require a correction workflow, a reason and a complete audit trail.

## 6.3 CO/PO and attainment

- Configure course outcomes for the applicable course/scheme.
- Map assessment questions or components to COs.
- Support approved CO-to-PO/PSO mappings.
- Calculate attainment using institution-approved methods.
- Record thresholds, calculation version and assessment inputs.
- Generate subject and programme reports.
- Track remedial action and subsequent performance.

Lab assessments must support CO mapping whenever required by the configured course and assessment design.

# 7. Shared Data, APIs and Database Design

Use the existing schema as the baseline; do not create duplicate tables for features that already have a valid implementation.

The target data model should support these domains:

| Domain | Existing foundation to reuse or verify | Required extension |
|---|---|---|
| College/department/users | `colleges`, `departments`, `users` | Complete Principal authorization, HOD appointment and scoped permissions |
| Subject allocation | `subjects`, `subject_assignments`, `class_teacher_assignments` | Consistent staff identity, component/batch scopes and effective dates |
| Timetable | No dedicated timetable model in repo (verify live DB) | Versioned schedules, timetable slots, room/lab allocations and publication workflow |
| Meetings | Partial SQL in repo (`20261011143000_principal_governance.sql`); verify live DB | Full meetings, scoped recipients, attendee status, notifications and action items |
| Attendance | `attendance_sessions`, `attendance_logs`, `attendance_records` | Link sessions to published timetable slots; preserve historical records |
| Marks | `student_marks`, `marks_audit_log` | Assessment definitions, component-specific assignments, approvals and freeze history |
| Lesson plans | `lesson_plan_topics`, `lesson_plan_progress` | Timetable linkage, evidence, HOD review and backlog tracking |
| CO/PO | `course_outcomes`, `course_learning_objectives`, `co_po_mapping`, `subject_profile` | Secure access, assessment mapping and versioned attainment |
| Notifications | Existing announcements/notices and messaging foundations | Recipient targeting, reliable delivery, acknowledgements and retry status |
| Governance | `audit_log`, `principal_decision_audit`, `hod_decision_audit` (repo migrations) | Audited role changes, timetable versions, meeting changes and academic corrections |

These names describe existing verified foundations and required domains, not a final SQL migration. Final column types, relationships, indexes and migration order must be based on the full current schema.

# 8. Safe Frontend Architecture

The existing `website/pages/dashboard.html` is a large file containing styling, navigation, page templates and application logic. Split this incrementally into maintainable modules while retaining the current Netlify static deployment.

Recommended target structure:

```text
website/
├── index.html
├── pages/
│   └── dashboard.html
├── assets/
│   ├── css/
│   │   ├── tokens.css
│   │   ├── layout.css
│   │   ├── components.css
│   │   └── dashboards.css
│   └── js/
│       ├── app.js
│       ├── auth/
│       │   ├── session.js
│       │   └── role-resolution.js
│       ├── core/
│       │   ├── permissions.js
│       │   ├── routing.js
│       │   └── realtime.js
│       ├── dashboards/
│       │   ├── college-admin.js
│       │   ├── principal.js
│       │   ├── hod.js
│       │   └── teacher.js
│       ├── features/
│       │   ├── users/
│       │   ├── subjects/
│       │   ├── timetable/
│       │   ├── meetings/
│       │   ├── attendance/
│       │   ├── marks/
│       │   ├── lesson-plans/
│       │   ├── course-outcomes/
│       │   ├── resources/
│       │   └── notifications/
│       └── services/
│           ├── supabase-client.js
│           └── api.js
├── _headers
└── _redirects

supabase/
└── migrations/
    ├── 001_security_baseline.sql
    ├── 002_role_and_permission_model.sql
    ├── 003_academic_assignment_normalization.sql
    ├── 004_timetable_model.sql
    ├── 005_meetings_and_recipients.sql
    ├── 006_assessment_workflow.sql
    └── 007_realtime_and_indexes.sql

tests/
├── permissions/
├── timetable/
├── meetings/
├── marks/
└── regression/
```

The migration names and order above are illustrative; reconcile them against the live migration history before creating actual files.

**Current incremental path:** Role consoles live under `website/assets/js/{college-admin,principal,hod,teacher}/` with shared `admin-dark-theme.css` and `ui/workspace.js`. Continue extracting features into `features/` without breaking global bindings in `dashboard.html`.

Keep shared layout components reusable, but implement separate dashboard modules with their own data loaders and workflows. Refactor inline event handlers and globals carefully: do not move all scripts into ES modules at once without verifying the existing function bindings.

# 9. Live Admin Configuration

Admin Console changes should update all affected dashboard experiences through shared backend configuration.

Examples:

- Adding a subject updates authorized subject selectors.
- Assigning a faculty member updates their subjects and timetable.
- Assigning a staff member to a lab enables the permitted lab workflows.
- Publishing a timetable revision updates affected schedules.
- Creating a meeting publishes it to its authorized recipients.
- Changing a permission is enforced server-side on subsequent operations.
- Changing an academic deadline updates the relevant dashboards and reminders.

Use realtime events to notify active clients, database versioning where appropriate, cache invalidation and authoritative refetch. Do not require a frontend redeployment for ordinary database-backed academic configuration changes.

Core application logic and schema changes still require controlled development, testing and deployment.

# 10. Security and Migration Safety

Before real student records are used:

1. Resolve the unsafe anonymous access policies identified in the live Supabase review.
2. Enable RLS on the six inspected academic tables currently reported with RLS disabled, but only alongside tested policies.
3. Enforce college, department, subject, section and batch access from verified identities and assignments.
4. Ensure that marks, attendance, meeting audiences and role assignments cannot be altered by changing browser-supplied IDs.
5. Review Edge Functions that have platform JWT verification disabled and require appropriate explicit authentication inside them.
6. Repair the backup function's unsafe authentication fallback.
7. Preserve existing history and avoid destructive schema replacement.
8. Introduce reviewed, additive migrations, and test them on staging before production.
9. Run regression tests for existing login, students, departments, marks, attendance, resources, lesson plans and AI integrations.

Do not run the legacy base schema against the live database.

# 11. Required Acceptance Tests

The development is not complete until these end-to-end tests pass.

### Dashboard separation
- College Admin sees setup and operational configuration.
- Principal sees institution-wide oversight, approvals, meetings and escalations.
- HOD sees department operations and pending faculty reviews.
- Teacher sees assigned classes, lessons, attendance, marks and subject resources.
- All four roles receive the correct dashboard data after login and reload.

### Assignment and laboratory scope
- A teacher assigned to a theory subject can manage only the authorized theory workload.
- A teacher assigned to a lab can enter marks for the assigned laboratory assessment.
- An HOD with an explicit lab assignment can perform the same permitted lab work and retain separate HOD review capabilities.
- A teacher not assigned to a subject or lab cannot enter its marks.
- Removing or expiring an assignment revokes future write access without deleting history.

### Meetings
- A college-wide meeting appears to the intended staff.
- A department meeting appears to the department's HOD and targeted teachers.
- A subject meeting appears to relevant assigned faculty.
- A lab meeting appears to the targeted lab faculty and batch.
- Unauthorized users cannot edit or inspect a private meeting just by guessing an ID.
- Meeting changes notify attendees, and action items retain owners and deadlines.

### Timetable
- Conflicting faculty, room, section and batch assignments are detected.
- Publishing a revision updates the affected calendars and reminders.
- Connected dashboards refetch the latest published schedule.
- Completed attendance and finalized academic records remain intact.
- Previous timetable versions can be reviewed and restored by authorized users.

### Academic integrity and security
- Invalid marks are rejected.
- Returned submissions can be corrected with appropriate history.
- Finalized marks cannot be edited without authorized reopening.
- Cross-college and cross-department access tests fail as expected.
- RLS and authorization tests pass for every role and operation.

---

# 12. Implementation Priority

**P0 — Security first:** Fix authentication, anonymous access and RLS gaps, validate existing authorization paths and establish safe migrations.

**P1 — Role architecture:** Connect College Admin, Principal, HOD and Teacher to separate dashboards, verified permissions and role-specific data loaders.

**P1 — Assignment foundation:** Normalize faculty/subject/component/batch assignment and use it consistently for timetable, attendance, marks and resources.

**P1 — Timetable and meetings:** Implement versioned timetable publishing, realtime propagation, meeting targeting, notifications and follow-up actions.

**P1 — Academic workflows:** Complete lesson plans, attendance, IA/lab marks, HOD review, controlled finalization and course-file evidence.

**P2 — OBE and reporting:** Add CO/PO attainment, remediation tracking, IQAC evidence and institution/department-level reporting.

**P2 — Performance and reliability:** Load-test concurrent users, realtime updates, notification delivery and AI integrations.

## Final requirement

Do not rebuild Cravex from scratch. Preserve working features and migrate them incrementally. Every feature must have a defined data source, role permissions, backend enforcement, acceptance tests and migration plan.

A feature is considered implemented only when the actual workflow persists correctly in Supabase, the correct users can access it, unauthorized users cannot access it, and the result appears in every affected dashboard. A rendered screen or clickable button alone is not proof of implementation.
