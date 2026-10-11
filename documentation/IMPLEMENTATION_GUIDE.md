# CRAVEX v3 — Actionable Implementation Guide
**Priority-based fixes with code examples**

---

## 🚨 CRITICAL FIXES (Deploy Today)

### Fix #1: Move Hardcoded Secrets to Environment Variables

**File:** `bot/index.ts`  
**Time:** 5 minutes  
**Impact:** Prevents credential exposure

**Current (VULNERABLE):**
```typescript
const PHONE_ID     = "1036694682867415";
const VERIFY_TOKEN = "vtu_bot_secret_123";
```

**Fixed:**
```typescript
const PHONE_ID     = Deno.env.get("META_PHONE_ID") || "1036694682867415";
const VERIFY_TOKEN = Deno.env.get("VERIFY_TOKEN") || "vtu_bot_secret_123";

// Validate on startup
if (!PHONE_ID || !VERIFY_TOKEN) {
  console.error("Missing required environment variables: META_PHONE_ID, VERIFY_TOKEN");
  Deno.exit(1);
}
```

**Then in Supabase:**
1. Go to Project Settings → Edge Functions
2. Add secrets:
   - `META_PHONE_ID` = `1036694682867415`
   - `VERIFY_TOKEN` = `vtu_bot_secret_123`

---

### Fix #2: Restrict CORS to Known Origins

**File:** `supabase-functions/process-pdf/index.ts`  
**Time:** 5 minutes  
**Impact:** Prevents malicious cross-origin requests

**Current (VULNERABLE):**
```typescript
"Access-Control-Allow-Origin": "*"
```

**Fixed:**
```typescript
const ALLOWED_ORIGINS = [
  "https://cravex.co.in",
  "https://dashboard.cravex.co.in",
  "http://localhost:3000"  // For local development only
];

const origin = req.headers.get("origin") || "";
const allowedOrigin = ALLOWED_ORIGINS.includes(origin) 
  ? origin 
  : ALLOWED_ORIGINS[0];

// In response headers:
headers: {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "3600",
  "Access-Control-Allow-Credentials": "false"
}
```

---

### Fix #3: Add Input Validation to All Handlers

**File:** `bot/index.ts`  
**Time:** 30 minutes  
**Impact:** Prevents injection attacks

**Create validation utility (add at top of bot/index.ts):**
```typescript
// Input validation helpers
function sanitizeInput(input: string, maxLength = 1000): string {
  if (!input || typeof input !== "string") return "";
  
  return input
    .substring(0, maxLength)
    .replace(/[\x00-\x1F\x7F]/g, "")  // Remove control characters
    .trim();
}

function validatePhoneNumber(phone: string): boolean {
  // Indian phone: 91 + 10 digits
  return /^91\d{10}$/.test(phone.replace(/\D/g, ""));
}

function validateRollNumbers(input: string): string[] {
  if (!input || input.length > 500) return [];
  
  const sanitized = input
    .replace(/[^\d\s,;-]/g, "")  // Keep only digits, spaces, commas, hyphens
    .substring(0, 500);
  
  const parts = sanitized.split(/[\s,;]+/);
  return parts.filter(p => /^\d{1,4}$/.test(p));
}

function validateCollegeName(name: string): boolean {
  const sanitized = sanitizeInput(name, 100);
  return sanitized.length >= 3 && sanitized.length <= 100;
}
```

**Update handleText() with validation:**
```typescript
async function handleText(d: any, phone: string, rawBody: string) {
  // Validate inputs at entry point
  if (!validatePhoneNumber(phone)) {
    console.warn("Invalid phone number format:", phone);
    return;
  }
  
  const cleanBody = sanitizeInput(rawBody, 1000);
  if (!cleanBody) return;
  
  // ... rest of handler
  try {
    if (!await checkRateLimit(d, phone)) {
      await wa(phone, "⏳ Too many messages. Please wait 60 seconds.");
      return;
    }
    
    const role = await identifyUser(d, phone);
    // ... rest of handler
  } catch (err) {
    console.error("handleText error:", err);
    await wa(phone, "❌ An error occurred. Please try again.");
  }
}
```

**Update handleStartClass() with validation:**
```typescript
async function handleClassStep(d: any, phone: string, rawInput: string, sess: any): Promise<boolean> {
  const body = sanitizeInput(rawInput, 100);
  if (!body) return true;
  
  // ... existing logic with validated input
}
```

**Update attendance parsing:**
```typescript
function parseRollNumbers(input: string): string[] {
  const validated = validateRollNumbers(input);
  return [...new Set(validated)];  // Remove duplicates
}
```

---

### Fix #4: Enable Row Level Security (RLS)

**File:** `schema.sql`  
**Time:** 45 minutes  
**Impact:** Ensures data isolation between colleges/users

**Replace this section:**
```sql
ALTER TABLE students DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
```

**With this:**
```sql
-- Enable RLS on sensitive tables
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_chunks ENABLE ROW LEVEL SECURITY;

-- Policies for Students table
CREATE POLICY "Students can see themselves"
ON students FOR SELECT
USING (auth.uid()::text = phone_number);

CREATE POLICY "Teachers can see their students"
ON students FOR SELECT
USING (college_id IN (
  SELECT college_id FROM users 
  WHERE phone_number = auth.uid()::text
  AND role IN ('teacher', 'admin')
));

CREATE POLICY "Admins can see college students"
ON students FOR SELECT
USING (college_id IN (
  SELECT college_id FROM users 
  WHERE phone_number = auth.uid()::text
  AND role = 'admin'
));

-- Policies for Users table
CREATE POLICY "Users can see themselves"
ON users FOR SELECT
USING (auth.uid()::text = phone_number);

CREATE POLICY "Admins can see college users"
ON users FOR SELECT
USING (college_id IN (
  SELECT college_id FROM users 
  WHERE phone_number = auth.uid()::text
  AND role IN ('admin', 'master')
));

-- Policies for parent_contacts
CREATE POLICY "Teachers can manage parent contacts"
ON parent_contacts FOR SELECT
USING (student_phone IN (
  SELECT phone_number FROM students
  WHERE college_id IN (
    SELECT college_id FROM users
    WHERE phone_number = auth.uid()::text
  )
));

-- Policies for doc_chunks
CREATE POLICY "Users see college knowledge base"
ON doc_chunks FOR SELECT
USING (college_id IN (
  SELECT college_id FROM users
  WHERE phone_number = auth.uid()::text
));
```

**Run in Supabase SQL Editor:**
1. Go to SQL Editor
2. Create new query
3. Paste the above schema changes
4. Run and test

---

### Fix #5: Add API Authentication to Edge Functions

**File:** `supabase-functions/process-pdf/index.ts`  
**Time:** 30 minutes  
**Impact:** Prevents unauthorized PDF uploads

**Add authentication check at function start:**
```typescript
Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    const ALLOWED_ORIGINS = ["https://cravex.co.in", "https://dashboard.cravex.co.in"];
    const origin = req.headers.get("origin") || "";
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      }
    });
  }

  // ──────────────────────────────────────────────
  // NEW: Authenticate request
  // ──────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  let userId: string;
  try {
    const token = authHeader.slice(7);  // Remove "Bearer "
    
    // Verify JWT with Supabase
    const d = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );
    
    const {
      data: { user },
      error: authError,
    } = await d.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    userId = user.id;
  } catch (err) {
    console.error("Auth error:", err);
    return new Response(
      JSON.stringify({ error: "Authentication failed" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // ──────────────────────────────────────────────
  // Continue with existing code
  // ──────────────────────────────────────────────
  
  const d = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // ... rest of function continues as before
});
```

---

## 🟠 HIGH PRIORITY FIXES (This Week)

### Fix #6: Add Session Expiry to Dashboard

**File:** `pages/dashboard.html`  
**Time:** 15 minutes  
**Impact:** Logs out inactive users

**Add to dashboard.html JavaScript section (before closing `</script>`):**
```javascript
// ──────────────────────────────────────────────
// SESSION TIMEOUT
// ──────────────────────────────────────────────

const SESSION_TIMEOUT = 60 * 60 * 1000;  // 1 hour
const INACTIVITY_TIMEOUT = 30 * 60 * 1000;  // 30 minutes

let sessionTimerId = null;
let inactivityTimerId = null;

function resetSessionTimer() {
  clearTimeout(sessionTimerId);
  sessionTimerId = setTimeout(() => {
    console.warn("Session expired due to max duration");
    doLogout();
  }, SESSION_TIMEOUT);
  
  resetInactivityTimer();
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimerId);
  inactivityTimerId = setTimeout(() => {
    console.warn("Session expired due to inactivity");
    doLogout();
  }, INACTIVITY_TIMEOUT);
}

// Reset timers on user activity
document.addEventListener("click", resetSessionTimer);
document.addEventListener("keypress", resetSessionTimer);
document.addEventListener("mousemove", resetSessionTimer);

// Start session timer on login
function onLoginSuccess() {
  localStorage.setItem("session_start", Date.now().toString());
  resetSessionTimer();
}

// Update doLogout() to clear timers
const originalDoLogout = window.doLogout || (() => {});
window.doLogout = function() {
  clearTimeout(sessionTimerId);
  clearTimeout(inactivityTimerId);
  originalDoLogout();
};

// Check if session is still valid on page load
function validateExistingSession() {
  const sessionStart = localStorage.getItem("session_start");
  if (!sessionStart) return;
  
  const elapsed = Date.now() - parseInt(sessionStart);
  if (elapsed > SESSION_TIMEOUT) {
    console.warn("Session expired");
    localStorage.clear();
    location.reload();
  } else {
    resetSessionTimer();
  }
}

// Call on page load
validateExistingSession();
```

---

### Fix #7: Create Environment Configuration File

**New File:** `.env.example`  
**Time:** 5 minutes

```env
# ────────────────────────────────────────────────
# SUPABASE
# ────────────────────────────────────────────────
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ────────────────────────────────────────────────
# EXTERNAL APIs
# ────────────────────────────────────────────────
GEMINI_API_KEY=AIzaSy...
OPENROUTER_API_KEY=sk-or-...
META_PHONE_ID=1036694682867415
WHATSAPP_ACCESS_TOKEN=EAABsZCxxxxxxxx...

# ────────────────────────────────────────────────
# BOT CONFIGURATION
# ────────────────────────────────────────────────
VERIFY_TOKEN=vtu_bot_secret_123
ALLOWED_ORIGINS=https://cravex.co.in,https://dashboard.cravex.co.in
LOG_LEVEL=info
ENVIRONMENT=production

# ────────────────────────────────────────────────
# RATE LIMITING (messages per minute)
# ────────────────────────────────────────────────
RATE_LIMIT_PER_USER=20
RATE_LIMIT_GLOBAL=1000

# ────────────────────────────────────────────────
# OPTIONAL: ERROR TRACKING
# ────────────────────────────────────────────────
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
SENTRY_ENVIRONMENT=production
```

**Create config validation (new file `config.ts`):**
```typescript
// config.ts
export interface Config {
  supabase: {
    url: string;
    serviceRoleKey: string;
  };
  apis: {
    geminiKey: string;
    openrouterKey: string;
  };
  bot: {
    phoneId: string;
    verifyToken: string;
  };
  environment: "development" | "staging" | "production";
}

export function getConfig(): Config {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GEMINI_API_KEY",
    "META_PHONE_ID",
    "VERIFY_TOKEN",
  ];

  const missing = required.filter(key => !Deno.env.get(key));
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}\n\nCreate .env file from .env.example`);
  }

  return {
    supabase: {
      url: Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    },
    apis: {
      geminiKey: Deno.env.get("GEMINI_API_KEY")!,
      openrouterKey: Deno.env.get("OPENROUTER_API_KEY") || "",
    },
    bot: {
      phoneId: Deno.env.get("META_PHONE_ID")!,
      verifyToken: Deno.env.get("VERIFY_TOKEN")!,
    },
    environment: (Deno.env.get("ENVIRONMENT") || "production") as any,
  };
}
```

---

### Fix #8: Add Structured Error Logging

**New File:** `logger.ts`  
**Time:** 20 minutes

```typescript
// logger.ts

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: string;
}

export class Logger {
  private static isDev = Deno.env.get("ENVIRONMENT") === "development";

  static log(level: LogLevel, message: string, context?: Record<string, any>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    // Always log to stderr in structured format
    console.error(JSON.stringify(entry));

    // Send critical errors to monitoring service
    if ((level === "error" || level === "warn") && !this.isDev) {
      this.sendToMonitoring(entry).catch(console.error);
    }
  }

  static debug(message: string, context?: Record<string, any>) {
    this.log("debug", message, context);
  }

  static info(message: string, context?: Record<string, any>) {
    this.log("info", message, context);
  }

  static warn(message: string, context?: Record<string, any>) {
    this.log("warn", message, context);
  }

  static error(message: string, error?: Error | unknown, context?: Record<string, any>) {
    const errorData = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : { error: String(error) };

    this.log("error", message, {
      ...context,
      ...errorData,
    });
  }

  private static async sendToMonitoring(entry: LogEntry) {
    const sentryDsn = Deno.env.get("SENTRY_DSN");
    if (!sentryDsn) return;

    try {
      const url = new URL(sentryDsn);
      const projectId = url.pathname.split("/").pop();
      const endpoint = `${url.protocol}//${url.host}/api/${projectId}/store/`;

      await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sentry-Auth": `Sentry sentry_key=${url.username}, sentry_version=7`,
        },
        body: JSON.stringify({
          level: entry.level,
          message: entry.message,
          extra: entry.context,
          timestamp: entry.timestamp,
        }),
      });
    } catch (err) {
      console.error("Failed to send to monitoring:", err);
    }
  }
}

export default Logger;
```

**Usage in bot/index.ts:**
```typescript
import Logger from "./logger.ts";

// Instead of console.error:
Logger.error("PDF processing failed", err, { fileName, collegeId });

// Instead of console.log:
Logger.info("Class started", { branch, semester, division });
```

---

### Fix #9: Extract CSS to External File

**New File:** `dashboard.css`  
**Time:** 30 minutes  
**Process:**
1. Copy all CSS from `<style>` tag in dashboard.html (lines 23-~900)
2. Create new file `dashboard.css`
3. Paste CSS into it
4. In dashboard.html, replace `<style>...</style>` with:
   ```html
   <link rel="stylesheet" href="dashboard.css">
   ```

**Benefits:**
- Browser can cache CSS
- Smaller HTML file
- Easier to maintain CSS separately

---

### Fix #10: Add JSDoc Comments to Key Functions

**File:** `bot/index.ts`  
**Time:** 1 hour

**Add to public/important functions:**
```typescript
/**
 * Identifies user role and college from WhatsApp phone number
 * @param {any} d - Supabase database client
 * @param {string} phone - WhatsApp phone number (91XXXXXXXXXX format)
 * @returns {Promise<UserRole | null>} User role info or null if not found
 * @throws {Error} If database query fails
 * 
 * @example
 * const role = await identifyUser(db, "919876543210");
 * if (role?.userRole === "teacher") { ... }
 */
async function identifyUser(d: any, phone: string) {
  // ... implementation
}

/**
 * Handles class attendance session workflow
 * - Fetches teacher's assigned subjects
 * - Allows selection of subject
 * - Records student attendance
 * - Sends parent alerts for low attendance
 * 
 * @param {any} d - Supabase client
 * @param {string} phone - Teacher's phone number
 * @param {string} collegeId - College ID
 * @param {string} userName - Teacher's name
 * @param {any} _role - User role object
 * @returns {Promise<void>}
 */
async function handleStartClass(d: any, phone: string, collegeId: string, userName: string, _role: any) {
  // ... implementation
}

/**
 * Parses roll number ranges and lists
 * Handles: "01, 05, 12, 18" and "01 to 05, 10 to 15"
 * 
 * @param {string} input - User input with roll numbers
 * @returns {string[]} Array of sanitized roll numbers
 * 
 * @example
 * parseRollNumbers("01 to 05, 10") // ["01", "02", "03", "04", "05", "10"]
 */
function parseRollNumbers(input: string): string[] {
  // ... implementation
}
```

---

## ✅ DEPLOYMENT CHECKLIST

Use this checklist before deploying to production:

```
SECURITY
  [ ] All hardcoded secrets moved to environment variables
  [ ] Input validation added to all user-facing handlers
  [ ] CORS restricted to known origins
  [ ] API authentication implemented
  [ ] RLS enabled on sensitive tables
  [ ] Session timeout implemented
  [ ] No sensitive data exposed in logs

PERFORMANCE
  [ ] CSS extracted to external file
  [ ] Database indexes verified
  [ ] API fallback chains tested
  [ ] Rate limiting configured

OPERATIONS
  [ ] Environment configuration (.env.example) created
  [ ] Error logging configured
  [ ] Deployment documentation written
  [ ] Backup strategy implemented
  [ ] SSL/TLS certificate configured

TESTING
  [ ] Manual smoke tests completed
  [ ] Edge function deployment verified
  [ ] Dashboard functionality tested
  [ ] Attendance flow tested with 50+ students
  [ ] PDF upload tested
  [ ] Rate limiting tested

DOCUMENTATION
  [ ] README updated
  [ ] API endpoints documented
  [ ] Database schema documented
  [ ] Deployment steps documented
  [ ] Emergency runbook created
```

---

## IMPLEMENTATION PRIORITY

**Week 1 (Before Any Users):**
1. Fix #1: Move secrets to env vars ⏱️ 5 min
2. Fix #3: Input validation ⏱️ 30 min
3. Fix #4: Enable RLS ⏱️ 45 min
4. Fix #2: CORS restriction ⏱️ 5 min
5. Fix #5: API auth ⏱️ 30 min

**Week 1 (Before Launch):**
6. Fix #6: Session expiry ⏱️ 15 min
7. Fix #7: .env.example ⏱️ 5 min
8. Fix #8: Structured logging ⏱️ 20 min

**Week 2 (Post-Launch Ok):**
9. Fix #9: Extract CSS ⏱️ 30 min
10. Fix #10: JSDoc comments ⏱️ 1 hour

**Total Time: ~3 hours for all critical fixes**

---

## TESTING AFTER FIXES

### Test Hardcoded Secrets Fix
```bash
# Verify env vars are used
grep -r "vtu_bot_secret_123" bot/
# Should return: Only in .env.example, NOT in code
```

### Test Input Validation
```typescript
// Test with malicious input
const malicious = "'; DROP TABLE students; --";
const sanitized = sanitizeInput(malicious);
console.log(sanitized);  // Should be safe text only
```

### Test RLS
```sql
-- Verify RLS is enabled
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = true;

-- Should show: students, users, parent_contacts, doc_chunks
```

### Test CORS
```javascript
// From browser on different domain
fetch("https://cravex-function.supabase.co/process-pdf", {
  method: "POST",
  body: JSON.stringify({ pdf_b64: "..." })
})
// Should get 401 Unauthorized (no bearer token)
// NOT a CORS error
```

---

**Next Steps:** Implement fixes in order of priority, test thoroughly, then deploy with confidence! 🚀
