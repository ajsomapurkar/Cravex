# F15 — Google Classroom Integration and Content Linking

**Priority:** P2  
**Current state:** Classroom-specific mapping/sync contract not confirmed in the inspected public tables  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for google classroom integration and content linking, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

The dashboard and prior product requirements mention Google Classroom integration, but the inspected Supabase table inventory did not establish a dedicated classroom mapping/sync domain. Resource and doc chunk metadata can include subject/branch context, but this alone is not a complete Classroom integration.

## 3. Scope

- Connect approved Google identity with least-privilege OAuth scopes appropriate to the actual operations.
- Map college + branch + academic year + semester + subject + section/batch to Classroom ID.
- Validate teacher role/ownership before creating or changing a class mapping.
- Link materials/assignments and show Classroom URL without copying files unnecessarily.
- Track last sync, sync status, last error, external update time and manual retry.
- Disconnect/revoke safely; handle removed courses, changed permissions and deleted materials.
- AI retrieval respects the same source access permissions as Classroom.

## 4. Required workflows

Admin/HOD configures mapping → app validates Google course → authorized teacher syncs content metadata → resources become visible to assigned audience → AI indexes only permitted, supported materials → sync errors appear in integration health screen.

## 5. Data and API implications

Potential entities: `classroom_connections`, `classroom_mappings`, `classroom_sync_runs`, `classroom_resource_links`. Store OAuth refresh tokens only server-side encrypted/secret-managed, not in browser table. Prefer stable external IDs and scoped mapping. Record provider API version/consent and permissions needed.

## 6. Authorization and audit requirements

Do not use a Classroom URL as proof of access. Verify signed-in user and provider permissions. Keep branch/subject separation on every imported metadata/chunk. AI retrieval must apply tenant, branch, semester, subject and user access scope before passing context to Gemini.

## 7. Backward-compatibility and change-safety rules

Do not duplicate binary content into Supabase storage unless required. Use link-first behavior and cache metadata. Indexing/removal events must update retrieval corpus appropriately. Disconnect does not automatically delete official college evidence unless retention policy says so.

## 8. Tests required

- Cross-branch/subject retrieval negative tests.
- OAuth scope denial and disconnected account flows.
- Sync idempotency and deleted/renamed external course.
- Expired/revoked token behavior and reconnect.
- Classroom URL does not bypass provider authorization.

## 9. Acceptance criteria

- [ ] Classroom links are stable, validated and scoped to class identity.
- [ ] Sync status and failures are visible and retryable.
- [ ] AI cannot retrieve unrelated branch/subject content.
- [ ] OAuth credentials/tokens are protected and revocable.

## 10. Dependencies

F01, F02, F05, F13, F16, F20.

## 11. Rollout plan

Start with read/link mapping rather than auto-create classes. Confirm product APIs and Google consent requirements, pilot one subject, then enable indexing with isolation tests.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
