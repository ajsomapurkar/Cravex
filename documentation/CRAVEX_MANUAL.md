# CRAVEX
## Product Manual & Business Bible
### Version 1.0 — April 2026

---

> This document is the single source of truth for everything Cravex.
> Read it end to end once. Then use it as a reference forever.
> If something changes in the product, update this document first.

---

# PART ONE — THE COMPANY

## 1.1 What Cravex Is

Cravex is an AI-powered WhatsApp assistant for engineering colleges affiliated to Visvesvaraya Technological University (VTU) in Karnataka, India.

It replaces the chaos of unstructured WhatsApp groups with a structured, role-aware platform that handles attendance tracking, syllabus Q&A, maths solving, academic risk prediction, parent alerts, and campus communication — all delivered inside WhatsApp. No app to install. No login to remember. Just one number students save on their phone.

## 1.2 The Problem We Are Solving

Every VTU college has the same operational problems:

**Attendance is manual and fragmented.** Teachers maintain attendance in registers or Excel files. Students have no visibility until it's too late. VTU mandates 75% minimum attendance — students who breach it cannot sit for semester exams. Colleges find out they have a detention problem only when it's already a crisis.

**Communication is broken.** Teachers broadcast important notices in informal WhatsApp groups where messages get buried. Students miss deadlines. Parents have no visibility into their ward's academic standing.

**Study materials are scattered.** PDFs, notes, and handbooks are shared in groups and quickly lost. Students preparing for exams have no organized, searchable source.

**Teachers are overloaded with repetitive questions.** "What is the minimum attendance?" gets asked by hundreds of students every semester. Teachers spend time answering questions that an AI can handle instantly.

**Parents are disconnected.** Most colleges have no system to automatically inform parents when a student is at risk. By the time parents find out, it is often too late to recover.

## 1.3 Our Solution

One WhatsApp number. One system. Everything connected.

- Students message the bot on WhatsApp to check attendance, ask syllabus questions, solve maths problems, or get campus notices.
- Teachers upload attendance via Excel or a single WhatsApp message. They upload PDFs which the AI learns from. They get a risk report of every student at any time.
- Parents receive automatic WhatsApp alerts when attendance drops below 75% or marks are weak.
- Admins manage everything from a clean web dashboard.

## 1.4 Vision

**Short term (Year 1):** Become the default WhatsApp assistant for VTU colleges in Karnataka. Start with 10 colleges, prove measurable improvement in attendance and student engagement.

**Medium term (Year 2-3):** Expand across all VTU-affiliated colleges (200+ in Karnataka). Add regional language support (Kannada). Launch a paid tier with advanced analytics and parent app.

**Long term (Year 5+):** Become the operating system for Indian engineering colleges. Expand to Anna University (Tamil Nadu), Mumbai University, and other state technical universities. Build the largest student academic data platform in India.

## 1.5 Why This Will Win

**Distribution is solved.** WhatsApp has 500 million users in India. Every student already has it. There is zero friction to adoption compared to any app that requires download, signup, and onboarding.

**The AI is not a gimmick.** The bot uses retrieval-augmented generation (RAG) with the college's own PDFs as the knowledge source. It actually knows the college's syllabus, rules, and materials. Other ed-tech chatbots give generic answers. Cravex gives answers specific to that college's branch and division.

**Teachers love it more than students.** Bulk Excel upload for attendance. Bulk student registration. AI-generated notices. Risk reports. The product saves teachers hours every week. Teacher adoption drives student adoption automatically.

**Network effects.** Once a college is on Cravex, every student, teacher, and parent is in the system. Switching cost is high. Expansion to the next semester or branch happens naturally.

---

# PART TWO — THE PRODUCT

## 2.1 System Architecture

```
Student/Teacher sends WhatsApp message to +91 72042 86239
         │
         ▼
Meta WhatsApp Cloud API
(receives message, fires webhook POST within ~200ms)
         │
         ▼
Supabase Edge Function — bot/index.ts
(Deno runtime, serverless, scales to thousands simultaneously)
         │
    ┌────┴────────────────────────────┐
    │                                 │
    ▼                                 ▼
Deduplication check             Session check
(processed_messages table)      (pdf_upload_sessions)
Block Meta retry doubles        Resume multi-step flows
    │                                 │
    └────────────┬────────────────────┘
                 │
                 ▼
         Identify User
    ┌────(users table)────┐
    │    (students table) │
    │                     │
    ▼                     ▼
  Staff               Student
(admin/teacher)       (registered)
    │                     │
    └──────────┬───────────┘
               │
               ▼
        Route by Message Type
   ┌─────────┬──────────┬───────────┐
   │         │          │           │
   ▼         ▼          ▼           ▼
Command    AI Query   PDF Upload  Excel Upload
Handler    Handler    Handler     Handler
   │         │          │           │
   └────┬────┘          └─────┬─────┘
        │                     │
        ▼                     ▼
  Supabase DB            Gemini API
  (read/write)           (generate/embed/transcribe)
        │
        ▼
  Reply via Meta
  WhatsApp API
        │
        ▼
User receives message on WhatsApp

Separately:
Admin Dashboard (browser) → Supabase JS SDK → same DB → read-only queries
```

## 2.2 Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Bot runtime | Deno on Supabase Edge Functions | Serverless, zero cold starts, runs TypeScript natively, global CDN |
| Database | PostgreSQL + pgvector on Supabase | Relational data + vector similarity search in one place |
| AI model | Google Gemini 2.5 Flash | Best price-performance for Indian use cases, supports audio and PDF natively |
| AI fallback | Gemini 1.5 Flash → 1.5 Flash 8B | Automatic fallback chain if primary is overloaded |
| Embeddings | Google text-embedding-004 (768 dims) | Used for semantic search in the RAG pipeline |
| WhatsApp | Meta WhatsApp Cloud API | Only official path to WhatsApp at scale |
| Dashboard | Vanilla HTML/CSS/JS + Supabase JS SDK | No framework overhead, deploys anywhere, fast |
| Hosting | Netlify | Free tier covers all static assets, auto-deploy from drag-and-drop |

## 2.3 Database Schema — All 14 Tables

### colleges
The root entity. One row per institution.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| name | TEXT | College name |
| location | TEXT | City |
| admin_phone | TEXT | WhatsApp number of main admin |
| whatsapp_phone_id | TEXT | Meta phone ID (for future multi-number support) |
| created_at | TIMESTAMPTZ | Registration date |

### users
Admins and teachers. Students are separate for performance reasons.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| name | TEXT | Full name |
| phone_number | TEXT | WhatsApp number (unique) |
| role | TEXT | 'admin' or 'teacher' |
| college_id | UUID | NULL = Master Admin (sees all colleges) |
| created_at | TIMESTAMPTZ | — |

### students
All enrolled students registered by teachers.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| name | TEXT | Full name |
| phone_number | TEXT | WhatsApp number (unique) |
| college_id | UUID | Which college |
| branch | TEXT | CS, EC, ME, Civil |
| division | TEXT | A, B, C |
| semester | INTEGER | 1 through 8 |
| risk_score | NUMERIC | 0-100 computed academic risk |
| parent_phone | TEXT | For automatic parent alerts |
| last_active | TIMESTAMPTZ | Last time they messaged the bot |
| usn | TEXT | University Seat Number |
| registered_by | TEXT | Teacher name who uploaded them |
| created_at | TIMESTAMPTZ | — |

### doc_chunks
The AI knowledge base. Every PDF uploaded by a teacher is split into ~500-character chunks, embedded into 768-dimensional vectors, and stored here. This is what powers the RAG (Retrieval-Augmented Generation) system.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| content | TEXT | The actual text chunk |
| embedding | vector(768) | Semantic vector for similarity search |
| college_id | UUID | Which college owns this |
| source_file | TEXT | Original PDF filename |
| file_title | TEXT | Friendly name given by teacher |
| target_branch | TEXT | CS / EC / All etc. |
| target_division | TEXT | A / B / All etc. |
| target_semester | INTEGER | 1-8 or NULL for all |
| uploaded_by | TEXT | Teacher name |
| created_at | TIMESTAMPTZ | — |

### uploaded_files
Metadata tracker for PDFs. Shown in the dashboard Knowledge Base page.

### attendance_records
One row per student per college. Upserted (updated or inserted) every time a teacher updates attendance. Stores latest percentage only.

### student_marks
One row per student per subject per test. Teachers enter marks via WhatsApp command or the system stores it. Used for risk score calculation.

### parent_contacts
Maps student phone numbers to parent phone numbers. Used for automatic parent alerts.

### announcements
All broadcast messages sent to students. Also used to generate context for smartnotice.

### processed_messages
Deduplication table. Meta's webhook sometimes fires twice for the same message. We insert the message_id here and if it already exists (duplicate key error), we return immediately without processing.

### response_cache
SHA-256 keyed cache of AI responses. Identical question from the same branch gets an instant cached reply. Reduces Gemini API costs by 40-60% in a college with many students.

Key: SHA-256(question + college_id + branch + division)

### pdf_upload_sessions
Multi-step PDF upload state. Because the Edge Function is serverless (no memory between requests), we persist the upload flow state in this table. Expires after 10 minutes. Also used for Excel upload flows.

### rate_limits
8 messages per 60-second window per phone. Prevents a single student from flooding the system. Safe fallback: if the table is missing, all messages pass through.

### voice_logs
Logs all voice note transcriptions for audit and debugging.

## 2.4 The pgvector Semantic Search Function

```sql
match_doc_chunks(query_embedding, match_college_id, match_count)
```

When a student asks a question:
1. The question is converted to a 768-dim embedding vector using Gemini text-embedding-004
2. This function runs cosine similarity search against all doc_chunks for that college
3. Returns the top 8 most semantically similar chunks
4. These chunks are filtered to the student's branch and division
5. The filtered chunks become context in the Gemini prompt
6. Gemini answers the question using that context

This is how the bot "knows" the college's own syllabus and materials without retraining any AI model.

## 2.5 AI Query Routing

Every incoming text message is classified before being sent to Gemini:

```
Incoming message
       │
       ├── Contains maths keyword? (solve, integrate, d/dx, matrix, etc.)
       │         └── YES → Maths Tutor mode (temperature 0.1, max 1500 tokens, no RAG)
       │
       ├── Contains general keyword? (what is, explain, career, coding, etc.)
       │         └── YES → General Knowledge mode (temperature 0.7, max 2048 tokens, no RAG)
       │
       └── Default → College Q&A mode (RAG search → context → Gemini, max 2048 tokens)
```

**Why this matters:** RAG (vector search) adds ~300ms latency and costs embedding API credits. For a maths problem, RAG is useless — no PDF contains "solve: integrate x^2". Routing prevents wasted API calls and makes the bot faster.

## 2.6 Resilient Gemini Architecture

The bot never fails silently. Every Gemini call goes through a 3-model fallback chain:

```
Try: gemini-2.5-flash (primary, best quality)
    │ 503/429? → exponential backoff (1s, 2s, 4s) × 3 attempts
    │ Still failing? →
Try: gemini-1.5-flash (fallback)
    │ Still failing? →
Try: gemini-1.5-flash-8b (emergency, lightweight)
    │ All failed? →
Return: "AI is experiencing high demand. Try again in 1-2 minutes."
```

Students never see a cryptic error. They get a clear message.

## 2.7 Role System

Cravex has 4 roles. Each role sees a different set of commands and dashboard pages.

| Role | Where Stored | Access Level |
|------|-------------|-------------|
| Master Admin | users table, college_id = NULL | All colleges, add colleges, global analytics |
| College Admin | users table, role = 'admin' | One college, all features, add teachers |
| Teacher | users table, role = 'teacher' | One college, attendance/marks/broadcast/PDF/Excel |
| Student | students table | Own attendance, marks, risk score, Q&A, voice notes |

**Security:** Students can only see their own data. Each DB query is scoped by college_id. A student from College A cannot access College B's data even if they know the bot number — because their phone number is only in College A's students table.

## 2.8 All Bot Commands

### Student Commands

| Command | What It Does |
|---------|-------------|
| `myattendance` | Shows current attendance %, VTU status, predictive days-to-breach warning |
| `myrisk` | Shows academic risk score (0-100) from attendance + marks, with weak subject list |
| `myfiles` | Lists all PDFs uploaded for their branch/division/semester |
| `notices` | Shows last 5 college announcements |
| `help` | Shows all available commands |
| Any question | Routes to maths solver, general knowledge, or RAG-powered college Q&A |
| Voice note | Gemini transcribes audio, processes as text question, answers |

### Teacher Commands

| Command | What It Does |
|---------|-------------|
| `attendance: {"91XX": "72%"}` | Updates single student attendance, sends alert, updates risk score |
| `!marks 91XX Subject 22/30` | Records internal marks, notifies student, alerts parent if below 60% |
| `!parent 91Student 91Parent Name` | Links parent phone to student for automatic alerts |
| `broadcast: message` | Sends message to all college students |
| `smartnotice` | AI generates 3 relevant college notices from live data |
| `atrisk` | Shows top 10 at-risk students ranked by risk score |
| `myattendance` | Shows low-attendance summary for the college |
| Send PDF | Triggers guided multi-step upload: branch → division → semester → title → AI indexes |
| Send Excel (.xlsx/.csv) | Triggers guided flow: 1=bulk register students, 2=bulk attendance update |

### Admin Commands (all teacher commands plus)

| Command | What It Does |
|---------|-------------|
| `!add teacher 91XX Name` | Creates teacher account linked to this college |

## 2.9 The PDF Upload Flow

This is one of the most technically sophisticated features. Here is exactly what happens when a teacher sends a PDF:

1. Teacher sends PDF to the WhatsApp bot
2. Bot detects it is a PDF (not Excel) by mime_type
3. Bot sends: "Which branch is this for? 1-CS 2-EC..."
4. Session saved to `pdf_upload_sessions` table (JSON state with mediaId, step)
5. Teacher replies "1" (CS)
6. Session updated: step = division
7. Bot asks for division, teacher replies
8. Session updated: step = semester
9. Bot asks semester, teacher replies
10. Session updated: step = title
11. Bot asks for title, teacher replies
12. Bot confirms: "Processing... 30-60 seconds"
13. Bot downloads PDF binary from Meta API using the mediaId
14. Binary sent to Gemini as base64 with prompt: "Extract ALL text"
15. Gemini returns raw text (up to 8000 tokens)
16. Text split into ~500-char chunks with 50-char overlap at paragraph boundaries
17. Each chunk embedded via text-embedding-004 (768-dim vector)
18. Chunks inserted to doc_chunks table with branch/division/semester tags
19. Entry added to uploaded_files table
20. Session cleared from database
21. Teacher receives: "✅ Title uploaded! 42 sections indexed for CS Div-A Sem-3"

**Why step 4 matters:** The bot is serverless. There is no memory between requests. If the teacher replies "CS" 30 seconds after sending the PDF, a completely fresh function instance handles that message. The session in the database is the only way it knows what's happening.

## 2.10 Excel Upload Flow

Teachers can register an entire class or update attendance for 60 students at once by sending a .xlsx or .csv file. Gemini reads the spreadsheet natively — no npm packages needed.

**For student registration:**
- Teacher sends Excel with columns: Name | Phone | USN (optional)
- Bot asks branch → division → semester
- Gemini extracts all student rows as JSON
- Each student inserted to students table
- Welcome WhatsApp sent to each new student's phone
- Teacher gets summary: X registered, Y already existed, Z failed

**For attendance update:**
- Teacher sends Excel with columns: Phone | Attendance%
- Bot asks branch → division → semester
- Gemini extracts all rows as JSON
- Each student's attendance_records upserted
- Risk scores updated
- Students notified individually with personalized messages
- Parents alerted if attendance < 75%
- Teacher gets summary: X notified, Y not found, Z parent alerts sent

## 2.11 Voice Note Flow

1. Student sends voice note
2. Bot detects `message.type === "audio"`
3. Downloads audio binary from Meta API
4. Strips codec suffix from mime_type (audio/ogg; codecs=opus → audio/ogg)
   This was a critical bug: Gemini rejects the codec suffix
5. Base64 encodes the audio
6. Sends to Gemini with both the audio data and text prompt: "Transcribe this audio"
7. Gemini returns transcription
8. Bot replies: "🎤 You said: [transcript] — Answering..."
9. Transcription processed as normal text question through full routing pipeline
10. Logged to voice_logs table

## 2.12 Risk Score Calculation

The academic risk score is a composite of two factors:

**Attendance Risk (0-40 points)**
- Attendance ≥ 85% → 0 points (safe)
- Attendance 75-85% → scales from 0 to 20 (warning zone)
- Attendance < 75% → scales from 20 to 40 (danger zone)

**Marks Risk (0-60 points)**
- For each subject where marks_obtained/max_marks < 60%: count as "weak"
- Risk = (weak_subjects / total_subjects) × 60

**Total = min(100, attendance_risk + marks_risk)**

**Risk levels:**
- 0-19: Low (green) — on track
- 20-49: Moderate (yellow) — needs attention
- 50-74: High (orange) — intervention recommended
- 75-100: Critical (red) — urgent action needed

## 2.13 Predictive Attendance Warning

When attendance is between 75% and 82%, the bot calculates how many days until the student breaches 75% at their current rate of missing classes.

Formula:
```
estimatedTotal = 60 (typical classes per semester)
attended = (attendance% / 100) × estimatedTotal
daysUntilRisk = ((attendance% - 75) / (100/estimatedTotal)) × 7
```

This gives students a concrete, actionable warning: "You may fall below 75% in approximately 12 days if you miss classes." This is the feature that makes VTU coordinators genuinely excited.

## 2.14 Response Caching

Every AI response (except greetings) is cached by a 32-character SHA-256 hash of:
```
hash(question.toLowerCase() + college_id + branch + division)
```

If the same question comes from another CS-A student at the same college, the cached answer is returned instantly with zero Gemini API call.

Cache invalidation: none (intentional). Academic content doesn't change frequently. A correct answer about Newton's second law today is still correct next week.

## 2.15 Message Chunking

WhatsApp has a practical limit of ~4096 characters per message. Some AI responses (especially detailed maths solutions or long syllabus explanations) exceed this.

The `waSend()` function splits responses at paragraph boundaries (double newlines) rather than mid-sentence, and delivers them as numbered parts (1/2), (2/2) with a 600ms delay between parts. Short responses (the majority) go through the standard `wa()` function unchanged.

---

# PART THREE — THE BUSINESS

## 3.1 Target Market

**Primary:** VTU-affiliated engineering colleges in Karnataka
- 200+ VTU-affiliated colleges
- Each college: 300-1500 students
- Each college: 20-80 teachers
- Total addressable students: ~200,000

**Secondary:** Other state technical universities in India
- Anna University: Tamil Nadu (~600 affiliated colleges)
- Mumbai University: ~900 engineering colleges
- JNTU: Andhra Pradesh and Telangana
- Combined TAM: 2.5 million+ engineering students

## 3.2 Pricing Model

| Plan | Price | Students | Target College |
|------|-------|---------|---------------|
| Pilot | Free, 3 months | Up to 500 | First 5 colleges |
| Starter | ₹2,999/month | Up to 200 | Small colleges (<500 students) |
| Growth | ₹4,999/month | Up to 500 | Mid-size colleges |
| Campus | ₹9,999/month | Unlimited | Large institutions |
| Enterprise | Custom | Unlimited + custom features | University chains |

**Unit economics at Growth tier:**
- Revenue: ₹4,999/month
- AI costs (Gemini): ~₹800/month (estimated 50K messages/month)
- Infrastructure (Supabase, Netlify): ~₹400/month
- **Gross margin: ~74%**

## 3.3 Sales Strategy

**Phase 1 — Founder-led sales (now)**
Go directly to principals and HODs. Personal demo. Show the bot live. The demo converts itself — voice note → instant answer is the wow moment. Target: 5 pilot colleges in 60 days.

**Phase 2 — Referral-driven (Month 4-12)**
Satisfied colleges refer to their sister institutions. VTU has clusters of affiliated colleges with shared management boards. One board relationship = multiple college contracts.

**Phase 3 — Channel partners (Year 2)**
Partner with VTU textbook publishers, coaching institutes, and college management software vendors to bundle Cravex as a value-add.

## 3.4 Demo Script (5 Minutes)

This is the sequence that closes deals with principals. Practice until you can do this in your sleep.

**Minute 0:30 — Setup**
"I'm going to show you this live right now. This is your college's WhatsApp bot number. Students save this number and text it."

**Minute 1:00 — Registration (skip if pre-done)**
"A teacher uploads an Excel with the class list. Every student gets a welcome message automatically. No manual registration."

**Minute 1:30 — Voice note (THE wow moment)**
Record voice note: "What is the VTU attendance rule?" Send it.
Wait 3 seconds. Bot transcribes and answers.
"The student sent a voice note. The AI transcribed it and answered. No typing needed."

**Minute 2:00 — Maths**
Type: "solve: differentiate sin(x²)"
"Step-by-step solution. Any VTU maths topic. Students stop bothering teachers with basic questions."

**Minute 2:30 — Attendance + parent alert**
From teacher number: "attendance: {"919XXXXXXXX": "65%"}"
"Teacher sent one message. Student got an alert. And the parent got a WhatsApp. Automatically."

**Minute 3:00 — Risk report**
Type: "atrisk"
"These are the students most likely to fail this semester. Risk score calculated from attendance and internal marks. Teacher can intervene before it's too late."

**Minute 3:30 — Dashboard**
Open dashboard on laptop. Show risk monitor, knowledge base, analytics.
"Everything visible on one screen. No spreadsheets. No manual reports."

**Minute 4:00 — Close**
"This is running right now on real infrastructure. Your college can be live in 24 hours. We're offering 3 months completely free to the first five colleges. No credit card. No commitment."

**The key line:** "You spend ₹5,000/month on one part-time staff member for admin. This does more, automatically, for the same cost."

## 3.5 Objections and Responses

**"Students won't use it."**
"They already use WhatsApp 4 hours a day. We're just putting education inside the app they're already on. No download required."

**"What about data privacy?"**
"Data is stored in India on AWS Mumbai servers. We comply with IT Act 2000. We don't share student data with anyone. We're happy to sign a data processing agreement."

**"Is it accurate? AI makes mistakes."**
"For maths, it is verified step-by-step. For college knowledge, it answers from your own PDFs — not from the internet. For VTU rules, it uses official VTU documentation."

**"What if WhatsApp stops working?"**
"We use Meta's official Business API, the same infrastructure used by banks and airlines for customer service. It's enterprise-grade, not personal WhatsApp."

**"We already have a college ERP."**
"We don't replace your ERP. We give students and teachers a communication channel. The ERP is for admin. Cravex is for students."

**"What happens after the free trial?"**
"₹4,999/month for up to 500 students. That's ₹10 per student per month. Less than the cost of printing one notice board update."

## 3.6 Metrics to Track

**Product metrics (weekly):**
- Total messages processed
- Unique active students (messaged in last 7 days)
- AI response cache hit rate (target: >40%)
- Average response time
- Voice notes processed
- PDFs uploaded

**Business metrics (monthly):**
- Colleges on free pilot
- Colleges converted to paid
- MRR (Monthly Recurring Revenue)
- Churn rate
- NPS from college admins

**Outcome metrics (per semester):**
- Average attendance improvement vs. pre-Cravex
- Reduction in sub-75% attendance cases
- Teacher time saved (survey)

---

# PART FOUR — INFRASTRUCTURE

## 4.1 Supabase Project

- **Project ID:** gkuzoywsftjxnxzlufiy
- **URL:** https://gkuzoywsftjxnxzlufiy.supabase.co
- **Region:** ap-southeast-1 (Singapore — closest to India on free tier)
- **Edge Function:** whatsapp-bot

**Required secrets in Edge Function:**
```
SUPABASE_URL              = https://gkuzoywsftjxnxzlufiy.supabase.co
SUPABASE_SERVICE_ROLE_KEY = (from Supabase → Settings → API)
GEMINI_API_KEY            = (from Google AI Studio → aistudio.google.com)
WHATSAPP_ACCESS_TOKEN     = (from Meta → WhatsApp → API Setup → Generate token)
```

## 4.2 Meta WhatsApp Setup

- **App:** EduConnect_Main_E... (App ID: 2481763965579668)
- **Business Account:** Botcy (needs rename to Cravex)
- **Business Account ID:** 889810857019394
- **Test number:** +1 555 174 1998 (Phone ID: 926560710551413)
- **Live number:** +91 72042 86239 (Phone ID: 1117610714762776) — Status: PENDING
- **App Mode:** Live ✅
- **Webhook URL:** https://gkuzoywsftjxnxzlufiy.supabase.co/functions/v1/whatsapp-bot
- **Verify Token:** vtu_bot_secret_123

**When new SIM activates (status changes from Pending to Connected):**
1. Update `PHONE_ID` in `bot/index.ts` line 4 to `"1117610714762776"`
2. Generate new permanent Access Token in Meta
3. Update `WHATSAPP_ACCESS_TOKEN` secret in Supabase
4. Redeploy edge function
5. Test via wa.me/917204286239

## 4.3 Hosting

- **Website + Dashboard:** Netlify (drag cravex folder to netlify.com/drop)
- **Bot:** Supabase Edge Functions (serverless Deno)
- **Database:** Supabase PostgreSQL (hosted on AWS)

## 4.4 API Costs (Free Tier Limits)

| Service | Free Tier | Paid Starts |
|---------|-----------|------------|
| Supabase | 50,000 MAU, 500MB DB, 500MB file | $25/month |
| Google Gemini | 15 requests/min on free tier | Pay per token after |
| Meta WhatsApp | 1,000 user conversations/month free | ~$0.011 per conversation after |
| Netlify | 100GB bandwidth, 300 build minutes | $19/month |

For a single college with 200 students sending ~5 messages/day each: ~30,000 messages/month. Well within Gemini free limits if cached responses absorb 40%+.

## 4.5 Scaling Path

**0-500 students:** Current setup handles this with zero cost.

**500-5,000 students (5-10 colleges):** 
- Upgrade Supabase to Pro ($25/month)
- Switch to Gemini paid tier (~$2-5/month at expected volume)
- Meta auto-upgrades to Tier 2 (10,000 users/day) based on quality rating

**5,000-50,000 students (50+ colleges):**
- Consider dedicated Supabase compute
- Add a queue (Redis/BullMQ) to handle burst traffic
- Potentially separate database per college group for true isolation

---

# PART FIVE — DEPLOYMENT & OPERATIONS

## 5.1 Deploy Checklist (New College Onboarding)

1. **Database:** Run this SQL to add the new college:
   ```sql
   INSERT INTO colleges (name, location, admin_phone)
   VALUES ('College Name', 'City', '91XXXXXXXXXX')
   RETURNING id;
   ```
   Note the returned `id` — this is the college's `college_id`.

2. **Admin user:** Create admin account:
   ```sql
   INSERT INTO users (name, phone_number, role, college_id)
   VALUES ('Principal Name', '91XXXXXXXXXX', 'admin', 'college-id-from-step-1');
   ```

3. **Verify:** The admin should message the bot. They should see the "not registered" message at first, then after the INSERT, they should see "help" menu.

4. **Onboarding call:** Walk through:
   - How to add teachers (from WhatsApp: `!add teacher 91XX Name`)
   - How to upload Excel for student registration
   - How to upload PDFs for knowledge base
   - Dashboard access at your Netlify URL

That's it. The college is live.

## 5.2 Full Test Checklist

Run through every item before showing to a principal.

**Registration & Security**
- [ ] Unknown number messages bot → "You're not registered yet. Ask your teacher."
- [ ] Admin messages → gets help menu
- [ ] Student (from Excel upload) → gets welcome message on registration

**Attendance**
- [ ] `attendance: {"91XX": "65%"}` → student gets warning + parent alert if linked
- [ ] `attendance: {"91XX": "78%"}` → student gets predictive days-to-breach warning
- [ ] `attendance: {"91XX": "88%"}` → student gets "safe zone" message
- [ ] `myattendance` from student → shows their %, VTU status, predictive warning

**Marks**
- [ ] `!marks 91XX Mathematics 18/30` → student notified, parent alerted (below 60%)
- [ ] `!marks 91XX Physics 25/30` → student notified with positive message

**Parent Integration**
- [ ] `!parent 91Student 91Parent ParentName` → linked, confirmation sent
- [ ] Update attendance below 75% → parent's phone gets alert

**Risk**
- [ ] `myrisk` from student → shows risk score with breakdown
- [ ] `atrisk` from teacher → shows top at-risk students ranked

**AI Features**
- [ ] "solve: integrate x^2 from 0 to 3" → step-by-step, answer = 9
- [ ] "what is Newton's second law" → general knowledge answer
- [ ] "what is VTU attendance rule" → college-aware answer
- [ ] Same question twice → second reply is instant (cached)

**Voice Notes**
- [ ] Send voice note asking maths question → transcription + step-by-step answer
- [ ] Send voice note asking general question → transcription + answer

**PDF Upload**
- [ ] Send PDF → branch → division → semester → title → "X sections indexed"
- [ ] `myfiles` → lists the uploaded PDF
- [ ] Ask question from PDF content → bot answers from it
- [ ] CS-A student asks EC question → bot doesn't answer from EC notes

**Excel Upload**
- [ ] Send student list Excel → option 1 → branch/division/sem → students registered + welcome messages
- [ ] Send attendance Excel → option 2 → branch/division/sem → students notified
- [ ] Unknown phone in attendance Excel → "Not found" count increments

**Broadcast & Notices**
- [ ] `broadcast: Test announcement` → all students receive it
- [ ] `notices` from student → shows last 5 announcements
- [ ] `smartnotice` → 3 AI-generated relevant notices

**Rate Limiting**
- [ ] Send 9 messages rapidly → 9th gets "sending too fast" message

**Dashboard**
- [ ] Login with admin phone + Master Admin role → all pages load
- [ ] Students page → branch filter works, search works
- [ ] Risk monitor → bars show, predictive days shown
- [ ] Broadcast from dashboard → saves to DB
- [ ] Knowledge base → shows uploaded PDFs with targeting

## 5.3 Known Limitations (Be Honest About These)

1. **New SIM pending:** The live number +91 72042 86239 is pending activation on WhatsApp Business API. Currently testing on +1 555 174 1998. Activates once payment method issue is resolved.

2. **Voice notes in noisy environments:** Gemini transcription accuracy drops with background noise. Works best in quiet settings. Students can always type instead.

3. **Excel format sensitivity:** If a teacher's Excel has unusual column headers or merged cells, Gemini may mis-parse some rows. The bot reports failed rows count. Teacher can clean the file and re-upload.

4. **PDF text extraction limit:** Gemini extracts up to 8000 tokens of text per PDF. Very large PDFs (200+ pages) may have later sections not indexed. Solution: split large PDFs before uploading.

5. **Gemini free tier rate limit:** 15 requests/minute on free tier. If a teacher uploads an Excel with 100 students and all 100 are new, the welcome messages could hit rate limits. The 200ms delay between messages mitigates this.

6. **Payment method for parent alerts:** Parent alerts are business-initiated messages. If the parent has never messaged the bot first, Meta technically requires a payment method on file. User-initiated messages (students texting the bot) are always free up to 1,000/month.

---

# PART SIX — ROADMAP

## Version 1.0 (Current — April 2026)
✅ WhatsApp bot with full command set
✅ PDF upload with branch-aware RAG
✅ Excel bulk student registration
✅ Excel bulk attendance upload
✅ Predictive attendance alerts
✅ Academic risk scoring
✅ Voice note support
✅ Parent WhatsApp integration
✅ Smart AI-generated notices
✅ Admin dashboard (10 pages)
✅ Rate limiting and deduplication
✅ Resilient Gemini with fallback chain
✅ Response caching
✅ Landing page + Privacy + Terms

## Version 1.1 (Next — 60 days)
- [ ] Live number activated (+91 72042 86239 pending)
- [ ] Full end-to-end test on live number
- [ ] First 3 pilot colleges onboarded
- [ ] Meta App Review submitted and approved
- [ ] Dashboard actions: send broadcast directly from web UI
- [ ] Dashboard actions: update attendance from web UI

## Version 1.2 (90 days)
- [ ] `mytimetable` command — shows student's class schedule
- [ ] `summarize Unit 3` — AI summarizes a specific unit from uploaded PDFs
- [ ] Exam date reminders (teacher sets date, bot reminds 3 days before)
- [ ] Student leaderboard by attendance (optional, per college preference)
- [ ] Auto-cleanup job for processed_messages older than 7 days

## Version 2.0 (6 months)
- [ ] Multi-language support (Kannada)
- [ ] Student study plan based on weak subjects
- [ ] Analytics dashboard with trend charts
- [ ] Parent-facing WhatsApp onboarding (not just alerts)
- [ ] Custom college branding on messages
- [ ] Bulk PDF upload (upload folder, not single file)
- [ ] Marks entry via Excel (currently WhatsApp command only)
- [ ] Automated weekly risk report to admin

## Version 3.0 (1 year)
- [ ] Expand beyond VTU to other state universities
- [ ] API for college ERP integrations
- [ ] Student mobile app (React Native) as premium tier
- [ ] Teacher scheduling and timetable management
- [ ] Fee reminder notifications
- [ ] Alumni engagement module

---

# PART SEVEN — QUICK REFERENCE

## Bot Phone Numbers
| Number | Purpose | Status |
|--------|---------|--------|
| +1 555 174 1998 | Test number (Meta sandbox) | Active ✅ |
| +91 72042 86239 | Live Indian SIM | Pending ⏳ |

## Key URLs
| Resource | URL |
|----------|-----|
| Supabase Dashboard | supabase.com/dashboard/project/gkuzoywsftjxnxzlufiy |
| Meta Developer Console | developers.facebook.com/apps/2481763965579668 |
| Netlify Deploy | netlify.com/drop |
| Google AI Studio | aistudio.google.com |
| WhatsApp Link (test) | wa.me/15551741998 |
| WhatsApp Link (live) | wa.me/917204286239 |

## Environment Variables
```
PHONE_ID                  = 926560710551413 (test) / 1117610714762776 (live)
VERIFY_TOKEN              = vtu_bot_secret_123
GEMINI_MODEL              = gemini-2.5-flash
EMBEDDING_MODEL           = text-embedding-004
SUPABASE_URL              = https://gkuzoywsftjxnxzlufiy.supabase.co
```

## Codebase Line Counts
| File | Lines | Purpose |
|------|-------|---------|
| bot/index.ts | 879 | Entire bot brain |
| pages/dashboard.html | 651 | Admin dashboard |
| index.html | 486 | Landing page |
| schema.sql | 245 | Database setup |
| privacy.html | 63 | Privacy policy |
| terms.html | 66 | Terms of service |

## Contact
- Email: hello@cravex.co.in
- Location: Belagavi, Karnataka, India

---

*This manual was last updated April 2026. When a feature changes, update the relevant section immediately. A manual that is out of date is worse than no manual.*
