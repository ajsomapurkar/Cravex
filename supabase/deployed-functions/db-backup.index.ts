/**
 * CRAVEX — Automated DB Backup v2
 * Triggered nightly at 2am via pg_cron + pg_net
 * Exports all critical tables as JSON to private storage bucket: cravex-backups/daily/
 * Keeps 30 days, auto-deletes older files
 * Trigger: x-cron-trigger: true header (no JWT needed — bucket is private)
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "cravex-backups";
const KEEP_DAYS = 30;

const BACKUP_TABLES = [
  "colleges",
  "users",
  "students",
  "subjects",
  "subject_assignments",
  "attendance_sessions",
  "attendance_logs",
  "attendance_records",
  "student_marks",
  "parent_contacts",
  "announcements",
  "uploaded_files",
  "doc_chunks",
  "voice_logs",
  "smart_notices",
  "ai_alerts",
];

Deno.serve(async (req) => {
  // Accept: cron trigger header OR manual call with correct secret
  const isCron = req.headers.get("x-cron-trigger") === "true";
  const secret = req.headers.get("x-backup-secret");
  const expectedSecret = Deno.env.get("BACKUP_SECRET") ?? "cravex-backup-2026";
  const isManual = secret === expectedSecret;

  if (!isCron && !isManual) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const d = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const results: Record<string, any> = {};
  const errors: string[] = [];

  console.log(`[backup] Starting — ${dateStr}`);

  // Export each table
  for (const table of BACKUP_TABLES) {
    try {
      const { data, error } = await d.from(table).select("*");
      if (error) {
        errors.push(`${table}: ${error.message}`);
        console.error(`[backup] ${table} failed:`, error.message);
        continue;
      }
      results[table] = data ?? [];
      console.log(`[backup] ${table}: ${data?.length ?? 0} rows`);
    } catch (e) {
      errors.push(`${table}: ${String(e)}`);
    }
  }

  // Build payload
  const totalRows = Object.values(results)
    .reduce((s: number, v: any) => s + (Array.isArray(v) ? v.length : 0), 0);

  const backup = {
    version: "2.0",
    created_at: now.toISOString(),
    project: "gkuzoywsftjxnxzlufiy",
    tables_backed_up: Object.keys(results).length,
    total_rows: totalRows,
    row_counts: Object.fromEntries(
      Object.entries(results).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
    ),
    errors: errors.length > 0 ? errors : null,
    data: results,
  };

  const payload = JSON.stringify(backup);
  const filePath = `daily/backup_${timestamp}.json`;
  const sizeKB = (payload.length / 1024).toFixed(1);

  // Upload to private bucket
  const { error: uploadErr } = await d.storage
    .from(BUCKET)
    .upload(filePath, payload, { contentType: "application/json", upsert: true });

  if (uploadErr) {
    console.error(`[backup] Upload failed:`, uploadErr.message);
    return new Response(
      JSON.stringify({ success: false, error: uploadErr.message }),
      { status: 500 }
    );
  }

  console.log(`[backup] Saved: ${filePath} (${sizeKB} KB, ${totalRows} rows)`);

  // Delete backups older than KEEP_DAYS
  try {
    const { data: files } = await d.storage.from(BUCKET).list("daily", {
      limit: 200,
      sortBy: { column: "created_at", order: "asc" },
    });
    if (files && files.length > 0) {
      const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000);
      const toDelete = files
        .filter(f => f.created_at && new Date(f.created_at) < cutoff)
        .map(f => `daily/${f.name}`);
      if (toDelete.length > 0) {
        await d.storage.from(BUCKET).remove(toDelete);
        console.log(`[backup] Deleted ${toDelete.length} old files`);
      }
    }
  } catch (e) {
    console.error("[backup] Cleanup error:", String(e));
  }

  return new Response(JSON.stringify({
    success: true,
    file: filePath,
    tables: Object.keys(results).length,
    total_rows: totalRows,
    size_kb: sizeKB,
    errors: errors.length > 0 ? errors : null,
  }), { status: 200 });
});

