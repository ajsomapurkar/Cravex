/**
 * CRAVEX — process-lesson-plan Edge Function
 * Called from dashboard.html "Upload Doc (AI)" button on the Lesson Plan tab.
 * Teacher uploads the HOD-format lesson plan (.docx or .pdf) and this
 * extracts text, structures it with Gemini into JSON, and writes:
 *   - subject_profile   (upsert, one row per subject)
 *   - course_outcomes   (insert new CO codes not already defined)
 *   - lesson_plan_topics (insert, appended after existing topics)
 *   - co_po_mapping     (upsert per co_id + po_code)
 *
 * Mirrors process-pdf conventions: same auth gate, same CORS, same
 * jsonRes/sleep helpers, same secrets (PROCESS_PDF_SECRET, GEMINI_API_KEY).
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import mammoth from "npm:mammoth@1.6.0";

// ── CONSTANTS ────────────────────────────────────────────────────────────
const GEMINI_MODELS = [
  "gemini-2.0-flash-001",
  "gemini-1.5-flash",
];
const MAX_B64_BYTES = 14_000_000; // ~10 MB raw

// ── CORS HEADERS ─────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// PO codes on the standard NBA 3-point scale used in the HOD doc
const PO_CODES = ["PO1","PO2","PO3","PO4","PO5","PO6","PO7","PO8","PO9","PO10","PO11"];

// ── MAIN HANDLER ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Auth gate — same pattern as process-pdf
  const secret = Deno.env.get("PROCESS_PDF_SECRET");
  const supaAnon = Deno.env.get("SUPABASE_ANON_KEY");
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

  // ── PARSE REQUEST ────────────────────────────────────────────────────
  let body: any;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return jsonRes({ error: "Invalid JSON body" }, 400);
  }

  let { file_b64, file_name, mime_type, subject_id, college_id, uploaded_by } = body;
  if (!file_b64 || !file_name || !subject_id || !college_id) {
    return jsonRes({ error: "Missing required fields: file_b64, file_name, subject_id, college_id" }, 400);
  }
  if (file_b64.includes("base64,")) file_b64 = file_b64.split("base64,")[1];
  file_b64 = file_b64.trim();

  if (file_b64.length > MAX_B64_BYTES) {
    return jsonRes({ error: `File too large (~${Math.round(file_b64.length / 1_333_333)} MB). Max ~10 MB.` }, 413);
  }

  const isDocx = /\.docx$/i.test(file_name) || mime_type?.includes("wordprocessingml");
  const isPdf = /\.pdf$/i.test(file_name) || mime_type === "application/pdf";
  if (!isDocx && !isPdf) {
    return jsonRes({ error: "Only .docx or .pdf files are supported for lesson plan upload." }, 400);
  }

  console.log(`process-lesson-plan: ${file_name} | subject=${subject_id} | college=${college_id}`);

  try {
    const KEY = Deno.env.get("GEMINI_API_KEY")!;

    // ── STEP 1: EXTRACT RAW TEXT ────────────────────────────────────────
    let rawText: string | null = null;
    if (isDocx) {
      rawText = await extractDocxText(file_b64);
    } else {
      rawText = await extractWithGemini(file_b64, KEY);
    }

    if (!rawText || rawText.trim().length < 50) {
      return jsonRes({
        error: "Could not read text from that file. If it's a scanned PDF, re-export from Word instead."
      }, 422);
    }
    console.log(`process-lesson-plan: extracted ${rawText.length} chars`);

    // ── STEP 2: STRUCTURE WITH GEMINI ───────────────────────────────────
    const structured = await structureLessonPlan(rawText, KEY);
    if (!structured) {
      return jsonRes({ error: "AI could not structure this document into a lesson plan. Try a cleaner export." }, 422);
    }

    const profile = structured.subject_profile || {};
    const cos: any[] = Array.isArray(structured.course_outcomes) ? structured.course_outcomes : [];
    const topics: any[] = Array.isArray(structured.topics) ? structured.topics : [];
    const copo: any[] = Array.isArray(structured.co_po_mapping) ? structured.co_po_mapping : [];

    const by = uploaded_by || "Dashboard AI upload";
    const summary = { profile_saved: false, course_outcomes_added: 0, topics_added: 0, co_po_cells_saved: 0 };

    // ── STEP 3: UPSERT SUBJECT PROFILE ──────────────────────────────────
    if (Object.keys(profile).length) {
      const { error: profErr } = await d.from("subject_profile").upsert({
        college_id, subject_id,
        course_title: profile.course_title ?? null,
        ltps: profile.ltps ?? null,
        total_theory_hours: numOrNull(profile.total_theory_hours),
        total_lab_note: profile.total_lab_note ?? null,
        credits: numOrNull(profile.credits),
        cie_marks: numOrNull(profile.cie_marks),
        see_marks: numOrNull(profile.see_marks),
        total_marks: numOrNull(profile.total_marks),
        exam_hours: numOrNull(profile.exam_hours),
        assessment_tools: profile.assessment_tools ?? null,
        textbooks: Array.isArray(profile.textbooks) ? profile.textbooks : [],
        reference_books: Array.isArray(profile.reference_books) ? profile.reference_books : [],
        prerequisites: Array.isArray(profile.prerequisites) ? profile.prerequisites : [],
        clos: Array.isArray(profile.clos) ? profile.clos : [],
        course_coordinator: profile.course_coordinator ?? null,
        updated_by: by, updated_at: new Date().toISOString(),
      }, { onConflict: "subject_id" });
      if (profErr) console.warn("subject_profile upsert error:", profErr.message);
      else summary.profile_saved = true;
    }

    // ── STEP 4: INSERT NEW COURSE OUTCOMES (skip existing codes) ────────
    const { data: existingCos } = await d.from("course_outcomes").select("id,co_code").eq("subject_id", subject_id);
    const existingCodes = new Set((existingCos || []).map((c: any) => String(c.co_code).trim().toUpperCase()));
    const coCodeToId: Record<string, string> = {};
    (existingCos || []).forEach((c: any) => coCodeToId[String(c.co_code).trim().toUpperCase()] = c.id);

    let nextCoOrder = existingCos?.length || 0;
    const newCos = cos.filter(c => c.co_code && !existingCodes.has(String(c.co_code).trim().toUpperCase()));
    if (newCos.length) {
      const rows = newCos.map(c => ({
        college_id, subject_id,
        co_code: String(c.co_code).trim(),
        description: c.description || "",
        blooms_level: c.blooms_level || null,
        order_index: nextCoOrder++,
        created_by: by,
      }));
      const { data: inserted, error: coErr } = await d.from("course_outcomes").insert(rows).select("id,co_code");
      if (coErr) console.warn("course_outcomes insert error:", coErr.message);
      else {
        summary.course_outcomes_added = inserted?.length || 0;
        (inserted || []).forEach((c: any) => coCodeToId[String(c.co_code).trim().toUpperCase()] = c.id);
      }
    }

    // ── STEP 5: INSERT TOPICS (appended after existing) ─────────────────
    const { data: existingTopics } = await d.from("lesson_plan_topics").select("order_index").eq("subject_id", subject_id).eq("is_active", true);
    let nextOrder = existingTopics?.length ? Math.max(...existingTopics.map((t: any) => t.order_index)) + 1 : 0;
    const topicRows = topics
      .filter(t => t.topic_name && String(t.topic_name).trim())
      .map(t => ({
        college_id, subject_id,
        module_name: t.module_name || null,
        topic_name: String(t.topic_name).trim(),
        co_code: t.co_code || null,
        week_number: numOrNull(t.week_number),
        planned_hours: numOrNull(t.planned_hours),
        teaching_method: t.teaching_method || null,
        assessment: t.assessment || null,
        order_index: nextOrder++,
        created_by: by,
      }));
    if (topicRows.length) {
      const { error: topicErr } = await d.from("lesson_plan_topics").insert(topicRows);
      if (topicErr) console.warn("lesson_plan_topics insert error:", topicErr.message);
      else summary.topics_added = topicRows.length;
    }

    // ── STEP 6: UPSERT CO-PO MAPPING ─────────────────────────────────────
    const copoRows = copo
      .map(m => ({
        co_code: String(m.co_code || "").trim().toUpperCase() || null,
        co_id: coCodeToId[String(m.co_code || "").trim().toUpperCase()],
        po_code: PO_CODES.includes(m.po_code) ? m.po_code : null,
        level: [1, 2, 3].includes(Number(m.level)) ? Number(m.level) : null,
      }))
      .filter(m => m.co_id && m.po_code && m.level !== null)
      .map(m => ({ college_id, subject_id, co_code: m.co_code, co_id: m.co_id, po_code: m.po_code, level: m.level, updated_by: by, updated_at: new Date().toISOString() }));
    if (copoRows.length) {
      const { error: copoErr } = await d.from("co_po_mapping").upsert(copoRows, { onConflict: "co_id,po_code" });
      if (copoErr) console.warn("co_po_mapping upsert error:", copoErr.message);
      else summary.co_po_cells_saved = copoRows.length;
    }

    console.log("process-lesson-plan: SUCCESS", JSON.stringify(summary));
    return jsonRes({ success: true, ...summary });

  } catch (err) {
    console.error("process-lesson-plan fatal error:", err);
    return jsonRes({ error: "Processing failed: " + String(err) }, 500);
  }
});

// ── DOCX TEXT EXTRACTION (mammoth) ────────────────────────────────────────
async function extractDocxText(b64: string): Promise<string | null> {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const result = await mammoth.extractRawText({ buffer: bytes });
    return result?.value ?? null;
  } catch (e) {
    console.error("mammoth extraction failed:", String(e));
    return null;
  }
}

// ── PDF TEXT EXTRACTION (Gemini fallback, same as process-pdf) ───────────
async function extractWithGemini(pdf_b64: string, KEY: string): Promise<string | null> {
  for (const model of GEMINI_MODELS) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 45000);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: "application/pdf", data: pdf_b64 } },
              { text: "Extract ALL text from this PDF, preserving table structure and headings as best you can. Return raw text only." },
            ]}],
            generationConfig: { temperature: 0, maxOutputTokens: 8000 },
          }),
        }
      );
      clearTimeout(tid);
      if (!res.ok) { console.error(`Gemini PDF extract HTTP ${res.status} model=${model}`); continue; }
      const data = await res.json();
      const t = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (t && t.length > 50) return t;
    } catch (e) {
      console.error(`Gemini PDF extract failed model=${model}:`, String(e));
    }
  }
  return null;
}

// ── STRUCTURING: raw text → lesson plan JSON ──────────────────────────────
async function structureLessonPlan(rawText: string, KEY: string): Promise<any | null> {
  const prompt = `You are given the raw text of a VTU/NBA-style HOD lesson plan document (like an AICTE/VTU course file: subject header block, module-wise lesson plan tables, course outcomes, and a CO-PO mapping matrix).

Extract it into ONLY this JSON shape, nothing else — no markdown fences, no preamble:

{
  "subject_profile": {
    "course_title": string|null,
    "ltps": string|null,               // e.g. "3:0:2:0" (L:T:P:S teaching hours/week)
    "total_theory_hours": number|null, // theory hours only, e.g. 40
    "total_lab_note": string|null,     // e.g. "8-10 Lab Sessions" if mentioned
    "credits": number|null,
    "cie_marks": number|null,
    "see_marks": number|null,
    "total_marks": number|null,
    "exam_hours": number|null,
    "assessment_tools": string|null,   // free text describing marks breakup
    "textbooks": string[],             // one string per book, "Author, Title, Edition, Publisher, Year"
    "reference_books": string[],
    "prerequisites": string[],
    "clos": [{"code": "CLO1", "description": "..."}],
    "course_coordinator": string|null
  },
  "course_outcomes": [{"co_code": "CO1", "description": "...", "blooms_level": string|null}],
  "topics": [{
    "module_name": string|null,        // e.g. "Module 1: INTRODUCTION AND INTELLIGENT AGENTS"
    "topic_name": string,              // the "Topics Covered" text for that row/hour
    "week_number": number|null,
    "planned_hours": number|null,      // usually 1 per row/hour unless stated otherwise
    "teaching_method": string|null,    // from Activity column, e.g. "Chalk & Talk", "PPT", "Demo" — pick the one(s) marked/checked, else null
    "co_code": string|null,
    "assessment": string|null
  }],
  "co_po_mapping": [{"co_code": "CO1", "po_code": "PO1", "level": 1}]  // only include cells with a numeric level (1/2/3); skip '-' cells entirely
}

Rules:
- One "topics" entry per lesson-plan row (per Hour), in document order, grouped under the correct module_name.
- Do not invent data. If a field isn't in the document, use null (or [] for arrays).
- course_outcomes: use the CO list (e.g. "CO 1", "CO1"), normalize codes to "CO1" format (no space).
- co_po_mapping po_code must be one of PO1..PO11 exactly.
- Return valid JSON only.

DOCUMENT TEXT:
"""
${rawText.slice(0, 30000)}
"""`;

  for (const model of GEMINI_MODELS) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 55000);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 8192, responseMimeType: "application/json" },
          }),
        }
      );
      clearTimeout(tid);
      if (!res.ok) { console.error(`Gemini structuring HTTP ${res.status} model=${model}`); continue; }
      const data = await res.json();
      const t = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!t) continue;
      const cleaned = t.replace(/^```json\s*|^```\s*|```\s*$/g, "");
      try {
        return JSON.parse(cleaned);
      } catch (e) {
        console.error("JSON parse failed for structuring response:", String(e));
        continue;
      }
    } catch (e) {
      console.error(`Gemini structuring failed model=${model}:`, String(e));
    }
  }
  return null;
}

// ── HELPERS ────────────────────────────────────────────────────────────
function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// ── REQUIRED SETUP ───────────────────────────────────────────────────────
/*
1. Run lesson_plan_schema_v3.sql first (subject_profile, co_po_mapping, planned_date/remarks).
2. Deploy: supabase functions deploy process-lesson-plan
3. Secrets reused from process-pdf — no new secrets needed:
     PROCESS_PDF_SECRET, GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
*/
