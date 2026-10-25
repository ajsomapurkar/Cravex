# Role Guide — College Admin

**Priority:** P0 permissions baseline; P1 college operations  
**Live role:** `college_admin` exists in `public.users_role_check`.  
**Scope:** One college only; not the Cravex platform and not automatically the Principal's academic authority.

## 1. Purpose

College Admin handles approved institution setup and day-to-day operational administration so academic users can work in the correct college, department, programme, branch and semester context.

## 2. Existing foundation

- `colleges`, `departments`, `users`, `subjects`, `subject_assignments`, `class_teacher_assignments`, `students`, announcements and academic record tables exist.
- The UI regression report showed College Admin navigation including Students, Teachers, Departments, Lesson Plan, Risk Monitor, Marks, Broadcast, Notices, Knowledge Base, Analytics, Resources and Evidence Packs.
- Existing fields provide a start but do not prove that user provisioning, scope boundaries, bulk import validation or every update path is secure.

## 3. Features required

### College profile and academic master data
- Maintain college profile, academic year, semester dates, branches/departments, programmes, sections, batches and rooms/labs where delegated.
- Maintain subject catalogue and link subjects to the correct department, programme, semester and applicable scheme.
- Import official academic calendar/rule references for the relevant scheme; require review before applying institution-specific dates.
- Activate/deactivate entities with effective dates. Avoid hard deletion if historical academic records refer to the entity.

### User and roster administration
- Invite/add teachers and staff; update employee identifiers, designation, qualification and department membership.
- Import students and rosters from a validated CSV/XLSX template; preview errors and duplicates before commit.
- Assign teachers to subjects/classes only within permitted scope. HOD/Principal business approval rules still apply.
- Deactivate, transfer or correct accounts using a logged workflow; support USN/roll-number uniqueness checks within the appropriate academic context.
- Never create a user as Principal/HOD/Teacher by trusting a front-end role dropdown alone; validate whether the current actor can grant that exact role and scope.

### Operational support
- Manage permitted announcement templates, academic reminders and support requests.
- Review missing assignments, inactive users, failed imports, upload failures and integration health.
- Maintain approved college-level Google Classroom mappings and chatbot settings where explicitly delegated.
- View college-wide operational summaries; sensitive academic records remain governed by role and purpose.

### Setup checklist and readiness
- Show incomplete college profile, missing department HOD, subjects without assignments, missing semester setup, unresolved identity records and inactive integrations.
- Allow configuration changes to be drafted, validated, previewed and published.
- Provide before/after audit history and export validation reports.

## 4. Must not be implicit

- College Admin is not automatically the academic approver of every IA submission.
- College Admin cannot access or mutate another college.
- College Admin cannot grant Principal to themselves, grant access outside their college, or change deployment-level secrets/privileges.
- College Admin cannot bypass HOD verification or Principal verification if the institution's approved marks workflow requires it.
- College Admin must not see or recover plaintext secrets, OTP values or private AI provider keys.

## 5. Data/API considerations

Use current `colleges`, `departments`, `users`, `subjects`, `subject_assignments` and `class_teacher_assignments` first. Before schema changes, map all current string-based phone references to stable IDs and create a gradual compatibility path. Candidate new models such as `academic_years`, `programmes`, `sections`, or `rooms` must be added only after a schema diff confirms no existing equivalent. Bulk imports should use a staging/preview table or validated server-side transaction, not partial browser row inserts.

## 6. Role boundaries

- Create and manage ordinary college users inside own college when authorized.
- Operationally assign data and settings only inside the college.
- Delegate departmental assignment actions to HOD/Principal workflows where the college requires approval.
- No platform feature flag, global quota, cross-college search or platform release access.

## 7. Implementation order

1. **P0:** Correct session authorization and college-scoped policies; remove anonymous write access.
2. **P1:** College/department/subject/semester master data and versioned configuration.
3. **P1:** User provisioning, safe imports, role/department assignments and lifecycle.
4. **P1:** Setup readiness, notifications and integration settings.
5. **P2:** Advanced import tools and operational analytics.

## 8. Acceptance criteria

- [ ] A College Admin cannot enumerate or change another college by manipulating IDs.
- [ ] User creation validates permitted role and department scope server-side.
- [ ] Bulk import preview identifies invalid rows and duplicates before writes; failed batches do not partially corrupt data.
- [ ] Deactivation/transfer preserves the academic history and invalidates obsolete access.
- [ ] Changes to shared settings appear in affected dashboards after publish/reconnect.
- [ ] All administrative mutations are audited.
