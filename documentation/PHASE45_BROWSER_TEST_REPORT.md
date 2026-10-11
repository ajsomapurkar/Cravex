# Phase 4–5 Browser Regression Notes

## Synthetic session

A local synthetic College Admin session was seeded with a placeholder college UUID and phone number. No real credentials or student data were used.

## Initial load

The generated `cravex_phase45_full_build/pages/dashboard.html` loaded successfully. The OTP login screen remained available before the synthetic session. After reload, the dashboard rendered the existing sidebar plus the Phase 3 command centre and the new Phase 4–5 Operations entries: Resources and Evidence Packs.

## Visible controls confirmed

The College Admin view exposed Dashboard, Students, Sessions, Teachers, Departments, Lesson Plan, Risk Monitor, Marks, Broadcast, Notices, Knowledge Base, Analytics, Resources, and Evidence Packs. The Phase 3 Branch dropdown exposed four options and the Division dropdown exposed A/B/C. The dashboard showed the new academic setup checklist, role label, quick actions, and workspace button.

## Safety observations

The new Phase 4–5 UI is additive and does not send WhatsApp messages or expose file downloads directly from the browser. Resource and evidence actions show safe placeholder messages until authenticated server functions and the migration are connected. The migration is packaged but must be reviewed in staging and receive proper RLS policies before production use.

## Bug found and fixed

The first implementation of Resources/Evidence navigation could recursively call the wrapped navigation function. The wrapper was changed so Resources and Evidence are handled directly while all existing views continue through the original navigation function. The package was rebuilt after the fix.

## Resources Hub regression

Resources navigation opened the new page. The page rendered three seeded resource rows, KPI cards, upload/request actions, status dropdown, branch dropdown, and secure-access warnings. Selecting `Pending review` reduced the table to the single pending resource, confirming the status filter and table redraw work.

## Resources compound filter

Selecting CSE scope while Pending review remained selected kept the correct single CSE pending row, confirming compound filtering.

## Evidence Packs regression

Evidence Packs navigation opened successfully. The builder rendered Academic year, Branch, Semester, and Period dropdowns; three checklist checkboxes; Generate evidence pack; and a review table. The page displayed the seeded pending-approval pack and the required source-record/intervention/HOD-review guidance.

## Evidence Packs dropdown regression

The Academic year dropdown accepted `2026–27`, the Branch dropdown accepted `CSE`, and the Semester dropdown accepted `4`; the selected values remained visible after each change. The Period dropdown remains to be exercised, followed by draft generation and risk-monitor coverage.

## Evidence Packs completion

The Period dropdown accepted `Full academic year`. Generate evidence pack created a new pending-approval draft using the selected 2026–27 and CSE context, and the new row appeared above the existing pack. The UI correctly states that HOD approval is required before export.

## Risk Monitor regression

Risk Monitor opened without replacing the existing page. The intervention queue rendered three deterministic synthetic cases with scores 86, 72, and 61, status filters, score sort control, and owner actions. Selecting `Open` reduced the queue to the two open cases and preserved the existing Risk Monitor summary/search area.

## Risk Monitor sort and navigation smoke test

Selecting `Lowest score` reordered the open cases from 61 to 86, confirming sort behavior. A browser smoke test called every existing view and both new views (`overview`, `students`, `sessions`, `teachers`, `departments`, `lessonplan`, `risk`, `marks`, `broadcast`, `notices`, `knowledge`, `analytics`, `resources`, `evidence`) and reported zero synchronous JavaScript exceptions; Evidence Packs remained the final active view.

## Teacher-role regression

After reloading with a synthetic Teacher session, the dashboard showed only teacher-appropriate People/Academics/Communication navigation plus Resources and Evidence Packs. The teacher-specific quick actions, Teacher focus checklist, Branch dropdown, Division dropdown, and workspace button rendered correctly. No College Admin-only Teachers or Departments navigation appeared.

## HOD-role regression

The HOD session rendered My Department, Students, Sessions, Lesson Plan, Risk Monitor, Marks, Communication, Knowledge, Analytics, Resources, and Evidence Packs, while omitting College Admin-only Teachers and Departments navigation. The existing intentional empty state—“No department assigned yet”—rendered safely for a HOD without a department assignment.

## Master-role regression

The Master Admin session rendered the master-only Colleges selector and full navigation, including Resources and Evidence Packs. The dashboard loaded live-looking college/student metrics from the configured Supabase project, confirming that the additive UI does not prevent existing data queries from rendering. Only synthetic local session data was used for role switching.
