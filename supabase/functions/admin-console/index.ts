/**
 * CRAVEX — admin-console Edge Function (CRX-ADMIN-001)
 * Versioned institution configuration with audit trail.
 * Auth: Bearer session_token from send-otp verify (HMAC).
 */
import {
  canManageCollegeConfig,
  createServiceClient,
  verifySessionToken,
} from "../_shared/session.ts";

const ALLOWED_ORIGINS = new Set([
  "https://cravex.co.in",
  "https://www.cravex.co.in",
  "https://admin.cravex.co.in",
  ...(Deno.env.get("DASHBOARD_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean),
]);

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const h: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (ALLOWED_ORIGINS.has(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(body: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(req) },
  });
}

async function audit(
  db: ReturnType<typeof createServiceClient>,
  row: Record<string, unknown>,
) {
  await db.from("config_change_audit").insert(row);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, req);

  const secret = Deno.env.get("SESSION_SIGNING_SECRET") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s*/i, "");
  const db = createServiceClient();
  const session = await verifySessionToken(token, secret, db);
  if (!session) return json({ error: "Unauthorized" }, 401, req);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const action = String(body.action ?? "");
  const collegeId = String(body.college_id ?? session.user.college_id ?? "");
  if (!collegeId) return json({ error: "college_id required" }, 400, req);

  if (!canManageCollegeConfig(session.effectiveRole, session.user.college_id, collegeId)) {
    return json({ error: "Forbidden" }, 403, req);
  }

  const actor = {
    actor_user_id: session.user.id,
    actor_phone: session.user.phone_number,
    actor_role: session.effectiveRole,
    college_id: collegeId,
  };

  if (action === "list_entries") {
    const { data: entries, error } = await db
      .from("institution_config_entries")
      .select("id, college_id, namespace, config_key, description, published_version_id, updated_at")
      .eq("college_id", collegeId)
      .order("namespace")
      .order("config_key");

    if (error) return json({ error: error.message }, 500, req);

    const pubIds = (entries ?? []).map((e) => e.published_version_id).filter(Boolean);
    let publishedById: Record<string, unknown> = {};
    if (pubIds.length) {
      const { data: pubs } = await db
        .from("institution_config_versions")
        .select("id, version_number, status, value, effective_from, published_at")
        .in("id", pubIds);
      publishedById = Object.fromEntries((pubs ?? []).map((p) => [p.id, p]));
    }

    const enriched = (entries ?? []).map((e) => ({
      ...e,
      published: e.published_version_id ? publishedById[e.published_version_id] ?? null : null,
    }));

    await audit(db, { ...actor, action: "read", metadata: { scope: "list_entries" } });
    return json({ entries: enriched }, 200, req);
  }

  if (action === "list_audit") {
    const limit = Math.min(Number(body.limit ?? 50), 200);
    const { data, error } = await db
      .from("config_change_audit")
      .select("*")
      .eq("college_id", collegeId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return json({ error: error.message }, 500, req);
    return json({ audit: data ?? [] }, 200, req);
  }

  const namespace = String(body.namespace ?? "general");
  const configKey = String(body.config_key ?? "");
  if (!configKey) return json({ error: "config_key required" }, 400, req);

  if (action === "save_draft") {
    const value = body.value ?? {};
    const changeSummary = String(body.change_summary ?? "Draft update");

    let { data: entry } = await db
      .from("institution_config_entries")
      .select("id")
      .eq("college_id", collegeId)
      .eq("namespace", namespace)
      .eq("config_key", configKey)
      .maybeSingle();

    if (!entry) {
      const { data: created, error: createErr } = await db
        .from("institution_config_entries")
        .insert({
          college_id: collegeId,
          namespace,
          config_key: configKey,
          description: body.description ?? null,
        })
        .select("id")
        .single();
      if (createErr) return json({ error: createErr.message }, 500, req);
      entry = created;
      await audit(db, {
        ...actor,
        entry_id: entry.id,
        action: "create_draft",
        after_value: value,
        metadata: { namespace, config_key: configKey },
      });
    }

    const { data: verNum } = await db.rpc("next_config_version_number", {
      p_entry_id: entry!.id,
    });
    const versionNumber = verNum ?? 1;

    const { data: draft, error: draftErr } = await db
      .from("institution_config_versions")
      .insert({
        entry_id: entry!.id,
        version_number: versionNumber,
        status: "draft",
        value,
        change_summary: changeSummary,
        created_by: session.user.id,
      })
      .select("*")
      .single();

    if (draftErr) return json({ error: draftErr.message }, 500, req);

    await db.from("institution_config_entries").update({
      updated_at: new Date().toISOString(),
    }).eq("id", entry!.id);

    await audit(db, {
      ...actor,
      entry_id: entry!.id,
      version_id: draft.id,
      action: "update_draft",
      after_value: value,
      metadata: { version_number: versionNumber, change_summary: changeSummary },
    });

    return json({ draft }, 200, req);
  }

  if (action === "publish") {
    const versionId = String(body.version_id ?? "");
    if (!versionId) return json({ error: "version_id required" }, 400, req);

    const { data: version, error: vErr } = await db
      .from("institution_config_versions")
      .select("*, entry:institution_config_entries!inner(id, college_id, namespace, config_key)")
      .eq("id", versionId)
      .maybeSingle();

    if (vErr || !version) return json({ error: "Version not found" }, 404, req);
    if (version.entry.college_id !== collegeId) return json({ error: "Forbidden" }, 403, req);

    const now = new Date().toISOString();
    await db.from("institution_config_versions")
      .update({ status: "superseded" })
      .eq("entry_id", version.entry_id)
      .eq("status", "published");

    const { data: published, error: pubErr } = await db
      .from("institution_config_versions")
      .update({
        status: "published",
        published_at: now,
        published_by: session.user.id,
        effective_from: body.effective_from ?? now,
      })
      .eq("id", versionId)
      .select("*")
      .single();

    if (pubErr) return json({ error: pubErr.message }, 500, req);

    await db.from("institution_config_entries").update({
      published_version_id: versionId,
      updated_at: now,
    }).eq("id", version.entry_id);

    await audit(db, {
      ...actor,
      entry_id: version.entry_id,
      version_id: versionId,
      action: "publish",
      before_value: null,
      after_value: published.value,
      metadata: { namespace: version.entry.namespace, config_key: version.entry.config_key },
    });

    return json({ published }, 200, req);
  }

  return json({ error: "Unknown action" }, 400, req);
});
