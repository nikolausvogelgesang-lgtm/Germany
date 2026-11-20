# Second Take — Person B (product, UI and editorial lead)

**Use this as your working document.** Repo: `https://github.com/nikolausvogelgesang-lgtm/Germany`. Person A has the harder backend/data task in `docs/PERSON-A-TECHNICAL.md`. You **both use Codex** to write code. You can paste this entire guide into Gemini or ChatGPT and ask for the **next step and a short Codex prompt**, one checkpoint at a time. You own a real, independent workstream: the listener-facing app, editorial checks and final submission story.

## 1. Shared context and what wins points

Sourcera's challenge is *The Liquid Briefing*: turn a day of licensed Newstex financial/business news into a **personal audio briefing a listener can trust**. Our idea, **Second Take**, makes the next briefing remember what the person already heard and clearly explain genuine new developments. The first briefing, including for a live wildcard profile, must be a full useful briefing. Memory is an extra demo moment, not a substitute for the official requirements.

**Official deliverables:** working Newstex-based audio, at least two listeners whose stories/order/depth/length/language clearly differ, every factual spoken claim linked to its source article, and a presentation explaining problem, likely buyer, newsroom workflow and cost for the full dataset plus 10×. The supplied detailed track sheet promises four profiles, a live wildcard profile and public releases for cross-checks. It describes an **answer key for the jury**; do not assume it is given to teams. The user's jury screenshot weights trust/accuracy **25%**, listener fit **20%**, news understanding **20%**, scalability/cost **15%**, listening **10%**, product path **10%**. The jury can check three claims from the audio and live-test the wildcard. Synthetic voice must be disclosed; no investment advice.

**Observed data:** six JSONL feeds with **1,740** unique article IDs/links. Zacks has 1,000 mostly older stories; Invezz has English/German/Dutch feeds with many translations of the same article; IBTimes UK and ActionForex add other coverage. Do not treat translated copies as independent sources. A German NEGATIVE label and ticker tags are unreliable. A multi-day Nvidia/Jensen Huang story may show real developments, but never invent a correction. Newstex article text is licensed for this hackathon only; do not commit or republish it. The promised separate profiles/releases were not in the inspected zip; ask Sourcera where they are.

**Unknowns:** exact profile/wildcard format, whether starter code is allowed, real runtime API grants, judge access to licensed data, final repo submission instructions, buyer willingness to pay. The cofounder responded “Cool idea”; that is a positive but noncommittal signal. User reports 42 teams. The older Claude context document predates the dataset inspection and still discusses ProofCast; treat it as historical context, not current implementation instructions.

**Team tools, per user:** two Codex users, ElevenLabs and n8n, plus two reported €50 OpenAI-related credits, Anthropic Pro and ChatGPT Pro usage/resets. Codex is how you build the UI. A must verify whether any credit is an actual app-runtime API grant; subscriptions alone do not prove that. Use official releases to cross-check an important figure if available, while keeping the article link on each spoken claim.

## 2. Clock and your checkpoints (Europe/Amsterdam)

The team wants everything **100% ready by Saturday 21 Nov, 10:00**. Aim to submit the GitHub link and tested commit by **09:30**. A third-party event listing mentions 10:30, but use the team's earlier cutoff and verify the organizer channel.

| Target | Your deliverable | Ask Person A for |
| --- | --- | --- |
| Fri 18:00–18:45 | Clone repo, own branch, obtain official profiles/releases, freeze UI sketch and 60-second demo | Exact synthetic response fixture/contract, API/TTS smoke result |
| By 20:30 | Simple player works with fixture: profile choice, audio, sentence/source links, loading/error states | One real article-to-audio response |
| By 22:30 | Two materially different complete listener views; pick/audit key stories | Two real briefing responses |
| By 00:00 | Test unseen wildcard profile and record actual differences/latency | Live endpoint and generation time |
| 00:00–02:00 | If core passes: before/after Second Take view and narration check | Real earlier/later fact IDs |
| 02:00–07:00 | Staggered rest, pitch, cost slide, README and fact audit | Usage log and known limits |
| 07:00–09:00 | Full rehearsal; source/audio/UX checks; fresh-clone check with A | Final backend commit and setup commands |
| By 09:30 | Final README, GitHub link, demo backup and submission | Exact tested commit SHA |

If time shrinks, simplify the interface and cut memory before you cut source links, wildcard or the two profiles.

## 3. What you own and how both Codex users cooperate

- **You own:** `frontend/`, `docs/` and README/pitch; editorial review of selected facts/clusters; voice and listening quality; final demo. Use Codex for frontend coding. You do **not** need to build the AI data pipeline.
- **Person A owns:** `backend/`, shared API contract/fixtures, root config, real JSONL ingest, clustering, source/fact checks, model calls, ElevenLabs TTS, usage/cost log and integration. Do not ask your Codex to modify these files.
- **GitHub:** the shared `Germany` repo is currently public with a README and these plans. Ask A to invite you as collaborator and verify you can push. Work in your own clone and branch (`codex/b-ui`); A uses `codex/a-core`. Wait for A's fixture/contract commit to land on `main`, pull it, then code against that stable shape. Commit and push small slices; open a PR or coordinate a clean merge. After A merges, pull latest main. Never paste keys, private download URLs, raw JSONL or article bodies into Codex chats or GitHub. If both of you share one laptop, use separate Git worktrees; never run two Codex sessions editing the same directory.
- **n8n:** available, but optional. Only after the app works, you may make one small newsroom approval/daily-trigger flow if it can reach the app. Do not use n8n for 1,740-file ingestion or for the live wildcard path. Its cloud instance cannot read a file from your laptop simply by local pathname; its own file storage is ephemeral.

On your own machine: `git clone https://github.com/nikolausvogelgesang-lgtm/Germany.git`, `cd Germany`, `git pull --ff-only`, then `git switch -c codex/b-ui` **after A has merged the fixture**. After a checked slice: `git add frontend/ docs/ README.md`, `git status --short`, `git commit -m "..."`, `git push -u origin codex/b-ui`, and open a short PR to `main`. Do not work in A's local directory or on A's branch.

## 4. Freeze the user-facing contract before coding

Person A supplies a **synthetic fixture** shaped like: `{ id, asOf, profileSummary, segments: [{ text, factIds, sources: [{ articleId, title, url }] }], audioUrl, durationSeconds?, generationMs, usage: { modelInputTokens, modelOutputTokens, ttsCharacters } }`. The real endpoint is `POST /api/briefings` with `{ listener: { language, topics, depth, maxMinutes, heardFactIds? }, asOf? }`. Ask A for the fixture path and a sample request. `heardFactIds` matters because event ID alone does not say which claims were already heard. Never invent backend fields in your UI. Display a compact transcript where each factual sentence has clickable source article(s); provide an audio player and visible synthetic-voice label.

## 5. Your step-by-step work and ready Codex prompts

**B1 — organize evidence and agree on demo.** Find the four organizer-provided listener profiles and public releases; if missing, ask Sourcera. Choose two maximally different official profiles when available (e.g. topic, knowledge depth, language or time budget). If unavailable, label provisional profiles and replace them when supplied. Write the 60-second sequence on paper: first listener, second listener, returning listener if built, source proof, wildcard. Choose 2–3 real multi-source event timelines and a small set of **matching and nonmatching article pairs** for A to use in clustering checks. Do not claim the event answer key is known.

> Codex prompt B1: “Read `docs/PERSON-B-PRODUCT.md` and Person A's committed response fixture. Work only in frontend/ and docs/. First make a one-page implementation checklist and a minimal wireframe for: two listener profiles, audio player, transcript with per-sentence source links, live wildcard input, and a small ‘new since last listen’ area only if the core exists. Do not touch backend, shared contract or root files. Identify missing fixture fields before coding.”

**B2 — build the simple frontend.** Use Codex to make a fast page: profile buttons/form at top; current story order and reason for selection; player; readable transcript; a source link on each factual sentence; a clear loading state for fresh wildcard audio; error state; one voice-disclosure line. No login, dashboard, voice cloning, animations or article-text republication. The source title/link may be shown, not the full licensed body. If A's backend is late, finish against synthetic fixtures; later replace only the data source.

> Codex prompt B2: “Implement the minimal React/Vite frontend against the committed synthetic Briefing fixture and frozen POST /api/briefings contract. Own frontend/ only. Show profile input, a complete briefing, audio playback, per-sentence source links, synthetic voice disclosure, wildcard loading/error state and clear differences between two listeners. Make it usable on one laptop screen. Keep code simple, run the frontend build, and report exact changed files and any contract mismatches. Do not invent facts or hardcode a known wildcard response.”

**B3 — editorial audit and listening pass.** For the real output, listen at normal speed. Pick **three claims after playback**, including a number if one is spoken; open the linked articles and check exact entity, number, unit, period and wording. If two sources actually disagree, make sure the audio attributes that disagreement; do not invent one for the demo. Check a translation pair is merged and a similar-topic/different-event pair stays separate. If any claim is unsupported, mark it blocked and tell A the exact sentence and source. Try two supplied profiles and an unseen wildcard: their stories/order/depth should visibly differ, not just the narrator voice. Check the audio does not drift into investment advice. Read script aloud and shorten sentence length where needed.

> Codex prompt B3: “Act as a strict Sourcera jury QA reviewer. Using the real running UI and the official rubric in this document, give me a checklist I can execute manually in 20 minutes. Demand evidence for three randomly chosen spoken claims, two distinct profiles, one unseen wildcard, duplicate merging, story ordering, audible pacing, source disagreement, voice disclosure and no investment advice. Report failures with exact reproduction and priority; do not assert success from code alone.”

**B4 — product story, cost and submission.** Make a concise pitch: a financial publisher/newsroom is the **hypothesized** buyer; editor sees clustered events and source-backed fact cards, approves the edition, and listeners get personal audio with source access. Do not claim Sourcera already pays or has this workflow integrated. Use A's actual call logs for measured costs. Keep 1,740-article cost separate from 17,400-article estimate; if listener count and audio length stay fixed, TTS does **not** automatically rise 10×. Prepare a 60-second demo and a clearly labelled backup. Write README with setup, data placement from organizer, environment variable **names** (never values), run/build commands, architecture, demo path, measured vs estimated costs, limitations and team roles. Include exported n8n workflow JSON only if actually used, without credentials. Check a fresh clone with A.

> Codex prompt B4: “Own README.md and docs/ only. Based on the real app and Person A's usage logs, write a concise GitHub README: what Second Take does, how to obtain/place organizer-provided data without committing it, env variable names, exact install/run commands, two-profile and wildcard demo, per-claim source design, what was actually measured on the 1,740-record set versus estimated, explicit 17,400-record assumptions, newsroom/buyer hypothesis, synthetic-voice disclosure and known limits. Do not invent prices, customer validation, API access or passing tests. Keep private links and article text out of Git.”

## 6. Simple pitch and demo script

**Opening:** “Finance news repeats the same event, but what listeners need tomorrow is what actually changed.” **Show:** choose two official profiles and play short excerpts; point out real story/order/depth differences. **Second Take:** if built, play the next edition for a returning listener and point to the new supported fact. **Trust proof:** click one spoken claim to its source; show how disagreement is attributed. **Wildcard:** enter the jury's new profile and show freshly produced transcript/audio, including latency. **Close:** publisher pays as a hypothesis; newsroom editor approves fact cards; cost has a measured full-data line and a separate 10× scenario. Ask the organizer for the exact pitch length; the 60-second sequence is a rehearsal unit, not an asserted official format.

## 7. Final decision gates and three-perspective check

- **Jury/editorial:** 65% of points are trust, listener fit and news understanding. A beautiful player without audited claims and genuine content differences loses. You own the random audit and source click test.
- **Engineering/delivery:** two Codex users can move faster only if file ownership and the response fixture stay stable. You own the frontend and docs; A owns API/data. A fresh clone and exact tested commit matter because the GitHub repo is the submission.
- **Listener/product:** the memory moment must be easy to hear, not just a label in UI. A first-time user still gets a useful daily briefing. Voice quality, pacing, visible source access and the publisher/editor narrative make it a believable product.

**Cut order if behind:** n8n → visual polish → memory → extra languages. Never cut the official two profiles, sourced audio, live wildcard test, full-set/10× cost explanation or basic run instructions. Confirm the GitHub visibility and judge data access with organizers; the repo is public already, so license and secret checks are urgent.

## 8. Prompt for Gemini/ChatGPT as your project guide

> “Use this entire Person B document as the source of truth for my tasks. I am the less technical teammate but I use Codex to build the frontend. Guide me one checkpoint at a time until our Saturday 10:00 hard deadline. First tell me exactly what to do next, what to send Person A, the short Codex prompt to paste and how to verify the result. Wait for my result before advancing. Challenge unsupported claims, fake demos, Git conflicts, licensing mistakes and work that does not help the official rubric.”
