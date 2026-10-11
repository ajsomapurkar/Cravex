# F10 — Internal Assessment, Marks and Approval Workflow

**Priority:** P1 — critical academic workflow  
**Current state:** Marks and marks audit foundation exist; approval/freeze workflow is unverified  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for internal assessment, marks and approval workflow, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

`student_marks` includes test type/number, max and obtained marks, subject reference and entered-by metadata; `marks_audit_log` exists. `update_mark_with_audit` exists. The live schema has anonymous read/insert/update/delete policies on student marks and anonymous read/insert policies on marks audit — a critical security risk. The current role constraint lacks Principal.

## 3. Scope

- Define CIE/IA assessment instances per subject, scheme, semester and academic year, with date, maximum marks, weighting and type.
- Upload/restrict question paper, answer key/valuation scheme and question-to-CO mapping.
- Enter/import marks with row-level validation, absent/exempt handling, duplicate and max-mark checks.
- Submission workflow: draft → submitted → HOD review → returned or verified/frozen → Principal/institutional verification where applicable → finalized.
- Reasoned corrections, reopen/unfreeze with authority, history and notifications.
- Export verified marks and retain submission evidence.

## 4. Required workflows

Teacher creates assessment → validates structure → enters marks → submits locked snapshot → HOD reviews counts/outliers/missing values → approve/freeze or return comments → Principal verification follows configured VTU/college procedure → finalized record read-only except formal correction workflow.

## 5. Data and API implications

Add assessment-instance/question/CO mapping and mark-submission metadata only after checking existing tables. Avoid using `subject` display name as sole key. Keep current `student_marks` as mark detail until a migration plan supports assessment foreign keys. Add unique constraints for a defined assessment/student/component combination after duplicates are audited.

## 6. Authorization and audit requirements

Teacher enters only for assigned assessment and subject. HOD can verify/freeze department submissions according to policy. Principal finalizes assigned institution-level submission. No one can self-elevate to override. Record actor, timestamp, outcome, reason and prior values for each change. Protect question papers from students until release date.

## 7. Backward-compatibility and change-safety rules

Maintain compatibility with existing marks queries until new assessment joins are populated. Do not change marks formulas or existing student totals without scheme mapping and verified backfill. A freeze must be enforced server-side in every update path, including RPC/Edge Function/direct database attempts.

## 8. Tests required

- Marks above maximum or invalid type are rejected.
- Duplicate imports and concurrent edits are handled.
- Non-assigned teacher cannot enter marks.
- HOD cannot approve without submitted state; Principal cannot skip required earlier stage.
- Frozen mark mutation is denied except authorized audited correction.
- Export reconciles exactly with finalized database records.

## 9. Acceptance criteria

- [ ] Assessment configuration is versioned and scheme-aware.
- [ ] Marks have audited submission/review/freeze/finalization states.
- [ ] Student marks and audit history are not exposed to anon.
- [ ] All write paths enforce assignment and frozen-state restrictions.

## 10. Dependencies

F01, F02, F03, F04, F05, F07, F11, F13, F14, F18.

## 11. Rollout plan

Fix data exposure first. Add assessment metadata and approval states additively, test existing marks screens, then release with old-record handling and migration parity checks.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
