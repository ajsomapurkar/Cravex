# F18 — Analytics, Reports and Exports

**Priority:** P2  
**Current state:** Analytics UI foundation exists; metrics and access accuracy need verification  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for analytics, reports and exports, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

The browser smoke report lists Analytics among role views. Live tables include attendance, marks, risk scores, usage events and OBE foundations. Accuracy and persistence of dashboard metrics were not independently proven.

## 3. Scope

- Role-aware dashboards: Principal institutional, HOD department, Teacher assigned subjects.
- Academic KPIs: attendance, syllabus coverage, IA completion, marks distributions, CO attainment, remediation, workload and pending approvals.
- Date/scheme/semester/branch filters.
- Drill-down from metric to authorized source records.
- Export CSV/PDF with applied filters, data-as-of time and audit event.
- Define metric formulas centrally; show denominator, exclusions, source, last-updated time and missing-data caveat.
- Avoid real-time expensive aggregation on every dashboard request; use indexed queries/materialized/read models if justified.

## 4. Required workflows

User selects authorized scope → API applies scope and filters → server computes/reads metric with defined formula → screen displays timestamp and drill-down → export uses same query/filter/formula and records audit. Scheduled reports use a snapshot and explicit period.

## 5. Data and API implications

Consider views, SQL functions or materialized/read models based on actual plans and scale; do not duplicate source records unnecessarily. Record metric definition/formula version. Index tuning must be query-driven: current advisor lists 16 unindexed FKs, 48 unused indexes and two duplicate-index groups; do not mass add/drop without workload assessment.

## 6. Authorization and audit requirements

Never allow query filters to broaden beyond caller scope. Server validates export fields and row limits. Exported PII is restricted and audited. Aggregate-only public metrics, if any, must be explicitly approved and protect small cohorts against re-identification.

## 7. Backward-compatibility and change-safety rules

Keep current dashboard display contracts while switching data sources. Compare new metrics against current output on fixture data before replacing. Do not treat “unused” advisor indexes as definitely safe to drop; the project may have low sample traffic.

## 8. Tests required

- Metric unit tests with known data and edge cases.
- Principal/HOD/Teacher same query returns scope-specific rows.
- Export equals on-screen filtered set.
- Pagination/large-range queries stay bounded.
- Performance tests under realistic record volume.

## 9. Acceptance criteria

- [ ] Every KPI has defined calculation and data provenance.
- [ ] Dashboards are role-scoped and drill-downs preserve permissions.
- [ ] Exports are accurate, bounded and audited.
- [ ] Index decisions are supported by query plans/workload, not guesses.

## 10. Dependencies

F01, F02, F03, F04, F05, F07, F09, F10, F11, F17, F20.

## 11. Rollout plan

Inventory existing KPIs and formulas, create fixture-based parity tests, centralize data queries, then optimize after collecting workload statistics.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
