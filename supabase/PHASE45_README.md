# Cravex Phase 4–5 Full Build

This is an additive build on the Phase 3 dashboard. It adds:

- Resources Hub with status and branch filters, upload/request actions, and private-file access warnings.
- Evidence Packs with academic-year, branch, semester, and period dropdowns, generation workflow, source checklist, and HOD review actions.
- Risk Monitor intervention queue with deterministic score sorting, status filtering, and owner actions.
- Safe migration SQL for resources, resource requests, risk cases, evidence packs, approvals, and usage events.

## Deployment order

1. Back up Supabase and test `supabase_phase45_migration.sql` in a staging project.
2. Complete Phase 1 RLS and membership policies before enabling these tables or using real student data.
3. Deploy `pages/dashboard.html` and keep the relative lesson-plan template and favicon files.
4. Wire the marked safe placeholders to authenticated Edge Functions: signed resource URLs, WhatsApp template sending, risk-case mutations, and evidence-pack export.
5. Test with synthetic College A and College B accounts before production.

## Important boundary

The UI deliberately fails safely where the backend tables or secure endpoints are not yet connected. It does not make files public, does not invent risk scores, and does not send WhatsApp messages directly from the browser.
