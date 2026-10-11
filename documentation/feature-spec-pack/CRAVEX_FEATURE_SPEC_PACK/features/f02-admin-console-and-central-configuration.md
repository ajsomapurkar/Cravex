# F02 — Admin Console and Central Configuration

**Priority:** P1 — foundation  
**Current state:** UI foundation exists; central live-config contract is incomplete  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for admin console and central configuration, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

The repository has a single large `website/pages/dashboard.html` and role-aware menu rendering. The database already contains `colleges`, `departments`, `users`, `subjects`, `subject_assignments`, `class_teacher_assignments` and quota/configuration-related data. The inspected public schema did not establish a comprehensive versioned settings system controlling all dashboard behavior.

## 3. Scope

- Separate platform Master controls from College Admin and Principal academic controls.
- Manage institution profile, academic years, programmes, branches, departments, semesters, sections, subject catalogues and active/inactive states.
- Manage user invitations/activation, role assignment, department/branch scope and effective dates.
- Manage configurable dashboard modules and feature flags by role/college.
- Manage academic-rule versions, schedule policies, notification templates, Classroom mappings and AI quotas.
- Show change preview, validation errors, published version, who changed it, and audit history.

## 4. Required workflows

Draft → validate → publish → emit version/change event → affected clients invalidate local caches and refetch the authoritative configuration. If clients are disconnected, the next load/reconnect must fetch the latest version. High-impact changes should support approval or effective date.

## 5. Data and API implications

Create a clear configuration domain only after comparing existing columns/settings. Candidate structures include `college_settings`, `feature_flags`, `academic_rule_versions`, `configuration_versions`, and `configuration_change_log`; these are proposed names, not a mandate to duplicate existing tables. Use stable IDs and explicit foreign keys rather than branch/subject display strings. APIs should expose scoped read configuration and authorized mutations. Keep schema/version metadata separate from UI display labels.

## 6. Authorization and audit requirements

Master has platform scope. College Admin has approved setup scope. Principal controls institution academic policies within allowed scope. HOD/Teacher cannot edit institution-wide feature flags. Enforce all changes server-side. Every publish records actor, target, before/after diff (with secrets redacted), scope, timestamp, reason and version.

## 7. Backward-compatibility and change-safety rules

Do not place permission checks only in menu visibility. Configuration reads should have stable contracts and defaults. Feature flags must fail safely if missing. Do not delete columns/modules simply because a feature is disabled. Use effective-dated settings where history matters. Frontend must tolerate unknown optional config fields.

## 8. Tests required

- Role-based publish and deny tests.
- Multiple browser sessions reflect a published change.
- A disconnected browser refreshes to the newest version.
- Cache invalidation and event-loss recovery.
- Invalid/conflicting settings are rejected with no partial write.
- Rollback restores prior configuration without rewriting academic records.

## 9. Acceptance criteria

- [ ] One authoritative configuration layer feeds all role dashboards.
- [ ] Admin changes take effect through APIs/events without editing each dashboard separately.
- [ ] Changes have validation, audit history, scoped authorization and rollback/version strategy.
- [ ] Feature flag defaults do not expose new modules accidentally.

## 10. Dependencies

Security/identity, academic master data, notifications and timetable. Principal features should build on the same permission/config contract.

## 11. Rollout plan

Start by documenting current settings/columns. Add the minimum additive model, dual-read only if required, verify dashboards use the central API, then retire duplicated constants in a later release.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
