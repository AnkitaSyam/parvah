# परवाह · Parvah

**Voice-first maternal and child health support for ASHA workers in rural India.**

An ASHA worker records a home visit on her phone. Parvah transcribes the
conversation in Hindi or English, extracts the symptoms into a longitudinal
risk timeline, flags obstetric danger signs, detects the myths the family
believes, and hands back a counselling script in their own language — then
follows the same woman past delivery into postnatal care, her child's
immunization schedule, and the baby's growth.

It works with no signal. A visit recorded out of coverage is queued on the
phone and uploads itself when a connection returns.

It also runs end-to-end **without any API key** — transcription falls back to a
simulated visit and myth matching falls back to local semantic search — so you
can set it up and try the whole flow before signing up for anything.

---

## Contents

1. [What you need before you start](#1-what-you-need-before-you-start)
2. [Set up Supabase](#2-set-up-supabase)
3. [Create the database](#3-create-the-database)
4. [Configure the project](#4-configure-the-project)
5. [Install and seed](#5-install-and-seed)
6. [Run it](#6-run-it)
7. [Optional: turn on real AI and SMS](#7-optional-turn-on-real-ai-and-sms)
8. [Usage guide](#8-usage-guide)
9. [Troubleshooting](#9-troubleshooting)
10. [Architecture](#10-architecture)
11. [Tests](#11-tests)
12. [Clinical sources](#12-clinical-sources)
13. [Deploying](#13-deploying)

---

# Part I — Setup

## 1. What you need before you start

| | |
|---|---|
| **Node.js 18 or newer** | `node --version` — install from [nodejs.org](https://nodejs.org) |
| **A Supabase account** | Free tier is plenty. [supabase.com](https://supabase.com) |
| **A modern browser** | Chrome, Edge or Firefox. Microphone access needs `localhost` or HTTPS |
| *(optional)* **Groq API key** | Free at [console.groq.com](https://console.groq.com) — turns on real transcription |
| *(optional)* **Twilio account** | Only if you want real SMS to go out |

Nothing else. There is no Docker, no Python, and no local database to install.

**Time to first run: about 15 minutes**, most of it waiting for Supabase to
provision your project.

---

## 2. Set up Supabase

Supabase provides the database, authentication and file storage.

### 2.1 Create a project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and sign in.
2. Click **New project**.
3. Fill in:
   - **Name** — `parvah`
   - **Database Password** — generate one and save it somewhere. You will not
     need it for Parvah itself, but you will if you ever use the Supabase CLI.
   - **Region** — pick the closest one. For India, `South Asia (Mumbai)`.
4. Click **Create new project** and wait ~2 minutes while it provisions.

### 2.2 Copy your three keys

Once the project is ready, go to **Project Settings → API** (the gear icon in
the sidebar). You need three values:

| Value | Where to find it | Used by |
|---|---|---|
| **Project URL** | *Project URL* box | backend + frontend |
| **anon / public key** | *Project API keys → `anon` `public`* | backend + frontend |
| **service_role key** | *Project API keys → `service_role`* (click **Reveal**) | backend only |

> **The `service_role` key bypasses all security rules.** It belongs only in
> `backend/.env`, which is git-ignored. Never put it in the frontend, never
> commit it, never paste it into a chat or an issue. If it leaks, rotate it
> immediately from the same page.

Keep this tab open — you will paste these into `.env` files in step 4.

### 2.3 Turn off email confirmation (recommended while testing)

By default Supabase emails a confirmation link before a new account can sign
in, which is a nuisance while you are setting things up.

1. Go to **Authentication → Sign In / Providers → Email**.
2. Turn **Confirm email** *off*.
3. Click **Save**.

Now **Create account** in Parvah signs you straight in. Turn it back on before
real users get near it.

---

## 3. Create the database

Parvah's schema lives in `backend/supabase/migrations/`. The files must run
**in filename order** — later ones alter tables the earlier ones create.

Pick **either** method below.

### Method A — Supabase SQL Editor (no extra tools)

1. In your Supabase dashboard, open **SQL Editor** in the sidebar.
2. Click **New query**.
3. For each file in `backend/supabase/migrations/`, **in this exact order**:

   ```
   001_init.sql
   002_add_asha_worker_schema.sql
   003_sync_pregnancy_myth_database.sql
   004_add_myth_embeddings.sql
   005_verify_patient_isolation.sql
   006_add_profile_age.sql
   008_add_profile_location.sql
   009_repair_postpartum_and_immunization.sql
   010_vitals_and_growth.sql
   ```

   Open the file, copy all of it, paste into the editor, and click **Run**.
   Wait for *Success* before moving to the next one.

   *(There is no `007` — the number was skipped during development. That is
   expected, not a missing file.)*

4. When all nine have run, open **Table Editor**. You should see:

   `profiles` · `patients` · `visits` · `pregnancy_myths` · `detected_myths` ·
   `risk_timeline` · `immunization_records` · `visit_vitals` · `child_growth` ·
   `calls` · `sms_alerts`

### Method B — Supabase CLI (faster if you already have it)

```bash
npm install -g supabase                            # if you don't have it
cd backend
supabase link --project-ref <your-project-ref>     # from your dashboard URL
supabase db push
```

`<your-project-ref>` is the random-looking string in your dashboard URL:
`https://supabase.com/dashboard/project/`**`abcdefghijklmnop`**

### 3.1 Verify

Run this in the SQL Editor. It should return **9 rows**, all with
`rls_enabled = true`:

```sql
select tablename, rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles','patients','visits','pregnancy_myths',
                    'detected_myths','risk_timeline','immunization_records',
                    'visit_vitals','child_growth')
order by tablename;
```

If any row shows `false`, re-run `005_verify_patient_isolation.sql` and
`009_repair_postpartum_and_immunization.sql`.

---

## 4. Configure the project

Parvah uses **two** env files — one for the server, one for the browser.

```bash
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env
```

### 4.1 `backend/.env`

Fill in the three Supabase values from step 2.2:

```ini
PORT=5000
NODE_ENV=development

SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...          # the anon / public key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...  # the service_role key

# Leave the rest as-is for now — everything works without them.
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

> The server **refuses to start** if any of those three are missing. That is
> deliberate — a silent fallback would quietly connect you to the wrong
> database.

### 4.2 `frontend/.env`

Only two values, and **never** the service_role key:

```ini
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...     # the same anon key

VITE_API_BASE_URL=/api                   # leave as-is for local development
```

The anon key is safe in the browser: every query is scoped to the signed-in
worker by row-level security in the database.

---

## 5. Install and seed

From the **repository root**:

```bash
# Install backend + frontend dependencies (~1 minute)
npm run install:all

# Load the myth catalog and build the semantic search index
npm run setup
```

`npm run setup` does two things:

1. **`seed:myths`** — writes 16 sourced pregnancy and newborn-care myths into
   `pregnancy_myths`, each with a Hindi counselling script and a citation.
2. **`embed:myths`** — downloads a ~90 MB embedding model **once** and computes
   a vector for each myth so transcripts can be matched semantically. This runs
   entirely on your machine and needs no API key.

The first `embed:myths` takes a few minutes while the model downloads. Later
runs are instant.

You should see:

```
✅ Seeded 16 pregnancy myths.
   Next: run `npm run embed:myths` to build the semantic search index.
```

---

## 6. Run it

You need **two terminals**, both at the repository root.

**Terminal 1 — backend:**

```bash
npm run dev:backend
```

```
🌸 Parvah backend listening on http://localhost:5000
   health   → http://localhost:5000/api/health
   groq     → ⚠️  not configured (simulated transcription)
   supabase → ✅ connected
   twilio   → ⚠️  not configured (SMS will be simulated)
```

The two ⚠️ lines are expected until you add optional keys in step 7.
`supabase → ✅ connected` is the one that must be green.

**Terminal 2 — frontend:**

```bash
npm run dev:frontend
```

```
  VITE ready
  ➜  Local:   http://localhost:3000/
```

Open **http://localhost:3000**, click **Create an account**, and you are in.

> **Health check:** open http://localhost:5000/api/health at any time to see
> exactly which services are live and which are simulated.

---

## 7. Optional: turn on real AI and SMS

Everything works without these. Add them when you want the real thing.

### Groq — real transcription and myth detection

1. Sign up free at [console.groq.com](https://console.groq.com).
2. **API Keys → Create API Key**, copy it.
3. Put it in `backend/.env`:

   ```ini
   GROQ_API_KEY=gsk_your_actual_key_here
   ```

4. Restart the backend. It should now say `groq → ✅ live`.

**With Groq off:** transcription returns a realistic simulated Hindi visit, and
myths are matched by local semantic search. The UI labels this clearly as
*offline mode* — nothing pretends to have worked.

**With Groq on:** Whisper transcribes your actual audio, and an LLM writes a
counselling script tailored to what the family said.

### Twilio — real SMS

```ini
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

Without these, SMS is simulated: the message body is shown on screen and logged
to the console, which is usually what you want for a demo.

> Sending SMS to Indian numbers requires DLT registration with an Indian
> telecom operator. For a demo, leave Twilio unconfigured and show the
> simulated message.

### Inbound SMS webhook (Myth-correction & Emergency bypass)

Parvah accepts inbound SMS from mothers and families via Twilio:

1. In the **Twilio Console**, go to **Phone Numbers → Manage → Active Numbers** and click your phone number.
2. Under **Messaging Configuration**, find **A message comes in**:
   - Set to **Webhook**
   - URL: `POST https://<your-domain>/api/sms/inbound`
3. **Local development with a public tunnel:**
   Twilio requires a publicly accessible URL to deliver webhooks. Use a tunnel such as [ngrok](https://ngrok.com):
   ```bash
   ngrok http 5000
   ```
   Copy the HTTPS forwarding URL (e.g. `https://xyz.ngrok-free.app`) and set it in `backend/.env`:
   ```ini
   PUBLIC_BASE_URL=https://xyz.ngrok-free.app
   ```
   This ensures Twilio's cryptographic request signature validation (`X-Twilio-Signature`) matches the public URL behind the reverse proxy.
4. **How inbound messages are handled:**
   - **Emergency bypass (Checked first):** If the message contains obstetric danger signs (e.g. heavy bleeding, severe headaches, convulsions), Parvah immediately replies with urgent 108 facility referral guidance via TwiML, alerts the woman's assigned ASHA worker via SMS, and logs the event to `sms_alerts` (`alert_type: 'emergency'`).
   - **Myth correction:** If safe, the text is matched against the pregnancy myth database. If a myth is found, she receives an SMS correction counseling script in her language and it logs as `alert_type: 'myth'`.
   - **Neutral advice:** If no emergency or myth is detected, Parvah sends a neutral healthcare acknowledgment advising her to contact her ASHA worker (`alert_type: 'neutral'`).

---

# Part II — Using Parvah

## 8. Usage guide

### 8.1 Create your worker account

On first load you see the sign-in screen.

1. Click **Create an account**.
2. Enter your name, email and a password (8+ characters).
3. Optionally add your mobile number, sub-centre, district, state and PIN code.
   These appear on referral slips as the referring worker, so they are worth
   filling in.
4. Click **Create account**.

Your profile is created automatically by a database trigger. If you left email
confirmation on in step 2.3, check your inbox first.

### 8.2 Register a patient

**Patients** tab → **Register patient**.

| Field | Why it matters |
|---|---|
| **Full name** | Required |
| **Age** | Required — **under 18 or 35+ adds standing risk** to her score |
| **Weeks pregnant** | Drives the whole ANC schedule. Blank defaults to 12 |
| **Blood group** | Printed on the referral slip |
| **Pregnancies (G) / Births (P)** | **4 or more births adds standing risk** |
| **Village** | Used for grouping, and on the slip |
| **Mobile / emergency contact** | 10 digits. SMS alerts go to these — and *only* these |
| **Counselling language** | Hindi or English. Counselling scripts are written in this language |

Her card then shows her real risk level, her current gestational week (which
advances by itself from the registration date), and what is overdue.

### 8.3 Record a visit

**Record** tab, then pick the patient. A banner tells you whether this is an
antenatal or postnatal visit and which danger signs Parvah is watching for.

Three ways to give it something to analyse — you can combine them:

- **Record** — tap *Start recording* and let the conversation run. Record the
  whole thing, including what the family says: that is where the myths come from.
- **Upload a file** — drag in an MP3, WAV, M4A, OGG or WebM (up to 25 MB).
- **Visit notes** — type what was discussed. With no recording, Parvah analyses
  the notes instead. Useful when the microphone is unavailable.

Click **Analyse visit**. Three steps run: saving the recording → transcribing
and analysing → saved to her record.

**What comes back:**

- **Summary** — with a red banner if an emergency sign was reported.
- **Vitals panel** — see 8.4.
- **Symptoms recorded** — each with severity, why it matters, and the concrete
  ASHA action. Newborn findings are tagged separately.
- **Vaccine hesitancy** — if the family expressed reluctance to immunize.
- **Beliefs to counsel** — with a link to the scripts.
- **Full transcript** — expandable, with the detected language.

> **Negation is handled.** If the worker says *"no bleeding, no convulsions"* or
> *"खून नहीं बह रहा"*, those are **not** flagged. Ruling a danger sign out is
> not the same as reporting it.

### 8.4 Enter vitals

The vitals panel appears under the visit summary, and on each patient's page in
the **Patients** tab.

Enter any of: **BP (upper/lower), haemoglobin, weight, temperature, pulse,
urine albumin, fundal height**. Click **Save & grade**.

Grading uses fixed protocol thresholds — no model involved, so the same reading
always gives the same action:

| Reading | Result |
|---|---|
| BP ≥ 160/110 | **Severe hypertension** — call 108, refer to FRU now |
| BP ≥ 140/90 | Raised — rest 15 min, repeat, test urine, refer same day |
| BP ≥ 140/90 **with albumin 2+** | **Severe** — this pair is the definition of pre-eclampsia |
| Hb < 7 | **Severe anaemia** — refer for transfusion, not IFA alone |
| Hb 7–9.9 | Moderate anaemia — Anemia Mukt Bharat protocol |
| Temp ≥ 38 °C postpartum | **Severe** — puerperal sepsis until proven otherwise |

Findings go straight into her risk timeline and immediately update her score.

**Filling vitals from the recording.** If the worker said the numbers aloud —
*"BP one forty by ninety hai, aur Hb seven point two"* — click **Fill from
recording**. Parvah pulls them out (English, Hinglish and Devanagari, and
converts Fahrenheit) and highlights the filled fields in purple.

> **Always check the values before saving.** Nothing is stored until you do.
> The parser deliberately refuses to guess: a swapped pair (`bp 90 by 140`), an
> impossible reading (`bp 400 by 300`) or an out-of-range Hb are discarded
> rather than offered.

### 8.5 Counsel on the myths

**Myths** tab. Each detected belief shows:

- **Heard in the visit** — the family's own words.
- **What the evidence says** — with a citation you can click.
- **Say this to the family** — a counselling script in her language.

Press **Play aloud** and hold the phone up so the family hears the rebuttal in
Hindi. Press **Mark as counselled** once you have addressed it — this persists,
so at the next visit you can see what is still outstanding.

Below the detections is the full **reference catalog** of 16 sourced myths,
searchable and filterable by category.

### 8.6 Understand the risk score

On the **Patients** tab, select a patient to see **Risk memory**.

- A score from 0–10, on a scale marked at **3.0 watch** and **6.0 alert**.
- **Standing risk** that never decays — adolescent pregnancy, age 35+, grand
  multiparity.
- **What each symptom contributes today** — raw points, how far they have
  decayed, and how many days ago they were reported.

Points decay linearly, so a resolved problem stops dominating while a repeating
pattern accumulates. Antenatal uses a 21-day window; postpartum uses 10 days,
because the danger window after delivery is days, not weeks.

**A severe sign in the last 7 days overrides the arithmetic entirely** and pins
her at alert — shown as a red band naming the sign that triggered it.

### 8.7 Follow the schedule

The **Schedule** tab shows what is actually due, computed from her dates — no
extra data entry.

**Before delivery:** ANC-1 to ANC-4 against India's four-visit schedule, plus
TT/Td doses, IFA and calcium. Each item is marked *overdue*, *due now* or
*upcoming*, with what to do at that visit.

**After delivery:** HBNC home visits on days 3, 7, 14, 21, 28 and 42 — plus
days 1 and 2 if the delivery was at home.

### 8.8 Record the delivery

On the patient's card, click **Record delivery**.

Enter the date, the outcome (live birth / stillbirth / neonatal death), where
it happened, and — for a live birth — the baby's name, sex and birth weight.

This is the moment the app switches modes:

- Danger signs change to the **postpartum** set — puerperal sepsis, DVT,
  postpartum eclampsia, mental-health crisis, newborn danger signs.
- The **HBNC visit schedule** starts.
- The **immunization record** opens.
- **Growth monitoring** begins.

> Enter the birth weight. Below 2.5 kg is automatically flagged to her timeline
> as low birth weight, with kangaroo-mother-care guidance and closer follow-up.
> And record the baby's **sex** — weight-for-age cutoffs differ, and without it
> Parvah declines to classify rather than guess.

### 8.9 Track immunization

On the **Schedule** tab after delivery you get India's National Immunization
Schedule computed from the date of birth — BCG, OPV, Hep B, Pentavalent,
Rotavirus, fIPV, PCV, MR, JE, DPT boosters and Vitamin A.

For each dose: **Given** or **Refused**.

**Refusal is the point.** The due date is already on the MCP card and in U-WIN.
What needs a person is a family declining a dose — so when you mark one
refused, Parvah asks *what the family said* and keeps it. Refusals appear as
actionable items, and the Myths tab has scripts for the usual reasons.

Parvah also detects hesitancy directly from visit audio. If the family says
they will not give the injection, a refusal is logged automatically with a
counselling script attached.

### 8.10 Monitor the baby's growth

Also on the patient's page after a live birth. Click **Record a weight** at
each contact.

- A **trajectory chart** with the WHO −2SD underweight band behind it.
- **Faltering** detected from the baby's own trajectory — weight loss, or less
  than half the expected gain over two weeks. This is the primary signal and
  needs no reference table.
- **Weight-for-age** classification as a secondary read.

The normal newborn dip (up to ~10% of birth weight, regained by day 14) is not
flagged. A loss beyond that is. Concerning results flow into the same risk
score as everything else.

### 8.11 Generate a referral slip

When a patient is at **watch** or **alert**, a **Referral slip** button appears
on her card, on the dashboard worklist, and on her risk timeline.

The slip is a printable, bilingual (English/Hindi) handoff document:

- Urgency banner — emergency / urgent / priority / routine
- Full identity, gestational age or postpartum day, blood group, G/P
- **Danger signs reported**
- **Recent findings** — symptom, severity, when it was reported, days ago, and
  what the ASHA already did
- **Checks completed** — BP, urine albumin, Hb, weight, foetal heart
- Counselling still outstanding
- The referring worker's name, phone and sub-centre, plus a signature line for
  the facility

**Print** produces a clean page (the app chrome is hidden). **Share** opens the
phone's share sheet for WhatsApp, or copies a text version to the clipboard.

### 8.12 Send an alert

From a danger-sign entry on the risk timeline, click **Alert family** — or use
the reminder buttons on the schedule.

Choose a template: danger sign, visit due, immunization due, or escalate to
supervisor. Optionally add a short detail.

> **You cannot type a phone number.** The recipient comes from the patient's
> own record — her contact number for family messages, her emergency contact
> for supervisor escalation. If no number is saved, Parvah tells you to add one
> to her card. This is deliberate: it stops the endpoint being used to send
> arbitrary messages to arbitrary numbers.

### 8.13 Working with no signal

This is the part that matters in a village.

- When the phone goes offline, a **banner appears on the Record tab** and the
  button changes from *Analyse visit* to **Save for later**.
- Record as normal. The audio and notes are stored **on the phone** in
  IndexedDB.
- The navbar shows a chip: **`3 to sync`**.
- When a connection returns, queued visits upload **automatically**, oldest
  first. You can also tap the chip to retry.
- If an upload fails mid-request because the signal dropped, the visit is
  queued rather than lost.

**Install it as an app:** in Chrome on Android, open the menu and choose
*Install app* / *Add to Home screen*. Parvah then opens from the home screen and
launches even with no connection.

> The offline cache holds the app itself, never patient data. Records always
> come fresh from the server — stale clinical data is worse than none.

### 8.14 A five-minute demo path

If you just want to see everything working:

1. Register a patient — age **17**, **32 weeks** pregnant. (Age 17 adds
   standing risk immediately.)
2. Go to **Record** and paste this into **Visit notes**:

   > दीदी, पिछले चार दिन से पैरों में बहुत सूजन है और सिरदर्द भी ठीक नहीं हो रहा।
   > खून नहीं बह रहा है, और दौरे भी नहीं आए। बीपी एक सौ पचास बटा पंचानवे है।
   > सासू माँ कहती हैं कि आयरन की गोली से बच्चे का रंग काला हो जाएगा, इसलिए मैंने गोली खाना बंद कर दिया।

3. Click **Analyse visit**. Swelling and headache are flagged — but bleeding and
   convulsions, which she explicitly *denied*, are not.
4. In the vitals panel, click **Fill from recording**: the BP (150/95) is pulled
   from the text. Save it and watch her move to **alert**.
5. Open **Myths** — the iron-tablet myth is detected. Press **Play aloud**.
6. Back on **Patients**, open **Risk memory** to see exactly why she is at alert.
7. Click **Referral slip** and press **Print**.
8. Turn on airplane mode, go to **Record**, and note that it still works.

---

## 9. Troubleshooting

**Backend exits immediately with "Missing required environment variable(s)"**
`backend/.env` is missing or incomplete. It needs `SUPABASE_URL`,
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Check you copied
`.env.example` to `.env` (not `.env.txt`).

**"relation public.pregnancy_myths does not exist"**
Migrations were not run, or ran out of order. Go back to step 3 and run them in
filename order starting from `001_init.sql`.

**The Myths tab says the catalog is empty**
Run `cd backend && npm run seed:myths`.

**Myth detection finds nothing even though the transcript clearly mentions one**
The semantic index has not been built. Run `cd backend && npm run embed:myths`.

**Sign-up seems to work but nothing happens**
Email confirmation is on. Either check your inbox, or turn it off — step 2.3.

**"Origin http://... is not allowed by ALLOWED_ORIGINS"**
Add the origin you are browsing from to `ALLOWED_ORIGINS` in `backend/.env`,
comma-separated, then restart the backend.

**Microphone does nothing / permission denied**
Browsers only allow microphone access on `localhost` or HTTPS. Use
`http://localhost:3000`, not your machine's LAN IP. Otherwise upload a file or
type notes — both work fully.

**The patient list is empty after signing in**
That is correct for a new account. Register your first patient.

**`npm run embed:myths` seems to hang**
It is downloading a ~90 MB model on first run. Give it a few minutes. Later
runs are instant.

**Everything says "simulated"**
That is the no-API-key mode, and it is fully functional. Add `GROQ_API_KEY` to
`backend/.env` for real transcription — see step 7.

**Port already in use**
Change `PORT` in `backend/.env`, or the port in `frontend/vite.config.js`.

---

# Part III — Reference

## 10. Architecture

```
frontend/                  React 18 + Vite. Supabase Auth in the browser;
                           every API call carries the user's JWT.
  src/lib/api.js           One request path — auth, error parsing, typed ApiError
  src/lib/outbox.js        IndexedDB queue for visits recorded with no signal
  src/lib/useOutbox.js     Connectivity tracking and automatic sync
  public/sw.js             Service worker — app shell only, never patient data

backend/                   Express. Never trusts the client for identity.
  middleware/auth.js       Verifies the JWT, builds an RLS-bound Supabase client
  middleware/security.js   Rate limiting, security headers, CORS allowlist
  routes/                  patients · visits · vitals · myths · immunizations
                           · referrals · sms · profile
  services/
    clinicalText           Negation-aware matching (English + Devanagari)
    vitals                 Protocol grading of BP/Hb/temp/albumin + voice parsing
    childGrowth            Weight-for-age classification, faltering detection
    groqTranscription      Whisper, typed errors, language detection
    groqSymptomExtractor   LLM extraction + a deterministic red-flag guard
    groqMythDetector       Myth detection, counselling scripts, hesitancy
    mythRetrieval          pgvector cosine similarity
    embeddings             Local transformers.js (all-MiniLM-L6-v2), no API key
    riskScoring            Stage-aware decay model with explainable breakdown
    careSchedule           ANC / HBNC / immunization schedules from dates
    storage                Private Supabase bucket + short-lived signed URLs
  supabase/migrations/     The single source of truth for the schema
```

**Data isolation.** Every table carries `asha_worker_id` and a row-level
security policy scoped to `auth.uid()`. Request data is served through a
Supabase client bound to the caller's JWT, so even a buggy route cannot read
another worker's patients. The service-role client is reserved for work that
legitimately spans users — risk scoring, storage, seeding.

**Audio is private.** Recordings go to a private Supabase Storage bucket and are
reachable only through a 5-minute signed URL issued after RLS has proved
ownership. There is deliberately no static `/uploads` mount.

## 11. Tests

```bash
cd backend && npm test
```

**208 offline assertions** — no API key, no network, no database.

```bash
npm run test:redflags    # 87 — danger signs, negation, stage scoping
npm run test:schedule    # 38 — ANC, HBNC, immunization, edge cases
npm run test:vitals      # 83 — BP/Hb grading, voice parsing, growth
```

The largest is the **negation regression suite**. An earlier version of the
red-flag guard matched keywords with no negation handling, so a visit in which
the worker carefully *ruled out* every danger sign —

> "no vaginal bleeding, no convulsions, denies difficulty breathing"

— produced three severe flags and pinned the patient at maximum risk for a
week. Every one of those transcripts is now a test case, alongside the danger
signs that were missing entirely: reduced fetal movement, ruptured membranes,
high fever, severe headache and severe pallor.

The vitals suite covers the cases where voice extraction must **refuse to
guess** — a swapped blood pressure, an impossible reading, a gestational week
that must not be read as a weight. A misheard number drives a wrong referral,
so parsing is deterministic regex, range-checked, and always confirmed by the
worker before anything is stored.

## 12. Clinical sources

Danger signs, thresholds and schedules are not invented. Each entry in
`backend/data/redFlagSymptoms.json` and `backend/data/mythDatabase.json` cites
its source:

- WHO, *Recommendations on Antenatal Care for a Positive Pregnancy Experience* (2016)
- WHO, *Recommendations on Postnatal Care of the Mother and Newborn* (2013)
- WHO, *Child Growth Standards* — weight-for-age
- MoHFW, *Home Based Newborn Care (HBNC) Operational Guidelines*
- MoHFW, *Guidelines for Antenatal Care and Skilled Attendance at Birth*
- Anemia Mukt Bharat operational guidelines
- ICMR-NIN, *Dietary Guidelines for Indians*

> **Parvah does not diagnose.** It records what was said, structures it, and
> flags what protocol says needs a clinician. Every screen carries that framing,
> and the LLM prompts forbid diagnostic language.
>
> The WHO weight-for-age table in `services/childGrowth.js` is an **abridged
> extract**. Verify it against the official tables before any clinical use.
> Faltering detection does not depend on it.

## 13. Deploying

- Set `ALLOWED_ORIGINS` to your real frontend origin. The default is localhost
  only, and a wrong value shows up as a 403.
- Set `VITE_API_BASE_URL` to the deployed backend URL. In development the Vite
  proxy handles it; a production build has no proxy.
- Set `NODE_ENV=production` so error responses stop echoing internal messages.
- The rate limiter is in-memory and single-process. Behind more than one
  instance, swap it for a Redis-backed limiter.
- The embedding model downloads ~90 MB on first use. Set `TRANSFORMERS_CACHE`
  to a persistent path, or run `npm run embed:myths` at build time.
- The service worker only registers in a production build.
- Turn **email confirmation back on** in Supabase before real users sign up.

## License

MIT
