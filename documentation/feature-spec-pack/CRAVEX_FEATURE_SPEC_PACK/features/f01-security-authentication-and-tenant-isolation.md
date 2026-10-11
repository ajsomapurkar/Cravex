# F01 — Security, Authentication and Tenant Isolation

**Priority:** P0 — blocking  
**Current state:** Existing controls are present but unsafe policy and RLS gaps are confirmed  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for security, authentication and tenant isolation, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

The live project has RLS enabled on many tables but still exposes permissive `anon` policies. A live policy query found 37 anonymous policies over 17 public tables. Supabase Security Advisor reports RLS disabled on six academic tables: `lesson_plan_topics`, `lesson_plan_progress`, `course_outcomes`, `course_learning_objectives`, `co_po_mapping`, and `subject_profile`. Several policies exist while RLS is disabled. Multiple `SECURITY DEFINER` functions are executable by `anon` and `authenticated`. The existing dashboard uses a public Supabase key, which is expected for browser apps; safety depends on policies and server-side enforcement, not hiding that key.

## 3. Scope

- Use a supported, documented identity model: Supabase Auth with verified claims and RLS, or custom signed sessions with all sensitive operations routed through server-side functions. Do not mix trust assumptions.
- Link every authenticated identity to one Cravex user record and derive college, department, role and assignments from trusted data.
- Replace blanket anonymous policies with deny-by-default policies. Anonymous access should be limited to explicitly public, minimal data.
- Enable RLS on the six disabled academic tables only alongside tested policies. Do not enable RLS blindly and accidentally lock out legitimate flows.
- Review `acquire_ai_lock`, `rls_auto_enable`, `trigger_process_pdf`, `update_mark_with_audit`, and every `SECURITY DEFINER` function.
- Review custom sessions, OTP verification, expiration, logout/revocation, rate limiting and brute-force controls.

## 4. Required workflows

1. A request comes from a user with no session: sensitive reads/writes are denied.
2. A Teacher from College A reads/writes only assigned subjects/classes and permitted students.
3. An HOD can access only their assigned department and approved department workflows.
4. A Principal can access permitted institution-level records but cannot become Master/platform owner.
5. College A cannot read or mutate College B even when an ID is guessed or tampered with.
6. OTP/session expiry or revocation takes effect on subsequent sensitive requests.

## 5. Data and API implications

Treat this as a controlled security change, not a full schema rewrite. Build test identities for Master, College Admin, Principal, HOD, Teacher and Student. Verify all exposed tables, views, RPCs, Edge Functions and Storage buckets. Evaluate anonymous policy commands for SELECT/INSERT/UPDATE/DELETE. Use `auth.uid()`/verified claims where using Supabase Auth; if custom sessions are retained, verify tokens server-side and do not trust client-supplied role/college IDs. Use narrow grants for RPC execution.

## 6. Authorization and audit requirements

The database is authoritative for authorization. Browser navigation visibility is never a security boundary. Audit role changes, failed privilege checks where appropriate, and administrative actions. Store token/signing secrets only in Supabase secrets or secure server-side environment configuration. Do not log OTPs, session secrets or full sensitive student information.

## 7. Backward-compatibility and change-safety rules

- Never rerun `supabase/schema.sql`: it contains `DISABLE ROW LEVEL SECURITY` statements.
- Add a new forward-only migration with explicit policy changes; avoid destructive blanket changes.
- Preserve intentional service-role server operations and webhook/custom-auth behavior, but document each function’s auth model.
- Run the migration on staging first; keep SQL to enable/replace policies specific and reversible where possible.
- After policy changes, run the full role/tenant test suite before frontend rollout.

## 8. Tests required

- Anonymous role matrix tests for every exposed table and RPC.
- Cross-college read/write negative tests.
- Principal/HOD/Teacher scope tests, including altered IDs and stale session claims.
- Session expiry, revoked user, disabled user, OTP brute-force and replay tests.
- Edge Function authentication and CORS tests.
- Supabase Security Advisor rerun and manual policy review.

## 9. Acceptance criteria

- [ ] No broad `anon` policies remain on academic, staff, marks, attendance, audit or integration tables.
- [ ] RLS is enabled with tested policies on all exposed tenant-sensitive tables.
- [ ] Security Advisor findings for disabled RLS and public execution paths are resolved or individually justified.
- [ ] Privileged functions cannot be invoked by unintended roles.
- [ ] Cross-tenant tests prove isolation for reads and writes.

## 10. Dependencies

All features depend on this. Complete before real student data or principal/teacher workflows are enabled.

## 11. Rollout plan

1. Export/backup current policies and schema state. 2. Create staging data and test identities. 3. Introduce narrowly scoped policies/RPC grants in migrations. 4. Run security tests. 5. Release app changes compatible with the new authorization model. 6. Re-run advisors and preserve evidence of results.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
