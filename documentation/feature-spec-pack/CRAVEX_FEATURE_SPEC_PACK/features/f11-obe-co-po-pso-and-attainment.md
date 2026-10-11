# F11 — OBE: CO, PO, PSO and Attainment

**Priority:** P1–P2  
**Current state:** CO/PO schemas exist, but RLS is disabled on four related tables  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for obe: co, po, pso and attainment, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

Live schema includes `course_outcomes`, `course_learning_objectives`, `co_po_mapping` and `subject_profile`. CO-PO table has 40 rows. Security Advisor flags RLS disabled on these four tables; their policies exist but are not enforced while RLS remains disabled. Current data foundations should be retained and secured.

## 3. Scope

- Manage CO definitions per course/scheme/version; course learning objectives if used by college model.
- Manage programme PO and PSO master catalogues and subject-to-CO/PO/PSO mapping with rationale/correlation level.
- Map each assessment question/component to CO and its maximum weight.
- Compute direct attainment from configured assessment data and indirect attainment from approved feedback/survey data.
- Configure institution-approved thresholds, weighting and target achievement rules per scheme.
- Generate CO attainment, PO/PSO contribution matrix, weak outcomes, remedial action and re-assessment results.
- Preserve formula/configuration version for reproducibility.

## 4. Required workflows

Setup outcome definitions → map course outcomes to questions/assessments → import validated assessment results → calculate attainment using published rule version → HOD reviews → action plan for weak outcome → subsequent assessment measures improvement → report exports data lineage.

## 5. Data and API implications

Use existing CO/mapping/profile tables as starting point. Identify where the PO/PSO master catalogues and question-level mappings are missing. Add version/run tables for attainment results and formula version, so old reports remain reproducible. Explicitly define mapping weight range and codes as constraints where valid.

## 6. Authorization and audit requirements

Teachers may draft course mapping for assigned subjects; HOD reviews/approves department mappings; institution-approved roles configure programme outcome masters/formulas. Protect course outcome tables with tenant and department/subject-scoped RLS. Changes after a report is approved should create a new mapping version, not rewrite the past report.

## 7. Backward-compatibility and change-safety rules

Do not assume a universal formula. Document each college-approved formula and test it with hand-calculated samples. Existing CO-PO rows must be reconciled before constraints or type changes. Enable RLS with reviewed policies in the same staged security work; do not expose mappings via anon.

## 8. Tests required

- Unit tests for formulas with hand-calculated examples, edge cases and no-data states.
- Verify assessment max marks/weighting and question-to-CO mapping sums.
- Cross-college/subject isolation tests.
- Formula version produces same result on report rerun.
- Weak CO triggers intended remediation queue.

## 9. Acceptance criteria

- [ ] CO/PO/PSO catalogues and mappings are authorized and versioned.
- [ ] Each attainment result records formula and source assessment versions.
- [ ] Reports can be reproduced and explained.
- [ ] RLS enforced on all OBE tables and tests pass.

## 10. Dependencies

F01, F02, F05, F07, F10, F12, F17, F18.

## 11. Rollout plan

Secure existing data first, document current mappings, implement question/assessment linkage, introduce attainment in a read-only pilot and compare manually verified sample reports before enabling exports.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
