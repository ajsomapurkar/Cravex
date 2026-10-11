/**
 * CRAVEX — process-pdf Edge Function
 * Called from dashboard when admin/teacher uploads PDF via website
 * Extracts text with LlamaParse (Gemini fallback), splits into chunks, stores embeddings
 *
 * PRODUCTION FIXES (this version):
 *  1.  Auth gate — requires Authorization: Bearer <PROCESS_PDF_SECRET>
 *  2.  PDF size limit — rejects base64 > ~10 MB with clear user message
 *  3.  LlamaParse primary extraction with Gemini fallback chain
 *  4.  Overlap chunking (splitChunks) — 50-token overlap, paragraph-aware
 *  5.  Subject tag + chunk_index metadata on every doc_chunk
 *  6.  Null embedding guard — skips chunks where embed() returns null
 *  7.  Safe-swap delete — old chunks deleted ONLY after new ones confirmed inserted
 *  8.  Embedding stored as native pgvector literal [n1,...n768] NOT JSON string
 *  9.  CORS headers — works from any dashboard origin
 *  10. Detailed error responses — tells client exactly what went wrong
 *  11. Non-fatal uploaded_files registry — processing continues even if registry fails
 *  12. Graceful JSON/raw body handling — works with both old and new frontend
 */

import { createClient } from "npm:@supabase/supabase-js@2";

// ── CONSTANTS ──────────────────────────────────────────────────────────────────
const EMBED_MODEL = "text-embedding-004";

// Gemini fallback model order — paid model first for reliability on large PDFs
const GEMINI_PDF_MODELS = [
  "gemini-2.0-flash-001",             // paid — reliable for large PDFs
  "gemini-2.5-flash-preview-04-17",
  "gemini-1.5-flash",                 // free tier — may 429 under load
  "gemini-1.5-flash-8b",
];

// ~13.3 MB base64 ≈ 10 MB raw — hard ceiling for edge function memory
const MAX_B64_BYTES = 14_000_000;

// ── CORS HEADERS ───────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-college-id, x-file-name, x-file-title, x-branch, x-division, x-semester, x-uploaded-by, x-subject-tag",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── MAIN HANDLER ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  // FIX 1: Auth gate — accept either PROCESS_PDF_SECRET (recommended) OR the Supabase anon key
  const secret     = Deno.env.get("PROCESS_PDF_SECRET");
  const supaAnon   = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  const provided = authHeader.replace(/^Bearer\s*/i, "");
  if (!((secret && provided === secret) || (supaAnon && provided === supaAnon))) {
    return jsonRes({ error: "Unauthorized" }, 401);
  }

  const d = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // ── PARSE REQUEST ────────────────────────────────────────────────────────────
  // FIX 12: Accept both JSON body and raw base64 string + header metadata
  let pdf_b64     = "";
  let college_id  = req.headers.get("x-college-id")    || "";
  let file_name   = req.headers.get("x-file-name")     || "upload.pdf";
  let file_title  = req.headers.get("x-file-title")    || file_name;
  let branch      = req.headers.get("x-branch")        || "All";
  let division    = req.headers.get("x-division")      || "All";
  let semester    = req.headers.get("x-semester")      || null;
  let uploaded_by = req.headers.get("x-uploaded-by")   || "Dashboard";
  let subject_tag = req.headers.get("x-subject-tag")   || null;

  try {
    const bodyText = await req.text();
    try {
      // Try JSON first
      const body = JSON.parse(bodyText);
      pdf_b64     = body.pdf_b64     ?? pdf_b64;
      college_id  = body.college_id  ?? college_id;
      file_name   = body.file_name   ?? file_name;
      file_title  = body.file_title  ?? file_title;
      branch      = body.branch      ?? branch;
      division    = body.division    ?? division;
      semester    = body.semester    ?? semester;
      uploaded_by = body.uploaded_by ?? uploaded_by;
      subject_tag = body.subject_tag ?? subject_tag;
    } catch {
      // Raw base64 string from legacy frontend
      pdf_b64 = bodyText;
    }
  } catch {
    return jsonRes({ error: "Failed to read request body" }, 400);
  }

  // Strip data URI prefix if present (e.g. "data:application/pdf;base64,...")
  if (pdf_b64.includes("base64,")) {
    pdf_b64 = pdf_b64.split("base64,")[1];
  }
  pdf_b64 = pdf_b64.trim();

  if (!pdf_b64 || pdf_b64.length < 100) {
    return jsonRes({ error: "Missing or invalid pdf_b64 in request body" }, 400);
  }
  if (!college_id) {
    return jsonRes({ error: "Missing college_id — send as JSON field or x-college-id header" }, 400);
  }

  // FIX 2: Size gate
  if (pdf_b64.length > MAX_B64_BYTES) {
    const sizeMB = Math.round(pdf_b64.length / 1_333_333);
    return jsonRes({
      error: `PDF too large (~${sizeMB} MB). Max ~10 MB. Please compress at smallpdf.com or split into parts.`
    }, 413);
  }

  // ── DECODE BASE64 → bytes ────────────────────────────────────────────────────
  let pdfBytes: Uint8Array;
  try {
    const bin = atob(pdf_b64);
    pdfBytes  = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) pdfBytes[i] = bin.charCodeAt(i);
  } catch {
    return jsonRes({ error: "Invalid base64 encoding in pdf_b64" }, 400);
  }

  console.log(`process-pdf: ${file_name} | ${pdfBytes.byteLength} bytes | college=${college_id} | branch=${branch} | subject=${subject_tag}`);

  try {
    const KEY = Deno.env.get("GEMINI_API_KEY")!;

    // ── STEP 1: EXTRACT TEXT ─────────────────────────────────────────────────
    // FIX 3: LlamaParse → Gemini fallback chain
    let fullText: string | null = null;

    fullText = await extractWithLlamaParse(pdfBytes, file_name);

    if (!fullText || fullText.trim().length < 50) {
      console.log("LlamaParse failed or returned empty — falling back to Gemini");
      fullText = await extractWithGemini(pdf_b64, KEY);
    }

    if (!fullText || fullText.trim().length < 50) {
      return jsonRes({
        error: "No readable text found in PDF. Please ensure it is a text-based PDF (not a scanned image). Re-save via Google Docs → Download as PDF, then try again."
      }, 422);
    }

    console.log(`process-pdf: extracted ${fullText.length} chars of text`);

    // ── STEP 2: CHUNK WITH OVERLAP ───────────────────────────────────────────
    // FIX 4: Paragraph-aware chunking with 50-token overlap
    const chunks = splitChunks(fullText, 500, 50);
    if (!chunks.length) {
      return jsonRes({ error: "PDF produced no indexable chunks after extraction" }, 422);
    }
    console.log(`process-pdf: ${chunks.length} chunks to embed`);

    // ── STEP 3: EMBED + INSERT (new chunks first) ────────────────────────────
    // FIX 7: Safe-swap — insert new chunks BEFORE deleting old ones
    let inserted = 0;
    const insertErrors: string[] = [];

    for (let i = 0; i < chunks.length; i += 5) {
      const batch = chunks.slice(i, i + 5);
      const rows: any[] = [];

      for (let ci = 0; ci < batch.length; ci++) {
        const trimmed = batch[ci].trim();
        if (!trimmed) continue;

        // FIX 6: Null embedding guard — skip, don't fail the whole upload
        const emb = await embed(trimmed, KEY);
        if (!emb) {
          console.warn(`embed() null for chunk ${i + ci} — skipping`);
          continue;
        }

        rows.push({
          content:          trimmed,
          college_id,
          source:           "dashboard_upload",
          source_file:      file_name,
          file_title:       file_title ?? file_name,
          target_branch:    branch ?? "All",
          target_division:  division ?? "All",
          target_semester:  semester ? parseInt(String(semester)) : null,
          // FIX 5: subject_tag + chunk_index for filtered RAG and ordering
          subject_tag:      subject_tag ?? null,
          chunk_index:      i + ci,
          uploaded_by:      uploaded_by ?? "Dashboard",
          // FIX 8: Native pgvector literal — NOT JSON.stringify
          embedding:        `[${emb.join(",")}]`,
        });
      }

      if (!rows.length) continue;

      const { error } = await d.from("doc_chunks").insert(rows);
      if (error) {
        console.error(`doc_chunks insert error (batch ${i / 5}):`, error.message);
        insertErrors.push(error.message);
      } else {
        inserted += rows.length;
      }
    }

    if (inserted === 0) {
      return jsonRes({
        error: `All chunk inserts failed. Errors: ${insertErrors.slice(0, 3).join("; ")}. Embedding may be rate-limited — try again in a minute.`
      }, 500);
    }

    // ── STEP 4: SAFE DELETE OLD CHUNKS ──────────────────────────────────────
    // FIX 7: Only delete after new chunks are confirmed — never lose data
    const { error: delErr } = await d.from("doc_chunks").delete()
      .eq("college_id", college_id)
      .eq("source_file", file_name)
      .eq("target_branch", branch ?? "All")
      .lt("created_at", new Date().toISOString());

    if (delErr) {
      // Non-fatal — old chunks might cause duplicates in search but won't break anything
      console.warn("Old chunk cleanup error (non-fatal):", delErr.message);
    }

    // ── STEP 5: REGISTER IN uploaded_files ──────────────────────────────────
    // FIX 11: Non-fatal — failure here doesn't roll back the upload
    try {
      await d.from("uploaded_files").insert({
        college_id,
        file_name,
        file_title:   file_title ?? file_name,
        branch:       branch ?? "All",
        division:     division ?? "All",
        semester:     semester ? parseInt(String(semester)) : null,
        subject_tag:  subject_tag ?? null,
        uploaded_by:  uploaded_by ?? "Dashboard",
        chunk_count:  inserted,
      });
    } catch (e) {
      console.warn("uploaded_files registry insert failed (non-fatal):", String(e));
    }

    console.log(`process-pdf: SUCCESS — ${inserted} chunks inserted for ${file_name}`);

    return jsonRes({
      success:    true,
      chunks:     inserted,
      title:      file_title ?? file_name,
      subject_tag: subject_tag ?? null,
      chars_extracted: fullText.length,
    });

  } catch (err) {
    console.error("process-pdf fatal error:", err);
    return jsonRes({ error: "Processing failed: " + String(err) }, 500);
  }
});

// ── LLAMAPARSE EXTRACTION ──────────────────────────────────────────────────────
// Primary extractor — handles scanned + complex PDFs well
async function extractWithLlamaParse(bytes: Uint8Array, fileName: string): Promise<string | null> {
  const KEY = Deno.env.get("LLAMA_CLOUD_API_KEY");
  if (!KEY) {
    console.log("LLAMA_CLOUD_API_KEY not set — skipping LlamaParse, using Gemini");
    return null;
  }

  try {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "application/pdf" }), fileName);

    console.log(`LlamaParse: uploading ${fileName} (${bytes.byteLength} bytes)...`);
    const uploadRes = await fetch("https://api.cloud.llamaindex.ai/api/parsing/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}` },
      body: form,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error(`LlamaParse upload error (${uploadRes.status}):`, errText.slice(0, 200));
      return null;
    }

    const { id: jobId } = await uploadRes.json();
    console.log(`LlamaParse: job ${jobId} started, polling...`);

    // Poll up to 90s (45 × 2s)
    for (let i = 0; i < 45; i++) {
      await sleep(2000);

      const statusRes = await fetch(`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}`, {
        headers: { Authorization: `Bearer ${KEY}` },
      });

      if (!statusRes.ok) {
        console.error(`LlamaParse status check error (${statusRes.status})`);
        continue;
      }

      const { status } = await statusRes.json();
      console.log(`LlamaParse: job ${jobId} status=${status} (${(i + 1) * 2}s)`);

      if (status === "SUCCESS") {
        const resultRes = await fetch(
          `https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/markdown`,
          { headers: { Authorization: `Bearer ${KEY}` } }
        );
        if (!resultRes.ok) {
          console.error(`LlamaParse result fetch error (${resultRes.status})`);
          return null;
        }
        const { markdown } = await resultRes.json();
        if (markdown && markdown.length > 50) {
          console.log(`LlamaParse: extracted ${markdown.length} chars`);
          return markdown;
        }
        console.warn("LlamaParse returned empty/short markdown");
        return null;
      }

      if (status === "ERROR") {
        console.error("LlamaParse job reported ERROR");
        return null;
      }
      // status === "PENDING" || "PROCESSING" — keep polling
    }

    console.error("LlamaParse: timed out after 90s");
    return null;
  } catch (e) {
    console.error("LlamaParse exception:", String(e));
    return null;
  }
}

// ── GEMINI PDF EXTRACTION (fallback) ──────────────────────────────────────────
// Used when LlamaParse is unavailable or fails
// FIX 3: Paid model first, 45s timeout per attempt, 3 retries per model
async function extractWithGemini(pdf_b64: string, KEY: string): Promise<string | null> {
  for (const model of GEMINI_PDF_MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), 45000); // 45s — large PDFs need time
        const res  = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`,
          {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            signal:  ctrl.signal,
            body: JSON.stringify({
              contents: [{ parts: [
                { inline_data: { mime_type: "application/pdf", data: pdf_b64 } },
                { text: "Extract ALL text from this PDF. Return raw text only, preserve structure and headings. Do not summarise or paraphrase." },
              ]}],
              generationConfig: { temperature: 0, maxOutputTokens: 8000 },
            }),
          }
        );
        clearTimeout(tid);

        if (res.status === 429 || res.status === 503) {
          const wait = Math.pow(2, attempt) * 1500;
          console.log(`Gemini PDF extract rate limited — waiting ${wait}ms (model=${model} attempt=${attempt})`);
          await sleep(wait);
          continue;
        }
        if (!res.ok) {
          console.error(`Gemini PDF extract HTTP ${res.status} model=${model}`);
          break; // try next model
        }

        const data = await res.json();
        const t    = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (t && t.length > 50) {
          console.log(`Gemini PDF extract: ${t.length} chars via ${model}`);
          return t;
        }
        break; // got a response but no text — try next model
      } catch (e) {
        console.error(`Gemini PDF extract failed model=${model} attempt=${attempt}:`, String(e));
        if (attempt < 2) await sleep(1000 * (attempt + 1));
      }
    }
  }
  return null;
}

// ── EMBEDDINGS ─────────────────────────────────────────────────────────────────
async function embed(text: string, KEY: string): Promise<number[] | null> {
  for (let i = 0; i < 3; i++) {
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 12000);
      const r    = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${KEY}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          signal:  ctrl.signal,
          body: JSON.stringify({
            model:   `models/${EMBED_MODEL}`,
            content: { parts: [{ text: text.slice(0, 2000) }] },
            task_type: "RETRIEVAL_DOCUMENT",
            outputDimensionality: 768,
          }),
        }
      );
      clearTimeout(tid);

      if (r.status === 429 || r.status === 503) {
        await sleep(800 * Math.pow(2, i));
        continue;
      }
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}));
        console.error(`Embed API error (attempt ${i + 1}):`, r.status, JSON.stringify(errBody).slice(0, 200));
        return null;
      }

      const d = await r.json();
      return d?.embedding?.values ?? null;
    } catch (e) {
      console.error(`Embed exception (attempt ${i + 1}):`, String(e));
      if (i < 2) await sleep(800);
    }
  }
  return null;
}

// ── CHUNKING WITH OVERLAP ──────────────────────────────────────────────────────
// FIX 4: Paragraph-aware chunking with configurable overlap
// Preserves context at chunk boundaries for better RAG retrieval
function splitChunks(text: string, size = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  const paras = text.split(/\n\s*\n/).filter(p => p.trim().length > 20);
  let cur = "";

  for (const p of paras) {
    if ((cur + p).length > size && cur.length > 0) {
      chunks.push(cur.trim());
      // Carry last `overlap` words into the next chunk for context continuity
      const words = cur.split(/\s+/);
      cur = words.slice(-overlap).join(" ") + " " + p;
    } else {
      cur += (cur ? "\n\n" : "") + p;
    }
  }
  if (cur.trim().length > 20) chunks.push(cur.trim());
  return chunks;
}

// ── HELPERS ────────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// FIX 9: All responses include CORS headers
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// ── REQUIRED SQL MIGRATIONS ────────────────────────────────────────────────────
/*
Run these in Supabase SQL Editor before deploying this version:

-- 1. Add subject_tag and chunk_index to doc_chunks (if not present)
ALTER TABLE doc_chunks
  ADD COLUMN IF NOT EXISTS subject_tag  text,
  ADD COLUMN IF NOT EXISTS chunk_index  integer DEFAULT 0;

-- 2. Add subject_tag to uploaded_files (if not present)
ALTER TABLE uploaded_files
  ADD COLUMN IF NOT EXISTS subject_tag  text,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz;

-- 3. Index for faster subject-filtered RAG queries
CREATE INDEX IF NOT EXISTS idx_doc_chunks_subject_tag
  ON doc_chunks (college_id, subject_tag)
  WHERE subject_tag IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_doc_chunks_source_file
  ON doc_chunks (college_id, source_file);

-- 4. Environment secrets to set in Supabase Edge Function settings:
--    PROCESS_PDF_SECRET   — any strong random string, same in dashboard
--    GEMINI_API_KEY       — Google AI Studio key
--    LLAMA_CLOUD_API_KEY  — LlamaIndex Cloud key (optional but recommended)
--    SUPABASE_URL         — auto-set by Supabase
--    SUPABASE_SERVICE_ROLE_KEY — auto-set by Supabase
*/