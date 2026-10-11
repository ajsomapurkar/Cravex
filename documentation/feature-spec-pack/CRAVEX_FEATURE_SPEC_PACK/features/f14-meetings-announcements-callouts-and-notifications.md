# F14 — Meetings, Announcements, Callouts and Notifications

**Priority:** P1  
**Current state:** Announcements/notices/outbound message foundations exist; delivery tracking is partial  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for meetings, announcements, callouts and notifications, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

Tables `announcements`, `smart_notices`, `outbound_messages`, `ai_alerts` and `support_escalations` exist. `announcements` includes target branch/division and college. Outbound messages have status/provider/error/idempotency fields. Principal meeting/minutes data model is not confirmed.

## 3. Scope

- Schedule meeting with subject, agenda, attendees, location/link, start/end, organizer, branch/department scope and visibility.
- Record attendance, minutes, action items, owner, deadline, status and follow-up.
- Create announcements/callouts by role, college, department, branch, section, assigned course or selected users.
- In-app inbox and optional WhatsApp/email channel.
- Track queued/sent/delivered/failed/read/acknowledged where channel supports it.
- Reminders, retries, escalation and idempotency so retried jobs do not send duplicates.
- High-priority emergency notice uses explicit confirmation and audit.

## 4. Required workflows

Authorized sender composes → system resolves current eligible recipients → preview count/scope → schedule/send → create per-recipient outbox entries → provider delivery attempts → status/acknowledgement updates → retry/escalate according to policy.

## 5. Data and API implications

Reuse announcements and outbound messaging structures where semantics fit. For meetings, add meeting, participant, agenda/minutes and action-item records if absent. Normalize notification recipients as IDs rather than only a count. Consider transactional outbox for dependable delivery. Avoid one large unbounded `recipients` JSON or text field as the sole auditable target.

## 6. Authorization and audit requirements

Send permission varies by role and scope. A teacher cannot broadcast institution-wide by manipulating target fields. Check the sender's tenant/department and resolve recipients server-side. Redact sensitive content from provider logs. Rate-limit urgent callouts and protect parent/student phone details.

## 7. Backward-compatibility and change-safety rules

Do not make notifications part of the only persistence path for academic mutations. Academic data update must succeed transactionally even if provider delivery fails. Use queue/outbox retries and deduplication. Changing role/assignment after scheduling should be handled by a documented recipient snapshot policy.

## 8. Tests required

- Target filtering and recipient counts match expected fixture.
- Duplicate provider retries are idempotent.
- Delivery failure is visible and retry does not duplicate.
- Scheduled meeting time zone and reminder tests.
- Unauthorized role cannot target other branches/college.

## 9. Acceptance criteria

- [ ] Meeting has agenda/minutes/actions/follow-up lifecycle.
- [ ] Callouts support scoped delivery and accurate recipients.
- [ ] Notification retries/idempotency/read status work without coupling to core writes.
- [ ] Every administrative broadcast is audited.

## 10. Dependencies

F01, F02, F03, F04, F05, F06, F08, F09, F10, F12.

## 11. Rollout plan

Retain existing announcements; add recipient/delivery semantics incrementally. Pilot in-app messages first, then external channel delivery when credentials and provider policies are confirmed.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
