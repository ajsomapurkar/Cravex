# F17 — IQAC, Evidence Packs and Academic Audits

**Priority:** P2  
**Current state:** Evidence Packs UI tested synthetically; complete source linkage and persistence need verification  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for iqac, evidence packs and academic audits, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

The Phase 4–5 browser report observed Evidence Packs navigation and builder with academic year/branch/semester/period selectors, checklist, generation action and review table. It displayed a seeded pending approval pack. That smoke test proves rendering, not real record aggregation or audit readiness.

## 3. Scope

- Templates/checklists configurable by institution/programme/scheme and audit type.
- Collect evidence references from attendance, lesson plans, course files, IA, CO/PO reports, mentoring, timetables and notices.
- Show missing evidence and provenance/source ID, owner, date, version and verification state.
- HOD/department review, Principal/IQAC approval and corrective-action assignment.
- Owner, due date, severity, status, comment, attachment and closure verification for findings.
- Export an audit package with index/manifest, filters, as-of date, generated-by and included evidence versions.
- Keep immutable record of submitted pack versions.

## 4. Required workflows

Select audit/template period → system queries permitted source records → builds draft manifest and gaps → HOD reviews → gaps become corrective actions → evidence added and verified → Principal/IQAC submits/approves → export with manifest and checksums.

## 5. Data and API implications

Reuse evidence pack tables if present; validate actual deployed schema before new tables. Link evidence by source type + stable source ID + version/checksum, not copying source facts into a new manual table. Add audit template versions, evidence items, review events and corrective actions only where needed.

## 6. Authorization and audit requirements

Audit exports may contain private student/faculty data. Build authorization into the generation function and download path. Users cannot approve their own pack if separation is required. Audit records should be append-only or correction-versioned; do not permit silent replacement after submission.

## 7. Backward-compatibility and change-safety rules

Maintain old pack exports and manifest so historical submission is reproducible. Source edits after snapshot should produce a “source changed since capture” indication, not silently mutate already submitted pack. Export should be size-bounded and background-generated if large.

## 8. Tests required

- Pack counts reconcile to source queries.
- Unauthorized evidence is excluded, not merely hidden in UI.
- Missing-item detection and corrective-action lifecycle.
- Approved pack remains reproducible after source record change.
- Export manifest/checksum and role-based download tests.

## 9. Acceptance criteria

- [ ] Evidence pack is generated from authorized source records with provenance.
- [ ] Review, correction, action and closure states are persisted.
- [ ] Exports have a versioned manifest and access control.
- [ ] UI smoke test is followed by data-persistence and cross-tenant tests.

## 10. Dependencies

F01, F02, F03, F04, F09, F10, F11, F12, F13, F18.

## 11. Rollout plan

Trace the current Evidence Packs data path; replace seeded/demo data with source-backed logic in stages; pilot a single department audit and verify totals manually.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
