# How it works — a plain-English explainer

> Written for someone who wants to understand the Netchex Visitor Signals app
> without being a developer. No code, no jargon — just what each piece does,
> why it exists, and how the pieces fit together.

---

## 1. The problem in one paragraph

Netchex's website gets thousands of visitors a month. Only about **3%** ever
fill out a form. RB2B (a pixel we drop on the site) can identify roughly
**40%** of the *anonymous* visitors — it tells us their name, work email,
company, and LinkedIn. The trouble is: most of those identified people aren't
real buyers. They're students, job-seekers, competitors, kids on gmail. An SDR
reading that feed by hand spends an hour a day sifting and still misses the
good leads because "good" isn't obvious at a glance.

**This app solves the triage problem.** It takes the firehose of identified
visitors, decides which ones fit Netchex's buyer profile, checks whether we're
already talking to them, and drafts a personalized outbound email in the
voice of a real Netchex SDR — all automatically, in about fifteen seconds per
visitor.

---

## 2. The pipeline, end to end

Think of it as an assembly line with six stations. A visitor enters at the
left and a draft email comes out the right.

```
RB2B pixel   →   Enrichment   →   ICP score   →   CRM dedup   →   Email draft   →   SDR
(identifies)     (Clay/Apify)    (0–100)         (SF + Gong)      (Gemini)
```

### Station 1 — Identification (RB2B)

When someone visits `netchex.com`, RB2B's pixel (already running) fires. If
RB2B can identify them, it sends us a small packet of data:

- first/last name, work email (when available)
- company name, industry, employee count, revenue band
- the specific page URLs they viewed
- any "Hot lead" / ICP tags RB2B has already assigned

Our app exposes a **webhook endpoint** — a URL RB2B calls whenever a new
visit is identified. That URL is `/api/webhook/rb2b`. When the data arrives,
the app saves it to our database and kicks off the rest of the pipeline.

> We also support a **CSV upload** path so we can bulk-import RB2B's
> historical export without needing the live webhook. Both paths end up in
> the exact same place.

### Station 2 — Enrichment (Clay or Apify)

RB2B often gives us a LinkedIn URL but no email, or vice versa. To draft a
good email we need more: job title, company description, LinkedIn headline.

The app is configured to call **Clay** (a B2B enrichment tool) as its primary
source. We send Clay the LinkedIn URL and it sends back a richer profile.
If Clay isn't configured or fails, the app **falls back to Apify** (a simpler
LinkedIn scraper). If neither is configured, the app just skips enrichment
and scores using what RB2B gave us.

Clay runs asynchronously — we push the visitor to Clay, Clay enriches,
Clay calls us back at `/api/webhook/clay/results` with the enriched row.
Nothing blocks waiting for it.

### Station 3 — ICP scoring (the rulebook)

This is where the app decides "is this a real buyer?" It gives each visitor
a score from **0 to 100** across four dimensions:

| Dimension | Weight | What we check |
|-----------|--------|---------------|
| **Firmographics** | 40 points | Is the industry on our target list? Is the company 50–500 employees? Are they US-based? |
| **Intent** | 30 points | Which product pages did they look at? Pricing and demo pages score highest; blog pages score lowest. |
| **Persona fit** | 20 points | Is their title one of our buyers — HR manager, payroll admin, ops director, CFO, owner? |
| **Capacity** | 10 points | Are they in our revenue sweet spot ($5M–$50M)? Are they a repeat visitor? |

**Before scoring**, we apply **hard disqualifiers** — if any of these hit, the
visitor gets a 0 and is marked Disqualified:

- Free email domain (gmail, yahoo, hotmail…) — no real buyer uses these
- Competitor domain (paychex.com, adp.com, paylocity.com…)
- Internal domain (anyone at netchex.com)
- Non-US location
- Missing email *and* missing LinkedIn (no way to reach them)

Based on the final score, each visitor is bucketed into a **tier**:

- **Tier 1 (75–100)** → Immediate outreach
- **Tier 2 (50–74)** → Nurture
- **Tier 3 (<50)** → Monitor only, no email drafted

The whole rulebook — target industries, target titles, revenue bands, the
disqualifier lists — **lives in the app's database, not in the code**. Sales
Ops can go to Settings → ICP Scoring Rules, edit any of it, hit save, and
the new rules apply to everyone scored afterward. There's also a
one-click "re-score top 50" button if the team wants to sweep historical
records through the new rubric.

### Station 4 — CRM dedup (Salesforce + Gong)

Before drafting an outbound email, the app checks: **are we already talking
to this person?** Nothing burns goodwill faster than cold-emailing someone
whose AE called them yesterday.

When an SDR clicks **Check Salesforce & Gong** on a visitor's page, the app:

1. Looks up the visitor's email in **Salesforce** — is there a Lead or a
   Contact? If yes, who owns it? What's the last activity?
2. Asks **Gong** how many prior calls + emails that person has had with our
   team, and when the last touchpoint was.
3. Shows the SDR a card that says, effectively: *"We've called this person
   twice, emailed three times, last touch was 12 days ago — the existing
   owner is Sarah."*

The results are **cached on the visitor's row** in the database, so if
someone opens the dashboard again tomorrow we don't re-query Gong.

### Station 5 — Email drafting (Gemini 2.5 Flash)

If the visitor passes scoring and isn't already in active play, the app
drafts a personalized email using **Google's Gemini 2.5 Flash** model.

Two things matter here:

**(a) The prompt is voice-matched.** It was reverse-engineered from 10 real
outbound emails written by Teresa and Scott (our existing SDRs) — we analyzed
their greeting patterns ("Hey [first name]," never "Dear"), their sentence
length (short), their call-to-action style ("Is a 10-minute overview worth
scheduling?"), and baked all of that into the system prompt. So drafts come
out sounding like a Netchex SDR, not like a ChatGPT email.

**(b) The prompt lives in the app, not in code.** Marketing can go to
Settings → Outreach Email Prompt, edit the template, and every email
generated afterward uses the new voice. No code change, no deploy.

Gemini Flash is cheap and fast — roughly **$0.0005 per email** and **~3
seconds** per draft. We can afford to regenerate on demand if the SDR
wants a different angle.

### Station 6 — The SDR (you)

The generated email shows up in the app with three buttons:

- **Copy Subject** / **Copy Body** — the SDR copies into their own tool
  (Gong Engage, Outreach, Apollo, whatever)
- **Send via Gong Engage** — defaults to *simulated*. It records that we
  would have pushed this into our Gong Flow but doesn't actually send a
  real email. To make it real, flip **Gong Engage — Live Send** ON in
  Settings and set a Default Flow ID. When live, clicking the button
  POSTs the prospect to `/v2/flows/{id}/assignees` in Gong — a genuine
  push into the configured Flow. Default is OFF so demos stay safe.
- **Sync to SF** — creates or updates the Lead in Salesforce with the score
  + the last touchpoint.

---

## 3. What's in each part of the repo

You don't need to open any of these files, but here's a map of what lives where
so the structure makes sense when you see it.

| Folder | What's in it |
|--------|--------------|
| `src/app/` | The web pages the SDR sees — Dashboard, Visitors list, Visitor detail, Settings. |
| `src/app/api/` | The "doors" that other tools (RB2B, Clay) can knock on. Each folder = one URL endpoint. |
| `src/lib/scoring/` | The ICP rubric — how we turn a visitor's data into a 0–100 score. |
| `src/lib/email/` | The email prompt template + the code that calls Gemini. |
| `src/lib/enrichment/` | The Clay and Apify integrations. |
| `src/lib/salesforce/` | The Salesforce lookup + sync code. |
| `src/lib/gong/` | The Gong API client for looking up prior activity. |
| `prisma/` | The database definition. `schema.prisma` describes every table. |
| `prisma/seed-data/` | A sample RB2B CSV export (351 real visitors) so the app has data to show immediately on first run. |
| `docker-compose.yml` | Runs the PostgreSQL database in a container with one command. |
| `README.md` | Setup instructions — how to run the whole thing locally. |
| `DEMO.md` | Narrator script for walking stakeholders through the app. |
| `docs/demo-deck.pptx` | The 7-slide stakeholder deck. |
| `scripts/` | Small helper scripts — capture screenshots, rebuild the deck. |

---

## 4. How sensitive data is handled

- **API keys** (Clay, Apify, Gong, Gemini, Salesforce) are entered through
  the Settings page in the app, not pasted into code.
- Those keys get **encrypted with AES-256-GCM** before being written to the
  database. Nobody reading the database directly sees the raw values.
- On the Settings page, keys are **masked** — we show the last 4 characters
  only (`****k338`). The full value never comes back out once saved.
- The `.env` file (which holds the one-time encryption key and the app
  password) is excluded from git, so it never leaves your laptop.

---

## 5. How it's deployed (for the demo)

Everything runs on your laptop. Three pieces:

1. **PostgreSQL** — the database. Runs inside Docker (a lightweight
   "container" — think of it as a mini virtual machine). One command spins
   it up: `docker compose up -d`.
2. **The app itself** — the Next.js web server. Started with `npm run dev`.
   It reads/writes to the database.
3. **ngrok** (optional, only needed for live RB2B / Clay callbacks) — this is
   a tool that gives your laptop a public URL. When RB2B fires its webhook
   in production, it needs a public address to POST to. ngrok tunnels
   requests from a public URL (like `https://abc123.ngrok.io`) straight to
   your local app. You only need this if you want to demo the live webhook
   path; CSV upload works without it.

The README has alternatives to ngrok for when you eventually deploy to a
real server — Cloudflare Tunnel, Tailscale Funnel, or fully-hosted options
like Fly.io and Railway.

---

## 6. What was built in this session

This project was built iteratively over several conversation "chapters".
Here's roughly what happened, in order:

1. **Scaffolding** — created the Next.js project, set up PostgreSQL in
   Docker, defined the database schema (Visitor, PageVisit, IcpScore,
   EnrichmentResult, OutreachMessage, and a few support tables).

2. **Ingestion** — built the RB2B webhook endpoint and the CSV upload path.
   Loaded the provided 351-row RB2B export as seed data so the app has
   content on first run.

3. **Enrichment** — wired up Clay (primary) and Apify (fallback) with a
   clean failover: if Clay is configured we use Clay; if not, try Apify; if
   neither, skip enrichment and score with just the RB2B data.

4. **Scoring** — implemented the four-dimension ICP engine with editable
   rules. The default rulebook came from the Netchex ICP analysis doc —
   target industries (hospitality, healthcare, multi-unit franchises…),
   target titles (HR/payroll/ops/owner), revenue sweet spot ($5M–$50M),
   and competitor/free-email disqualifiers.

5. **UI** — dashboard with stats + recent visitors table, all-visitors
   browse page, visitor detail page with all the cards (enrichment, score
   breakdown, page visits, outreach), and a settings page with one card
   per integration.

6. **Email generation** — first pass used a generic prompt. Then the user
   supplied a **tone analysis memo** (a careful study of 10 real outbound
   emails from Teresa and Scott) with specific rules: "Hey [first name],"
   as the greeting, short sentences, a real customer reference when the
   industry matches, CTA phrased as a question with a duration. We rewrote
   the default prompt to match that profile exactly, and made the prompt
   editable from Settings.

7. **CRM + Gong linkage** — added a read-only Gong client (prior calls,
   prior emails, last touchpoint) and a "Check Salesforce & Gong" button
   on each visitor's page. Cached the results on the visitor row so
   repeat lookups are free.

8. **Simulated Gong Engage send** — added a "Send via Gong Engage (sim)"
   button on each generated email. It logs what would be pushed without
   actually sending a mail. Flipping to real sends is one config change
   behind a feature flag.

9. **Polish** — fixed a bug where `{{name}}` in the email prompt was
   rendering the full name ("Michael Murphy, CPA") instead of just the
   first name ("Michael"), which broke the tone profile's rule.

10. **Documentation + repo** — wrote the README (setup, Docker, ngrok, the
    production roadmap), wrote the DEMO.md narrator script, built a 7-slide
    PowerPoint deck, captured screenshots, pushed everything to GitHub at
    `github.com/tanya-jain-netchex/visitor-signals`.

---

## 7. What's next (beyond the demo)

None of these are built yet; they're what I'd tackle first once the demo
lands well:

- **Real Gong Engage send** — flip the simulated send to a live push once
  Legal signs off.
- **Auto-assign to the right AE** — Gong's CRM mapping already knows the
  owner, so we can route qualified leads directly.
- **Slack notification for Tier 1** — same webhook pattern, different
  endpoint.
- **Daily digest email for the SDR team** — top 10 qualified visitors from
  the last 24 hours, ranked.
- **Monitoring dashboard** — time from visit to qualification, LLM spend
  per week, Clay credits burned.

---

## 8. The one-number goal

Everything above exists to move **one number**: the time between a visitor
landing on `netchex.com` and a personalized, vetted email sitting in front
of an SDR.

Today that's measured in hours (and often never happens at all, because the
triage is manual). With this pipeline it's **under fifteen seconds** and
costs **under fifteen cents**.

That's the pitch.
