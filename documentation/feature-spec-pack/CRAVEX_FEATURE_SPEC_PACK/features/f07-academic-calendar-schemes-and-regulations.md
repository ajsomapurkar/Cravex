# F07 — Academic Calendar, Schemes and Regulations

**Priority:** P1  
**Current state:** Configurable academic rule/version model is not established end-to-end  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for academic calendar, schemes and regulations, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

Live `subjects` has some academic fields (semester, credits, teaching hours, CIE/SEE marks, exam hours, prerequisites/books); the platform is affiliated to VTU by default in `colleges`. A general rule registry and effective scheme versioning were not confirmed.

## 3. Scope

- Institution academic years and terms/semesters with start/end, instructional periods and event calendar.
- Imported or manually entered official VTU dates, mapped to local college dates with source/document and last-verified date.
- Programme/scheme/regulation versions and applicability by cohort/admission year/semester.
- Assessment structures, attendance/eligibility rules, marks maxima, rounding/weighting and deadlines as versioned settings.
- Holiday, exam window, internal assessment and submission reminders.
- Track amendments/circulars and who approved local adoption.

## 4. Required workflows

Admin records source and applicability → institution validates the calendar/scheme → effective version published → dashboards use the version assigned to cohort/course → deadline reminders are recalculated without rewriting historic results.

## 5. Data and API implications

Add academic year/term/scheme/regulation and version entities only after checking existing source. Rule parameters should be typed and validated; avoid an unbounded JSON blob as the sole domain model for critical assessment rules. Track source URI/file, issued/effective date, version, approval and cohort applicability.

## 6. Authorization and audit requirements

Only authorized academic administrators/Principal may publish institutional adoption of a rule. Teachers and HODs consume the effective version, except an explicitly delegated configuration role. Changes to a future rule do not retroactively change final marks or student records.

## 7. Backward-compatibility and change-safety rules

Keep historical course/assessment records tied to the rule version used at the time. Official calendars/regulations are external and can change; do not hardcode VTU thresholds/dates into components. Store source + verification date and make rules adjustable by applicable scheme.

## 8. Tests required

- Cohort selects correct scheme/rule version.
- New version affects target cohorts only.
- Changing a deadline creates targeted notifications and audit entry.
- Historical finalized assessment output remains reproducible from original rule version.

## 9. Acceptance criteria

- [ ] Calendar and regulation versions have effective dates and source provenance.
- [ ] Assessment/attendance rules are scoped to programme, scheme and cohort.
- [ ] Institution can update a future-effective policy without code deploy.
- [ ] Historical calculations remain reproducible.

## 10. Dependencies

F02, F03, F06, F09, F10, F11, F18.

## 11. Rollout plan

Start by documenting current assessment assumptions; create a scheme-version registry; move one rule at a time into configuration with parity tests against current behaviour.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
