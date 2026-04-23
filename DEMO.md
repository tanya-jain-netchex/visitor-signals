# Netchex Visitor Signals — Demo Script

Use this as a narrator's guide when walking stakeholders through the app. Estimated runtime: **8–12 minutes** with discussion.

The goal of the demo is to show **one number moving**: time from an anonymous website visit to a personalized, vetted email sitting in front of an SDR. Everything else is supporting detail.

---

## Before you present

**60-second setup checklist:**

1. `docker compose up -d` — PostgreSQL is running.
2. `npm run dev` — app is up on `http://localhost:3000`.
3. `ngrok http 3000` — webhook URL is live. Copy it.
4. Log into the app with your `APP_PASSWORD`.
5. Open Settings and confirm at least: **LLM Provider on**, **Clay enabled** (if you'll show live enrichment), **ICP threshold = 50**.
6. Have a qualified Tier 1 visitor bookmarked — Sarah-Jane Shapiro or any Tier 1 lead on the dashboard is fine.
7. If you're showing the CRM card: make sure Gong access key + base URL are saved in Settings so the "Check Salesforce & Gong" button works.

If anything's unconfigured the app will tell you exactly which field is missing — the error messages surface in the UI.

---

## Slide-by-slide walkthrough

### 1. Why this exists (30 seconds)

> "Today 97% of our website visitors leave without filling out a form. RB2B identifies about 40% of those — name, email, company, LinkedIn — but the raw feed is a firehose. Most of those identified visitors aren't buyers. An SDR reading through the feed manually burns an hour a day and still misses the real leads because they're not obvious at first glance."

**The point:** the data is already there. The bottleneck is *triage and personalization*, not identification.

---

### 2. The pipeline in one slide (45 seconds)

Show the diagram: **RB2B → Clay enrichment → ICP scoring → SF/Gong dedup → LLM email draft → SDR inbox**.

> "Every step is configurable — you can swap LLM providers, change the scoring rules, or turn off Salesforce if you don't want CRM writes. We wanted this to be the opposite of a black box."

---

### 3. Ingestion — CSV + live webhook (1 minute)

Open **Dashboard**. Point to the counters: `total visitors`, `qualified`, `by tier`.

> "This data was loaded via CSV — a 351-row RB2B export covering the last two weeks. In production this same pipeline fires off the RB2B webhook, one event at a time, within seconds of the visit."

If you have RB2B pointed at your ngrok URL, trigger a live visit and watch the counter tick. If not, note that the CSV and the webhook hit the same ingestion code path.

---

### 4. ICP scoring — making the "good lead" definition visible (1.5 min)

Click any **Tier 1 visitor** from the dashboard. Show the **ICP Score card**:

- Score wheel (e.g. 87/100) with tier label.
- Click the little `(i)` icon → the **Score Reasoning popover** opens.

Walk through the breakdown:

> "Firmographics is worth 40 — industry match, company size 50–500, US-based. Intent is 30 — we look at which product pages they visited and give bonus weight to pricing and demo pages. Persona fit is 20 — is this a payroll/HR/operations title. Capacity is 10 — revenue band and whether they came back more than once."

Click into **Settings → ICP Scoring Rules** briefly:

> "These rules live in the app, not in code. If Sales wants to re-define the ICP next quarter, they change it here — the new rules apply to anyone scored afterward, and there's a one-click re-score for the top 50 historical records if you want to sweep."

---

### 5. CRM dedup — avoid stepping on an active deal (1 minute)

Back on the visitor detail page, click **Check Salesforce & Gong** in the CRM card.

> "Before we draft an email, we check: is this person already in our Salesforce? Have we called them before? Has someone on our team already emailed them? If yes, we don't want a cold outreach — we want the existing owner to know they're back on the site."

Point to:

- **View Lead / Contact** link (opens the SF record in a new tab).
- **Prior Gong calls** count.
- **Prior Gong emails** count.
- **Last touchpoint** timestamp.

> "This check runs on-demand via Gong's API. We cache the result on the visitor record, so subsequent dashboard loads don't hit Gong."

---

### 6. Email generation — the tone is the product (2 min)

Scroll to the **Outreach** card. Click **Generate Email**.

While it loads (~3–5 seconds):

> "This is Gemini 2.5 Flash. We picked Flash because it's fast and cheap — we can afford to regenerate on demand. For Tier 1 leads we can escalate to Claude or GPT-4, but Flash gets us 85% of the quality at 5% of the cost."

When it appears, read the first two sentences aloud. Point out:

- Greeting is `Hey [first name],` — not "Dear".
- Sentences are short.
- There's a real Netchex customer name mentioned if the industry matched (IVY Hospitality, CFAN, Willbanks, etc.).
- The CTA is a question with a duration: "Is a 10-minute overview worth scheduling?"

Show **Settings → Outreach Email Prompt**:

> "The prompt was reverse-engineered from 10 real outbound emails Teresa and Scott sent in the last two weeks. Greeting patterns, sentence length, CTA phrasing — all matched to our actual SDR voice. When Marketing decides the voice should shift, they edit this template, not the code."

---

### 7. The send path — simulated for now (45 seconds)

Click **Send via Gong Engage (sim)** on the generated email.

> "This is intentionally a dry-run. It records that we would have pushed this prospect into our Gong Engage Flow and that Salesforce would have logged the activity — without actually mailing anyone. That's the right default for a demo. In production, flipping this to a real send is a single config change on the Gong client."

Also show **Copy Body** — the realistic SDR workflow is copy + paste into their own sequence tool until trust in the auto-send is established.

---

### 8. What's next (1 minute)

Close with one slide on the roadmap:

- **Real Gong Engage send** — wired behind a feature flag, awaiting Legal sign-off.
- **Auto-assign to the right AE** — Gong's CRM mapping already tells us the owner.
- **Slack notification for Tier 1 leads** — same hook, different endpoint.
- **Daily digest email for the SDR team** — top 10 qualified visitors from the last 24h, ranked.
- **Monitoring dashboard** — time-to-qualification, LLM spend, enrichment credit burn.

---

## FAQ responses (keep in your back pocket)

**"What happens if Clay rate-limits us?"**
Clay runs async — we push the visitor and Clay POSTs back to our callback when enrichment completes. Rate limits surface as failed Clay requests that retry; the visitor stays in `ENRICHING` status until it resolves.

**"What does a single lead cost us?"**
Roughly: 1 Clay credit (~$0.05–0.15 depending on plan) + 1 LLM call (~$0.0005 on Gemini Flash) = under 15¢ per generated email. Gong/SF API calls are free at our tier.

**"Can we see which emails were opened?"**
Not in this app directly — that lives in Gong Engage once we wire real sends. The Gong API exposes open/reply stats per email reference, which we can ingest as a follow-on.

**"How do we re-train the tone if it drifts?"**
Drop 5–10 new real SDR emails into a prompt rewriter, regenerate the template, paste into Settings. No deploy needed.

**"What about GDPR / deletion requests?"**
Visitors can be deleted via the admin API; the `OutreachMessage`, `IcpScore`, `EnrichmentResult`, and `PageVisit` rows cascade-delete via Prisma. Gong's data-privacy endpoint is the source of truth for Gong-side deletion.

**"Why isn't this just built inside Clay / Gong / [our MA tool]?"**
Those tools own pieces of this. What we built is the *connective tissue* — the rubric that decides which visitors matter, the voice that makes the emails not sound like a template, and the dedup that keeps us from cold-emailing someone in an active deal. That logic belongs in one place, owned by Sales Ops, not distributed across three SaaS configs.

---

## Known soft spots to pre-empt

- The Tier 3 visitors still get scored but don't get emails drafted — that's intentional. Don't let someone point at a Tier 3 and ask "why no email?"
- The simulated Gong send is visibly marked `(simulated)` on the message. If someone asks whether this is sending real emails, the answer is *explicitly no, by design, flipping it is a config change*.
- The first `Check Salesforce & Gong` click takes 1–3 seconds because it's a live Gong API call. Don't try to demo it on a visitor with no email — it'll error out cleanly, but it looks worse than just picking a visitor with an email.

---

## If everything breaks mid-demo

Fallback narrative: open the screenshots in `/public/screenshots/` and walk through the same flow via static images. The story is the same; only the live interaction is missing.
