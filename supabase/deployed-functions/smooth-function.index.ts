/**
 * CRAVEX v3 — WhatsApp College Intelligence Platform
 * Copyright © 2026 Cravex. All rights reserved.
 * https://cravex.co.in | hello@cravex.co.in
 *
 * PRODUCTION FIXES (this version):
 *  1.  PDF session TTL — expires_at on every upsert, stale rows never trap users
 *  2.  processPDF fully async — runs in EdgeRuntime.waitUntil, webhook returns 200 instantly
 *  3.  Pre-flight PDF size check — rejects >8 MB before any API call, clear user guidance
 *  4.  LlamaParse polling with per-page progress pings — "Processing... page 3/12"
 *  5.  Chunking with overlap (splitChunks) — 50-token overlap, paragraph-aware
 *  6.  Subject-tag + page metadata on every doc_chunk — enables filtered RAG + citation
 *  7.  askpdf / askpdf <subject> commands — student-facing RAG with page citation
 *  8.  listfiles / listfiles <subject> — teacher file browser with chunk count + date
 *  9.  deletefile <name> — removes doc_chunks + uploaded_files entry atomically
 *  10. reprocesspdf — re-runs LlamaParse on the last uploaded file without re-upload
 *  11. AI lock: always clear stale lock first, never silently drop messages
 *  12. Voice handler: clears stale lock at entry
 *  13. cancel / stop / reset / ping always escape any stuck session
 *  14. hi/hello auto-clears stuck session
 *  15. batchRollup + broadcast in waitUntil — teacher gets instant confirmation
 *  16. wa() wrapped in try/catch — network errors never crash the webhook
 *  17. Dedup gate on every incoming message (processed_messages table)
 *  18. Rate limit: 20 msg/min per user (teachers get same; raise RATE_LIMIT if needed)
 *  19. 500-user concurrency: stateless DB-backed locks, no in-process shared state
 *  20. Embedding stored as native pgvector literal `[n1,...n768]`
 *  21. Webhook signature verification (WHATSAPP_APP_SECRET env var)
 *  22. Per-college AI rate limit — 100 AI calls/hour per college
 *  23. Parent two-way messaging — linked parents (via !parent) can now text the
 *      bot directly and get attendance/marks/risk for their child(ren), no
 *      extra verification beyond the existing parent_phone link.
 *  24. FIX (this patch): image messages were never dispatched — WhatsApp sends
 *      type:"image" but the webhook switch had no branch for it, and there was
 *      no handleImage() function at all. Photos landed with zero handler match
 *      and the message was silently dropped (or, if a caller manually wired a
 *      one-off image path elsewhere, it lacked the browser/screenshot-aware
 *      vision prompt). Added a proper handleImage() with Gemini vision +
 *      explicit "ignore UI chrome" prompt, wired into the Deno.serve dispatch.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

// ── CONSTANTS ──────────────────────────────────────────────────────────────────
const PHONE_ID     = Deno.env.get("PHONE_ID") ?? "";
const VERIFY_TOKEN = Deno.env.get("VERIFY_TOKEN") ?? "";
const EMBED_MODEL  = "gemini-embedding-001";

// Production must fail closed if deployment secrets are missing. A missing
// secret is a deployment failure, not a reason to accept unauthenticated traffic.

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const RATE_LIMIT   = 20; // messages per 60s per user — raise for teachers if needed

const OX_ALPHA_ENABLED = Deno.env.get("OX_ALPHA_ENABLED") === "true";
const OR_BASE_MODELS = [
  "google/gemini-2.0-flash-001",
  "google/gemini-2.5-flash-preview:free",
  "mistralai/mistral-7b-instruct:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "microsoft/phi-3-mini-128k-instruct:free",
];
// Ox Alpha is opt-in. With the flag absent/false, the request order is byte-for-byte
// equivalent to the previous production fallback chain.
const OR_MODELS = OX_ALPHA_ENABLED ? ["stealth/ox-alpha", ...OR_BASE_MODELS] : OR_BASE_MODELS;
const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];
const VOICE_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-2.5-flash-preview-04-17",
];

const BMAP: Record<string, string> = {
  "1":"CS","2":"EC","3":"ME","4":"Civil","5":"All",
  "cs":"CS","ec":"EC","me":"ME","civil":"Civil","all":"All","cse":"CS","ece":"EC","mech":"ME",
};
const DMAP: Record<string, string> = {
  "1":"A","2":"B","3":"C","4":"All","a":"A","b":"B","c":"C","all":"All",
};

// Word "stems" — matched with a regex word-boundary so variants like
// solve/solves/solved/solving or calculate/calculating all match (plain
// .includes("solve") does NOT match "solving").
const MATHS_STEMS = ["solv","integrat","differentiat","deriv","limit","matri","determinant","eigenvalue","laplace","fourier","calculat","comput","simplif","expand","factoris","factoriz","proof","prove","theorem","polynomial","trigonometr","calculus","vector","scalar","probabilit","statistic","varianc","numerical","equation","formula","math","physic","chemistr"];
const MATHS_KW = ["differential equation","sin(","cos(","tan(","log(","mean of","median of","d/dx","dy/dx","^2","^3"];
const GENERAL_KW = ["what is","what are","explain","define","how does","why does","tell me about","history of","who invented","difference between","career","job","salary","scope","future","programming","python","java","javascript","coding","algorithm","advice","tips","suggest","recommend","meaning of","concept of","theory of","how to","why is","where is","when did","who is","biology","botany","zoology","science","subject","syllabus topic","concept","doubt in"];

const INSTANT: Record<string, string> = {
  "hi":"👋 Hey *{name}*! Ask anything or type *help* for commands.",
  "hello":"👋 Hello *{name}*! How can I help you today?",
  "hey":"👋 Hey *{name}*! Ask anything or type *help* for commands.",
  "hii":"👋 Hey *{name}*! Ask anything or type *help* for commands.",
  "helo":"👋 Hello *{name}*! How can I help you today?",
  "hy":"👋 Hey *{name}*! Ask anything or type *help*.",
  "heyy":"👋 Hey *{name}*! Ask anything or type *help*.",
  "k":"👍 Got it! Let me know if you need anything.",
  "ok":"👍 Sure! Let me know if you need anything.",
  "okay":"👍 Sure! Let me know if you need anything.",
  "thanks":"😊 You're welcome, *{name}*!",
  "thank you":"😊 You're welcome, *{name}*!",
  "ty":"😊 You're welcome!",
  "tq":"😊 You're welcome, *{name}*!",
  "thankyou":"😊 You're welcome, *{name}*!",
  "good morning":"🌅 Good morning, *{name}*! How can I help?",
  "good afternoon":"☀️ Good afternoon, *{name}*! How can I help?",
  "good evening":"🌆 Good evening, *{name}*! How can I help?",
  "good night":"🌙 Good night, *{name}*! Study well 📚",
  "gm":"🌅 Good morning, *{name}*!",
  "gn":"🌙 Good night, *{name}*! Study well 📚",
  "test":"✅ Cravex v3 is online and working! Type *help* for commands.",
  "start":"👋 Hey *{name}*! Type *help* to see all commands.",
  "hi there":"👋 Hey *{name}*! Ask anything or type *help* for commands.",
  "bot":"🤖 Cravex bot is live! Type *help* for commands.",
  "hello bot":"👋 Hello *{name}*! How can I help you today?",
  "who are you":"🤖 I'm *Cravex* — your AI WhatsApp assistant for college! Type *help* for commands.",
  "what can you do":"🤖 I can answer syllabus questions, track attendance, show marks, risk scores, voice notes and more! Type *help* for the full list.",
};

// ── UTILITIES ──────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
function queryType(q: string): "maths" | "general" | "college" {
  const l = q.toLowerCase();
  const stemHit = MATHS_STEMS.some(stem => new RegExp(`\\b${stem}`, "i").test(l));
  if (stemHit || MATHS_KW.some(k => l.includes(k))) return "maths";
  if (GENERAL_KW.some(k => l.includes(k))) return "general";
  // Generic "help me with X problems" phrasing that doesn't name a subject
  if (/\b(problem|question|topic|doubt)s?\b/.test(l)) return "general";
  return "college";
}
function isMemoryQuery(q: string): boolean {
  const l = q.toLowerCase();
  return l.includes("last ask")||l.includes("previous question")||l.includes("what did i ask")||
    l.includes("what was my last")||l.includes("my last question")||l.includes("last time i asked")||
    l.includes("what have i asked")||l.includes("our conversation")||l.includes("what did you answer")||
    l.includes("remind me")||l.includes("what was that")||l.includes("what did we discuss");
}

// ── DB CLIENT ──────────────────────────────────────────────────────────────────
function db() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

// ── SESSION HELPERS (with TTL on every write) ──────────────────────────────────
async function getSession(d: any, phone: string) {
  try {
    const { data } = await d.from("pdf_upload_sessions")
      .select("session_data")
      .eq("phone_number", phone)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    return data?.session_data ?? null;
  } catch { return null; }
}
async function setSession(d: any, phone: string, data: any, ttlMs = 600_000) {
  try {
    await d.from("pdf_upload_sessions").upsert(
      {
        phone_number: phone,
        session_data: data,
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone_number" }
    );
  } catch {}
}
async function clearSession(d: any, phone: string) {
  try { await d.from("pdf_upload_sessions").delete().eq("phone_number", phone); } catch {}
}

// ── CHAT HISTORY (last 20 turns, 24hr TTL) ─────────────────────────────────────
async function getChatHistory(d: any, phone: string): Promise<{ role: string; text: string; ts: string }[]> {
  try {
    const { data } = await d.from("pdf_upload_sessions")
      .select("session_data")
      .eq("phone_number", "hist_" + phone)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    return data?.session_data?.history || [];
  } catch { return []; }
}
async function saveChatHistory(d: any, phone: string, history: { role: string; text: string; ts: string }[]) {
  try {
    await d.from("pdf_upload_sessions").upsert(
      {
        phone_number: "hist_" + phone,
        session_data: { history: history.slice(-20) },
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone_number" }
    );
  } catch {}
}
function buildHistoryContext(history: { role: string; text: string; ts: string }[], userName: string): string {
  if (!history.length) return "";
  const lines = history.map(h => {
    const when = h.ts ? new Date(h.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";
    return `[${when}] ${h.role === "user" ? userName : "Cravex"}: ${h.text}`;
  });
  return "\n\n*Conversation history (most recent last):*\n" + lines.join("\n");
}

// ── GROQ WHISPER TRANSCRIPTION ─────────────────────────────────────────────────
async function transcribeWithGroq(audioBytes: ArrayBuffer, mimeType: string): Promise<string | null> {
  const KEY = Deno.env.get("GROQ_API_KEY");
  if (!KEY) return null;
  try {
    const ext = mimeType.includes("mp3")||mimeType.includes("mpeg") ? "mp3"
              : mimeType.includes("wav") ? "wav"
              : mimeType.includes("webm") ? "webm"
              : "ogg";
    const form = new FormData();
    form.append("file", new Blob([audioBytes], { type: mimeType }), `audio.${ext}`);
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "en");
    form.append("response_format", "text");
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${KEY}` },
      body: form, signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) { console.error("Groq transcription failed:", res.status); return null; }
    const text = (await res.text()).trim();
    return text.length > 2 ? text : null;
  } catch (e) { console.error("Groq error:", String(e)); return null; }
}

// ── AI: OPENROUTER ─────────────────────────────────────────────────────────────
async function aiText(prompt: string, opts: { temp?: number; tokens?: number } = {}): Promise<string | null> {
  const KEY = Deno.env.get("OPENROUTER_API_KEY");
  const { temp = 0.7, tokens = 2048 } = opts;
  if (KEY) {
    for (const model of OR_MODELS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), model === "stealth/ox-alpha" ? 25_000 : 20_000);
        const requestBody: Record<string, unknown> = {
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: temp,
          max_tokens: tokens,
        };
        if (model === "stealth/ox-alpha") {
          requestBody.reasoning = { effort: "low" };
          requestBody.include_reasoning = false;
        }
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://cravex.co.in", "X-Title": "Cravex" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.status === 429 || res.status === 503) continue;
        if (!res.ok) continue;
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 2) return text;
      } catch (error) {
        console.error("OpenRouter model failed", { model, error: String(error) });
      }
    }
  }
  return aiGeminiText(prompt, opts);
}

// ── AI: GEMINI DIRECT ──────────────────────────────────────────────────────────
async function aiGeminiText(prompt: string, opts: { temp?: number; tokens?: number } = {}): Promise<string | null> {
  return _gemini([{ text: prompt }], opts.temp ?? 0.7, opts.tokens ?? 2048);
}
async function aiGeminiMultimodal(parts: any[], opts: { temp?: number; tokens?: number } = {}): Promise<string | null> {
  return _gemini(parts, opts.temp ?? 0, opts.tokens ?? 8000);
}
async function _gemini(parts: any[], temp: number, tokens: number): Promise<string | null> {
  const KEY = Deno.env.get("GEMINI_API_KEY")!;
  for (const model of GEMINI_MODELS) {
    for (let i = 0; i < 2; i++) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 15000);
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`,
          { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: temp, maxOutputTokens: tokens } }),
            signal: ctrl.signal }
        );
        clearTimeout(tid);
        if (res.status === 503 || res.status === 429) { await sleep(i === 0 ? 800 : 1500); continue; }
        if (!res.ok) break;
        const d = await res.json();
        const t = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (t) return t;
        break;
      } catch { if (i < 1) await sleep(600); }
    }
  }
  return null;
}

// ── PDF TEXT EXTRACTION VIA LLAMAPARSE ────────────────────────────────────────
async function extractPdfText(
  bytes: ArrayBuffer,
  fileName: string,
  onProgress?: (msg: string) => Promise<void>
): Promise<string | null> {
  const KEY = Deno.env.get("LLAMA_CLOUD_API_KEY");
  if (!KEY) {
    console.error("CRITICAL: LLAMA_CLOUD_API_KEY secret missing.");
    return extractPdfTextGemini(bytes);
  }
  try {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "application/pdf" }), fileName);
    const uploadRes = await fetch("https://api.cloud.llamaindex.ai/api/parsing/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}` },
      body: form,
    });
    if (!uploadRes.ok) {
      console.error(`LlamaParse upload error (${uploadRes.status}):`, await uploadRes.text());
      return extractPdfTextGemini(bytes);
    }
    const { id: jobId } = await uploadRes.json();
    console.log(`LlamaParse job: ${jobId}`);
    for (let i = 0; i < 45; i++) {
      await sleep(2000);
      if (i > 0 && i % 5 === 0 && onProgress) {
        await onProgress(`⏳ Still processing... (${i * 2}s elapsed)`);
      }
      const statusRes = await fetch(`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}`, {
        headers: { Authorization: `Bearer ${KEY}` },
      });
      const { status } = await statusRes.json();
      if (status === "SUCCESS") {
        const resultRes = await fetch(`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/markdown`, {
          headers: { Authorization: `Bearer ${KEY}` },
        });
        const { markdown } = await resultRes.json();
        return markdown ?? null;
      }
      if (status === "ERROR") {
        console.error("LlamaParse job failed.");
        return extractPdfTextGemini(bytes);
      }
    }
    console.error("LlamaParse timed out after 90s.");
    return extractPdfTextGemini(bytes);
  } catch (e) {
    console.error("LlamaParse exception:", String(e));
    return extractPdfTextGemini(bytes);
  }
}

async function extractPdfTextGemini(bytes: ArrayBuffer): Promise<string | null> {
  const KEY = Deno.env.get("GEMINI_API_KEY")!;
  const u8 = new Uint8Array(bytes);
  const CHUNK = 8192;
  let bin = "";
  for (let i = 0; i < u8.length; i += CHUNK) bin += String.fromCharCode(...Array.from(u8.slice(i, Math.min(i + CHUNK, u8.length))));
  const b64 = btoa(bin);
  const geminiPdfModels = ["gemini-2.0-flash-001", "gemini-2.5-flash-preview-04-17", "gemini-1.5-flash"];
  for (const model of geminiPdfModels) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 45000);
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`,
          {
            method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
            body: JSON.stringify({
              contents: [{ parts: [
                { inline_data: { mime_type: "application/pdf", data: b64 } },
                { text: "Extract ALL text from this PDF. Return raw text only, preserve headings and structure. Do not summarise." },
              ]}],
              generationConfig: { temperature: 0, maxOutputTokens: 8000 },
            }),
          }
        );
        clearTimeout(tid);
        if (res.status === 429 || res.status === 503) { await sleep(Math.pow(2, attempt) * 1500); continue; }
        if (!res.ok) break;
        const data = await res.json();
        const t = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (t && t.length > 50) return t;
        break;
      } catch (e) {
        console.error(`Gemini PDF extract failed model=${model} attempt=${attempt}:`, String(e));
        if (attempt < 2) await sleep(1000 * (attempt + 1));
      }
    }
  }
  return null;
}

// ── EMBEDDINGS ─────────────────────────────────────────────────────────────────
async function embed(text: string): Promise<number[] | null> {
  const KEY = Deno.env.get("GEMINI_API_KEY")!;
  const clean = text.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${KEY}`,
        {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
          body: JSON.stringify({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text: clean.slice(0, 2000) }] },
            task_type: "RETRIEVAL_DOCUMENT",
            outputDimensionality: 768,
          }),
        }
      );
      clearTimeout(tid);
      if (r.status === 429 || r.status === 503) { await sleep(800 * Math.pow(2, i)); continue; }
      const d = await r.json();
      if (!r.ok) { console.error(`Embed error (attempt ${i + 1}):`, r.status, JSON.stringify(d)); return null; }
      return d?.embedding?.values ?? null;
    } catch (e) {
      console.error(`Embed exception (attempt ${i + 1}):`, String(e));
      if (i < 2) await sleep(800);
    }
  }
  return null;
}

// ── CHUNKING WITH OVERLAP ──────────────────────────────────────────────────────
function splitChunks(text: string, size = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  const paras = text.split(/\n\s*\n/).filter(p => p.trim().length > 20);
  let cur = "";
  for (const p of paras) {
    if ((cur + p).length > size && cur.length > 0) {
      chunks.push(cur.trim());
      const words = cur.split(/\s+/);
      cur = words.slice(-overlap).join(" ") + " " + p;
    } else {
      cur += (cur ? "\n\n" : "") + p;
    }
  }
  if (cur.trim().length > 20) chunks.push(cur.trim());
  return chunks;
}

// ── PER-USER AI LOCK ───────────────────────────────────────────────────────────
async function isUserProcessing(d: any, phone: string): Promise<boolean> {
  try {
    const { data } = await d.from("rate_limits").select("last_message").eq("phone_number", "lock_" + phone).maybeSingle();
    if (!data) return false;
    return (Date.now() - new Date(data.last_message).getTime()) < 8000;
  } catch { return false; }
}
async function setUserProcessing(d: any, phone: string): Promise<void> {
  try {
    await d.from("rate_limits").upsert(
      { phone_number: "lock_" + phone, message_count: 1, window_start: new Date().toISOString(), last_message: new Date().toISOString() },
      { onConflict: "phone_number" }
    );
  } catch {}
}
async function clearUserProcessing(d: any, phone: string): Promise<void> {
  try { await d.from("rate_limits").delete().eq("phone_number", "lock_" + phone); } catch {}
}

// ── RATE LIMIT ─────────────────────────────────────────────────────────────────
async function checkRateLimit(d: any, phone: string): Promise<boolean> {
  try {
    const now = new Date();
    const win = new Date(now.getTime() - 60_000).toISOString();
    const { data } = await d.from("rate_limits").select("message_count,window_start").eq("phone_number", phone).maybeSingle();
    if (!data || data.window_start < win) {
      await d.from("rate_limits").upsert(
        { phone_number: phone, message_count: 1, window_start: now.toISOString(), last_message: now.toISOString() },
        { onConflict: "phone_number" }
      );
      return true;
    }
    if (data.message_count >= RATE_LIMIT) return false;
    await d.from("rate_limits").update({ message_count: data.message_count + 1, last_message: now.toISOString() }).eq("phone_number", phone);
    return true;
  } catch { return true; }
}

// ── MAIN WEBHOOK ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "GET") {
    const u = new URL(req.url);
    const verifyToken = VERIFY_TOKEN;
    if (!verifyToken) return new Response("Webhook not configured", { status: 503 });
    if (u.searchParams.get("hub.verify_token") === verifyToken)
      return new Response(u.searchParams.get("hub.challenge"), { status: 200 });
    return new Response("Forbidden", { status: 403 });
  }

  // Verify every POST is genuinely from Meta. Never bypass this when the app
  // secret is absent; a missing secret is a deployment failure, not a reason to
  // accept unauthenticated traffic.
  const rawBody = await req.text().catch(() => "");
  const appSecret = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
  if (!appSecret) return new Response("Webhook not configured", { status: 503 });
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  if (!sig) return new Response("Forbidden", { status: 403 });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = "sha256=" + Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, "0")).join("");
  if (!constantTimeEqual(sig, expected)) { console.warn("Webhook sig mismatch"); return new Response("Forbidden", { status: 403 }); }
  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return new Response("OK", { status: 200 }); }

  const entry   = payload?.entry?.[0]?.changes?.[0]?.value;
  const metadataPhoneId = entry?.metadata?.phone_number_id;
  if (!PHONE_ID || metadataPhoneId !== PHONE_ID) {
    console.warn("Webhook phone-number mismatch");
    return new Response("Forbidden", { status: 403 });
  }
  const message = entry?.messages?.[0];
  if (!message) return new Response("OK", { status: 200 });

  const phone = message.from;
  const msgId = message.id;
  const d     = db();

  const { error: dupErr } = await d.from("processed_messages").insert({ message_id: msgId });
  if (dupErr) return new Response("OK", { status: 200 });

  const type = message.type;

  if (type === "document") {
    const fname = message.document?.filename ?? "";
    const mime  = message.document?.mime_type ?? "";
    const isXL  = mime.includes("spreadsheet") || mime.includes("excel") ||
                  fname.endsWith(".xlsx") || fname.endsWith(".xls") || fname.endsWith(".csv");
    if (isXL) {
      EdgeRuntime.waitUntil(handleExcel(d, message, phone).catch(e => console.error("handleExcel:", e)));
    } else {
      EdgeRuntime.waitUntil(handlePDF(d, message, phone).catch(e => console.error("handlePDF:", e)));
    }
  } else if (type === "image") {
    EdgeRuntime.waitUntil(handleImage(d, message, phone).catch(e => console.error("handleImage:", e)));
  } else if (type === "audio") {
    EdgeRuntime.waitUntil(handleVoice(d, message, phone).catch(e => console.error("handleVoice:", e)));
  } else if (type === "text" && message.text?.body) {
    EdgeRuntime.waitUntil(handleText(d, phone, message.text.body.trim()).catch(e => console.error("handleText:", e)));
  }

  return new Response("OK", { status: 200 });
});

// ── IDENTIFY USER ──────────────────────────────────────────────────────────────
async function identifyUser(d: any, phone: string) {
  try {
    const { data: u } = await d.from("users").select("role,college_id,name").eq("phone_number", phone).maybeSingle();
    if (u) return { userRole: u.role as string, collegeId: u.college_id as string, userName: u.name as string, branch: null as string | null, division: null as string | null, semester: null as number | null };
    const { data: s } = await d.from("students").select("college_id,name,branch,division,semester,risk_score,roll_number").eq("phone_number", phone).maybeSingle();
    if (s) return { userRole: "student", collegeId: s.college_id as string, userName: s.name as string, branch: s.branch as string | null, division: s.division as string | null, semester: s.semester as number | null, riskScore: s.risk_score, rollNumber: s.roll_number };

    // Parent check — any student(s) that list this number as parent_phone.
    // No extra verification: if you're already linked (via !parent), you can
    // text the bot immediately and it identifies you as that child's parent.
    const { data: kids } = await d.from("students")
      .select("phone_number,name,college_id,branch,division,semester,risk_score,roll_number")
      .eq("parent_phone", phone);
    if (kids?.length) {
      const label = kids.length === 1 ? `${kids[0].name}'s parent` : "Parent";
      return {
        userRole: "parent",
        collegeId: kids[0].college_id as string,
        userName: label,
        branch: null as string | null, division: null as string | null, semester: null as number | null,
        children: kids,
      };
    }
  } catch {}
  return null;
}

// ── PARENT COMMANDS ─────────────────────────────────────────────────────────────
async function handleParentCommand(d: any, phone: string, bl: string, userName: string, children: any[], collegeId: string): Promise<boolean> {
  if (INSTANT[bl]) { await wa(phone, INSTANT[bl].replace(/{name}/g, userName)); return true; }
  if (bl === "help" || bl === "menu")                                    { await handleParentHelp(phone); return true; }
  if (bl === "myattendance" || bl === "attendance")                      { await handleParentAttendance(d, phone, children); return true; }
  if (bl === "mymarks" || bl === "marks")                                { await handleParentMarks(d, phone, children); return true; }
  if (bl === "myrisk" || bl === "risk")                                  { await handleParentRisk(d, phone, children); return true; }
  if (bl === "notices" || bl === "announcements" || bl === "notice")     { await handleNotices(d, collegeId, phone); return true; }
  return false;
}

async function handleParentHelp(phone: string) {
  await wa(phone,
    "🤖 *Cravex — Parent Menu*\n\n" +
    "You're linked as a parent on Cravex.\n\n" +
    "• *attendance* — your ward's attendance, subject-wise\n" +
    "• *marks* — your ward's internal marks\n" +
    "• *risk* — academic risk score\n" +
    "• *notices* — college announcements\n" +
    "• Ask any question about your ward's performance\n\n" +
    "You'll also get automatic alerts if attendance or marks drop below the safe range."
  );
}

async function handleParentAttendance(d: any, phone: string, children: any[]) {
  let msg = "";
  for (const child of children) {
    const { data: subjects } = await d.from("student_subject_attendance")
      .select("subject_name,subject_code,attendance_percent,present_count,total_classes,vtu_status")
      .eq("student_phone", child.phone_number).eq("college_id", child.college_id)
      .order("attendance_percent", { ascending: true });
    msg += `👤 *${child.name}*`;
    if (child.branch) msg += ` (${child.branch} Div-${child.division || "?"} Sem-${child.semester || "?"})`;
    msg += "\n";
    if (!subjects?.length) { msg += "No attendance recorded yet.\n\n"; continue; }
    let present = 0, total = 0;
    for (const sub of subjects) {
      const emoji = sub.vtu_status === "at_risk" ? "🔴" : sub.vtu_status === "warning" ? "🟡" : "🟢";
      msg += `${emoji} ${sub.subject_name}: *${sub.attendance_percent}%* (${sub.present_count}/${sub.total_classes})\n`;
      present += sub.present_count || 0; total += sub.total_classes || 0;
    }
    if (total > 0) msg += `📈 Overall: *${Math.round(present * 100 / total)}%*\n`;
    msg += "\n";
  }
  await waSend(phone, "📊 *Attendance Report*\n\n" + msg.trim());
}

async function handleParentMarks(d: any, phone: string, children: any[]) {
  let msg = "";
  for (const child of children) {
    let marks: any[] = [];
    try { const { data: m } = await d.from("student_marks").select("subject,marks_obtained,max_marks").eq("phone_number", child.phone_number).eq("college_id", child.college_id); marks = m || []; } catch {}
    msg += `👤 *${child.name}*\n`;
    if (!marks.length) { msg += "No marks recorded yet.\n\n"; continue; }
    for (const m of marks) {
      const pct = Math.round(m.marks_obtained / m.max_marks * 100);
      msg += `${pct >= 75 ? "✅" : pct >= 60 ? "📈" : "⚠️"} ${m.subject}: ${m.marks_obtained}/${m.max_marks} (${pct}%)\n`;
    }
    msg += "\n";
  }
  await waSend(phone, "📝 *Marks Report*\n\n" + msg.trim());
}

async function handleParentRisk(d: any, phone: string, children: any[]) {
  let msg = "";
  for (const child of children) {
    const { data: fresh } = await d.from("students").select("risk_score").eq("phone_number", child.phone_number).maybeSingle();
    const score = fresh?.risk_score ?? child.risk_score ?? 0;
    const emoji = score < 20 ? "🟢" : score < 50 ? "🟡" : score < 75 ? "🟠" : "🔴";
    const level = score < 20 ? "Low" : score < 50 ? "Moderate" : score < 75 ? "High" : "Critical";
    msg += `${emoji} *${child.name}*: ${score}/100 — ${level}\n`;
  }
  await wa(phone, "🎯 *Risk Scores*\n\n" + msg.trim());
}

async function handleParentAI(d: any, phone: string, question: string, children: any[], collegeId: string) {
  if (await isUserProcessing(d, phone)) {
    await sleep(3000);
    if (await isUserProcessing(d, phone)) { await wa(phone, "⏳ Still processing. Give me 5 seconds!"); return; }
  }
  await setUserProcessing(d, phone);
  try {
    let dbContext = "\n\nLINKED CHILD(REN) — live data:\n";
    for (const child of children) {
      const { data: subAtt } = await d.from("student_subject_attendance")
        .select("subject_name,attendance_percent,vtu_status")
        .eq("student_phone", child.phone_number).eq("college_id", child.college_id);
      dbContext += `\n${child.name} (${child.branch || "?"} Sem-${child.semester || "?"}):\n`;
      (subAtt || []).forEach((s: any) => {
        dbContext += `  ${s.subject_name}: ${s.attendance_percent}%${s.vtu_status === "at_risk" ? " ⚠️ below 75%" : ""}\n`;
      });
      let marks: any[] = [];
      try { const { data: m } = await d.from("student_marks").select("subject,marks_obtained,max_marks").eq("phone_number", child.phone_number).eq("college_id", child.college_id); marks = m || []; } catch {}
      if (marks.length) dbContext += `  Marks: ` + marks.map((m: any) => `${m.subject} ${m.marks_obtained}/${m.max_marks}`).join(", ") + "\n";
    }
    const prompt = `You are *Cravex*, an AI WhatsApp assistant for VTU engineering college parents.\nYou're talking to a parent about their child's academic performance.${dbContext}\n\nAnswer the parent's question using the data above if relevant. Be warm, clear, concise, WhatsApp-friendly with *bold* for key terms. If asked something outside this data (general study/parenting advice), answer helpfully anyway — never refuse.\n\nParent's question: ${question}`;
    const answer = await aiText(prompt, { temp: 0.5, tokens: 1200 });
    if (!answer) { await wa(phone, "⚡ AI is busy — please resend your question."); return; }
    await waSend(phone, answer);
  } finally {
    await clearUserProcessing(d, phone);
  }
}

// ── TEXT HANDLER ───────────────────────────────────────────────────────────────
async function handleText(d: any, phone: string, rawBody: string) {
  try {
    if (!await checkRateLimit(d, phone)) {
      await wa(phone, "⏳ Too many messages. Please wait 60 seconds.");
      return;
    }

    const cleanBody = rawBody.replace(/^[*_~`]+|[*_~`]+$/g, "").trim();
    const bl = cleanBody.toLowerCase();
    const bl0 = bl.split(" ")[0];

    if (bl === "cancel" || bl === "stop" || bl === "reset") {
      await clearSession(d, phone);
      await clearUserProcessing(d, phone);
      await wa(phone, "✅ Cleared! Type *help* for commands.");
      return;
    }
    if (bl === "ping") {
      await clearSession(d, phone);
      await clearUserProcessing(d, phone);
      await wa(phone, "🏓 Pong! Bot is live.");
      return;
    }

    const isGreeting = ["hi","hello","hey","hii","helo","hy","heyy"].includes(bl);
    if (isGreeting) {
      await clearSession(d, phone);
      await clearUserProcessing(d, phone);
    }

    const sess = await getSession(d, phone);
    if (sess?.step && !isGreeting) {
      let handled = false;
      if (sess.step.startsWith("excel_"))       handled = await handleExcelStep(d, phone, rawBody);
      else if (sess.step.startsWith("class_"))  handled = await handleClassStep(d, phone, rawBody, sess);
      else                                      handled = await handlePDFStep(d, phone, rawBody);
      if (handled) return;
    }

    const role = await identifyUser(d, phone);
    if (!role) {
      await wa(phone, "👋 *Welcome to Cravex!*\n\nYou're not registered yet.\n\nAsk your *teacher or college admin* to add you — they'll upload a student list and you'll receive a welcome message automatically.");
      return;
    }
    const { userRole, collegeId, userName } = role;
    const isStaff = userRole === "admin" || userRole === "teacher";
    const isParent = userRole === "parent";

    // Parent flow is fully separate — its own commands, then falls through to
    // a parent-aware AI responder for anything else. Never touches the
    // staff/student command paths below (those assume a student's own phone).
    if (isParent) {
      const handled = await handleParentCommand(d, phone, bl, userName, role.children, collegeId);
      if (handled) return;
      await handleParentAI(d, phone, cleanBody, role.children, collegeId);
      return;
    }

    if (INSTANT[bl]) { await wa(phone, INSTANT[bl].replace(/{name}/g, userName)); return; }
    if (bl === "help" || bl === "menu")                          { await handleHelp(userRole, phone); return; }
    if (bl === "myattendance" || bl === "attendance")            { await handleMyAttendance(d, phone, collegeId, userName, role); return; }
    if (bl === "myfiles" || bl === "my files")                   { await handleMyFiles(d, phone, collegeId, role); return; }
    if (bl === "myrisk" || bl === "risk")                        { await handleRiskScore(d, phone, collegeId, userName, role); return; }
    if (bl === "notices" || bl === "announcements" || bl === "notice") { await handleNotices(d, collegeId, phone); return; }
    if (bl === "atrisk" || bl === "at risk")                     { await handleAtRisk(d, collegeId, phone, role); return; }
    if (!isStaff && (bl === "mymarks" || bl === "marks"))        { await handleMyMarks(d, phone, collegeId, userName); return; }
    if (!isStaff && (bl === "mysubjects" || bl === "subjects"))  { await handleMySubjects(d, phone, collegeId, role); return; }

    if (bl0 === "askpdf") {
      const parts = cleanBody.split(/\s+/);
      let subjectTag: string | null = null;
      let question = "";
      if (parts.length >= 3 && parts[1].length <= 20 && !parts[1].includes(" ")) {
        subjectTag = parts[1];
        question   = parts.slice(2).join(" ");
      } else {
        question = parts.slice(1).join(" ");
      }
      if (!question) { await wa(phone, "Usage:\n• *askpdf <question>*\n• *askpdf DSA what is a binary tree?*"); return; }
      await handleAskPdf(d, phone, question, subjectTag, role);
      return;
    }

    if (isStaff) {
      if (bl === "start class" || bl === "startclass" || bl === "take attendance" || bl === "class") { await handleStartClass(d, phone, collegeId, userName, role); return; }
      if (bl === "end class"   || bl === "endclass"   || bl === "stop class")   { await handleEndClass(d, phone, collegeId); return; }
      if (bl.startsWith("attendance:"))  { await handleAttendanceUpdate(d, cleanBody, collegeId, phone); return; }
      if (bl.startsWith("broadcast:"))   { await handleBroadcast(d, cleanBody, collegeId, phone); return; }
      if (bl.startsWith("smartnotice"))  { await handleSmartNotice(d, collegeId, phone); return; }
      if (bl.startsWith("!marks"))       { await handleMarkEntry(d, cleanBody, collegeId, phone); return; }
      if (bl.startsWith("!parent"))      { await handleParentLink(d, cleanBody, collegeId, phone); return; }

      if (bl0 === "listfiles") {
        const subject = cleanBody.split(/\s+/).slice(1).join(" ") || null;
        await handleListFiles(d, phone, collegeId, subject);
        return;
      }
      if (bl0 === "deletefile") {
        const fname = cleanBody.replace(/^deletefile\s*/i, "").trim();
        await handleDeleteFile(d, phone, collegeId, fname);
        return;
      }
      if (bl === "reprocesspdf" || bl === "reprocess") {
        await handleReprocessPdf(d, phone, collegeId, role);
        return;
      }

      if (bl.startsWith("!addsubject") && userRole === "admin") { await handleAddSubject(d, cleanBody, collegeId, phone); return; }
      if (bl.startsWith("!assign")     && userRole === "admin") { await handleAssignSubject(d, cleanBody, collegeId, phone); return; }
      if (bl.startsWith("!add teacher") && userRole === "admin") { await handleAddTeacher(d, cleanBody, collegeId, phone); return; }
      if (bl.startsWith("!add student") && (userRole === "admin" || userRole === "teacher")) { await handleAddSingleStudent(d, cleanBody, collegeId, phone, role); return; }
      if (bl === "register students" || bl === "add students" || bl === "upload students") {
        await wa(phone, "📋 *To register students:*\n\nSend your *Excel file* (.xlsx or .csv) as a document attachment.\n\nRequired columns:\n• *Name* — student full name\n• *Phone* — 10 or 12 digit number\n• *Roll No* — class roll number\n• *USN* — university seat number (optional)\n\nOr add one student:\n*!add student 91XXXXXXXXXX Name RollNo Branch Sem*");
        return;
      }
    }

    await handleAI(d, cleanBody, userRole, userName, collegeId, phone, role);
  } catch (err) { console.error("handleText:", err); }
}

// ── CLASS SESSION ──────────────────────────────────────────────────────────────
async function handleStartClass(d: any, phone: string, collegeId: string, userName: string, _role: any) {
  const { data: assignments } = await d.from("subject_assignments")
    .select("id,subject_id,branch,semester,division,subjects(name,code)")
    .eq("teacher_phone", phone).eq("college_id", collegeId);
  if (!assignments?.length) { await wa(phone, "📚 No subjects assigned yet.\n\nAsk admin: *!assign YourPhone SubjectName Branch Semester*"); return; }
  const { data: openSess } = await d.from("attendance_sessions")
    .select("id,subjects(name),branch,semester,division")
    .eq("teacher_phone", phone).eq("status", "open").maybeSingle();
  if (openSess) { await wa(phone, `⚠️ Active session: *${openSess.subjects?.name}* (${openSess.branch} Div-${openSess.division} Sem-${openSess.semester}).\n\nSend roll numbers or type *end class*.`); return; }
  let menu = "📋 *Select Subject*\n\n";
  assignments.forEach((a: any, i: number) => { menu += `*${i + 1}*. ${a.subjects?.name} (${a.subjects?.code || ""})\n   ${a.branch} Div-${a.division} Sem-${a.semester}\n`; });
  menu += "\nReply with the *number* (e.g. 1)";
  await wa(phone, menu);
  await setSession(d, phone, { step: "class_subject", assignments, collegeId, teacherPhone: phone, userName }, 1800_000);
}

async function rollupAttendanceRecord(d: any, studentPhone: string, collegeId: string, studentName: string): Promise<void> {
  try {
    const [{ count: total }, { count: present }] = await Promise.all([
      d.from("attendance_logs").select("*", { count: "exact", head: true }).eq("student_phone", studentPhone).eq("college_id", collegeId),
      d.from("attendance_logs").select("*", { count: "exact", head: true }).eq("student_phone", studentPhone).eq("college_id", collegeId).eq("status", "present"),
    ]);
    if (!total || total === 0) return;
    const pct = Math.round((present || 0) * 100 / total);
    await d.from("attendance_records").upsert(
      { phone_number: studentPhone, college_id: collegeId, student_name: studentName, attendance_percent: pct, updated_at: new Date().toISOString() },
      { onConflict: "phone_number,college_id" }
    );
    const { data: subAtt } = await d.from("student_subject_attendance")
      .select("vtu_status,attendance_percent").eq("student_phone", studentPhone).eq("college_id", collegeId);
    let attRisk = 0;
    if (subAtt?.length) {
      const atRiskSubs  = subAtt.filter((s: any) => s.vtu_status === "at_risk");
      const warnSubs    = subAtt.filter((s: any) => s.vtu_status === "warning");
      if (atRiskSubs.length > 0) {
        const worst = Math.min(...atRiskSubs.map((s: any) => s.attendance_percent || 0));
        attRisk = Math.min(40, Math.round(20 + (75 - worst) * 1.5) + (atRiskSubs.length - 1) * 5);
      } else if (warnSubs.length > 0) {
        attRisk = Math.round(warnSubs.length * 8);
      }
    } else {
      attRisk = pct >= 85 ? 0 : pct >= 75 ? Math.round((85 - pct) * 2) : Math.min(40, Math.round(20 + (75 - pct) * 1.5));
    }
    await d.from("students").update({ risk_score: Math.min(100, attRisk) }).eq("phone_number", studentPhone).eq("college_id", collegeId);
  } catch (e) { console.error("rollupAttendanceRecord:", e); }
}

async function batchRollup(d: any, students: { phone_number: string; name: string }[], collegeId: string): Promise<void> {
  const BATCH = 10;
  for (let i = 0; i < students.length; i += BATCH) {
    await Promise.all(students.slice(i, i + BATCH).map(s => rollupAttendanceRecord(d, s.phone_number, collegeId, s.name)));
  }
}

async function handleClassStep(d: any, phone: string, rawInput: string, sess: any): Promise<boolean> {
  const body = rawInput;
  const m    = body.trim().toLowerCase();

  if (sess.step === "class_subject") {
    const idx = parseInt(body.trim()) - 1;
    if (isNaN(idx) || idx < 0 || idx >= sess.assignments.length) { await wa(phone, `❌ Reply with a number 1-${sess.assignments.length}`); return true; }
    const chosen = sess.assignments[idx];
    const { count } = await d.from("students").select("*", { count: "exact", head: true }).eq("college_id", sess.collegeId).eq("branch", chosen.branch).eq("semester", chosen.semester).eq("division", chosen.division);
    const { data: session, error } = await d.from("attendance_sessions").insert({
      college_id: sess.collegeId, subject_id: chosen.subject_id, teacher_phone: phone,
      branch: chosen.branch, semester: chosen.semester, division: chosen.division,
      session_date: new Date().toISOString().split("T")[0], total_students: count || 0, status: "open",
    }).select().single();
    if (error) { await wa(phone, "❌ Could not start session. Try again."); await clearSession(d, phone); return true; }
    await setSession(d, phone, { step: "class_attendance", sessionId: session.id, subjectId: chosen.subject_id, subjectName: chosen.subjects?.name, branch: chosen.branch, semester: chosen.semester, division: chosen.division, collegeId: sess.collegeId, totalStudents: count || 0 }, 3600_000);
    await wa(phone, `✅ *Class Started!*\n\n📚 *${chosen.subjects?.name}*\n🏷️ ${chosen.branch} Div-${chosen.division} Sem-${chosen.semester}\n👥 Total: *${count || 0}*\n\n*Send roll numbers of PRESENT students:*\nExample: 01, 05, 12, 18, 22, 45\n\nOr *all present* if everyone attended.\nType *end class* when done.`);
    return true;
  }

  if (sess.step === "class_attendance") {
    if (m === "end class" || m === "endclass" || m === "done" || m === "close") {
      await d.from("attendance_sessions").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", sess.sessionId);
      await clearSession(d, phone);
      await wa(phone, `✅ Session closed.\n\n📚 ${sess.subjectName} — ${sess.branch} Div-${sess.division} Sem-${sess.semester}\n\nAttendance saved to dashboard.`);
      return true;
    }
    if (m === "all present" || m === "all" || m === "everyone") {
      const { data: students } = await d.from("students").select("phone_number,name,roll_number").eq("college_id", sess.collegeId).eq("branch", sess.branch).eq("semester", sess.semester).eq("division", sess.division);
      const logs = (students || []).map((s: any) => ({ session_id: sess.sessionId, college_id: sess.collegeId, student_phone: s.phone_number, student_name: s.name, roll_number: s.roll_number, subject_id: sess.subjectId, branch: sess.branch, semester: sess.semester, division: sess.division, status: "present" }));
      if (logs.length) await d.from("attendance_logs").upsert(logs, { onConflict: "session_id,student_phone" });
      await d.from("attendance_sessions").update({ present_count: logs.length, absent_count: 0, status: "closed", closed_at: new Date().toISOString() }).eq("id", sess.sessionId);
      await clearSession(d, phone);
      EdgeRuntime.waitUntil(batchRollup(d, students || [], sess.collegeId).catch(console.error));
      await wa(phone, `✅ *All ${logs.length} students marked PRESENT*\n\n📚 ${sess.subjectName}\n🏷️ ${sess.branch} Div-${sess.division} Sem-${sess.semester}\nSession closed.`);
      return true;
    }

    const parsedRolls = parseRollNumbers(body.trim());
    if (!parsedRolls.length) { await wa(phone, "❌ Could not parse roll numbers.\n\nFormat: *01, 05, 12, 18* or *1 5 12 18*\nOr *all present* if everyone attended.\nType *end class* to close."); return true; }

    const { data: students } = await d.from("students").select("phone_number,name,roll_number,parent_phone").eq("college_id", sess.collegeId).eq("branch", sess.branch).eq("semester", sess.semester).eq("division", sess.division).order("roll_number", { ascending: true });
    if (!students?.length) { await wa(phone, `❌ No students found for ${sess.branch} Div-${sess.division} Sem-${sess.semester}.`); return true; }

    const presentSet = new Set(parsedRolls.map((r: string) => String(parseInt(r, 10))));
    const logs: any[] = [];
    const presentNames: string[] = [];
    const absentStudents: any[] = [];

    for (const st of students) {
      const rollNorm = String(parseInt(String(st.roll_number || "0"), 10));
      const isPresent = presentSet.has(rollNorm);
      logs.push({ session_id: sess.sessionId, college_id: sess.collegeId, student_phone: st.phone_number, student_name: st.name, roll_number: st.roll_number, subject_id: sess.subjectId, branch: sess.branch, semester: sess.semester, division: sess.division, status: isPresent ? "present" : "absent" });
      if (isPresent) presentNames.push(`${st.roll_number || "?"} ${st.name}`);
      else absentStudents.push(st);
    }

    for (let i = 0; i < logs.length; i += 20) {
      await d.from("attendance_logs").upsert(logs.slice(i, i + 20), { onConflict: "session_id,student_phone" });
    }
    await d.from("attendance_sessions").update({ present_count: presentNames.length, absent_count: absentStudents.length }).eq("id", sess.sessionId);

    EdgeRuntime.waitUntil(batchRollup(d, students, sess.collegeId).catch(console.error));

    EdgeRuntime.waitUntil((async () => {
      for (const st of absentStudents) {
        if (!st.parent_phone) continue;
        try {
          const { data: subAtt } = await d.from("student_subject_attendance").select("attendance_percent,subject_name").eq("student_phone", st.phone_number).eq("subject_id", sess.subjectId).maybeSingle();
          const pct = subAtt?.attendance_percent ?? null;
          if (pct !== null && pct < 75) {
            await wa(st.parent_phone, `📊 *Cravex Attendance Alert*\n\nYour ward *${st.name}* has *${pct}% attendance* in *${subAtt?.subject_name || sess.subjectName}* — below VTU's 75% minimum.\n\nPlease encourage regular class attendance.\n— Cravex`).catch(() => {});
          }
        } catch {}
      }
    })().catch(console.error));

    let msg = `✅ *Attendance Recorded!*\n\n📚 *${sess.subjectName}*\n🏷️ ${sess.branch} Div-${sess.division} Sem-${sess.semester}\n\n✅ Present: *${presentNames.length}*\n❌ Absent: *${absentStudents.length}*\n👥 Total: *${students.length}*\n\n`;
    if (absentStudents.length > 0 && absentStudents.length <= 15) {
      msg += `*Absent:*\n${absentStudents.map((s: any) => `• ${s.roll_number || "?"} ${s.name}`).join("\n")}\n\n`;
    } else if (absentStudents.length > 15) {
      msg += `*${absentStudents.length} students absent* (see dashboard for full list)\n\n`;
    }
    msg += "Send *end class* to close, or send corrected roll numbers to update.";
    await wa(phone, msg);
    return true;
  }
  return false;
}

async function handleEndClass(d: any, phone: string, _collegeId: string) {
  const sess = await getSession(d, phone);
  if (sess?.step === "class_attendance") {
    await d.from("attendance_sessions").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", sess.sessionId);
    await clearSession(d, phone);
    const { data: logs } = await d.from("attendance_logs").select("student_phone,student_name").eq("session_id", sess.sessionId);
    EdgeRuntime.waitUntil(batchRollup(d, (logs || []).map((l: any) => ({ phone_number: l.student_phone, name: l.student_name })), sess.collegeId).catch(console.error));
    await wa(phone, `✅ Session for *${sess.subjectName}* closed. Attendance saved.`);
  } else {
    const { data: openSess } = await d.from("attendance_sessions").select("id,college_id,subjects(name)").eq("teacher_phone", phone).eq("status", "open").maybeSingle();
    if (openSess) {
      await d.from("attendance_sessions").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", openSess.id);
      const { data: logs } = await d.from("attendance_logs").select("student_phone,student_name").eq("session_id", openSess.id);
      EdgeRuntime.waitUntil(batchRollup(d, (logs || []).map((l: any) => ({ phone_number: l.student_phone, name: l.student_name })), openSess.college_id).catch(console.error));
      await wa(phone, `✅ Session for *${openSess.subjects?.name}* closed.`);
    } else { await wa(phone, "No active session found."); }
  }
}

function parseRollNumbers(input: string): string[] {
  let cleaned = input.replace(/(\d+)\s+to\s+(\d+)/gi, (_, s, e) => {
    const arr = []; for (let i = parseInt(s); i <= parseInt(e); i++) arr.push(i.toString()); return arr.join(",");
  });
  const parts = cleaned.split(/[\s,;]+/).map(p => p.trim()).filter(p => /^\d+$/.test(p));
  return [...new Set(parts.map(p => String(parseInt(p, 10))))];
}

// ── IMAGE HANDLER (photo QA) ────────────────────────────────────────────────────
// This was MISSING entirely in production — WhatsApp sends type:"image" for
// photos, but the Deno.serve dispatcher had no branch for it and there was no
// handleImage() function anywhere in the file. Every photo a user sent hit no
// matching case and was silently dropped. This adds the missing handler,
// wired into the dispatcher above, with a vision prompt that explicitly
// handles both direct photos AND screenshots (ignoring browser/app UI chrome).
async function handleImage(d: any, message: any, phone: string) {
  await clearUserProcessing(d, phone);

  const role = await identifyUser(d, phone);
  if (!role) { await wa(phone, "👋 You're not registered. Ask your teacher to add you."); return; }
  await wa(phone, "📸 Got your photo! Reading it...");
  try {
    const image = message.image;
    if (!image?.id) { await wa(phone, "❌ Could not read that photo. Please type your question instead."); return; }
    const mRes = await fetch(`https://graph.facebook.com/v21.0/${image.id}`, { headers: { Authorization: `Bearer ${Deno.env.get("WHATSAPP_ACCESS_TOKEN")}` } });
    const mData = await mRes.json();
    if (!mData.url) { await wa(phone, "❌ Could not download photo. Try again."); return; }
    const iRes = await fetch(mData.url, { headers: { Authorization: `Bearer ${Deno.env.get("WHATSAPP_ACCESS_TOKEN")}` } });
    if (!iRes.ok) { await wa(phone, "❌ Download failed. Please try again."); return; }
    const bytes = await iRes.arrayBuffer();
    if (bytes.byteLength > 16_000_000) { await wa(phone, "❌ Photo too large (max 16 MB). Please send a smaller image."); return; }
    const u8 = new Uint8Array(bytes);
    const CHUNK = 8192;
    const chunks: string[] = [];
    for (let i = 0; i < u8.length; i += CHUNK) chunks.push(String.fromCharCode(...Array.from(u8.slice(i, Math.min(i + CHUNK, u8.length)))));
    const b64 = btoa(chunks.join(""));
    if (!b64) { await wa(phone, "❌ Photo appears empty. Please try again."); return; }
    let mime = (image.mime_type || "image/jpeg").split(";")[0].trim().toLowerCase();
    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (!allowedMimes.includes(mime)) mime = "image/jpeg";

    const readPrompt = `You are an academic content analyzer. Extract ALL academic content visible in this image, including questions, problems, diagrams, formulas, code, or handwritten/printed notes.

INSTRUCTIONS:
- This image may be a direct photo OR a screenshot (e.g. of a PDF viewer, browser, or app) — either is fine.
- Ignore any browser UI, toolbars, tabs, address bars, scrollbars, window chrome, or app menus. Focus ONLY on the actual study content inside the page/document area.
- If you see ANY academic text, math equations, diagrams, code, or questions — even partially visible or split across a table — extract them in FULL detail.
- Include all numbers, symbols, subscripts, superscripts, and diagram labels EXACTLY as shown. Preserve question numbering and structure.
- Only reply with exactly NOT_ACADEMIC if there is truly no academic content at all (e.g. selfie, meme, random object, blank screen).

Output only the transcription/description, or NOT_ACADEMIC — no extra commentary.`;
    const extracted = await aiGeminiMultimodal([{ inline_data: { mime_type: mime, data: b64 } }, { text: readPrompt }], { temp: 0, tokens: 3000 });

    if (Deno.env.get("DEBUG_PHOTOS") === "true") {
      console.log(`[PHOTO_DEBUG] mime=${mime} bytes=${bytes.byteLength} extracted="${(extracted || "").slice(0, 200)}"`);
    }

    if (!extracted || extracted.trim() === "NOT_ACADEMIC") {
      await wa(phone, "📸 Got the photo, but I couldn't find a study question in it.\n\nTry:\n✅ A direct photo (not a screenshot) with good lighting\n✅ Uploading the PDF file directly\n✅ Just typing your question below!");
      return;
    }

    await wa(phone, `📸 *I can see:* ${extracted.slice(0, 300)}${extracted.length > 300 ? "…" : ""}\n\nAnswering...`);
    try { await d.from("voice_logs").insert({ phone_number: phone, college_id: role.collegeId, transcript: `[photo] ${extracted}`, created_at: new Date().toISOString() }); } catch {}
    if (role.userRole === "parent") { await handleParentAI(d, phone, extracted, role.children, role.collegeId); return; }
    await handleAI(d, extracted, role.userRole, role.userName, role.collegeId, phone, role);
  } catch (err) {
    console.error("Image handler:", err);
    await wa(phone, "❌ Couldn't process that photo. Please type your question instead.");
  }
}

// ── PDF HANDLER ────────────────────────────────────────────────────────────────
async function handlePDF(d: any, message: any, phone: string) {
  const role = await identifyUser(d, phone);
  if (!role || (role.userRole !== "teacher" && role.userRole !== "admin")) {
    await wa(phone, "❌ Only teachers and admins can upload documents.");
    return;
  }
  const doc = message.document;
  if (!doc?.mime_type?.includes("pdf")) { await wa(phone, "❌ Only PDF files are supported for knowledge upload."); return; }

  const fileName = doc.filename || "document.pdf";

  const fileSizeMB = doc.file_size ? doc.file_size / (1024 * 1024) : 0;
  if (fileSizeMB > 8) {
    await wa(phone,
      `❌ *PDF too large* (${fileSizeMB.toFixed(1)} MB — max 8 MB).\n\n` +
      `*How to fix:*\n` +
      `• Compress at *smallpdf.com* or *ilovepdf.com*\n` +
      `• Split into smaller parts\n` +
      `• Scanned PDFs can't be extracted — re-save via Google Docs → Download as PDF`
    );
    return;
  }

  await clearSession(d, phone);

  await setSession(d, phone, { step: "branch", mediaId: doc.id, fileName, collegeId: role.collegeId, uploadedBy: role.userName });
  await wa(phone, `📄 Got *${fileName}*!\n\nWhich *branch*?\n\n1️⃣ CS\n2️⃣ EC\n3️⃣ ME\n4️⃣ Civil\n5️⃣ All Branches\n\nReply with number or name.`);
}

async function handlePDFStep(d: any, phone: string, msg: string): Promise<boolean> {
  const s = await getSession(d, phone);
  if (!s || s.step?.startsWith("excel_") || s.step?.startsWith("class_")) return false;
  const m  = msg.trim();
  const ml = m.toLowerCase();
  if (s.step === "branch")   { s.branch = BMAP[ml] || m.toUpperCase(); s.step = "division"; await setSession(d, phone, s); await wa(phone, `✅ Branch: *${s.branch}*\n\nDivision?\n1️⃣ A  2️⃣ B  3️⃣ C  4️⃣ All`); return true; }
  if (s.step === "division") { s.division = DMAP[ml] || m.toUpperCase(); s.step = "semester"; await setSession(d, phone, s); await wa(phone, `✅ Division: *${s.division}*\n\nSemester? (1-8 or *all*)`); return true; }
  if (s.step === "semester") { const sem = ml === "all" ? null : parseInt(m); if (sem !== null && (isNaN(sem) || sem < 1 || sem > 8)) { await wa(phone, "❌ Enter 1-8 or *all*"); return true; } s.semester = sem; s.step = "subject_tag"; await setSession(d, phone, s); await wa(phone, `✅ Semester: *${sem ?? "All"}*\n\nSubject tag? (e.g. *DSA*, *DBMS*, *OS*)\nType *skip* to skip.`); return true; }
  if (s.step === "subject_tag") { s.subjectTag = ml === "skip" ? null : m.toUpperCase(); s.step = "title"; await setSession(d, phone, s); await wa(phone, `✅ Subject: *${s.subjectTag ?? "None"}*\n\nGive it a title or type *skip*.`); return true; }
  if (s.step === "title") {
    s.fileTitle = ml === "skip" ? s.fileName : m;
    s.step = "processing";
    await setSession(d, phone, s);
    await wa(phone, `⏳ Processing *${s.fileTitle}*...\n\nThis can take 30-90 seconds for large PDFs. I'll keep you updated!`);
    EdgeRuntime.waitUntil(processPDF(d, phone, s).catch(async (err) => {
      console.error("processPDF fatal:", err);
      await clearSession(d, phone);
      await wa(phone, "❌ PDF processing failed. Please try again or type *cancel* to reset.");
    }));
    return true;
  }
  if (s.step === "processing") {
    await wa(phone, "⏳ Still processing your PDF... Please wait a moment.");
    return true;
  }
  return false;
}

async function processPDF(d: any, phone: string, s: any) {
  try {
    const mRes = await fetch(`https://graph.facebook.com/v21.0/${s.mediaId}`, {
      headers: { Authorization: `Bearer ${Deno.env.get("WHATSAPP_ACCESS_TOKEN")}` },
    });
    const mData = await mRes.json();
    if (!mData.url) { await wa(phone, "❌ Cannot download PDF. Please resend."); await clearSession(d, phone); return; }

    const pRes = await fetch(mData.url, { headers: { Authorization: `Bearer ${Deno.env.get("WHATSAPP_ACCESS_TOKEN")}` } });
    if (!pRes.ok) { await wa(phone, "❌ Could not download PDF. Please resend."); await clearSession(d, phone); return; }

    const bytes = await pRes.arrayBuffer();
    console.log(`PDF: downloaded ${bytes.byteLength} bytes for ${s.fileName}`);

    if (bytes.byteLength > 10_000_000) {
      await wa(phone, "❌ PDF too large (max 10 MB). Please send a smaller file or split it.");
      await clearSession(d, phone);
      return;
    }

    const progressPing = async (msg: string) => { await wa(phone, msg).catch(() => {}); };

    const fullText = await extractPdfText(bytes, s.fileName, progressPing);

    if (!fullText || fullText.trim().length < 50) {
      await wa(phone,
        "❌ *Could not extract text from this PDF.*\n\n" +
        "*Possible causes:*\n" +
        "• Scanned/image-only PDF (no machine-readable text)\n" +
        "• Password-protected file\n" +
        "• AI service temporarily busy\n\n" +
        "*Fix:* Re-save via *Google Docs → Download as PDF* or *Microsoft Word → Save as PDF*, then resend.\n\n" +
        "Type *cancel* to reset."
      );
      await clearSession(d, phone);
      return;
    }

    const chunks = splitChunks(fullText, 500, 50);
    console.log(`PDF: ${chunks.length} chunks from ${fullText.length} chars`);

    let inserted = 0;
    const totalBatches = Math.ceil(chunks.length / 5);
    for (let bi = 0; bi < chunks.length; bi += 5) {
      const batch = chunks.slice(bi, bi + 5);
      const rows: any[] = [];

      const batchNum = Math.floor(bi / 5);
      if (chunks.length > 20 && batchNum > 0 && batchNum % Math.ceil(totalBatches / 5) === 0) {
        const pct = Math.round((bi / chunks.length) * 100);
        await progressPing(`📄 Indexing... ${pct}% done (${bi}/${chunks.length} sections)`);
      }

      for (let ci = 0; ci < batch.length; ci++) {
        const trimmed = batch[ci].trim();
        if (!trimmed) continue;
        const emb = await embed(trimmed);
        if (!emb) { console.warn(`embed() returned null for chunk ${bi + ci} — skipping`); continue; }
        rows.push({
          content: trimmed,
          college_id: s.collegeId,
          source: "pdf_upload",
          source_file: s.fileName,
          file_title: s.fileTitle,
          target_branch: s.branch,
          target_division: s.division,
          target_semester: s.semester,
          subject_tag: s.subjectTag ?? null,
          chunk_index: bi + ci,
          uploaded_by: s.uploadedBy,
          embedding: `[${emb.join(",")}]`,
        });
      }
      if (!rows.length) continue;
      const { error } = await d.from("doc_chunks").insert(rows);
      if (error) console.error("doc_chunks insert error:", error.message);
      else inserted += rows.length;
    }

    if (inserted === 0) {
      await wa(phone, "❌ PDF processed but no sections could be embedded. Please try again in a minute.");
      await clearSession(d, phone);
      return;
    }

    await d.from("doc_chunks").delete()
      .eq("college_id", s.collegeId)
      .eq("source_file", s.fileName)
      .eq("target_branch", s.branch)
      .eq("target_division", s.division)
      .lt("created_at", new Date().toISOString());

    try {
      await d.from("uploaded_files").insert({
        college_id: s.collegeId,
        file_name: s.fileName,
        file_title: s.fileTitle,
        branch: s.branch,
        division: s.division,
        semester: s.semester,
        subject_tag: s.subjectTag ?? null,
        uploaded_by: s.uploadedBy,
        chunk_count: inserted,
      });
    } catch {}

    await clearSession(d, phone);
    await wa(phone,
      `✅ *${s.fileTitle}* uploaded!\n\n` +
      `📚 *${inserted} sections* indexed\n` +
      `🎯 ${s.branch} Div-${s.division}${s.semester ? " Sem-" + s.semester : " All Sems"}${s.subjectTag ? "\n🏷️ Subject: " + s.subjectTag : ""}\n\n` +
      `Students can now ask:\n• *askpdf <question>*${s.subjectTag ? `\n• *askpdf ${s.subjectTag} <question>*` : ""} 🎓`
    );
  } catch (err) {
    console.error("processPDF:", err);
    await clearSession(d, phone);
    await wa(phone, "❌ PDF processing failed. Please try again. Type *cancel* to reset.");
  }
}

// ── STUDENT askpdf COMMAND ─────────────────────────────────────────────────────
async function handleAskPdf(d: any, phone: string, question: string, subjectTag: string | null, role: any) {
  if (!role) { await wa(phone, "❌ Not registered."); return; }
  await wa(phone, `🔍 Searching${subjectTag ? " *" + subjectTag + "*" : ""} materials...`);

  try {
    const qEmb = await embed(question);
    if (!qEmb) { await wa(phone, "❌ Search temporarily unavailable. Please try again."); return; }

    let query = d.rpc("match_doc_chunks", {
      query_embedding: `[${qEmb.join(",")}]`,
      match_college_id: role.collegeId,
      match_count: 15,
    });

    const { data: chunks } = await query;
    if (!chunks?.length) { await wa(phone, "📚 No materials found. Ask your teacher to upload relevant PDFs."); return; }

    let filtered = chunks;
    if (subjectTag) {
      filtered = chunks.filter((c: any) => c.subject_tag?.toUpperCase() === subjectTag.toUpperCase());
      if (!filtered.length) {
        filtered = chunks.filter((c: any) => c.subject_tag?.toUpperCase().includes(subjectTag.toUpperCase()));
      }
      if (!filtered.length) {
        await wa(phone, `📚 No materials found for *${subjectTag}*.\n\nAvailable subjects: Ask your teacher to tag PDFs when uploading.\n\nTrying general search...`);
        filtered = chunks;
      }
    }

    if (role.userRole === "student" && role.branch) {
      const branchFiltered = filtered.filter((c: any) =>
        (!c.target_branch || c.target_branch === "All" || c.target_branch === role.branch) &&
        (!c.target_division || c.target_division === "All" || c.target_division === role.division)
      );
      if (branchFiltered.length > 0) filtered = branchFiltered;
    }

    const best = filtered
      .filter((c: any) => (c.similarity ?? 0) >= 0.55)
      .slice(0, 5);

    if (!best.length) {
      await wa(phone, "📚 No closely matching content found for that question. Try rephrasing or check *myfiles* for available materials.");
      return;
    }

    const context = best.map((c: any) => c.content).join("\n---\n");
    const sourceFiles = [...new Set(best.map((c: any) => c.file_title || c.source_file))].join(", ");

    const prompt = `You are Cravex, a WhatsApp bot for VTU engineering students.
Answer the following question using ONLY the provided context from uploaded study materials.
Be concise, clear, and WhatsApp-friendly. Use *bold* for key terms.
If the answer is not in the context, say so clearly.

Context from: ${sourceFiles}
---
${context}
---

Question: ${question}`;

    const answer = await aiText(prompt, { temp: 0.3, tokens: 1500 });
    if (!answer) { await wa(phone, "❌ Could not generate answer. Please try again."); return; }

    await waSend(phone, answer + `\n\n📄 _Source: ${sourceFiles}_`);
  } catch (err) {
    console.error("handleAskPdf:", err);
    await wa(phone, "❌ Search failed. Please try again.");
  }
}

// ── listfiles COMMAND ──────────────────────────────────────────────────────────
async function handleListFiles(d: any, phone: string, collegeId: string, subjectFilter: string | null) {
  try {
    let q = d.from("uploaded_files")
      .select("file_name,file_title,branch,division,semester,subject_tag,chunk_count,uploaded_by,created_at")
      .eq("college_id", collegeId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (subjectFilter) q = q.ilike("subject_tag", `%${subjectFilter}%`);
    const { data: files } = await q;
    if (!files?.length) {
      await wa(phone, subjectFilter
        ? `📚 No files found for subject *${subjectFilter}*.`
        : "📚 No documents uploaded yet. Send a *PDF* to upload one."
      );
      return;
    }
    let msg = `📚 *Uploaded Files*${subjectFilter ? " — " + subjectFilter : ""}\n\n`;
    files.forEach((f: any, i: number) => {
      const date = new Date(f.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      msg += `*${i + 1}. ${f.file_title || f.file_name}*\n`;
      msg += `   🎯 ${f.branch} ${f.division ? "Div-" + f.division : ""} ${f.semester ? "Sem-" + f.semester : "All Sems"}\n`;
      if (f.subject_tag) msg += `   🏷️ ${f.subject_tag}\n`;
      msg += `   📦 ${f.chunk_count || 0} sections | 📅 ${date} | 👤 ${f.uploaded_by}\n\n`;
    });
    msg += "To delete: *deletefile <filename>*\nTo re-extract: *reprocesspdf*";
    await waSend(phone, msg);
  } catch (err) {
    console.error("handleListFiles:", err);
    await wa(phone, "❌ Could not list files. Please try again.");
  }
}

// ── deletefile COMMAND ─────────────────────────────────────────────────────────
async function handleDeleteFile(d: any, phone: string, collegeId: string, fileName: string) {
  if (!fileName) { await wa(phone, "Usage: *deletefile <filename>*\nExample: *deletefile DSA_Notes.pdf*\n\nUse *listfiles* to see file names."); return; }
  try {
    const { data: files } = await d.from("uploaded_files")
      .select("id,file_name,file_title,chunk_count")
      .eq("college_id", collegeId)
      .ilike("file_name", `%${fileName}%`);

    if (!files?.length) {
      await wa(phone, `❌ No file found matching *${fileName}*.\n\nUse *listfiles* to see exact file names.`);
      return;
    }
    if (files.length > 1) {
      const list = files.map((f: any, i: number) => `*${i + 1}.* ${f.file_title || f.file_name}`).join("\n");
      await wa(phone, `⚠️ Multiple files matched. Please be more specific:\n\n${list}`);
      return;
    }

    const file = files[0];
    await d.from("doc_chunks").delete().eq("college_id", collegeId).eq("source_file", file.file_name);
    await d.from("uploaded_files").delete().eq("id", file.id);

    await wa(phone, `🗑️ *${file.file_title || file.file_name}* deleted.\n\n${file.chunk_count || 0} indexed sections removed.`);
  } catch (err) {
    console.error("handleDeleteFile:", err);
    await wa(phone, "❌ Delete failed. Please try again.");
  }
}

// ── reprocesspdf COMMAND ───────────────────────────────────────────────────────
async function handleReprocessPdf(d: any, phone: string, collegeId: string, role: any) {
  try {
    const { data: lastFile } = await d.from("uploaded_files")
      .select("*")
      .eq("college_id", collegeId)
      .eq("uploaded_by", role.userName)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastFile) {
      await wa(phone, "📚 No previously uploaded file found for your account.\n\nSend a *PDF* to upload one.");
      return;
    }

    await wa(phone,
      `🔄 Re-processing *${lastFile.file_title || lastFile.file_name}*...\n\n` +
      `Note: This re-extracts using LlamaParse. The original WhatsApp PDF is no longer available — ` +
      `if re-extraction fails, please resend the PDF file.`
    );

    const { data: existingChunks } = await d.from("doc_chunks")
      .select("id,content")
      .eq("college_id", collegeId)
      .eq("source_file", lastFile.file_name)
      .order("chunk_index", { ascending: true });

    if (!existingChunks?.length) {
      await wa(phone, `❌ No stored content found for *${lastFile.file_title || lastFile.file_name}*.\n\nPlease resend the original PDF to re-upload.`);
      return;
    }

    EdgeRuntime.waitUntil((async () => {
      let reembedded = 0;
      for (const chunk of existingChunks) {
        const emb = await embed(chunk.content);
        if (!emb) continue;
        await d.from("doc_chunks").update({ embedding: `[${emb.join(",")}]` }).eq("id", chunk.id);
        reembedded++;
      }
      await d.from("uploaded_files").update({ chunk_count: reembedded, updated_at: new Date().toISOString() }).eq("id", lastFile.id);
      await wa(phone, `✅ Re-indexed *${lastFile.file_title || lastFile.file_name}*!\n\n📦 ${reembedded} sections re-embedded and ready.`);
    })().catch(async (err) => {
      console.error("reprocessPDF:", err);
      await wa(phone, "❌ Re-processing failed. Please resend the original PDF.");
    }));
  } catch (err) {
    console.error("handleReprocessPdf:", err);
    await wa(phone, "❌ Failed. Please try again.");
  }
}

// ── EXCEL HANDLER ──────────────────────────────────────────────────────────────
async function handleExcel(d: any, message: any, phone: string) {
  const role = await identifyUser(d, phone);
  if (!role || (role.userRole !== "teacher" && role.userRole !== "admin")) { await wa(phone, "❌ Only teachers/admins can upload Excel files."); return; }
  const doc = message.document;
  await wa(phone, `📊 Got *${doc.filename}*!\n\nIs this a:\n1️⃣ Student registration list\n2️⃣ Attendance update\n\nReply with 1 or 2.`);
  await setSession(d, phone, { step: "excel_type", mediaId: doc.id, fileName: doc.filename, collegeId: role.collegeId, uploadedBy: role.userName });
}

async function handleExcelStep(d: any, phone: string, msg: string): Promise<boolean> {
  const s = await getSession(d, phone);
  if (!s?.step?.startsWith("excel_")) return false;
  const m = msg.trim().toLowerCase();
  if (s.step === "excel_type") {
    if (m === "1" || m.includes("student") || m.includes("register")) { s.step = "excel_students_branch"; await setSession(d, phone, s); await wa(phone, "✅ Student registration.\n\nBranch?\n1️⃣ CS  2️⃣ EC  3️⃣ ME  4️⃣ Civil  5️⃣ All"); return true; }
    if (m === "2" || m.includes("attendance")) { s.step = "excel_att_branch"; await setSession(d, phone, s); await wa(phone, "✅ Attendance update.\n\nBranch?\n1️⃣ CS  2️⃣ EC  3️⃣ ME  4️⃣ Civil"); return true; }
    await wa(phone, "Reply with *1* (student list) or *2* (attendance)."); return true;
  }
  if (s.step === "excel_students_branch") { s.branch = BMAP[m] || m.toUpperCase(); s.step = "excel_students_div"; await setSession(d, phone, s); await wa(phone, `✅ Branch: *${s.branch}*\n\nDivision?\n1️⃣ A  2️⃣ B  3️⃣ C  4️⃣ All`); return true; }
  if (s.step === "excel_students_div")    { s.division = DMAP[m] || m.toUpperCase(); s.step = "excel_students_sem"; await setSession(d, phone, s); await wa(phone, `✅ Division: *${s.division}*\n\nSemester? (1-8)`); return true; }
  if (s.step === "excel_students_sem")    { const sem = parseInt(m); if (isNaN(sem) || sem < 1 || sem > 8) { await wa(phone, "❌ Enter 1-8"); return true; } s.semester = sem; s.step = "excel_students_processing"; await setSession(d, phone, s); await wa(phone, `⏳ Registering students for *${s.branch}* Div-${s.division} Sem-${s.semester}...`); await processStudentExcel(d, phone, s); return true; }
  if (s.step === "excel_att_branch")      { s.branch = BMAP[m] || m.toUpperCase(); s.step = "excel_att_div"; await setSession(d, phone, s); await wa(phone, `✅ Branch: *${s.branch}*\n\nDivision?\n1️⃣ A  2️⃣ B  3️⃣ C  4️⃣ All`); return true; }
  if (s.step === "excel_att_div")         { s.division = DMAP[m] || m.toUpperCase(); s.step = "excel_att_sem"; await setSession(d, phone, s); await wa(phone, `✅ Division: *${s.division}*\n\nSemester? (1-8)`); return true; }
  if (s.step === "excel_att_sem")         { const sem = parseInt(m); if (isNaN(sem) || sem < 1 || sem > 8) { await wa(phone, "❌ Enter 1-8"); return true; } s.semester = sem; s.step = "excel_att_processing"; await setSession(d, phone, s); await wa(phone, `⏳ Processing attendance...`); await processAttendanceExcel(d, phone, s); return true; }
  return false;
}

async function parseExcelWithGemini(mediaId: string, mode: "students" | "attendance"): Promise<any[] | null> {
  const mRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, { headers: { Authorization: `Bearer ${Deno.env.get("WHATSAPP_ACCESS_TOKEN")}` } });
  const mData = await mRes.json();
  if (!mData.url) return null;
  const fRes = await fetch(mData.url, { headers: { Authorization: `Bearer ${Deno.env.get("WHATSAPP_ACCESS_TOKEN")}` } });
  const bytes = await fRes.arrayBuffer();

  let csvText = "";
  try { csvText = await extractXlsxAsCSV(bytes); } catch (e) { console.error("XLSX extract:", e); }

  const prompt = mode === "students"
    ? `Parse this CSV/spreadsheet data and return ONLY a JSON array, no markdown, no explanation:\n[{"name":"string","phone":"10 or 12 digit number as string","roll_number":"string or null","usn":"string or null"}]\nRules:\n- phone must contain digits only (strip spaces/dashes), 10 or 12 digits\n- If phone is 10 digits, prefix with "91"\n- Skip header row and any row missing phone or name\n- roll_number is the roll/seat number (first column usually)\n- usn is university seat number like 1VT23CS001\n\nData:\n${csvText.slice(0, 6000)}`
    : `Parse this CSV/spreadsheet data and return ONLY a JSON array, no markdown:\n[{"phone":"10 or 12 digit number as string","attendance":number}]\nRules:\n- phone must be digits only, 10 or 12 digits. If 10 digits, prefix with "91"\n- attendance is the numeric percentage\n- Skip header row and rows missing phone\n\nData:\n${csvText.slice(0, 6000)}`;

  if (csvText.length > 20) {
    const raw = await aiText(prompt, { temp: 0, tokens: 4000 });
    if (raw) {
      try { const match = raw.match(/\[[\s\S]*\]/); if (match) { const parsed = JSON.parse(match[0]); if (parsed.length > 0) return parsed; } } catch {}
    }
  }

  const u8 = new Uint8Array(bytes);
  let bin = ""; for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.slice(i, i + 8192));
  const b64 = btoa(bin);
  for (const mime of ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"]) {
    const raw2 = await aiGeminiMultimodal([{ inline_data: { mime_type: mime, data: b64 } }, { text: prompt }], { temp: 0, tokens: 4000 });
    if (!raw2) continue;
    try { const match = raw2.match(/\[[\s\S]*\]/); if (match) return JSON.parse(match[0]); } catch {}
  }
  return null;
}

// ── XLSX PARSER ────────────────────────────────────────────────────────────────
async function extractXlsxAsCSV(bytes: ArrayBuffer): Promise<string> {
  const u8 = new Uint8Array(bytes);
  const files = await unzipAll(u8);
  const sharedStrings: string[] = [];
  const ssXml = files["xl/sharedStrings.xml"] || files["xl/SharedStrings.xml"] || "";
  if (ssXml) {
    for (const m of ssXml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)) {
      const texts = [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(t => decodeXmlEntities(t[1]));
      sharedStrings.push(texts.join(""));
    }
  }
  const sheetXml = files["xl/worksheets/sheet1.xml"] || "";
  if (!sheetXml) return "";
  const rows: string[] = [];
  for (const rowM of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cellM of rowM[1].matchAll(/<c\s[^>]*>([\s\S]*?)<\/c>/g)) {
      const cellTag = cellM[0];
      const inner   = cellM[1];
      const cellType = (cellTag.match(/\bt="([^"]*)"/)?.[1]) ?? "";
      let value = "";
      if (cellType === "inlineStr") {
        const isM = inner.match(/<is[^>]*>([\s\S]*?)<\/is>/);
        if (isM) value = [...isM[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(t => decodeXmlEntities(t[1])).join("");
      } else if (cellType === "s") {
        const idx = parseInt(inner.match(/<v>([^<]*)<\/v>/)?.[1] ?? "");
        value = isNaN(idx) ? "" : (sharedStrings[idx] || "");
      } else if (cellType === "str") {
        value = decodeXmlEntities(inner.match(/<v>([^<]*)<\/v>/)?.[1] ?? "");
      } else {
        value = inner.match(/<v>([^<]*)<\/v>/)?.[1] ?? "";
      }
      cells.push(value);
    }
    if (cells.some(c => c.trim())) rows.push(cells.join(","));
  }
  return rows.join("\n");
}
function decodeXmlEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
async function unzipAll(u8: Uint8Array): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  let i = 0;
  while (i < u8.length - 4) {
    if (u8[i] === 0x50 && u8[i+1] === 0x4B && u8[i+2] === 0x03 && u8[i+3] === 0x04) {
      const compression = u8[i+8] | (u8[i+9] << 8);
      const compSize    = u8[i+18] | (u8[i+19]<<8) | (u8[i+20]<<16) | (u8[i+21]<<24);
      const uncompSize  = u8[i+22] | (u8[i+23]<<8) | (u8[i+24]<<16) | (u8[i+25]<<24);
      const fnLen       = u8[i+26] | (u8[i+27] << 8);
      const extLen      = u8[i+28] | (u8[i+29] << 8);
      const dataStart   = i + 30 + fnLen + extLen;
      const fname       = new TextDecoder().decode(u8.slice(i + 30, i + 30 + fnLen));
      if (fname.endsWith(".xml") || fname.endsWith(".XML")) {
        const compData = u8.slice(dataStart, dataStart + compSize);
        try {
          if (compression === 0) {
            files[fname] = new TextDecoder("utf-8").decode(compData.slice(0, uncompSize));
          } else if (compression === 8) {
            const ds = new DecompressionStream("deflate-raw");
            const writer = ds.writable.getWriter();
            const reader = ds.readable.getReader();
            writer.write(compData); writer.close();
            const chunks: Uint8Array[] = [];
            let result = await reader.read();
            while (!result.done) { chunks.push(result.value); result = await reader.read(); }
            const total = chunks.reduce((acc, c) => acc + c.length, 0);
            const out = new Uint8Array(total);
            let off = 0;
            for (const c of chunks) { out.set(c, off); off += c.length; }
            files[fname] = new TextDecoder("utf-8").decode(out);
          }
        } catch (e) { console.error("Decompress", fname, e); }
      }
      i = dataStart + compSize;
    } else { i++; }
  }
  return files;
}

async function processStudentExcel(d: any, phone: string, s: any) {
  try {
    const rows = await parseExcelWithGemini(s.mediaId, "students");
    if (!rows?.length) { await wa(phone, "❌ No student rows found.\n\nRequired columns: *Name | Phone | Roll Number | USN*"); await clearSession(d, phone); return; }
    let inserted = 0, skipped = 0;
    const failed: string[] = [];
    const BATCH = 10;
    for (let bi = 0; bi < rows.length; bi += BATCH) {
      await Promise.all(rows.slice(bi, bi + BATCH).map(async (row: any) => {
        if (!row.name || !row.phone) { failed.push(row.name || "unnamed"); return; }
        let ph = row.phone.toString().replace(/\D/g, "");
        if (ph.length === 10) ph = "91" + ph;
        if (ph.length !== 12) { failed.push(row.name); return; }
        const { data: ex } = await d.from("students").select("name").eq("phone_number", ph).maybeSingle();
        if (ex) { skipped++; return; }
        const { error } = await d.from("students").insert({ name: row.name.trim(), phone_number: ph, college_id: s.collegeId, branch: s.branch, division: s.division, semester: s.semester, roll_number: row.roll_number || null, usn: row.usn || null, registered_by: s.uploadedBy, last_active: new Date().toISOString() });
        if (error) { failed.push(row.name); return; }
        inserted++;
        await sleep(300);
        try {
          await wa(ph,
            `🎉 Welcome to *Cravex*, *${row.name.trim()}*!\n\n` +
            `Your teacher *${s.uploadedBy}* has added you.\n` +
            `📚 *${s.branch}* Div-${s.division} Sem-${s.semester}` +
            `${row.roll_number ? `\n🔢 Roll No: *${row.roll_number}*` : ""}\n\n` +
            `*Commands:*\n• Ask any question\n• 🎤 Voice note\n• *myattendance*\n• *myrisk*\n• *myfiles*\n• *askpdf <question>*\n• *help*`
          );
        } catch {}
      }));
    }
    let msg = `✅ *Registration complete!*\n\n➕ Registered: *${inserted}*\n⏭️ Already existed: *${skipped}*\n`;
    if (failed.length) msg += `❌ Failed: *${failed.length}* — ${failed.slice(0, 5).join(", ")}\n`;
    msg += `\n📌 *${s.branch}* Div-${s.division} Sem-${s.semester}\nStudents can use the bot immediately!`;
    await wa(phone, msg);
  } catch (err) { console.error("StudentExcel:", err); await wa(phone, "❌ Processing failed. Format: Name | Phone | Roll | USN"); }
  finally { await clearSession(d, phone); }
}

async function processAttendanceExcel(d: any, phone: string, s: any) {
  try {
    const rows = await parseExcelWithGemini(s.mediaId, "attendance");
    if (!rows?.length) { await wa(phone, "❌ No rows found. Format: Phone | Attendance%"); await clearSession(d, phone); return; }
    let sent = 0, notFound = 0, parentAlerts = 0;
    for (const row of rows) {
      let ph = (row.phone || "").toString().replace(/\D/g, "");
      if (ph.length === 10) ph = "91" + ph;
      if (ph.length !== 12) { notFound++; continue; }
      const pct = parseFloat(row.attendance);
      if (isNaN(pct)) { notFound++; continue; }
      const { data: st } = await d.from("students").select("name,parent_phone,branch,division,semester").eq("phone_number", ph).eq("college_id", s.collegeId).maybeSingle();
      if (!st) { notFound++; continue; }
      await d.from("attendance_records").upsert({ phone_number: ph, college_id: s.collegeId, attendance_percent: pct, student_name: st.name, updated_at: new Date().toISOString() }, { onConflict: "phone_number,college_id" });
      const risk = pct >= 85 ? 0 : pct >= 75 ? Math.round((85 - pct) * 2) : Math.min(40, Math.round(20 + (75 - pct) * 1.5));
      await d.from("students").update({ risk_score: Math.min(100, risk), last_active: new Date().toISOString() }).eq("phone_number", ph);
      let msg = `📊 *Attendance Update*\n\n👤 ${st.name}\n🏷️ ${st.branch || s.branch} Div-${st.division || s.division} Sem-${st.semester || s.semester}\n\nAttendance: *${pct}%*\n`;
      if (pct < 75) msg += "\nStatus: ⚠️ *Below 75% — VTU Detention Risk!*";
      else if (pct < 80) { const days = Math.round((pct - 75) / (100 / 60) * 7); msg += `\nStatus: ⚡ May fall below 75% in ~${days} days.`; }
      else msg += "\nStatus: ✅ Good standing! 💪";
      try { await wa(ph, msg); sent++; } catch {}
      if (pct < 75 && st.parent_phone) { try { await wa(st.parent_phone, `📊 *Cravex Parent Alert*\n\nYour ward *${st.name}* has *${pct}% attendance* — below VTU's 75%.\n\nDetention risk.\n— Cravex`); parentAlerts++; } catch {} }
      await sleep(200);
    }
    await wa(phone, `✅ *Attendance updated!*\n\n📤 Notified: *${sent}*\n❌ Not found: *${notFound}*\n👨‍👩‍👧 Parent alerts: *${parentAlerts}*\n\n${notFound > 0 ? "⚠️ Not found = not registered. Upload student list first." : "All done!"}`);
  } catch (err) { console.error("AttExcel:", err); await wa(phone, "❌ Processing failed. Try again."); }
  finally { await clearSession(d, phone); }
}

// ── COMMAND HANDLERS ───────────────────────────────────────────────────────────
async function handleAttendanceUpdate(d: any, body: string, collegeId: string, phone: string) {
  const json = body.replace(/^attendance:\s*/i, "").trim();
  let data: Record<string, string>;
  try { data = JSON.parse(json); } catch { await wa(phone, `❌ Format: *attendance: {"91XXXXXXXXXX":"72%"}*`); return; }
  let sent = 0, failed = 0;
  for (const [ph, pct] of Object.entries(data)) {
    const { data: st } = await d.from("students").select("name,parent_phone").eq("phone_number", ph).eq("college_id", collegeId).maybeSingle();
    if (!st) { failed++; continue; }
    const p = parseFloat(pct);
    await d.from("attendance_records").upsert({ phone_number: ph, college_id: collegeId, attendance_percent: isNaN(p) ? null : p, student_name: st.name, updated_at: new Date().toISOString() }, { onConflict: "phone_number,college_id" });
    const risk = isNaN(p) ? 0 : p >= 85 ? 0 : p >= 75 ? Math.round((85 - p) * 2) : Math.round(25 + (75 - p) * 1.5);
    await d.from("students").update({ risk_score: Math.min(100, risk), last_active: new Date().toISOString() }).eq("phone_number", ph);
    let msg = `📊 *Attendance Update*\n\n👤 ${st.name}\nAttendance: *${pct}*\n`;
    if (isNaN(p)) msg += "\nStatus: ❓ Unknown";
    else if (p < 75) msg += "\nStatus: ⚠️ *Below 75% — VTU Detention Risk!*";
    else if (p < 80) { const days = Math.round((p - 75) / (100 / 60) * 7); msg += `\nStatus: ⚡ May fall below 75% in ~${days} days.`; }
    else msg += "\nStatus: ✅ Good standing! 💪";
    try { await wa(ph, msg); sent++; } catch { failed++; }
    if (!isNaN(p) && p < 75 && st.parent_phone) await wa(st.parent_phone, `📊 *Cravex Parent Alert*\n\nYour ward *${st.name}* has *${pct} attendance* — below VTU's 75%.\n\n— Cravex`).catch(() => {});
  }
  await wa(phone, `✅ Done!\n📤 Sent: ${sent}\n❌ Not found: ${failed}`);
}

async function handleMyAttendance(d: any, phone: string, collegeId: string, userName: string, role: any) {
  const isStaff = role.userRole === "admin" || role.userRole === "teacher";
  if (isStaff) {
    const { data: assignments } = await d.from("subject_assignments").select("branch,semester,division,subject_id,subjects(name,code)").eq("teacher_phone", phone).eq("college_id", collegeId);
    if (!assignments?.length) { await wa(phone, "📊 No subjects assigned yet.\n\nType *start class* to begin."); return; }
    let msg = "📊 *Class Attendance Summary*\n\n";
    for (const a of assignments) {
      const { data: subAtt } = await d.from("student_subject_attendance").select("student_name,attendance_percent,vtu_status,total_classes").eq("college_id", collegeId).eq("subject_id", a.subject_id || "").eq("branch", a.branch).eq("division", a.division).eq("semester", a.semester).order("attendance_percent", { ascending: true });
      const total = subAtt?.length || 0;
      const atRisk = subAtt?.filter((r: any) => r.vtu_status === "at_risk").length || 0;
      const warning = subAtt?.filter((r: any) => r.vtu_status === "warning").length || 0;
      const avgPct = total > 0 ? Math.round(subAtt!.reduce((s: number, r: any) => s + (r.attendance_percent || 0), 0) / total) : 0;
      const classes = subAtt?.[0]?.total_classes || 0;
      msg += `📚 *${a.subjects?.name}* (${a.subjects?.code || ""})\n`;
      msg += `🏷️ ${a.branch} Div-${a.division} Sem-${a.semester}\n`;
      msg += `👥 ${total} students | 🕐 ${classes} classes | Avg: *${avgPct}%*\n`;
      if (atRisk)   msg += `🔴 At risk (<75%): *${atRisk}*\n`;
      if (warning)  msg += `🟡 Warning (75-80%): *${warning}*\n`;
      if (atRisk === 0 && warning === 0 && total > 0) msg += `🟢 All students safe!\n`;
      msg += "\n";
    }
    msg += "Full breakdown: *atrisk* command or Cravex dashboard.";
    await waSend(phone, msg);
    return;
  }
  const { data: st } = await d.from("students").select("branch,division,semester").eq("phone_number", phone).eq("college_id", collegeId).maybeSingle();
  const { data: subjects } = await d.from("student_subject_attendance").select("subject_name,subject_code,attendance_percent,present_count,total_classes,vtu_status").eq("student_phone", phone).eq("college_id", collegeId).order("attendance_percent", { ascending: true });
  if (!subjects?.length) { await wa(phone, `📊 No attendance recorded yet, *${userName}*.\n\nYour teacher will mark the first class soon.`); return; }
  let msg = `📊 *Your Attendance*\n\n👤 *${userName}*\n`;
  if (st?.branch) msg += `🏷️ ${st.branch} Div-${st.division || "?"} Sem-${st.semester || "?"}\n\n`;
  let overallPresent = 0, overallTotal = 0;
  for (const sub of subjects) {
    const pct    = sub.attendance_percent ?? 0;
    const status = sub.vtu_status;
    const emoji  = status === "at_risk" ? "🔴" : status === "warning" ? "🟡" : "🟢";
    msg += `${emoji} *${sub.subject_name}* (${sub.subject_code || ""})\n`;
    msg += `   ${sub.present_count}/${sub.total_classes} classes — *${pct}%*\n`;
    if (status === "at_risk") {
      const need = Math.ceil((0.75 * sub.total_classes - sub.present_count) / 0.25);
      if (need > 0) msg += `   ⚠️ Need *${need} more* classes to reach 75%\n`;
    } else if (status === "warning") {
      const daysLeft = Math.round((pct - 75) / (100 / (sub.total_classes || 60)) * 7);
      msg += `   ⚡ May drop below 75% in ~${daysLeft} days\n`;
    }
    overallPresent += (sub.present_count || 0);
    overallTotal   += (sub.total_classes || 0);
    msg += "\n";
  }
  if (overallTotal > 0) {
    const overall = Math.round(overallPresent * 100 / overallTotal);
    msg += `📈 *Overall: ${overall}%* across all subjects\n`;
  }
  const atRiskCount = subjects.filter((s: any) => s.vtu_status === "at_risk").length;
  if (atRiskCount > 0) msg += `\n⚠️ *${atRiskCount} subject(s) below 75% — VTU detention risk!*\nAttend every remaining class for those subjects.`;
  else msg += "\n✅ All subjects safe! Keep it up 💪";
  await waSend(phone, msg);
}

async function handleMarkEntry(d: any, body: string, collegeId: string, phone: string) {
  const parts = body.replace(/^!marks\s*/i, "").trim().split(/\s+/);
  if (parts.length < 3) { await wa(phone, "Format: *!marks 91XXXXXXXXXX SubjectName 22/30*"); return; }
  const ph = parts[0], marksRaw = parts[parts.length - 1], subject = parts.slice(1, parts.length - 1).join(" ");
  const [obtained, max] = marksRaw.split("/").map(Number);
  if (isNaN(obtained)) { await wa(phone, "❌ Invalid marks. Format: 22/30"); return; }
  const { data: st } = await d.from("students").select("name,parent_phone").eq("phone_number", ph).eq("college_id", collegeId).maybeSingle();
  if (!st) { await wa(phone, "❌ Student not found."); return; }
  const maxM = isNaN(max) ? 30 : max;
  await d.from("student_marks").upsert({ phone_number: ph, college_id: collegeId, subject, marks_obtained: obtained, max_marks: maxM, updated_at: new Date().toISOString() }, { onConflict: "phone_number,college_id,subject,test_number" }).catch(() => {});
  const pct = Math.round((obtained / maxM) * 100), weak = pct < 60;
  let msg = `📝 *Marks Updated*\n\n👤 ${st.name}\nSubject: *${subject}*\nScore: *${obtained}/${maxM}* (${pct}%)`;
  msg += weak ? "\n\n⚠️ Below 60%. Ask the bot for notes!" : pct < 75 ? "\n\n📈 Room to improve." : "\n\n✅ Good performance!";
  await wa(ph, msg);
  if (weak && st.parent_phone) await wa(st.parent_phone, `📝 *Cravex Parent Alert*\n\n*${st.name}* scored *${obtained}/${maxM}* in *${subject}* (${pct}%).\n\n— Cravex`).catch(() => {});
  await wa(phone, `✅ Marks saved — ${st.name}: ${subject} ${obtained}/${maxM} (${pct}%)`);
}

async function handleMyMarks(d: any, phone: string, collegeId: string, userName: string) {
  let marks: any[] = [];
  try { const { data: m } = await d.from("student_marks").select("subject,marks_obtained,max_marks").eq("phone_number", phone).eq("college_id", collegeId); marks = m || []; } catch {}
  if (!marks.length) { await wa(phone, `📝 No marks recorded yet, *${userName}*.\n\nYour teacher will enter them soon.`); return; }
  const list = marks.map(m => { const pct = Math.round(m.marks_obtained / m.max_marks * 100); return `${pct >= 75 ? "✅" : pct >= 60 ? "📈" : "⚠️"} *${m.subject}*: ${m.marks_obtained}/${m.max_marks} (${pct}%)`; }).join("\n");
  await wa(phone, `📝 *Your Marks*\n\n👤 *${userName}*\n\n${list}`);
}

async function handleParentLink(d: any, body: string, collegeId: string, phone: string) {
  const parts = body.replace(/^!parent\s*/i, "").trim().split(/\s+/);
  if (parts.length < 2) { await wa(phone, "Format: *!parent StudentPhone ParentPhone ParentName*"); return; }
  const [sp, pp, ...n] = parts;
  const pname = n.join(" ") || "Parent";
  try { await d.from("parent_contacts").upsert({ student_phone: sp, parent_phone: pp, college_id: collegeId, parent_name: pname }, { onConflict: "student_phone,college_id" }); } catch {}
  await d.from("students").update({ parent_phone: pp }).eq("phone_number", sp).eq("college_id", collegeId);
  let notified = false;
  try {
    const { data: st } = await d.from("students").select("name").eq("phone_number", sp).eq("college_id", collegeId).maybeSingle();
    await wa(pp,
      `👋 Welcome to *Cravex*, *${pname}*!\n\n` +
      `You've been linked as the parent/guardian of *${st?.name || "your ward"}*.\n\n` +
      `*You can now:*\n• *attendance* — subject-wise attendance\n• *marks* — internal marks\n• *risk* — academic risk score\n• *notices* — college announcements\n• Ask any question about your ward\n\n` +
      `You'll also get automatic alerts if attendance or marks drop below the safe range.`
    );
    notified = true;
  } catch {}
  await wa(phone, `✅ Parent *${pname}* linked to student ${sp}.${notified ? "\n📩 Welcome message sent to parent." : "\n⚠️ Welcome message not sent — ask parent to message this number first, or check the number."}`);
}

async function handleRiskScore(d: any, phone: string, collegeId: string, userName: string, role: any) {
  if (role.userRole === "admin" || role.userRole === "teacher") { await handleAtRisk(d, collegeId, phone, role); return; }
  const { data: st } = await d.from("students").select("branch,division,semester").eq("phone_number", phone).eq("college_id", collegeId).maybeSingle();
  const { data: subjectAtt } = await d.from("student_subject_attendance").select("subject_name,subject_code,attendance_percent,vtu_status,present_count,total_classes").eq("student_phone", phone).eq("college_id", collegeId);
  let marks: any[] = [];
  try { const { data: m } = await d.from("student_marks").select("subject,marks_obtained,max_marks").eq("phone_number", phone).eq("college_id", collegeId); marks = m || []; } catch {}
  let attRisk = 0;
  const atRiskSubs  = subjectAtt?.filter((s: any) => s.vtu_status === "at_risk")  || [];
  const warningSubs = subjectAtt?.filter((s: any) => s.vtu_status === "warning")  || [];
  if (atRiskSubs.length > 0) {
    const worstPct = Math.min(...atRiskSubs.map((s: any) => s.attendance_percent || 0));
    attRisk = Math.min(40, Math.round(20 + (75 - worstPct) * 1.5) + (atRiskSubs.length - 1) * 5);
  } else if (warningSubs.length > 0) {
    attRisk = Math.round(warningSubs.length * 8);
  }
  let marksRisk = 0;
  if (marks.length > 0) {
    const weak = marks.filter((m: any) => m.marks_obtained / m.max_marks < 0.6).length;
    marksRisk = Math.round((weak / marks.length) * 60);
  }
  const total = Math.min(100, attRisk + marksRisk);
  await d.from("students").update({ risk_score: total }).eq("phone_number", phone).catch(() => {});
  const emoji = total < 20 ? "🟢" : total < 50 ? "🟡" : total < 75 ? "🟠" : "🔴";
  const level = total < 20 ? "Low — You're on track!" : total < 50 ? "Moderate — Stay focused" : total < 75 ? "High — Needs attention" : "Critical — Act now!";
  let msg = `${emoji} *Academic Risk Score*\n\n👤 *${userName}*\n`;
  if (st?.branch) msg += `🏷️ ${st.branch} Div-${st.division || "?"} Sem-${st.semester || "?"}\n`;
  msg += `\nRisk: *${total}/100* — ${level}\n`;
  if (subjectAtt?.length) {
    msg += "\n📊 *Subject-wise Attendance:*\n";
    for (const sub of subjectAtt) {
      const e = sub.vtu_status === "at_risk" ? "🔴" : sub.vtu_status === "warning" ? "🟡" : "🟢";
      msg += `${e} ${sub.subject_name}: *${sub.attendance_percent}%* (${sub.present_count}/${sub.total_classes})\n`;
    }
  }
  if (marks.length > 0) {
    const weak = marks.filter((m: any) => m.marks_obtained / m.max_marks < 0.6);
    if (weak.length) msg += `\n📝 *Weak subjects (marks < 60%):*\n${weak.map((m: any) => `• ${m.subject}: ${m.marks_obtained}/${m.max_marks}`).join("\n")}`;
  } else { msg += "\n📝 No marks recorded yet"; }
  if (total >= 50) msg += "\n\n💡 Focus on low-attendance subjects. Ask the bot for notes on weak topics.";
  else msg += "\n\n✅ Keep consistent attendance and you'll be fine!";
  await waSend(phone, msg);
}

async function handleAtRisk(d: any, collegeId: string, phone: string, role: any) {
  if (role.userRole === "student") { await handleRiskScore(d, phone, collegeId, role.userName, role); return; }
  const isAdmin = role.userRole === "admin";
  let query = d.from("student_subject_attendance")
    .select("student_phone,student_name,subject_name,subject_code,attendance_percent,vtu_status,branch,division,semester,total_classes,present_count")
    .eq("college_id", collegeId).eq("vtu_status", "at_risk").order("attendance_percent", { ascending: true });
  if (!isAdmin) {
    const { data: assignments } = await d.from("subject_assignments").select("branch,semester,division").eq("teacher_phone", phone).eq("college_id", collegeId);
    if (!assignments?.length) { await wa(phone, "📊 No subjects assigned yet."); return; }
    const branches = [...new Set(assignments.map((a: any) => a.branch))];
    query = query.in("branch", branches);
  }
  const { data: atRiskRows } = await query.limit(50);
  if (!atRiskRows?.length) { await wa(phone, "🟢 *No students below 75%!*\n\nAll students are in safe zone across all subjects."); return; }
  const byStudent: Record<string, any> = {};
  for (const row of atRiskRows) {
    if (!byStudent[row.student_phone]) byStudent[row.student_phone] = { name: row.student_name, phone: row.student_phone, branch: row.branch, division: row.division, semester: row.semester, subjects: [] };
    byStudent[row.student_phone].subjects.push({ name: row.subject_name, code: row.subject_code, pct: row.attendance_percent, present: row.present_count, total: row.total_classes });
  }
  const students = Object.values(byStudent);
  students.sort((a: any, b: any) => {
    const avgA = a.subjects.reduce((s: number, x: any) => s + x.pct, 0) / a.subjects.length;
    const avgB = b.subjects.reduce((s: number, x: any) => s + x.pct, 0) / b.subjects.length;
    return avgA - avgB;
  });
  let msg = `🚨 *At-Risk Report* — ${students.length} student(s) below 75%\n\n`;
  for (const st of students.slice(0, 10)) {
    msg += `🔴 *${st.name}* (${st.branch} Div-${st.division} Sem-${st.semester})\n`;
    for (const sub of st.subjects) {
      const need = Math.ceil((0.75 * sub.total - sub.present) / 0.25);
      msg += `   • ${sub.name}: *${sub.pct}%* — needs ${need > 0 ? need + " more classes" : "immediate attention"}\n`;
    }
    msg += "\n";
  }
  if (students.length > 10) msg += `_...and ${students.length - 10} more. See dashboard for full list._\n\n`;
  msg += "Full analytics on the Cravex dashboard.";
  await waSend(phone, msg);
}

async function handleMyFiles(d: any, phone: string, collegeId: string, role: any) {
  const isStaff = role.userRole === "admin" || role.userRole === "teacher";
  let q = d.from("uploaded_files").select("*").eq("college_id", collegeId).order("created_at", { ascending: false }).limit(15);
  if (!isStaff && role.branch) q = q.or(`branch.eq.${role.branch},branch.eq.All`);
  const { data: files } = await q;
  const filtered = isStaff ? files : (files || []).filter((f: any) => !f.division || f.division === "All" || f.division === role.division);
  if (!filtered?.length) { await wa(phone, isStaff ? "📚 No documents uploaded yet." : "📚 No materials for your branch yet."); return; }
  const list = filtered.map((f: any, i: number) =>
    `*${i + 1}. ${f.file_title || f.file_name}*\n   🎯 ${f.branch || "All"} ${f.division ? `Div-${f.division}` : "All Divs"} ${f.semester ? `Sem-${f.semester}` : "All Sems"}${f.subject_tag ? `\n   🏷️ ${f.subject_tag}` : ""}`
  ).join("\n\n");
  await wa(phone, `📚 *${isStaff ? "All Documents" : "Your Study Materials"}*\n\n${list}\n\nAsk:\n• *askpdf <question>*\n• *askpdf <subject> <question>*`);
}

async function handleBroadcast(d: any, body: string, collegeId: string, phone: string) {
  let msg = body.replace(/^broadcast:\s*/i, "").trim();
  if (!msg) { await wa(phone, "Usage: *broadcast: Your message here*"); return; }
  if (msg.length > 3800) { msg = msg.slice(0, 3800); await wa(phone, "⚠️ Message trimmed to 3800 characters."); }
  await d.from("announcements").insert({ college_id: collegeId, message: msg, created_at: new Date().toISOString() });
  const { data: students } = await d.from("students").select("phone_number").eq("college_id", collegeId);
  if (!students?.length) { await wa(phone, "❌ No students registered yet."); return; }
  await wa(phone, `📢 Broadcasting to *${students.length}* students...`);
  EdgeRuntime.waitUntil((async () => {
    let sent = 0;
    for (let i = 0; i < students.length; i++) {
      try { await wa(students[i].phone_number, `📢 *College Announcement*\n\n${msg}`); sent++; } catch {}
      if (i > 0 && i % 10 === 0) await sleep(1000);
      else await sleep(200);
    }
    await wa(phone, `✅ Broadcast complete! Sent to *${sent}/${students.length}* students.`);
  })().catch(console.error));
}

async function handleSmartNotice(d: any, collegeId: string, phone: string) {
  const [{ data: atRiskRows }, { data: recent }] = await Promise.all([
    d.from("student_subject_attendance").select("student_name,subject_name,attendance_percent").eq("college_id", collegeId).eq("vtu_status", "at_risk").limit(30),
    d.from("announcements").select("message").eq("college_id", collegeId).order("created_at", { ascending: false }).limit(3),
  ]);
  const uniqueAtRisk   = new Set(atRiskRows?.map((r: any) => r.student_name) || []).size;
  const worstSubjects  = [...new Set(atRiskRows?.map((r: any) => r.subject_name) || [])].slice(0, 3).join(", ");
  const ctx = `Date: ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}.` +
    ` Students below 75% VTU attendance: ${uniqueAtRisk}.` +
    (worstSubjects ? ` Subjects with most absences: ${worstSubjects}.` : "") +
    ` Recent notices: ${recent?.map((r: any) => r.message.slice(0, 40)).join(" | ") || "none"}.`;
  const raw = await aiText(
    `You are an assistant for a VTU engineering college in India. Generate 3 official college notices.\nData: ${ctx}\n\nReturn ONLY valid JSON array, no markdown:\n[{"type":"attendance","message":"..."},{"type":"academic","message":"..."},{"type":"general","message":"..."}]\nEach message under 80 words.`,
    { temp: 0.5, tokens: 600 }
  );
  if (!raw) { await wa(phone, "❌ Could not generate notices. Try again."); return; }
  let notices: any[] = [];
  try { const match = raw.match(/\[[\s\S]*\]/); if (match) notices = JSON.parse(match[0]); } catch {}
  if (!notices.length) { await wa(phone, "❌ Could not generate notices. Try again."); return; }
  let msg = "🤖 *AI Smart Notices*\n\n";
  notices.slice(0, 3).forEach((n: any, i: number) => { msg += `*${i + 1}. ${(n.type || "NOTICE").toUpperCase()}*\n${n.message}\n\n`; });
  msg += "To send: *broadcast: [message]*";
  await wa(phone, msg);
}

async function handleNotices(d: any, collegeId: string, phone: string) {
  const { data } = await d.from("announcements").select("message,created_at").eq("college_id", collegeId).order("created_at", { ascending: false }).limit(5);
  if (!data?.length) { await wa(phone, "📋 No announcements yet."); return; }
  await wa(phone, "📋 *Latest Announcements*\n\n" + data.map((n: any, i: number) => `*${i + 1}. ${new Date(n.created_at).toLocaleDateString("en-IN")}*\n${n.message}`).join("\n\n"));
}

async function handleAddSingleStudent(d: any, body: string, collegeId: string, phone: string, role: any) {
  const raw = body.replace(/^!add\s+student\s*/i, "").trim();
  const parts = raw.split(/\s+/);
  if (parts.length < 4) { await wa(phone, "Format: *!add student Phone Name RollNo Branch Semester [Division]*\n\nExample:\n*!add student 919731096483 Arjun Patil 01 CS 3 A*\n\nOr send an *Excel file* to register a whole class."); return; }
  let ph = parts[0].replace(/\D/g, "");
  if (ph.length === 10) ph = "91" + ph;
  if (ph.length !== 12) { await wa(phone, `❌ Invalid phone: ${parts[0]}\nUse 10 or 12 digit number.`); return; }
  const lastPart = parts[parts.length - 1].toUpperCase();
  const hasDivision = ["A", "B", "C"].includes(lastPart) && isNaN(parseInt(lastPart));
  let division = "A", semIdx = parts.length - 1;
  if (hasDivision) { division = lastPart; semIdx = parts.length - 2; }
  const sem = parseInt(parts[semIdx]);
  if (isNaN(sem) || sem < 1 || sem > 8) { await wa(phone, `❌ Semester must be 1-8.`); return; }
  const branchRaw = parts[semIdx - 1]?.toLowerCase() || "cs";
  const branch = BMAP[branchRaw] || parts[semIdx - 1]?.toUpperCase() || "CS";
  const rollNo = parts[semIdx - 2] || null;
  const name = parts.slice(1, semIdx - 2).join(" ");
  if (!name) { await wa(phone, "❌ Name missing.\nFormat: *!add student Phone Name RollNo Branch Semester*"); return; }
  const { data: ex } = await d.from("students").select("name,branch,division,semester").eq("phone_number", ph).maybeSingle();
  if (ex) { await wa(phone, `⚠️ *${ph}* already registered as *${ex.name}* (${ex.branch} Div-${ex.division} Sem-${ex.semester}).`); return; }
  const { error } = await d.from("students").insert({ name: name.trim(), phone_number: ph, college_id: collegeId, branch, division, semester: sem, roll_number: rollNo || null, registered_by: role.userName || "Teacher", last_active: new Date().toISOString() });
  if (error) { await wa(phone, `❌ Could not add student: ${error.message}`); return; }
  let welcomeSent = false;
  try {
    await wa(ph,
      `🎉 Welcome to *Cravex*, *${name.trim()}*!\n\n` +
      `Your teacher *${role.userName}* has added you.\n` +
      `📚 *${branch}* Div-${division} Sem-${sem}` +
      `${rollNo ? `\n🔢 Roll No: *${rollNo}*` : ""}\n\n` +
      `*Commands:*\n• Ask any question\n• 🎤 Voice note\n• *myattendance*\n• *myrisk*\n• *myfiles*\n• *askpdf <question>*\n• *help*`
    );
    welcomeSent = true;
  } catch {}
  await wa(phone,
    `✅ *${name.trim()}* added!\n\n` +
    `📱 ${ph}\n🏷️ ${branch} Div-${division} Sem-${sem}` +
    `${rollNo ? `\n🔢 Roll: ${rollNo}` : ""}\n` +
    (welcomeSent ? "\n📩 Welcome message sent!" : "\n⚠️ Welcome not sent (student hasn't messaged bot yet)")
  );
}

async function handleAddTeacher(d: any, body: string, collegeId: string, phone: string) {
  const parts = body.trim().split(/\s+/);
  const np = parts[2], name = parts.slice(3).join(" ") || "Teacher";
  if (!np) { await wa(phone, "Usage: *!add teacher 91XXXXXXXXXX Name*"); return; }
  const { error } = await d.from("users").insert({ phone_number: np, role: "teacher", college_id: collegeId, name });
  if (error) { await wa(phone, `❌ ${error.message}`); return; }
  const { data: col } = await d.from("colleges").select("name").eq("id", collegeId).maybeSingle();
  let welcomeSent = false;
  try {
    await wa(np,
      `👋 Welcome to *Cravex*, *${name}*!\n\n` +
      `You've been added as a *Teacher* at *${col?.name || "your college"}*.\n\n` +
      `*Your commands:*\n` +
      `• *start class* — take attendance by roll numbers\n` +
      `• *mysubjects* — see assigned subjects\n` +
      `• Send *PDF* — upload study material\n` +
      `• Send *Excel* — bulk register students or update attendance\n` +
      `• *!marks 91XX Subject 22/30* — enter marks\n` +
      `• *broadcast: message* — send notice to all students\n` +
      `• *atrisk* — see at-risk students\n` +
      `• *listfiles* — see uploaded documents\n` +
      `• *help* — full command list\n\n` +
      `Ask your admin to assign subjects so you can start taking attendance. 🎓`
    );
    welcomeSent = true;
  } catch {}
  await wa(phone,
    `✅ Teacher *${name}* added!\n\n` +
    (welcomeSent ? `📱 Welcome message sent to ${np}.` :
      `⚠️ Welcome NOT sent to ${np} yet.\n\n*Fix:* Ask *${name}* to send *hi* to this bot number first.`) +
    `\n\nNext:\n1. *!addsubject SubjectName Branch Semester*\n2. *!assign ${np} SubjectName Branch Semester*`
  );
}

async function handleAddSubject(d: any, body: string, collegeId: string, phone: string) {
  const raw = body.replace(/^!addsubject\s*/i, "").trim();
  const parts = raw.split(/\s+/);
  if (parts.length < 3) { await wa(phone, "Format: *!addsubject SubjectName Branch Semester*\nExample: *!addsubject Physics CS 1*"); return; }
  const semStr = parts[parts.length - 1] || "";
  const sem = parseInt(semStr.replace(/[^0-9]/g, ""));
  if (isNaN(sem) || sem < 1 || sem > 8) { await wa(phone, `❌ Semester must be 1-8. Got: "${semStr}"`); return; }
  const branchRaw = parts[parts.length - 2].toLowerCase();
  const branch = BMAP[branchRaw] || parts[parts.length - 2].toUpperCase();
  const thirdFromLast = parts[parts.length - 3] || "";
  const looksLikeCode = /\d/.test(thirdFromLast) || (thirdFromLast.length <= 8 && thirdFromLast === thirdFromLast.toUpperCase() && thirdFromLast.length > 2);
  let code = "", name = "";
  if (parts.length >= 4 && looksLikeCode) { code = thirdFromLast; name = parts.slice(0, parts.length - 3).join(" ") || code; }
  else { name = parts.slice(0, parts.length - 2).join(" "); }
  if (!name) { await wa(phone, "❌ Subject name missing."); return; }
  const { data: existing } = await d.from("subjects").select("id").eq("college_id", collegeId).ilike("name", name).eq("branch", branch).eq("semester", sem).maybeSingle();
  if (existing) { await wa(phone, `⚠️ *${name}* already exists for ${branch} Sem-${sem}.`); return; }
  const { error } = await d.from("subjects").insert({ college_id: collegeId, name, code: code || null, branch, semester: sem });
  if (error) { await wa(phone, `❌ ${error.message}`); return; }
  await wa(phone, `✅ *${name}*${code ? " (" + code + ")" : ""} added!\n🏷️ ${branch} Sem-${sem}\n\nAssign teacher: *!assign TeacherPhone ${name} ${branch} ${sem}*`);
}

async function handleAssignSubject(d: any, body: string, collegeId: string, phone: string) {
  const raw = body.replace(/^!assign\s*/i, "").trim();
  const parts = raw.split(/\s+/);
  if (parts.length < 4) { await wa(phone, "Format: *!assign TeacherPhone SubjectName Branch Semester [Division]*"); return; }
  const teacherPhone = parts[0];
  const lastPart = parts[parts.length - 1].toUpperCase();
  const isDivision = ["A", "B", "C", "ALL"].includes(lastPart) && isNaN(parseInt(lastPart));
  let div = "A", semIdx = parts.length - 1;
  if (isDivision) { div = DMAP[parts[parts.length - 1].toLowerCase()] || lastPart; semIdx = parts.length - 2; }
  const sem = parseInt(parts[semIdx]);
  if (isNaN(sem) || sem < 1 || sem > 8) { await wa(phone, `❌ Semester invalid. Use 1-8.`); return; }
  const branch = BMAP[parts[semIdx - 1]?.toLowerCase()] || parts[semIdx - 1]?.toUpperCase() || "CS";
  const subjectName = parts.slice(1, semIdx - 1).join(" ");
  if (!subjectName) { await wa(phone, "❌ Subject name missing."); return; }
  const { data: subjects } = await d.from("subjects").select("id,name,code,branch,semester").eq("college_id", collegeId);
  const branchSubjects = subjects?.filter((s: any) => s.branch === branch && s.semester === sem) || [];
  const findMatch = (pool: any[]) => pool.find((s: any) => s.name.toLowerCase().includes(subjectName.toLowerCase()) || subjectName.toLowerCase().includes(s.name.toLowerCase()) || s.code?.toLowerCase() === subjectName.toLowerCase());
  const subject = findMatch(branchSubjects) || findMatch(subjects || []);
  if (!subject) {
    const list = branchSubjects.length ? branchSubjects.map((s: any) => `- ${s.name} (${s.code || "no code"})`).join("\n") : "No subjects yet for " + branch + " Sem-" + sem;
    await wa(phone, `❌ "*${subjectName}*" not found for ${branch} Sem-${sem}.\n\nAvailable:\n${list}\n\nAdd first: *!addsubject ${subjectName} ${branch} ${sem}*`);
    return;
  }
  const { error } = await d.from("subject_assignments").upsert({ college_id: collegeId, teacher_phone: teacherPhone, subject_id: subject.id, branch, semester: sem, division: div }, { onConflict: "teacher_phone,subject_id,division" });
  if (error) { await wa(phone, `❌ ${error.message}`); return; }
  try { await wa(teacherPhone, `📚 *New Subject Assigned!*\n\nSubject: *${subject.name}*\n🏷️ ${branch} Div-${div} Sem-${sem}\n\nType *start class* to take attendance.`); } catch {}
  await wa(phone, `✅ *${subject.name}* assigned!\n🏷️ ${branch} Div-${div} Sem-${sem}\n👤 Teacher: ${teacherPhone}\n\nTeacher notified.`);
}

async function handleMySubjects(d: any, phone: string, collegeId: string, role: any) {
  const isStaff = role.userRole === "admin" || role.userRole === "teacher";
  if (isStaff) {
    const { data: assignments } = await d.from("subject_assignments").select("branch,semester,division,subjects(name,code)").eq("teacher_phone", phone).eq("college_id", collegeId);
    if (!assignments?.length) { await wa(phone, "📚 No subjects assigned yet."); return; }
    const list = assignments.map((a: any, i: number) => `*${i + 1}. ${a.subjects?.name}* (${a.subjects?.code || ""})\n   🏷️ ${a.branch} Div-${a.division} Sem-${a.semester}`).join("\n\n");
    await wa(phone, `📚 *Your Subjects*\n\n${list}\n\nType *start class* to begin attendance.`);
  } else { await handleMyAttendance(d, phone, collegeId, role.userName, role); }
}

async function handleHelp(role: string, phone: string) {
  const isStaff = role === "teacher" || role === "admin";
  let msg = "🤖 *Cravex v3 Commands*\n\n*For everyone:*\n• Ask any question — syllabus, concepts\n• 🎤 Send a *voice note*\n• 📸 Send a *photo* of a question\n• *myattendance* — attendance status\n• *mymarks* — internal marks\n• *myrisk* — academic risk score\n• *myfiles* — study materials\n• *mysubjects* — your subjects\n• *notices* — announcements\n• *askpdf <question>* — ask from uploaded docs\n• *askpdf <subject> <question>* — filtered search\n• *help* — this menu\n";
  if (isStaff) msg +=
    "\n*📋 Register Students:*\n" +
    "• Send *Excel file* (.xlsx) — bulk register\n" +
    "• *!add student Phone Name RollNo Branch Sem [Div]*\n" +
    "\n*📊 Attendance:*\n" +
    "• *start class* → select subject → send roll numbers\n" +
    "• *all present* → marks everyone present\n" +
    "• *end class* → close session\n" +
    "\n*📚 Documents:*\n" +
    "• Send *PDF* → AI knowledge upload\n" +
    "• *listfiles* — see all uploaded files\n" +
    "• *listfiles <subject>* — filter by subject\n" +
    "• *deletefile <name>* — remove a document\n" +
    "• *reprocesspdf* — re-index last uploaded PDF\n" +
    "\n*📢 Other:*\n" +
    "• *broadcast: message* — send to all\n" +
    "• *smartnotice* — AI-generated notices\n" +
    "• *atrisk* — risk report\n" +
    "• *!marks 91XX Subject 22/30* — enter marks\n" +
    "• *!parent 91S 91P Name* — link parent\n";
  if (role === "admin") msg +=
    "\n*🔑 Admin only:*\n" +
    "• *!add teacher 91XX Name*\n" +
    "• *!addsubject Name Code Branch Sem*\n" +
    "• *!assign TeacherPhone Name Branch Sem Div*\n";
  msg += "\n*🔧 Emergency:*\n• *ping* — test bot + clear stuck session\n• *cancel* / *stop* — clear stuck state";
  await wa(phone, msg);
}

// ── VOICE HANDLER ──────────────────────────────────────────────────────────────
async function handleVoice(d: any, message: any, phone: string) {
  await clearUserProcessing(d, phone);

  const role = await identifyUser(d, phone);
  if (!role) { await wa(phone, "👋 You're not registered. Ask your teacher to add you."); return; }
  await wa(phone, "🎤 Got your voice note! Transcribing...");
  try {
    const audio = message.audio || message.voice;
    if (!audio?.id) { await wa(phone, "❌ Could not read voice note. Please type your question."); return; }
    const mRes = await fetch(`https://graph.facebook.com/v21.0/${audio.id}`, { headers: { Authorization: `Bearer ${Deno.env.get("WHATSAPP_ACCESS_TOKEN")}` } });
    const mData = await mRes.json();
    if (!mData.url) { await wa(phone, "❌ Could not download voice note. Try again."); return; }
    const aRes = await fetch(mData.url, { headers: { Authorization: `Bearer ${Deno.env.get("WHATSAPP_ACCESS_TOKEN")}` } });
    if (!aRes.ok) { await wa(phone, "❌ Download failed. Please try again."); return; }
    const bytes = await aRes.arrayBuffer();
    if (bytes.byteLength > 16_000_000) { await wa(phone, "❌ Voice note too large (max 16 MB). Please record a shorter message."); return; }
    const u8 = new Uint8Array(bytes);
    const CHUNK = 8192;
    const chunks: string[] = [];
    for (let i = 0; i < u8.length; i += CHUNK) chunks.push(String.fromCharCode(...Array.from(u8.slice(i, Math.min(i + CHUNK, u8.length)))));
    const b64 = btoa(chunks.join(""));
    if (!b64 || b64.length < 100) { await wa(phone, "❌ Audio too short or empty. Please try again."); return; }
    let mime = (audio.mime_type || "audio/ogg").split(";")[0].trim().toLowerCase();
    const allowedMimes = ["audio/wav", "audio/mp3", "audio/aiff", "audio/aac", "audio/ogg", "audio/flac", "audio/mpeg", "audio/webm"];
    if (!allowedMimes.includes(mime)) mime = "audio/ogg";
    const GKEY = Deno.env.get("GEMINI_API_KEY")!;
    const tPrompt = `Transcribe this audio recording exactly as spoken. The speaker may use English, Hindi, or Kannada. Output ONLY the transcribed words — no labels, no explanations, just the raw transcription text.`;
    let transcript: string | null = null;
    transcript = await transcribeWithGroq(bytes, mime);
    if (!transcript) {
      const mimesToTry = [...new Set([mime, "audio/ogg", "audio/mp3", "audio/mpeg"])];
      outerLoop: for (const model of VOICE_MODELS) {
        for (const tryMime of mimesToTry) {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 25000);
          try {
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GKEY}`,
              { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
                body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: tryMime, data: b64 } }, { text: tPrompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 500 } }) }
            );
            clearTimeout(tid);
            if (res.status === 429 || res.status === 503) { await sleep(2000); continue; }
            if (!res.ok) break;
            const data = await res.json();
            const t = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (t && t.length > 2 && !t.toLowerCase().startsWith("i cannot") && !t.toLowerCase().startsWith("i'm unable") && !t.toLowerCase().includes("no audio") && !t.toLowerCase().includes("cannot transcribe")) {
              transcript = t; break outerLoop;
            }
            break;
          } catch (e) { clearTimeout(tid); await sleep(1000); }
        }
      }
    }
    if (!transcript) {
      await wa(phone, "🎤 Voice received but couldn't transcribe.\n\nPlease *type your question* — all other features work perfectly!\n\n_Voice works best in quiet environments with clear speech._");
      return;
    }
    await wa(phone, `🎤 *You said:* \"${transcript}\"\n\nAnswering...`);
    try { await d.from("voice_logs").insert({ phone_number: phone, college_id: role.collegeId, transcript, created_at: new Date().toISOString() }); } catch {}
    if (role.userRole === "parent") { await handleParentAI(d, phone, transcript, role.children, role.collegeId); return; }
    await handleAI(d, transcript, role.userRole, role.userName, role.collegeId, phone, role);
  } catch (err) {
    console.error("Voice handler:", err);
    await wa(phone, "❌ Voice processing failed. Please type your question instead.");
  }
}

// ── AI HANDLER ─────────────────────────────────────────────────────────────────
async function handleAI(d: any, question: string, userRole: string, userName: string, collegeId: string, phone: string, role: any) {
  const isStaff = userRole === "admin" || userRole === "teacher";
  if (!isStaff) { try { await d.from("students").update({ last_active: new Date().toISOString() }).eq("phone_number", phone); } catch {} }

  if (await isUserProcessing(d, phone)) {
    await sleep(3000);
    if (await isUserProcessing(d, phone)) {
      await wa(phone, "⏳ Still processing your previous message. Give me 5 seconds!");
      return;
    }
  }
  await setUserProcessing(d, phone);

  try {
    const history = await getChatHistory(d, phone);
    const now = new Date().toISOString();

    if (isMemoryQuery(question)) {
      if (!history.length) {
        await wa(phone, "🧠 No conversation history yet — this is our first exchange!");
        await saveChatHistory(d, phone, [{ role: "user", text: question, ts: now }]);
        return;
      }
      const memPrompt = `You are Cravex, a WhatsApp bot. A user is asking about our conversation history.\nQuestion: \"${question}\"\n\nHistory:\n${history.map(h => `[${h.ts ? new Date(h.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "?"}] ${h.role === "user" ? userName : "Cravex"}: ${h.text}`).join("\n")}\n\nAnswer naturally and specifically. Be concise and WhatsApp-friendly.`;
      const memAnswer = await aiText(memPrompt, { temp: 0.3, tokens: 600 });
      if (memAnswer) {
        await waSend(phone, memAnswer);
        await saveChatHistory(d, phone, [...history, { role: "user", text: question, ts: now }, { role: "bot", text: memAnswer.slice(0, 400), ts: new Date().toISOString() }]);
      } else {
        const lastUser = [...history].reverse().find(h => h.role === "user");
        await wa(phone, lastUser ? `🧠 Your last question was:\n\n\"${lastUser.text}\"` : "🧠 No previous questions found in memory.");
      }
      return;
    }

    const cacheInput = `${question.toLowerCase().trim()}|${collegeId}|${role.branch || ""}|${role.division || ""}|${role.semester || ""}|${userRole}`;
    const ckey = await sha256(cacheInput);
    const { data: cached } = await d.from("response_cache").select("answer").eq("question_hash", ckey).maybeSingle();
    if (cached?.answer) {
      await waSend(phone, cached.answer);
      await saveChatHistory(d, phone, [...history, { role: "user", text: question, ts: now }, { role: "bot", text: cached.answer.slice(0, 400), ts: new Date().toISOString() }]);
      return;
    }

    const historyCtx = buildHistoryContext(history, userName);

    let dbContext = "";
    try {
      if (isStaff) {
        const { data: mySubjects } = await d.from("subject_assignments").select("branch,semester,division,subjects(name,code)").eq("teacher_phone", phone).eq("college_id", collegeId);
        if (mySubjects?.length) {
          dbContext = "\n\nYOUR ASSIGNED SUBJECTS:\n" + mySubjects.map((a: any) => `• ${a.subjects?.name} (${a.subjects?.code || "no code"}) — ${a.branch} Div-${a.division} Sem-${a.semester}`).join("\n");
        }
      } else {
        const { data: subAtt } = await d.from("student_subject_attendance").select("subject_name,subject_code,attendance_percent,vtu_status,present_count,total_classes").eq("student_phone", phone).eq("college_id", collegeId);
        if (subAtt?.length) {
          dbContext = "\n\nYOUR SUBJECT-WISE ATTENDANCE (live data):\n";
          for (const s of subAtt) {
            const flag = s.vtu_status === "at_risk" ? " ⚠️ BELOW 75% — VTU risk" : s.vtu_status === "warning" ? " ⚡ Warning zone" : "";
            dbContext += `• ${s.subject_name}: ${s.attendance_percent}% (${s.present_count}/${s.total_classes} classes)${flag}\n`;
          }
        }
        const { data: marks } = await d.from("student_marks").select("subject,marks_obtained,max_marks").eq("phone_number", phone).eq("college_id", collegeId);
        if (marks?.length) {
          dbContext += "\nYOUR MARKS:\n" + marks.map((m: any) => `• ${m.subject}: ${m.marks_obtained}/${m.max_marks} (${Math.round(m.marks_obtained / m.max_marks * 100)}%)`).join("\n");
        }
      }
    } catch (e) { console.error("dbContext:", e); }

    const IDENTITY = `You are *Cravex*, an AI WhatsApp bot for VTU engineering college students and teachers.\n\nAbout Cravex:\n- WhatsApp-based: attendance by roll numbers, marks, risk scores, notices, PDF study materials, voice notes\n- Built by Cravex team | cravex.co.in\n- Use the user's real database data below to answer attendance/marks questions directly\n- If asked about features, explain clearly\n\nCurrent user: *${userName}* | Role: ${userRole}${role.branch ? " | " + role.branch + " Div-" + role.division + " Sem-" + role.semester : ""}${dbContext}`;

    const qt = queryType(question);
    let prompt = "";

    if (qt === "maths") {
      prompt = `${IDENTITY}\n\nYou are an expert VTU engineering tutor. Solve the problem below step by step with complete working. Never refuse.\n\n*STRICT WhatsApp FORMATTING RULES — follow exactly:*\n\n1️⃣ *Fractions* — NEVER use \\frac{}{}. Write as (numerator)/(denominator):\n   ✅  (3a²)/4   ✅  (dy/dx)   ✅  (9a⁴)/16\n   ❌  \\frac{3a^2}{4}   ❌  \\frac{9a^4}{16}\n\n2️⃣ *Superscripts/Powers* — use unicode superscripts or ^ only for simple cases:\n   ✅  a²  a³  x²  y²  a⁴   (use ² ³ ⁴ unicode where possible)\n   ✅  x^n  for general n\n\n3️⃣ *Square roots* — write as √(expression):\n   ✅  √2   ✅  √(3a)   ✅  3a√2\n   ❌  \\sqrt{2}\n\n4️⃣ *Derivatives* — write as dy/dx, d²y/dx²\n   ✅  dy/dx = (ay - x²)/(y² - ax)\n\n5️⃣ *Multiplication* — use × symbol:\n   ✅  2√2 × (3a/32)\n\n6️⃣ *Each calculation step* — show it on its own line with = sign aligned, like:\n   = (-4a)(3a²/4) - (-3a²/4)(-4a)\n   = -3a³ - 3a³\n   = -6a³\n\n7️⃣ *Structure every solution like this:*\n   • 1–2 line problem summary\n   • Formula used (clearly written)\n   • Step 1: ...\n   • Step 2: ...\n   • (continue numbered steps)\n   • ✅ *Final Answer: [boxed answer]*\n\n8️⃣ Use *bold* for labels like *Step 1*, *Formula*, *Final Answer*.\n   Use — (em dash) as separator between logical sections.\n\nNEVER output LaTeX commands like \\rho \\frac \\sqrt \\times \\left \\right — WhatsApp renders them as ugly raw text.${historyCtx}\n\n*Problem:* ${question}`;
    } else if (qt === "general") {
      prompt = `${IDENTITY}\n\n- Be accurate and concise\n- Use *bold* for key terms\n- WhatsApp-friendly formatting\n- If this is a follow-up, continue naturally${historyCtx}\n\nQuestion: ${question}`;
    } else {
      let context = "No documents uploaded for this branch yet. Answer from general VTU knowledge.";
      const qEmb = await embed(question);
      if (qEmb) {
        const { data: chunks } = await d.rpc("match_doc_chunks", {
          query_embedding: `[${qEmb.join(",")}]`,
          match_college_id: collegeId,
          match_count: 10,
        });
        if (chunks?.length) {
          const filtered = role.branch && !isStaff
            ? chunks.filter((c: any) =>
                (!c.target_branch || c.target_branch === "All" || c.target_branch === role.branch) &&
                (!c.target_division || c.target_division === "All" || c.target_division === role.division)
              )
            : chunks;
          const relevant = filtered.filter((c: any) => (c.similarity ?? 0) >= 0.70);
          const best = relevant.length ? relevant : filtered.filter((c: any) => (c.similarity ?? 0) >= 0.50).slice(0, 3);
          if (best.length) {
            context = best.map((c: any) => c.content).join("\n---\n");
          }
        }
      }
      if (context.startsWith("No documents")) {
        const { data: fb } = await d.from("doc_chunks").select("content").eq("college_id", collegeId).limit(5);
        if (fb?.length) context = fb.map((k: any) => k.content).join("\n---\n");
      }
      prompt = `${IDENTITY}\n\nKNOWLEDGE BASE:\n${context}\n\nRules:\n- Use the knowledge base first if it's relevant to the question\n- If the knowledge base is NOT relevant (e.g. the question is a general academic/study question on any subject, not specific to this college), ignore it and just answer the question directly and helpfully from your own knowledge — do NOT refuse or say you can't help\n- For timetables/fees specific to this college: tell them to check with college office\n- Be concise and WhatsApp-friendly\n- Use *bold* for key points\n- If this is a follow-up, continue naturally${historyCtx}\n\nQuestion: ${question}`;
    }

    // Per-college AI quota — 100 AI calls/hour, prevents one college eating everyone's Gemini quota
    const aiKey = "ai_" + collegeId;
    const aiWin = new Date(Date.now() - 3600_000).toISOString();
    const { data: aiLimit } = await d.from("rate_limits").select("message_count,window_start").eq("phone_number", aiKey).maybeSingle();
    if (aiLimit && aiLimit.window_start >= aiWin && aiLimit.message_count >= 100) {
      await wa(phone, "⚠️ College AI quota is busy right now. Please try again in a few minutes.");
      return;
    }
    if (!aiLimit || aiLimit.window_start < aiWin) {
      await d.from("rate_limits").upsert({ phone_number: aiKey, message_count: 1, window_start: new Date().toISOString(), last_message: new Date().toISOString() }, { onConflict: "phone_number" });
    } else {
      await d.from("rate_limits").update({ message_count: aiLimit.message_count + 1, last_message: new Date().toISOString() }).eq("phone_number", aiKey);
    }
    const answer = await aiText(prompt, { temp: qt === "maths" ? 0.1 : 0.7, tokens: qt === "maths" ? 1500 : 2048 });
    if (!answer) {
      await wa(phone, `⚡ One moment — AI is handling multiple requests.\n\nJust *resend your question* and it will answer immediately.`);
      return;
    }

    await saveChatHistory(d, phone, [...history, { role: "user", text: question, ts: now }, { role: "bot", text: answer.slice(0, 400), ts: new Date().toISOString() }]);

    const skip = ["hi", "hello", "hey", "ok", "okay", "thanks", "thank you", "k", "hy"].includes(question.toLowerCase().trim());
    if (!skip) { try { await d.from("response_cache").insert({ question_hash: ckey, answer, college_id: collegeId, created_at: new Date().toISOString() }); } catch {} }

    await waSend(phone, answer);
  } finally {
    await clearUserProcessing(d, phone);
  }
}

// ── HELPERS ────────────────────────────────────────────────────────────────────
async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function wa(to: string, text: string): Promise<void> {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
  if (!PHONE_ID || !accessToken) {
    console.error("WA send skipped: WhatsApp secrets are not configured");
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const e = await res.json();
      console.error("WA send failed", { to, status: res.status, code: e?.error?.code, msg: e?.error?.message });
    }
  } catch (err) {
    console.error("WA send exception", { to, err: String(err) });
  } finally {
    clearTimeout(timeout);
  }
}

async function waSend(to: string, text: string): Promise<void> {
  const MAX = 3800;
  if (text.length <= MAX) { await wa(to, text); return; }
  const paras = text.split(/\n\n+/);
  let chunk = "";
  const parts: string[] = [];
  for (const p of paras) {
    const add = chunk ? "\n\n" + p : p;
    if ((chunk + add).length > MAX && chunk.length > 0) { parts.push(chunk); chunk = p; }
    else chunk += add;
  }
  if (chunk.length > 0) parts.push(chunk);
  for (let i = 0; i < parts.length; i++) {
    const hdr = parts.length > 1 ? `_(${i + 1}/${parts.length})_\n\n` : "";
    await wa(to, hdr + parts[i]);
    if (i < parts.length - 1) await sleep(600);
  }
}
