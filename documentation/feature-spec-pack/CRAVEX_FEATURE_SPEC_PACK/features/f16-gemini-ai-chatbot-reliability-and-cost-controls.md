# F16 — Gemini / AI Chatbot Reliability and Cost Controls

**Priority:** P1–P2  
**Current state:** AI job, quota, cache and provider health foundations exist; load validation needed  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for gemini / ai chatbot reliability and cost controls, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

Live schema includes `ai_jobs`, `college_quotas`, `provider_health`, `usage_events`, `response_cache`, `rate_limits`, `doc_chunks`, and vector documents. Active `ai-worker` v5 exists; `smooth-function` is v358. Some endpoints have `verify_jwt=false` but custom auth may be present, so inspect each deployed function instead of changing settings blindly.

## 3. Scope

- Per-user, per-college, per-feature limits and fair scheduling.
- Durable queue with bounded concurrency, status polling, deadline, cancellation and idempotency.
- Retry transient 429/5xx/network errors with exponential backoff + jitter and maximum attempts; don't retry invalid requests indefinitely.
- Provider circuit breaker, health view and explicit fallback policy.
- Context filtering before model call, token limits, prompt/version tracking and source citations/links.
- Cache safe repeated queries using normalized query + tenant/scope + corpus/config version.
- Usage/cost telemetry, queue depth/latency, quota metrics and alerts.
- Clear user messages for overload; never say “come again later” when a job can be queued.
- Keep human academic authority for marks, approvals and policy decisions.

## 4. Required workflows

Question arrives → authenticate/authorize → apply per-user/college quota → retrieve only permitted context → cache check → queue if capacity is full → worker claims job atomically → call preferred provider → retry/fallback within policy → save answer and usage → notify/poll client. On overload, show queued/rate-limited state with expected retry behavior where reliable, not a false success.

## 5. Data and API implications

Build on current `ai_jobs`, rate limits, quota and provider-health structures. Audit lock/RPC semantics, queue claims and status transitions. Ensure jobs store tenant/user identity by stable ID where feasible; phone fields are not authorization. Cache keys must include user/tenant access scope and source/config version where answers can vary by access.

## 6. Authorization and audit requirements

Verify session before accepting a job and before returning results. Never leak private retrieved chunks or cached answers across branches/roles. Service role only in worker. Clamp body size and token budget. Protect worker secret; compare in constant time and rotate. No user-visible request may set `college_id`, role or quota exemption as trusted data.

## 7. Backward-compatibility and change-safety rules

Do not re-deploy repo snapshots of active Edge Functions without diffing active versions. Use queue/worker migration in staged mode. Preserve synchronous endpoint compatibility while new async operation is introduced; UI should handle both during transition. Avoid caching data whose access or policy scope cannot be represented safely.

## 8. Tests required

- Load test at agreed concurrent user levels and burst profile.
- Simulate 429, 500, timeout and provider outage; verify retry cap and circuit breaker.
- Duplicate message/job submission is idempotent.
- Cache isolation tests across college/branch/role.
- Queue remains recoverable after worker interruption.
- Costs, latency, queue age, failure ratio and per-tenant usage are measured.

## 9. Acceptance criteria

- [ ] High concurrency queues fairly rather than collapsing into a generic error.
- [ ] Transient failures recover within bounded retry budget.
- [ ] No cross-scope retrieval or cache leakage.
- [ ] Usage/cost and provider health are observable.
- [ ] AI answers cannot commit or finalize official academic records without authorized human workflow.

## 10. Dependencies

F01, F02, F13, F15, F20.

## 11. Rollout plan

Inspect live functions and logs first; test with a staging project/provider quota, roll out queued execution to a small cohort, compare cost/latency/answer quality, then increase concurrency gradually.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
