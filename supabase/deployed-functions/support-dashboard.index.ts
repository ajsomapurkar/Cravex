/**
 * CRAVEX — dashboard-support Edge Function
 *
 * Backs the "Help / Support" chat widget on pages/dashboard.html.
 * Answers teacher/HOD/college_admin questions about USING the dashboard
 * (attendance, marks, students, broadcast, lesson plans, OTP login, parent
 * alerts). NOT the student-facing syllabus bot — that's bot/index.ts.
 *
 * Escalation: the model is instructed to end its reply with the literal
 * control token `<<ESCALATE>>` when the conversation should be handed to a
 * human. This function strips the token before returning the reply, and
 * — when present — fires a WhatsApp message to the support team number and
 * logs the escalation to `support_escalations` for follow-up.
 *
 * Auth gate + CORS mirror process-lesson-plan / process-pdf conventions.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

// ── CONSTANTS ────────────────────────────────────────────────────────────
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const ESCALATE_TOKEN = "<<ESCALATE>>";
const MAX_HISTORY_TURNS = 12; // keep prompt small; widget is short-lived per session

const PHONE_ID = Deno.env.get("PHONE_ID") ?? "1036694682867415";

// ── CORS HEADERS ─────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const ROLE_LABEL: Record<string, string> = {
  teacher: "teacher",
  hod: "hod",
  college_admin: "college_admin",
  master: "college_admin", // master behaves like an admin for this widget's purposes
};

// ── SYSTEM PROMPT TEMPLATE ───────────────────────────────────────────────
function buildSystemPrompt(role: string, teacherName: string, collegeName: string, currentPage: string): string {
  return `# Cravex Dashboard Support Agent

## Role
You are the Cravex Dashboard Support Assistant. You help teachers, HODs, and college
admins use the Cravex dashboard — a WhatsApp-based college intelligence platform for
attendance, marks, lesson plans, and parent communication.

You are NOT the student-facing syllabus/Q&A bot. You only help staff operate the
dashboard and understand how Cravex works.

## Who you're talking to
- Role: ${role}
- Name: ${teacherName}
- College: ${collegeName}
- Current dashboard page: ${currentPage}

Use this to tailor answers. A teacher and a college_admin can see different tabs —
don't describe a feature the current role can't access. If unsure what the role can
see, answer generally and note "if you don't see this option, it may need admin access."

## What you know (answer confidently on these)
- Attendance: how to mark attendance, edit past entries, view % per student/class,
  what counts toward the 75% VTU minimum, how attendance alerts are triggered to parents.
- Marks: how to enter IA1/IA2/Assignment/SEE marks, edit existing marks, how
  percentage is calculated, how marks alerts are sent to parents.
- Students: adding/removing students, bulk upload, editing student details (name, USN, parent phone).
- Broadcast: how to send a broadcast message to a class/section via WhatsApp.
- Lesson plans: uploading a lesson plan PDF, what the AI extracts from it, how to edit it after processing.
- Login/OTP: how OTP login works, what to do if OTP doesn't arrive (resend, check number on file — do NOT explain backend mechanics).
- Parent alerts: what triggers an attendance/marks alert, how to configure or pause them.
- General "what is Cravex": one-line explainer if asked — a WhatsApp platform that gives students syllabus Q&A and gives parents/staff attendance & marks visibility.

## How to answer
- Keep answers short — 2-4 sentences, plain language, no jargon.
- If the answer involves clicking through the UI, describe the exact path, e.g.:
  "Go to Students -> Attendance -> select the class -> tap the date."
- If you're not fully sure an answer is correct for this college's exact setup, say so
  plainly rather than guessing: "I'm not fully sure — let me connect you to support."
- Never expose backend details: no mention of Supabase, OpenRouter, Gemini, API keys,
  database tables, or internal function names, even if asked directly.
- Never share other teachers'/students'/colleges' data, even hypothetically.

## When to escalate to a human (do this, don't just apologize and stop)
Escalate when ANY of these are true:
1. The teacher explicitly asks to talk to someone / requests a call.
2. You don't have a confident answer after one clarifying attempt.
3. The query involves something you're not permitted to handle: billing/payment
   disputes, account deletion, data correction requests, complaints about the platform.
4. The teacher seems frustrated or has asked the same question twice without resolution.

When escalating, say so plainly and warmly — don't just go silent. Write something like:
"I'll connect you with our support team now — you'll get a message on WhatsApp shortly."
Then, as the LAST thing in your reply, on its own line, output exactly: ${ESCALATE_TOKEN}
Do not explain that token to the user and do not output it unless you are actually escalating.

## Boundaries
- If asked something about student syllabus content, marks meaning, or academic
  material — redirect: "That's something the student WhatsApp bot can help with —
  this assistant is for dashboard/account questions."
- If asked to change dashboard behavior, add a feature, or anything requiring a
  developer — don't attempt it, escalate instead.
- If asked anything unrelated to Cravex (general chit-chat, unrelated tech help) —
  politely redirect back to dashboard support, don't engage at length.

## Output format
Respond in plain text only — no markdown headers, no code blocks. This renders in a
small chat widget, so keep it visually simple: short paragraphs, occasional bullets
only when listing steps (max 3-4 bullets).`;
}

// ── GEMINI CALL (with model fallback) ────────────────────────────────────
async function callGemini(systemPrompt: string, history: { role: string; text: string }[]): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const contents = history.map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [{ text: h.text }],
  }));

  let lastErr: unknown = null;
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
          }),
        },
      );
      if (!res.ok) {
        lastErr = await res.text();
        continue;
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
      if (text.trim()) return text.trim();
      lastErr = "empty response";
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`All Gemini models failed: ${String(lastErr)}`);
}

// ── WHATSAPP NOTIFY (support team) ───────────────────────────────────────
async function notifySupportTeam(context: {
  teacherName: string;
  role: string;
  collegeName: string;
  currentPage: string;
  lastMessage: string;
}): Promise<void> {
  const supportNumber = Deno.env.get("SUPPORT_WHATSAPP_NUMBER");
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  if (!supportNumber || !token) {
    console.error("SUPPORT_WHATSAPP_NUMBER or WHATSAPP_ACCESS_TOKEN not configured — skipping support notify");
    return;
  }
  const text =
    `🆘 *Dashboard support escalation*\n\n` +
    `*Name:* ${context.teacherName}\n` +
    `*Role:* ${context.role}\n` +
    `*College:* ${context.collegeName}\n` +
    `*Page:* ${context.currentPage}\n\n` +
    `*Last message:*\n${context.lastMessage}`;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: supportNumber, type: "text", text: { body: text } }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      console.error("Support WA notify failed", { status: res.status, err: e });
    }
  } catch (err) {
    console.error("Support WA notify exception", String(err));
  }
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, 405);

  // Auth gate — same pattern as process-lesson-plan / process-pdf
  const supaAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  const provided = authHeader.replace(/^Bearer\s*/i, "");
  if (!(supaAnon && provided === supaAnon)) {
    return jsonRes({ error: "Unauthorized" }, 401);
  }

  const d = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ── PARSE REQUEST ───────────────────────────────────────────────────
  let body: any;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return jsonRes({ error: "Invalid JSON body" }, 400);
  }

  const rawRole = String(body.role ?? "teacher");
  const role = ROLE_LABEL[rawRole] ?? "teacher";
  const teacherName = String(body.teacherName ?? "there").slice(0, 80);
  const collegeId = body.collegeId ?? null;
  const currentPage = String(body.currentPage ?? "dashboard").slice(0, 60);
  const message = String(body.message ?? "").slice(0, 1000);
  const historyIn: { role: string; text: string }[] = Array.isArray(body.history) ? body.history : [];

  if (!message.trim()) return jsonRes({ error: "message is required" }, 400);

  // Resolve college name server-side (don't trust a client-supplied label)
  let collegeName = "your college";
  if (collegeId) {
    try {
      const { data: college } = await d.from("colleges").select("name").eq("id", collegeId).maybeSingle();
      if (college?.name) collegeName = college.name;
    } catch {
      // fall back to default label
    }
  }

  const history = [...historyIn.slice(-MAX_HISTORY_TURNS), { role: "user", text: message }];
  const systemPrompt = buildSystemPrompt(role, teacherName, collegeName, currentPage);

  let rawReply: string;
  try {
    rawReply = await callGemini(systemPrompt, history);
  } catch (err) {
    console.error("dashboard-support Gemini error", String(err));
    return jsonRes({
      reply: "I'm having trouble reaching support right now — please try again in a moment.",
      escalate: false,
    });
  }

  const escalate = rawReply.includes(ESCALATE_TOKEN);
  const reply = rawReply.replace(ESCALATE_TOKEN, "").trim();

  if (escalate) {
    EdgeRuntime.waitUntil(
      notifySupportTeam({ teacherName, role, collegeName, currentPage, lastMessage: message }),
    );
    try {
      await d.from("support_escalations").insert({
        college_id: collegeId,
        user_name: teacherName,
        user_role: role,
        current_page: currentPage,
        last_message: message,
        transcript: history,
      });
    } catch (err) {
      console.error("support_escalations insert failed", String(err));
    }
  }

  return jsonRes({ reply, escalate });
});
