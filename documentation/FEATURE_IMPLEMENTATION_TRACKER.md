# Feature implementation tracker (F01–F21)

**Spec pack:** [feature-spec-pack/CRAVEX_FEATURE_SPEC_PACK/README.md](feature-spec-pack/CRAVEX_FEATURE_SPEC_PACK/README.md)  
**Role model (4 product roles):** [ROLE_MODEL_AND_PERMISSION_MATRIX.md](ROLE_MODEL_AND_PERMISSION_MATRIX.md)  
**Last reviewed against repo:** 2026-10-18  
**Master functional spec:** [DASHBOARD_REDESIGN_AND_FUNCTIONAL_SPEC.md](DASHBOARD_REDESIGN_AND_FUNCTIONAL_SPEC.md)

### Gap vs four-role product model (dashboard today)

| Topic | Target | Current repo / live |
|--------|--------|---------------------|
| Login roles | `college_admin`, `principal`, `hod`, `teacher` only | **Master Admin** still on login + QA bypass; legacy `admin`/`master` in app logic |
| Principal in DB | In `users_role_check` | Migration in repo; **not necessarily applied** on live Supabase |
| Authorization | Server + RLS; UI not proof | Direct anon queries + client role picker (F01 open) |
| Module UIs | Matrix-driven capabilities | **F02–F05** dark role consoles shipped (UI partial); timetable/meetings/RLS still open |
| Student login | Out of scope | No student login UI (OK) |  
**Legend:** ✅ Done (verified E2E) · 🟡 In repo / partial · 🔴 Not started · ⚠️ P0 blocker

| ID | Feature | Priority | Repo status | Primary evidence / next step |
|---|---|---|---|---|
| F01 | Security, auth, tenant isolation | P0 | 🟡 | `supabase/migrations/20261011120100_p0_anon_remediation_template.sql` (template only); `admin-console` + `_shared/session.ts`; CORS updates on edge functions. **Next:** apply RLS remediation on staging; remove QA OTP bypass before pilot. |
| F02 | Admin console & central config | P1 | 🟡 | **Dark College Admin Console** (`college-admin-module.js`, setup readiness checklist); `admin-console` Edge Function + config migration in repo. **Next:** server-side user provisioning rules, staged bulk import, deploy admin-console. |
| F03 | Principal dashboard & governance | P1 | 🟡 | **Dark Institution Console** (`principal-console-theme`, `principal-module.js`): approval queue, HOD governance, meetings; migration `20261011143000_principal_governance.sql`. **Next:** apply migrations on staging, server-side auth for approvals, full marks freeze workflow. |
| F04 | HOD department operations | P1 | 🟡 | **Dark HOD Console** (`hod-console-theme`, `hod-module.js`): review queue, dept KPIs, meetings; migration `20261011150000_hod_operations.sql`. **Next:** dept-scoped RLS, lesson-plan approval states, timetable (F06). |
| F05 | Teacher faculty workspace | P1 | 🟡 | **Dark Teaching Workspace** (`teacher-console-theme`, `teacher-module.js`): my classes, submissions, KPIs from `subject_assignments`. **Next:** assignment-scoped RLS, real marks submit workflow (F10). |
| F06 | Timetable live publishing | P1 | 🔴 | No versioned timetable model in repo. **Next:** implement per `f06-*.md` after F07/F02. |
| F07 | Calendar, schemes, regulations | P1 | 🟡 | Partial subject/academic fields in existing schema (see audit inventory). **Next:** versioned rules + admin config linkage. |
| F08 | Student records & mentoring | P1 | 🟡 | Existing student tables + dashboard queries. **Next:** lifecycle, mentoring, secure access (F01). |
| F09 | Attendance & eligibility | P1 | 🟡 | `attendance_*` tables; UI hooks in dashboard. **Next:** correction workflow, schedule linkage, policy lockdown. |
| F10 | IA marks & approval | P1 | 🟡 | `student_marks`, `marks_audit_log`, `update_mark_with_audit`. **Next:** submission → HOD → Principal freeze per spec. |
| F11 | OBE CO/PO/PSO attainment | P1–P2 | 🟡 | CO/PO tables; RLS disabled on four tables (audit). **Next:** enable RLS + attainment pipeline. |
| F12 | Lesson plans & delivery evidence | P1 | 🟡 | `lesson_plan_*`, `process-lesson-plan`; RLS off on plan tables. **Next:** approval + evidence + RLS. |
| F13 | Course files & resources | P1 | 🟡 | `uploaded_files`, `documents`, `process-pdf`. **Next:** access model + HOD review. |
| F14 | Meetings, announcements, notifications | P1 | 🟡 | `announcements`, `smart_notices`, `outbound_messages`. **Next:** delivery/ack workflow proof. |
| F15 | Google Classroom integration | P2 | 🔴 | Not confirmed in repo. **Next:** mapping/sync domain per spec. |
| F16 | Gemini / AI chatbot controls | P1–P2 | 🟡 | `ai_jobs`, quotas, cache, provider health. **Next:** load test + cost guards. |
| F17 | IQAC evidence packs & audits | P2 | 🟡 | Evidence Packs UI (smoke-tested only). **Next:** source-backed persistence. |
| F18 | Analytics, reports, exports | P2 | 🟡 | Analytics UI in dashboard. **Next:** formula/scope verification. |
| F19 | Labs & practical batches | P2 | 🟡 | Partial batch columns (audit). **Next:** full lab workflow. |
| F20 | Migrations & release safety | P0 | 🟡 | `supabase/migrations/` + README; deployed-function mirrors. **Next:** CI apply order, staging drills, shrink live/repo drift. |
| F21 | Testing, observability, backups | P0–P1 | 🟡 | Manual UI smoke only; backup endpoint auth flagged in spec audit. **Next:** automated E2E + backup auth review. |

## Admin host & deploy (cross-cutting)

| Item | Status | Notes |
|---|---|---|
| `admin.cravex.co.in` entry routes | 🟡 | `netlify.toml` / `_redirects` — asset paths must not rewrite to HTML |
| Admin dark theme + session cache | 🟡 | `admin-dark-theme.css`; 7-day `localStorage` on admin host (test-only) |
| QA Master login `91999191991` | ⚠️ | Client-side bypass in `dashboard.html`; **remove or env-gate before production** |
| Netlify production | 🟡 | Documented in `NETLIFY_DEPLOYMENT.md` |
| Supabase edge deploy | 🟡 | `admin-console`, updated `send-otp` in repo — confirm deployed versions on project |

## How to update this file

When a feature meets the pack’s “complete” rule (UI + persistence + auth + audit + failures + tests), change its row to ✅ and link the PR/commit in the feature’s markdown under **Verification**.
