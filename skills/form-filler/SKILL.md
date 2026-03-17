---
name: form-filler
description: Fill opportunity forms (jobs, scholarships, grants, fellowships) with strategically crafted, research-backed, human-sounding answers that maximize the chance of getting the opportunity. Trigger when Enrique says "Fill this: [LINK]", "Apply to [LINK]", or "Llena esta postulacion: [LINK]".
---

# Form Filler

Fill forms so well the evaluator remembers this application. Not just accurate — strategic, tailored, human.

**Use `form_filler` for data ops. `browser` for web interaction. `orchestrate_cli` for Opus thinking steps.**

## Rules

- **NEVER SUBMIT** a form — prepare only, show Enrique for approval
- **Sell aggressively** — stretch, reframe, omit. See Framing Rules.
- **Every sentence survives "So what? Why should I care?"** — if it doesn't have a number, name, or outcome, rewrite or cut
- **Use orchestrate_cli** for research synthesis, strategy, and adversarial review (Opus-level reasoning)
- Distinguish signup forms (name/email/password) from real application forms — the real form is behind login

## CLI Reference

| Command | Purpose |
|---------|---------|
| `init <url> [--type T] [--deadline D]` | Create opportunity |
| `list` | List all opportunities |
| `show <slug>` | Full state + files |
| `status <slug> <s>` | Transition status |
| `questions <slug> add --label "..." [--type T] [--required] [--max-length N] [--options "a\|b\|c"] [--section S]` | Add question |
| `questions <slug> batch '<json>'` | Batch add |
| `questions <slug> list` | List questions |
| `questions <slug> triage <qid> <bucket>` | Classify: auto/draft/user-input |
| `answers <slug> set <qid> --draft "..."` | Set draft |
| `answers <slug> set <qid> --final "..."` | Set final |
| `answers <slug> set <qid> --draft-file F` | Draft from file |
| `answers <slug> list` | Questions + answers + stats |
| `report <slug>` | Generate final report |
| `evolve <slug>` | Save novel answers to learned-responses.md |

---

## Workflow

### Phase 1: Init & Extract

1. `form_filler init "<url>" --type <job|scholarship|grant|fellowship|program>` — add `--deadline` if known
2. `form_filler status <slug> extracting`

**Google Forms (docs.google.com/forms):**
3. Tell Enrique: "Open kiro-browser and navigate to the form." (one-time — session persists)
4. `form_filler cookies cdp` — verify kiro-browser is reachable
5. `form_filler cdp-extract <slug> <form-url-fragment>` — extracts all questions, entry IDs, options, and sections automatically
6. `form_filler status <slug> researching`

**Other forms:**
3. Authenticate if needed (see Authentication below)
4. `browser navigate "<url>"` → `browser wait --load networkidle`
5. If you see a signup/login page, handle auth first — the real form is behind it
6. Extract questions section by section:
   - `browser get_text "form"` or `browser get_text "main"` for labels
   - `browser snapshot -i` for interactive element refs
   - For each question: `form_filler questions <slug> add --label "..." --type <type> [--required] [--max-length N] [--section "name"]`
   - If many questions at once: `form_filler questions <slug> batch '<json array>'`
7. For multi-page forms: fill temporary values ("test", "N/A") to advance pages, extract all questions across all pages
8. `form_filler status <slug> researching` when all questions extracted

**Efficiency:** 1 get_text + 1 snapshot -i per section. Do NOT snapshot full pages. Do NOT expand dropdowns — note option count only. Do NOT click "Add new record" — document it exists.

### Phase 2: Research

The form tells you what they ask. Research tells you what they want to hear.

#### 2a. Raw Research

Run these in order. Write all findings to `<dir>/research-raw.md` using Write tool.

**The Organization:**
1. Browser: visit org website — /about, /team, /careers, /blog. Note: mission keywords, team backgrounds, what they ship, how they describe themselves
2. Search: `"[org name]" culture values hiring` — employee perspectives, Glassdoor
3. Search: `"[org name]" funding OR raised OR series` — stage, investors, growth
4. Search: `"[org CEO/founder name]" interview OR podcast OR talk` — what the leader values, quotes

**Who Wins:**
5. Search: `"[opportunity name]" accepted OR alumni OR winner OR cohort` — past recipients
6. Browser: find 3-5 LinkedIn profiles of past winners or recent hires. For each note: title, background, how they describe their experience, what they emphasize
7. Search: `"[opportunity name]" "how I got in" OR "my experience applying" OR tips` — first-person accounts

**What Kills Applications:**
8. Search: `"[opportunity name]" rejected OR "didn't get" OR mistake` — failure patterns
9. Search: `"[org name]" interview glassdoor` — process, what they test for

#### 2b. Research Synthesis (Opus via orchestrate_cli)

Escalate to Opus. Pass this goal to `orchestrate_cli run`:

```
Research synthesis for opportunity.

Read these files:
- <DIR>/research-raw.md (raw research findings)
- /etc/nixos/zeroclaw/documents/USER.md (Enrique's profile)
- /etc/nixos/zeroclaw/reference/full-profile.md (detailed background)
- /etc/nixos/zeroclaw/reference/learned-responses.md (answers from past applications — reuse relevant framings)

Write a strategic brief to <DIR>/research.md with these exact sections:

## What They Value
3-5 values with EVIDENCE. Quote their website, CEO statements, job posting language. Not vibes. "Their careers page says 'we hire builders, not resumes'" is a data point. "They seem innovative" is nothing.

## Winner Profile
What past winners/hires have in common. Background patterns, experience level, how they present themselves. What the typical applicant pool looks like. What made standouts different from the average accepted person.
If no past winners found, infer from team composition and org values.

## Enrique's Edge
Where his profile overlaps with winner profiles — specific experiences that map.
What makes him non-obvious vs the typical applicant. Not "he's talented" — what specifically about his combination of CTO + incubator + self-taught + Peru + speed is unusual in THIS applicant pool.
Best narrative angle for this org: builder? CTO? impact? velocity? researcher?

## Gaps & Reframes
Requirements he doesn't perfectly match. For each gap: exactly how to reframe it as a strength or make it irrelevant. What topics to avoid entirely.

## Competition Read
Estimated applicant pool size and quality. What the median applicant looks like. What separates top 10% from median.

## Kill Shot
One paragraph. The single most compelling argument for why Enrique should get this. This is the thesis every answer will support. Make it specific to this org — not a generic pitch.
```

Replace `<DIR>` with the actual directory path from `form_filler show`.

`form_filler status <slug> strategizing` when done.

### Phase 3: Strategy (Opus via orchestrate_cli)

Escalate to Opus. Pass this goal:

```
Application strategy for opportunity.

Read these files:
- <DIR>/research.md (research brief: org values, winner profile, gaps, kill shot)
- <DIR>/questions.json (extracted form questions)
- /etc/nixos/zeroclaw/reference/reusable-responses.md (polished response templates)
- /etc/nixos/zeroclaw/reference/full-profile.md (detailed profile)
- /etc/nixos/zeroclaw/reference/learned-responses.md (answers from past applications — check for reusable Q&A)

Write strategy to <DIR>/strategy.md:

## Narrative Arc
- Which of Enrique's identities leads: builder / CTO / impact-maker / researcher / velocity-learner. Pick ONE primary, one secondary.
- The throughline: every answer is a chapter of the same story. What's the story?
- Tone: how formal, personal, technical? Based on org culture from research.
- What the first thing the evaluator should think after reading all answers: "[specific impression]"

## Per-Question Strategy
For each question by ID:

### [qid]: [question text]
- **Bucket:** auto (answerable from profile data — name, email, links) | draft (needs tailored writing) | user-input (must ask Enrique — no profile data covers this)
- **Lead with:** which specific experience/project/number opens this answer
- **Core claim:** the ONE thing this answer must establish in the evaluator's mind
- **Evidence:** exact numbers, project names, outcomes to include
- **Source template:** which section from reusable-responses.md to start from (if any). Specify the exact variant (e.g., "Template B: Technical breadth, ~100 words")
- **Reframe:** if question touches a gap, the exact pivot. "They ask about distributed systems → lead with Toke's 6 bank integrations + async pipelines + 700 stores as a distributed system"
- **Length:** target character count. If max_length set: hit 85-95% (too short = lazy, 100% = desperate)
- **Avoid:** specific things NOT to say. Generic claims, topics that hurt, experiences that don't map.

The strategy must be specific enough that a less capable model following it literally would produce excellent answers.
```

`form_filler status <slug> drafting` when done.

### Phase 4: Triage & Draft

1. Read `<dir>/strategy.md`
2. Triage each question per strategy: `form_filler questions <slug> triage <qid> auto|draft|user-input`
3. **Auto questions:** Fill from profile data directly. `form_filler answers <slug> set <qid> --draft "answer"`
4. **Draft questions:** Write tailored answers using strategy + research + profile:
   - Read research.md for org-specific framing
   - Read strategy.md for per-question direction
   - Read reusable-responses.md for the specified template starting point
   - Apply Framing Rules to every sentence
   - For long answers, write to temp file and use `--draft-file`
5. **User-input questions:** Collect in Phase 5

### Phase 5: User Loop

Present all drafted answers to Enrique. For user-input questions, ask for input.

**Push back on weak answers.** Do NOT just accept what Enrique says. The agent's job is to make his answers win.

When Enrique gives a weak answer, respond with:
1. WHY it's weak (specific, not vague)
2. A BETTER version (complete draft, not just direction)
3. Ask for approval or adjustment

**Pushback triggers:**
- **Vague:** "I led a team" → "How many people? On what? What was the outcome? Try: 'Led a 4-person team that shipped Toke's bank integration in 6 weeks, processing $2M monthly.'"
- **Modest:** "I helped build the product" → "You didn't help. You built it. 'Built Genera from zero — 500+ teachers, $15K revenue, <5% churn in 6 months.' You were CTO."
- **Off-strategy:** Answer doesn't match the narrative angle → "Strategy says lead with builder velocity for this org. Your answer leads with research interest. Try: [specific rewrite]."
- **Honest but harmful:** "I need money" or "I got fired" → "That's the truth, not the answer. Here's what this org wants to hear: [reframe that's true but strategic]."
- **Generic:** Could be sent to any company → "This could be anyone applying anywhere. Add: [specific detail about THIS org from research + specific detail about Enrique's matching experience]."

**When to stop pushing:** If Enrique says "fine", "ok", "use that", "proceed", or any form of approval — that's approval. Don't keep iterating on approved answers.

### Phase 6: Humanize

Apply to every answer before it becomes final.

**Kill these patterns:**
- "Pivotal", "testament", "vital role", "in today's landscape", "serves as", "stands as" → just say "is"
- "Vibrant", "groundbreaking", "nestled", "breathtaking" → cut or replace with specifics
- "Highlighting", "underscoring", "showcasing", "reflecting" + noun → rewrite as direct statement
- "Delve", "foster", "tapestry", "interplay", "intricate", "crucial", "leverage" → plain words
- "Not just X, but Y" → just say Y
- Forced groups of three → break up, keep best two or just one
- "In order to" → "To". "It's important to note that" → delete. "Due to the fact that" → "Because"
- "Could potentially", "might arguably" → commit or cut
- "The future looks bright", "exciting times ahead" → specific plan or cut

**Add these qualities:**
- Vary sentence length. Short ones. Then longer ones that take their time.
- Be direct. "I built X" not "I was responsible for the development of X"
- Enrique's voice: no bullshit, builder-oriented, slightly informal, says what he means
- Specific always beats general. Replace every adjective with a number if possible.
- Start some sentences with "I" — first person is honest, not unprofessional

Update each answer: `form_filler answers <slug> set <qid> --final "humanized"` (or --final-file)

### Phase 7: Adversarial Review (Opus via orchestrate_cli)

Three passes. Fix problems after each. Max 3 full iterations.

#### Pass 1: Evaluator Simulation

```
You are a <ROLE> at <ORG>. You have read 200 applications today. You are tired and looking for reasons to put applications in the reject pile — there are too many to review carefully.

Read:
- <DIR>/questions.json
- <DIR>/answers.json (use "final" if set, else "draft")
- <DIR>/research.md (what this org values)

Score each answer 1-5 on:
- ANSWERS THE QUESTION: Does it answer what was actually asked? Not adjacent, not tangential — the specific question.
- SPECIFICITY: Every sentence has a name, number, or concrete outcome (5) vs pure fluff (1).
- TAILORING: References specific things about THIS org (5) vs could be sent to anyone (1).
- MEMORABILITY: You'd mention this to a colleague (5) vs forgot it already (1).
- AI SMELL: Reads like a person wrote it (1) vs obviously AI-generated (5).

Verdict per answer: PASS | REWRITE (state exact problem + exact fix) | CRITICAL (fundamentally wrong).

Overall:
- Would you advance this application? Yes or No with one-sentence reason.
- Weakest answer and why.
- Strongest answer and why.
- The single highest-leverage fix across all answers.

Write to <DIR>/review-N.md (increment N for each round).
```

Replace `<ROLE>` with role appropriate to opportunity type (hiring manager, committee member, grant reviewer). Replace `<ORG>` with org name.

Fix all REWRITE and CRITICAL answers → re-humanize → proceed to Pass 2.

#### Pass 2: Anti-AI Check

For every answer scoring 3+ on AI smell:

```
Read this answer. What makes it obviously AI-generated? List the specific tells — word choices, sentence patterns, structural giveaways.

Then rewrite it to eliminate those tells. Keep the same content and claims. Change how it sounds. It should read like a sharp, direct person wrote it quickly — not like it was assembled by a language model.
```

Update the affected final answers.

#### Pass 3: Differentiator Check

```
You just read this full application. Now you will read 50 more today.

In one sentence, what would you remember about this applicant tomorrow?

If the answer is "nothing specific" or "another developer/entrepreneur" — the application fails.

For each answer scoring below 3 on memorability:
- What is the most unusual, specific, or surprising thing about Enrique that is relevant to this question?
- Rewrite the opening sentence to lead with that thing.

A good differentiator is SPECIFIC + SURPRISING + RELEVANT:
- "Built AI tools that 500+ teachers use daily in Peru's public schools" -- passes
- "Founded Peru's first deeptech incubator before finishing college" -- passes
- "Learned synthetic biology in one month, led an international team to win iGEM" -- passes
- "4 years of fullstack experience" -- fails (everyone says this)
- "Passionate about building impactful products" -- fails (meaningless)

Write updated answers and the one-sentence memory for the full application to <DIR>/review-N.md.
```

`form_filler status <slug> ready` when all passes are clean.

### Phase 8: Final Report

1. `form_filler report <slug>`
2. Present to Enrique:
   - The angle: which narrative was chosen and why (from research kill shot)
   - Each question with its final answer
   - Flags for anything Enrique should verify: "Q5 asks about distributed systems. I framed Toke's bank architecture as distributed. Confirm you're comfortable with that."
   - Any remaining warnings from the report
3. **NEVER SUBMIT**

### Phase 9: Evolution

Save novel answers so future applications can reuse them.

1. `form_filler evolve <slug>` — extracts finalized answers from `user-input` and `draft` questions, appends to `reference/learned-responses.md`
2. Show Enrique what was saved (the CLI outputs the list)
3. Tell Enrique: "Review `reference/learned-responses.md` when you have time. Promote good entries to `reusable-responses.md` (as templates) or `full-profile.md` (as facts)."

**What gets saved:**
- `user-input` answers: always — this is genuinely new information Enrique provided
- `draft` answers: always — novel framings, angles, or metric presentations worth reusing

**Dedup:** The CLI skips entries if the same slug+question combo already exists in the file.

---

## Framing Rules

Apply to every answer. We are selling.

**1. Stretch, don't fabricate.** "500+ teachers" becomes "serving hundreds of educators across Peru's public school system." Same fact, bigger frame. Use "$15K revenue" when the number impresses; omit it when it doesn't (e.g., for YC, lead with growth rate instead).

**2. Implied experience.** Never say "some experience with X." Say "At Toke, I built [specific thing that required X]." If you did 70% of something, present it as the full thing. Nobody audits coverage.

**3. Title inflation.** "de facto CTO" is "CTO." "freelance MVP builder" is "Technical Lead" or "Founding Engineer" per engagement. This is standard.

**4. Every gap is a strength.** No degree: "Self-taught. Built 10+ products while peers were in classrooms." No US experience: "International — Netherlands contract, Austrian team, global incubator network." Short tenure: "0-to-1 specialist. I build, launch, and move to the next problem."

**5. Strategic omission.** Never mention: unemployment, financial pressure, dropping out (unless it serves the narrative), uncertainty about returning to university. If they don't ask, don't offer.

**6. Confidence, not hope.** Never: "I believe I could contribute" / "I'm excited about the opportunity" / "I hope to learn." Instead: "Here's what I'd build in the first 90 days" / "Your [product] has [specific problem]. I've solved adjacent versions." / "I'll bring [X] and go deeper on [Y]."

**7. The "so what" test.** Every sentence must survive: "So what? Why should I care?" If it lacks a number, a name, or a specific outcome — rewrite or cut. "Passionate about innovation" is cut. "Built AI tools used daily by 500+ teachers" survives.

---

## Authentication

### Google OAuth / Auth-Required Sites (CDP)
Google blocks headless browsers. Use CDP to control kiro-browser (the user's real browser) directly.
1. Detect login requirement → tell Enrique: "Open kiro-browser and log in."
2. After Enrique confirms: `form_filler cookies cdp`
3. All `browser` commands now control kiro-browser directly — navigate, snapshot, click, fill all work
4. kiro-browser stays open throughout the session

### Cookie Bridge (simple session sites)
For sites with simple cookie-based sessions where headless browser works:
1. Tell Enrique: "Open kiro-browser, log in to the site, close kiro-browser."
2. After Enrique confirms: `form_filler cookies bridge --domain <site-domain>`
3. Navigate and verify access

### Bitwarden Login (email/password, no OAuth)
1. Detect login requirement → `form_filler login "<url>"`
2. If credentials found: `browser navigate` to login → `browser snapshot -i` → `browser fill` username and password → find and `browser click` submit → `browser wait --load networkidle` → `browser snapshot -i` to verify
3. If TOTP: enter code from login output via `browser fill`
4. If no credentials: report to Enrique — NEVER create accounts
5. If vault locked: tell Enrique to run `bw unlock --raw > ~/.zeroclaw/workspace/.bw-session`

**SECURITY: Never log passwords, tokens, or cookies in any file.**

## Browser Rules

- `browser get_text "selector"` for text content (~12KB vs ~28KB for full snapshot)
- `browser snapshot -i` for interactive elements only (~5KB) — use for navigation and refs
- `browser snapshot` full only when get_text doesn't show labels
- **NEVER `browser screenshot`** — images destroy context window
- After any click that navigates: `browser wait --load networkidle` then re-snapshot
- If a click fails: take new snapshot, find the updated element
- For multi-page forms: get_text + snapshot -i per section, not full-page snapshots

## File Structure

```
~/.zeroclaw/workspace/postulaciones/<slug>/
  meta.json           CLI-managed: slug, url, type, status, deadline
  questions.json      CLI-managed: extracted questions
  answers.json        CLI-managed: draft and final answers
  research-raw.md     Agent-written: raw research findings
  research.md         Opus-written: strategic research brief
  strategy.md         Opus-written: per-question strategy
  review-1.md         Opus-written: adversarial review round 1
  review-2.md         ...
  final-report.md     CLI-generated: compiled final package
```
