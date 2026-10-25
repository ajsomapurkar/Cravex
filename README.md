# Cravex — connected Netlify + Supabase handoff

This package restores the dashboard's existing Supabase connection from `Cravex_Website_Supabase_Handoff_Complete.zip` while preserving the current landing-page design.

## What is included

- `website/` — Netlify publish directory. The landing page has a **Dashboard** button beside **Request pilot access**. The dashboard is available at `/dashboard` and `/pages/dashboard.html`.
- `website/pages/dashboard.html` — the cleaned dashboard implementation with the handoff's existing public Supabase project configuration restored. It calls the existing `send-otp` Edge Function. The old DevTools telemetry/context-menu blocking and browser-local authorization restoration were **not** copied back in.
- `supabase/` — backend/schema source kept outside the public publish folder.
- `documentation/` and `templates/` — the handoff manuals, audit notes, and spreadsheet templates.
- **Feature roadmap (F01–F21):** [CRAVEX Feature Spec Pack](documentation/feature-spec-pack/CRAVEX_FEATURE_SPEC_PACK/README.md) and [implementation tracker](documentation/FEATURE_IMPLEMENTATION_TRACKER.md).
- **Four college roles & permissions:** [Role model and permission matrix](documentation/ROLE_MODEL_AND_PERMISSION_MATRIX.md).
- **Dashboard redesign & functional spec:** [Detailed change specification](documentation/DASHBOARD_REDESIGN_AND_FUNCTIONAL_SPEC.md).
- **Role feature guides (zip bundle):** [documentation/features/](documentation/features/).
- `netlify.toml` — tells a Git-connected Netlify site to publish only `website/`.

## Connection status

The dashboard's project reference matches the Supabase project already connected to this session. That project currently has an active `send-otp` function (deployed version 12). The copied handoff snapshot of that function is older (version 9); **do not redeploy the snapshot over the active function just to publish the website**.

The dashboard route and its Supabase wiring are present. Actual WhatsApp OTP delivery still depends on the WhatsApp Business credentials configured in Supabase. If the currently configured Meta sender is blocked, OTP delivery will not work until the replacement sender credentials are added there. Do not put provider secrets in Netlify or browser code. Login is deliberately not restored from browser storage; users must authenticate again after a page reload until a proper server-issued session is implemented.

## Deploy

See [NETLIFY_DEPLOYMENT.md](NETLIFY_DEPLOYMENT.md). For Git import, keep the repository root as the Netlify base and let `netlify.toml` select `website/`. For drag-and-drop, upload only the contents of `website/`.

## Temporary security status — test data only

The dashboard uses a browser-visible **public anon key** and direct Supabase queries. The connected database currently has broad `anon` policies that permit unrestricted access on some academic/admin tables. You asked to defer hardening until the end of this build; this package leaves the database unchanged. **Use synthetic/test data only until the policies and authentication model are tightened.** See [TEMPORARY_SECURITY_STATUS.md](TEMPORARY_SECURITY_STATUS.md).

Do not run the included base schema or migrations against the live project as part of this Netlify deploy. The backend source is supplied for review; deploy database changes separately after review and backup.
