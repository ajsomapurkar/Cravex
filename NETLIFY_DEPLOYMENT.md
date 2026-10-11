# Netlify deployment

## Git-connected site

1. Push or import this package's repository to Netlify.
2. Use the repository root as the base directory. The included `netlify.toml` sets the publish directory to `website/`; no build command is required.
3. Deploy a preview, then verify `/`, `/dashboard`, `/pages/dashboard.html`, `/privacy`, and `/terms`.
4. Keep `supabase/` and `documentation/` outside the publish directory. Do not change the publish directory to the repository root.

## Netlify Drop

1. Extract the ZIP.
2. Upload **the contents of `website/` only** to Netlify Drop. Do not upload the repository root or the whole ZIP as a publish directory.
3. Attach the Cravex custom domain and verify `/dashboard` after DNS/HTTPS is active.

## Admin subdomain (`admin.cravex.co.in`)

1. In **Netlify → Domain management**, add `admin.cravex.co.in` as a **domain alias** on the same site as `cravex.co.in` (not a separate site).
2. At your DNS host, add a **CNAME** record: `admin` → your Netlify site subdomain (for example `chic-malasada-a53c0d.netlify.app`) or use Netlify DNS if the apex is delegated there.
3. Wait for HTTPS provisioning, then open `https://admin.cravex.co.in/` — it should serve the staff dashboard (`netlify.toml` and `_redirects` rewrite to `/pages/dashboard.html`).
4. In **Supabase → Edge Functions → secrets**, set or extend `DASHBOARD_ORIGINS` to include `https://admin.cravex.co.in` (comma-separated with production origins).
5. Redeploy **`send-otp`** and **`admin-console`** after pulling the latest function sources from this repository.

Do not store Netlify or Supabase passwords in the repository. Use Netlify CLI login or a personal access token locally.

## Dashboard and OTP checks

- `/dashboard` is a Netlify rewrite to `/pages/dashboard.html`.
- The dashboard calls the existing Supabase `send-otp` function. Production CORS includes `https://cravex.co.in`, `https://www.cravex.co.in`, and `https://admin.cravex.co.in`; Netlify deploy-preview domains are not on the allowlist unless you add each preview origin to `DASHBOARD_ORIGINS` (do not use `*`).
- OTP delivery needs valid WhatsApp Business credentials stored as Supabase function secrets. If the old Meta sender is blocked, the page can load but OTP will fail until the fresh sender credentials are configured in Supabase.
- The page does not persist authorization in browser storage; a user needs to authenticate again after reload until a server-issued session is wired.
- Never put the Supabase service-role key, WhatsApp access token, Gemini/Groq/OpenRouter key, or other backend secret into Netlify browser variables or website files.

## Supabase boundary

This ZIP does not deploy SQL or Edge Functions and does not change the live database. The active `send-otp` function is version 12; the source snapshot in `supabase/deployed-functions/` is older. Do not redeploy it automatically. Review the security status before importing real student records.
