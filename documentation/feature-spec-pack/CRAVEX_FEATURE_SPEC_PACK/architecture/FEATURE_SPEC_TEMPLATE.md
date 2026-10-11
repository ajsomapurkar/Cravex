# Feature Specification Template

Copy this file when adding a feature specification.

## Metadata
- Feature ID:
- Priority (P0/P1/P2):
- Current state (existing foundation / partial / missing / unknown):
- Owner:
- Target release:
- Related files / tables / functions:

## Objective
What user/business outcome does this feature deliver?

## Current implementation — confirmed versus unverified
Record repo paths, live schema objects and tested workflows. Do not label screen presence as full functionality.

## Scope
List included and explicitly excluded behavior.

## Roles and authorization
Which roles can view/create/update/approve/publish/export? Define college/department/subject/class boundaries.

## Workflows and state transitions
Document states, allowed transitions, rejection/return behavior and edge cases.

## Data and API implications
List existing tables to reuse, proposed changes, constraints, indexes, RPCs/functions, integrations and source of truth. Mark new names as proposals until schema inspection confirms absence.

## Migration and backward compatibility
Describe additive change, backfill, parity checks, dual-read/write if needed, feature flag, old-client behavior and removal criteria.

## Realtime and notifications
Define the durable database change, event contract, affected subscribers, refetch behavior, reconnect recovery and delivery retry.

## Security and audit
Define server-side authorization, RLS, private files, audit fields, sensitive data handling and privilege boundaries.

## Tests
Unit, integration, RLS/cross-tenant negative, E2E, migration, concurrency, failure/retry, load and accessibility tests as relevant.

## Acceptance criteria
Use checkboxes with externally verifiable behavior.

## Rollout, monitoring and rollback
State feature flag, staging evidence, metrics/alerts, failure thresholds and rollback/forward-fix procedure.

## Change log
| Date | Change | Author/PR | Validation |
|---|---|---|---|
