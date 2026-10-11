# Cravex Netlify Deployment Audit

**Audit date:** 30 August 2026

## Result

The supplied ZIP was **not safe to upload as a Netlify publish directory unchanged**. It contained backend TypeScript, SQL migrations, internal review/manual files, placeholder Phase 4/5 UI handlers, misleading free-pilot/compliance claims, and a dashboard that restored authorization from `localStorage`.

A clean static publish directory has now been prepared. It contains only the public landing page, legal pages, favicon, templates, dashboard HTML, Netlify redirects, and security headers. Backend source and SQL are intentionally excluded from the publish directory so they cannot be downloaded as public static assets.

## Corrections made

| Area | Correction |
|---|---|
| Public positioning | Replaced “live,” “free pilot,” and “VTU Compliant” wording with pilot-stage, paid-pilot, and VTU-aware wording |
| Pricing | Updated public pilot CTA/copy to ₹15,000 for a 30-day pilot up to 500 students; removed the Cashfree payment CTA from the public page |
| Dashboard sessions | Removed restoration of authorization from `localStorage`; dashboard requires OTP after refresh until a server-issued session is wired |
| Phase 4/5 demo data | Removed seeded student/resource/risk/evidence rows so the deploy build does not present synthetic records as live college data |
| Netlify routing | Added `/dashboard` and `/app` redirects to `/pages/dashboard.html`, plus legal-page routes |
| Static security | Added `_headers` with no-sniff, referrer, frame, permissions, and no-store rules for dashboard routes |
| Publish hygiene | Excluded TypeScript backend, SQL, internal manuals, and review reports from the public publish directory |

## Validation completed

The local validation passed HTML parsing, duplicate-ID checks, relative asset checks, inline JavaScript syntax checks, and publish-file hygiene. The landing page rendered locally, the direct dashboard rendered its OTP login screen, and the browser console showed no load-time JavaScript errors.

The local Python static server returns 404 for `/dashboard` because it does not process Netlify `_redirects`. That route must be tested after Netlify deploy; direct `/pages/dashboard.html` was verified locally.

## Still required before real student data

The supplied Phase 4/5 migration explicitly assumes Phase 1 RLS hardening and leaves its RLS policies commented out. The Phase 4/5 Resources and Evidence actions are placeholders until authenticated server functions are connected. The existing dashboard still uses direct Supabase browser queries with an anon key; removing stale localStorage restoration prevents one class of session abuse but does not replace server-issued authentication and RLS.

Before using real data, complete the two-college RLS tests, server-derived tenant authorization, authenticated PDF/resource/evidence endpoints, parent verification and consent, secret rotation, webhook idempotency, private storage/signed URLs, usage budgets, backup/restore rehearsal, and monitoring. Netlify publication of the static site does not complete those backend gates.
