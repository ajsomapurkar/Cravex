# Role Guide — Principal

**Priority:** P1 academic governance; depends on P0 security  
**Live status:** Apply migration `20261011120000_principal_admin_config.sql` on staging before production Principal accounts. QA bypass uses synthetic users only.

## 1. Purpose

The Principal has institution-wide academic oversight within their own college: department leadership, academic calendars, high-level approvals, institutional meetings/callouts, performance monitoring, quality assurance and escalations. Principal access does not equal platform-owner access.

## 2. Existing foundation

- `departments.hod_user_id` can help identify department ownership.
- `announcements`, `smart_notices`, `outbound_messages`, `audit_log`, `marks_audit_log`, analytics-related source tables and support escalations provide partial building blocks.
- Product roles are College Admin, Principal, HOD and Teacher (see [ROLE_MODEL_AND_PERMISSION_MATRIX.md](../ROLE_MODEL_AND_PERMISSION_MATRIX.md)).
- UI: `website/assets/js/principal/principal-module.js`, dark theme `principal-console.css`, QA `91999191993`.

## 3. Dashboard modules required

### Institutional overview
- College summary by academic year, semester, branch and department.
- Syllabus coverage planned versus completed; overdue lesson plans and missing course evidence.
- Attendance trends, internal-assessment completion and pending marks submissions.
- Faculty allocation/workload, timetable conflict summary, lab/room utilization and unresolved escalations.
- Student academic-risk and remediation status with access limited to legitimate institutional duties.

### HOD and department leadership
- Add/assign/deactivate HOD for a department within the college, with effective date and reason.
- Appoint temporary acting HOD, defining exact scope and expiry (`acting_hod_*` in migration `20261011143000_principal_governance.sql`).
- Review department readiness, pending approvals, overdue actions and audit observations.

### Approvals and academic governance
- Review items routed to Principal by policy; approve, return (mandatory comment), or escalate.
- Final marks freeze and timetable approval per institution policy (F06/F10).

### Meeting scheduler and callouts
- Meetings: `institution_meetings` when migration applied; local fallback until then.
- Callouts via existing notices/broadcast (server-side recipient resolution still required).

### Academic quality and reporting
- IQAC/evidence packs, CO/PO summaries, exports (F11, F17, F18).

## 4. Implementation status in repo (2026-10-11)

| Module | Status |
|--------|--------|
| Dark Principal console + KPIs | Shipped |
| Approval queue (evidence packs, resources) | Shipped (client; needs RLS) |
| HOD governance (departments page) | Shipped (no acting-HOD UI yet) |
| Meetings | Shipped (DB or localStorage) |
| Marks freeze / timetable approval | Not started |
| IQAC / OBE exports | Partial (existing pages) |
| Server-side scope + audit | Partial (`principal_decision_audit` migration) |

## 5. Main workflow

`Dashboard → approval/alert queue → inspect evidence and scope → approve/return/escalate → record audit → notify owner → follow up until closed`.

## 6. Acceptance criteria (target)

- [ ] Principal can access only their college and authorized academic data.
- [ ] Principal can assign HODs and acting HODs with effective dates, expiry and audit.
- [ ] Approval sequence cannot skip required HOD review or change finalized records without an explicit correction flow.
- [ ] Meetings preserve agenda, minutes and follow-up actions.
- [ ] Callouts resolve recipients server-side.
- [ ] Reports disclose filters/data-as-of time and match authorized source rows.
