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

## Dashboard and OTP checks

- `/dashboard` is a Netlify rewrite to `/pages/dashboard.html`.
- The dashboard calls the existing Supabase `send-otp` function. That function's current CORS allowlist is for `https://cravex.co.in` and `https://www.cravex.co.in`; Netlify deploy-preview domains are not on the allowlist. Test OTP on the custom domain, or deliberately add the exact preview origin to the function's allowlist (do not use `*`).
- OTP delivery needs valid WhatsApp Business credentials stored as Supabase function secrets. If the old Meta sender is blocked, the page can load but OTP will fail until the fresh sender credentials are configured in Supabase.
- The page does not persist authorization in browser storage; a user needs to authenticate again after reload until a server-issued session is wired.
- Never put the Supabase service-role key, WhatsApp access token, Gemini/Groq/OpenRouter key, or other backend secret into Netlify browser variables or website files.

## Supabase boundary

This ZIP does not deploy SQL or Edge Functions and does not change the live database. The active `send-otp` function is version 12; the source snapshot in `supabase/deployed-functions/` is older. Do not redeploy it automatically. Review the security status before importing real student records.
