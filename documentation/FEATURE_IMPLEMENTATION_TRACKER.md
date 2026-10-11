# Feature implementation tracker (F01–F21)

**Spec pack:** [feature-spec-pack/CRAVEX_FEATURE_SPEC_PACK/README.md](feature-spec-pack/CRAVEX_FEATURE_SPEC_PACK/README.md)  
**Last reviewed against repo:** 2026-10-11  
**Legend:** ✅ Done (verified E2E) · 🟡 In repo / partial · 🔴 Not started · ⚠️ P0 blocker

| ID | Feature | Priority | Repo status | Primary evidence / next step |
|---|---|---|---|---|
| F01 | Security, auth, tenant isolation | P0 | 🟡 | `supabase/migrations/20261011120100_p0_anon_remediation_template.sql` (template only); `admin-console` + `_shared/session.ts`; CORS updates on edge functions. **Next:** apply RLS remediation on staging; remove QA OTP bypass before pilot. |
| F02 | Admin console & central config | P1 | 🟡 | Migration `20261011120000_principal_admin_config.sql`; `supabase/functions/admin-console/`; `website/assets/js/admin/config-console.js`; Settings on admin host. **Next:** deploy function + migration; wire all modules to config APIs. |
| F03 | Principal dashboard & governance | P1 | 🟡 | Principal in `workspace.js` + dashboard role picker; DB role in migration (not live until migrate). **Next:** Principal-only routes and approval workflows per spec. |
| F04 | HOD department operations | P1 | 🟡 | HOD nav/workspace in dashboard UI; schema `departments.hod_user_id`. **Next:** verify auth on HOD actions; course-file review lifecycle (spec). |
| F05 | Teacher faculty workspace | P1 | 🟡 | Role workspace UI (`dashboard-ui.css`, `workspace.js`). **Next:** end-to-end teacher flows (attendance, plans, files) with enforced RLS. |
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
