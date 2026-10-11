/**
 * CRAVEX — send-otp Edge Function
 * POST { phone, role } → validates user exists → generates OTP → sends via WhatsApp
 * POST { phone, otp }  → verifies OTP → returns { valid: true, user: {...} }
 */
import { createClient } from "npm:@supabase/supabase-js@2";

// Allowed browser origins: production domains, optional DASHBOARD_ORIGINS env (comma-separated),
// and this site's own Netlify URL + its deploy previews (<hash>--chic-malasada-a53c0d.netlify.app).
// Not a blanket *.netlify.app wildcard.
const ALLOWED_ORIGINS = new Set([
  "https://cravex.co.in",
  "https://www.cravex.co.in",
  ...(Deno.env.get("DASHBOARD_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean),
]);
const NETLIFY_SITE_ORIGIN = /^https:\/\/(?:[a-z0-9-]+--)?chic-malasada-a53c0d\.netlify\.app$/;
const isAllowedOrigin = (origin: string) => ALLOWED_ORIGINS.has(origin) || NETLIFY_SITE_ORIGIN.test(origin);

// Phone ID is an identifier, not an access credential; keep a compatibility fallback
// while deployments migrate to the environment variable.
const PHONE_ID = Deno.env.get("PHONE_ID") ?? "1036694682867415";
// Prefer a dedicated signing secret; fall back to the service key for backward compatibility.
const SESSION_SIGNING_SECRET = Deno.env.get("SESSION_SIGNING_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const h: Record<string, string> = {
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  if (isAllowedOrigin(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

Deno.serve(async (req) => {
  // Per-request responder so CORS headers always reflect the caller's real origin.
  const res = (body: unknown, status = 200) => jsonRes(body, status, req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });

  const d = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
  const rateLimit = async (key: string, limit: number, windowMs: number): Promise<boolean> => {
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs).toISOString();
    const { data } = await d.from("rate_limits").select("message_count,window_start").eq("phone_number", key).maybeSingle();
    if (!data || data.window_start < windowStart) {
      await d.from("rate_limits").upsert({ phone_number: key, message_count: 1, window_start: now.toISOString(), last_message: now.toISOString() }, { onConflict: "phone_number" });
      return true;
    }
    if ((data.message_count ?? 0) >= limit) return false;
    await d.from("rate_limits").update({ message_count: data.message_count + 1, last_message: now.toISOString() }).eq("phone_number", key);
    return true;
  };

  let body: any;
  try { body = await req.json(); }
  catch { return res({ error: "Invalid JSON" }, 400); }

  const phone = (body.phone ?? "").toString().trim().replace(/\D/g, "");
  if (!phone || phone.length < 10) return res({ error: "Invalid phone" }, 400);

  // ── MODE 1: SEND OTP ─────────────────────────────────────────────────
  if (body.action === "send") {
    if (!PHONE_ID) return res({ error: "configuration_error" }, 503);
    const role = body.role ?? "";

    // Verify user exists with matching role
    const { data: user } = await d.from("users")
      .select("id, name, role, college_id")
      .eq("phone_number", phone)
      .maybeSingle();

    if (!user) return res({ error: "not_found" }, 404);

    // Check role matches
    const effectiveRole = (!user.college_id && user.role === "admin") ? "master" : user.role;
    if (role && effectiveRole !== role) return res({ error: "role_mismatch", effective: effectiveRole }, 403);

    // Rate limit both by phone and by the function-level key.
    if (!await rateLimit("otp_send:" + phone, 3, 10 * 60 * 1000)) return res({ error: "rate_limited" }, 429);
    const { count } = await d.from("auth_otps")
      .select("id", { count: "exact", head: true })
      .eq("phone_number", phone)
      .gt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
    if ((count ?? 0) >= 3) return res({ error: "rate_limited" }, 429);
    await d.from("auth_otps").delete().eq("phone_number", phone).lt("expires_at", new Date().toISOString());

    // Generate crypto-secure 6-digit OTP
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const otp = String(100000 + (arr[0] % 900000));

    // Store in DB with 5-min TTL
    await d.from("auth_otps").insert({
      phone_number: phone,
      otp_code: otp,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    // Send via WhatsApp
    const msg = `🔑 *Cravex Dashboard Login*\n\nYour verification code:\n\n*${otp}*\n\nExpires in 5 minutes. Do not share this code.\n— Cravex`;
    const waRes = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("WHATSAPP_ACCESS_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: msg },
      }),
    });

    if (!waRes.ok) {
      const err = await waRes.json().catch(() => ({}));
      console.error("WA send failed:", err);
      return res({ error: "whatsapp_failed", detail: err?.error?.message ?? "unknown" }, 500);
    }

    console.log(`OTP sent to ${phone.slice(0,6)}****`);
    return res({ sent: true, name: user.name });
  }

  // ── MODE 2: VERIFY OTP ────────────────────────────────────────────────
  if (body.action === "verify") {
    const otp = (body.otp ?? "").toString().trim();
    if (!otp || !/^\d{6}$/.test(otp)) return res({ error: "Invalid OTP format" }, 400);
    if (!await rateLimit("otp_verify:" + phone, 8, 10 * 60 * 1000)) return res({ valid: false, error: "rate_limited" }, 429);

    const now = new Date().toISOString();
    const { data: record } = await d.from("auth_otps")
      .select("id")
      .eq("phone_number", phone)
      .eq("otp_code", otp)
      .eq("verified", false)
      .gt("expires_at", now)
      .maybeSingle();

    if (!record) return res({ valid: false, error: "invalid_or_expired" }, 401);

    // Mark as used atomically; a concurrent replay must not receive a session.
    const { data: consumed, error: consumeError } = await d.from("auth_otps")
      .update({ verified: true })
      .eq("id", record.id)
      .eq("verified", false)
      .select("id")
      .maybeSingle();
    if (consumeError || !consumed) return res({ valid: false, error: "invalid_or_expired" }, 401);

    // Return full user record for the dashboard session
    const { data: user } = await d.from("users")
      .select("*")
      .eq("phone_number", phone)
      .maybeSingle();

    if (!user || !SESSION_SIGNING_SECRET) return res({ valid: false, error: "configuration_error" }, 503);
    const session_token = await signSession({
      sub: user.id,
      role: (!user.college_id && user.role === "admin") ? "master" : user.role,
      college_id: user.college_id ?? null,
      exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60,
    }, SESSION_SIGNING_SECRET);
    console.log(`OTP verified for ${phone.slice(0,6)}****`);
    return res({ valid: true, user, session_token });
  }

  return res({ error: "Missing action field. Use action: 'send' or 'verify'" }, 400);
});

async function signSession(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encode = (value: string) => btoa(value).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const body = encode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const signature = encode(String.fromCharCode(...new Uint8Array(mac)));
  return `${body}.${signature}`;
}

function jsonRes(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}
