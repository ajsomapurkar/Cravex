import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export type SessionClaims = {
  sub: string;
  role: string;
  college_id: string | null;
  exp: number;
};

export type SessionUser = {
  id: string;
  phone_number: string;
  name: string;
  role: string;
  college_id: string | null;
  is_active?: boolean;
  department_id?: string | null;
  department_code?: string | null;
};

function b64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function effectiveDashboardRole(user: SessionUser): string {
  if (!user.college_id && user.role === "admin") return "master";
  return user.role;
}

export async function verifySessionToken(
  token: string,
  secret: string,
  db: SupabaseClient,
): Promise<{ claims: SessionClaims; user: SessionUser; effectiveRole: string } | null> {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  if (!constantTimeEqual(expected, b64urlDecode(signature))) return null;

  let claims: SessionClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch {
    return null;
  }
  if (!claims.sub || !claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  const { data: user } = await db
    .from("users")
    .select("id,phone_number,name,role,college_id,is_active,department_id,department_code")
    .eq("id", claims.sub)
    .eq("is_active", true)
    .maybeSingle();

  if (!user) return null;
  const effectiveRole = effectiveDashboardRole(user as SessionUser);
  return { claims, user: user as SessionUser, effectiveRole };
}

export function canManageCollegeConfig(
  effectiveRole: string,
  userCollegeId: string | null,
  targetCollegeId: string,
): boolean {
  if (effectiveRole === "master") return true;
  if (!userCollegeId || userCollegeId !== targetCollegeId) return false;
  return ["college_admin", "principal"].includes(effectiveRole);
}

export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}
