# F08 — Student Records, Enrollment and Mentoring

**Priority:** P1  
**Current state:** Students table and risk/intervention UI foundations exist  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for student records, enrollment and mentoring, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

Live `students` has college, branch, division, semester, batch, USN, roll number, parent contacts, active/deleted state and risk score. Risk Monitor UI had a synthetic smoke test. Data contains test records, and anonymous policies currently expose student data; F01 blocks real data.

## 3. Scope

- Secure student create/import/update/deactivate and duplicate detection.
- Enrollment history and cohort/programme/branch/section transitions with effective date and reason.
- Subject registration/assignment where required.
- Profile and authorized contact/parent relationship management with verification/consent statuses from `parent_links`.
- Academic risk flags, attendance/marks triggers, advisor/mentor ownership, follow-up date, intervention plan and closure outcome.
- Bulk CSV validation report, dry run, duplicate handling and reversible import batch.

## 4. Required workflows

Import preview → validate rows and uniqueness → approve import → transaction/batch persisted with import ID → errors downloadable → reconcile counts. For mentoring, risk flag → assigned mentor → contact/meeting → action → follow-up → outcome/closure.

## 5. Data and API implications

Prefer student UUID internally. Current phone-based unique identity and other legacy fields need normalization plan; do not assume phone is permanently stable or globally unique across colleges. Add import batch/error structures if not present. Link intervention to student UUID and source signal. Retain soft delete or lifecycle state.

## 6. Authorization and audit requirements

Student access should be own record only if student self-service is implemented; teacher sees assigned students, HOD department scope, Principal approved institution scope. Parent data is accessible only for verified/consented relationship and policy. Limit exposure of phone, parent details and risk indicators.

## 7. Backward-compatibility and change-safety rules

Do not physically delete student history on transfer/deactivation. Record effective-dated enrolment and keep references valid. CSV import must be idempotent or require explicit duplicate resolution. Changes to branch/semester should update future assignments only through a controlled transition workflow.

## 8. Tests required

- Duplicate/invalid CSV and partial failures are reported deterministically.
- College/department cross-tenant isolation.
- Parent link requires proper verification and cannot be forged by client.
- Risk-to-intervention traceability and audit.
- Transfer changes future scope without losing historical attendance/marks.

## 9. Acceptance criteria

- [ ] Student lifecycle changes are validated, audited and reversible where appropriate.
- [ ] Imports have preview, row errors, duplicate strategy and reconciliation.
- [ ] Academic risk has owner, due date, action and outcome.
- [ ] Student/contact privacy is enforced by F01 policies.

## 10. Dependencies

F01, F02, F05, F09, F10, F14, F18.

## 11. Rollout plan

First secure current access, then standardize student UUID relationships, then improve imports and mentoring. Do not re-key existing records in one destructive migration.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
