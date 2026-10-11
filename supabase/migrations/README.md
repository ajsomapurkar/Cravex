# Supabase migrations

Apply in order on **staging/dev** before production.

## Phase 1 — Principal + Admin Console

```bash
# After reconciling with remote migration history (see CRAVEX_BUILD_PLAN_SAFE_CHANGE_STRATEGY.md)
supabase db push   # or apply SQL manually in SQL editor
```

Files:

- `20261011120000_principal_admin_config.sql` — `principal` role, `institution_config_*`, `config_change_audit`, RLS deny-by-default on config tables
- `20261011120100_p0_anon_remediation_template.sql` — **gated** P0 anon policy removal (run only after dashboard auth proxy tests)

## Edge Functions

Deploy from `supabase/functions/`:

- `admin-console` — configuration API (requires migration above)
- Update `send-otp` CORS for `admin.cravex.co.in`

Set `SESSION_SIGNING_SECRET` in Supabase secrets (recommended); functions fall back to service role key only for backward compatibility during rollout.
