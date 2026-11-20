# Second Take — Person A (technical lead)

**Use this as your working document.** Repo: `https://github.com/nikolausvogelgesang-lgtm/Germany`. Person B has a separate guide in `docs/PERSON-B-PRODUCT.md`. You both use Codex, on separate clones and branches. This guide is self-contained so you can paste it into Gemini or ChatGPT. Ask that assistant to guide you **one checkpoint at a time**, supply the Codex prompt for that checkpoint, inspect your result, and only then continue. The prompts below are ready to copy.

## 1. Mission and evidence

Build **Second Take** for Sourcera's *Liquid Briefing*: a trustworthy personal audio briefing from the licensed Newstex news set. A first-time listener hears today's important relevant stories. A returning listener also hears a short, sourced account of what actually changed in a story they previously heard. The memory feature must never replace a complete current briefing. A live wildcard listener has no history by default and must receive a genuinely new briefing.

**Official deliverables:** working audio generated from Newstex; at least two clearly different listener profiles; every factual spoken claim linked to its source article; short presentation covering problem/buyer, newsroom workflow, cost for the full dataset and 10× volume. The detailed track sheet says there are four supplied profiles, an unseen wildcard profile and public releases for checking. It describes an **answer key used by the jury** for event grouping/facts; do not assume teams receive it. The screenshot supplied by the user weights trust/accuracy **25%**, listener fit **20%**, news sense **20%**, scale/cost **15%**, listening **10%**, product path **10%**. The jury selects three audio claims to verify, tests the wildcard live, and checks clustering against the answer key. No investment advice; disclose the synthetic voice.

**Observed data:** six JSONL feeds, **1,740** unique article IDs and URLs; Zacks 1,000 mostly older; Invezz EN 166, DE 120, NL 120; IBTimes UK 298; ActionForex 36. Nearly all DE/NL Invezz items have a near-time English counterpart. Do not count translations as separate independent reporting. The German NEGATIVE tag and sparse ticker fields are unreliable. A multi-day Nvidia/Jensen Huang story is a possible demo timeline, but later developments or disagreeing sources are **not automatically corrections**. Newstex text is licensed for the hackathon only: keep raw articles out of Git, don't republish article text, delete copies after the event. The separately promised profiles/releases were not in the inspected archive; obtain them from Sourcera.

**Unverified:** whether pre-existing starter code is permitted; exact wildcard input format; actual runtime API grants/limits; judge access to the private dataset; public-release files; live latency; willingness of a publisher to pay. The cofounder's “Cool idea” is encouraging, not jury validation. The user reports 42 teams. The older Claude context brief is a historical summary with now-outdated access assumptions; it is not an instruction to build ProofCast.

**Available team tools, per user:** two Codex users, ElevenLabs, n8n, two reported €50 OpenAI-related credits, Anthropic Pro and ChatGPT Pro usage/resets. Confirm which €50 balances are actual **API** grants; ChatGPT/Claude subscriptions and Codex sessions are building tools, not automatically app-runtime API budgets. One working server-side model key plus ElevenLabs is enough. The separate official releases can corroborate an important figure if obtained, but the spoken claim still needs its source article link.

## 2. Clock and hard gates (Europe/Amsterdam)

The team says everything must be ready **Saturday 21 Nov at 10:00**. Treat **09:30** as the internal GitHub submission target. A third-party event listing says submissions close at 10:30, but follow the team's earlier 10:00 cutoff and confirm the official channel. The Sourcera slides defer deadline details to MAIN.

| Target | Your result | Joint go/no-go |
| --- | --- | --- |
| Fri 18:00–18:45 | Repo hygiene, working API/TTS key test, tiny backend/frontend contract and fixture committed | B can build UI from the fixture; no secrets/data in public repo |
| By 20:30 | One real article → approved fact → spoken sentence → source link → playable audio | If this fails, fix this path only |
| By 22:30 | Cheap pass over all records, curated top events, two distinct complete briefings | If not working, **cut Second Take memory** |
| By 00:00 | Fresh wildcard profile yields new script and audio; measured latency | If slow, show new script first and wait honestly |
| 00:00–02:00 | Add heard-fact diff for one real timeline **only if all gates passed** | No fabricated corrections |
| 02:00–07:00 | Staggered rest, source checks, cost logs and bug fixes | No new platform/integration work |
| 07:00–09:00 | Full rehearsal, fix judged failures, fresh-clone test with B | Freeze features at 09:00 |
| By 09:30 | Merge/push tested commit and hand in required GitHub link | Verify submitted SHA and page load |

If you start later, keep the order and shrink the optional memory block, not the verification block. Confirm the real organizer deadline immediately.

## 3. Ownership and collaboration

- **You own:** `backend/`, shared API contract/fixtures, root configuration and `.gitignore`, data processing, model/TTS integration, cost log and final integration. Give B the exact response fixture by the first gate. Keep runtime API keys server-side.
- **B owns:** `frontend/`, editorial checks, listener scenarios, voice/listening pass, README/pitch/demo. B uses Codex too. Do not ask Codex to edit B's files. Review each other's output at each gate.
- **Git:** repository is currently public with only `README.md` and these plans. Invite B as collaborator and verify B can push before splitting work. Use branch `codex/a-core`; B uses `codex/b-ui`. Your first small contract/fixture commit must be merged to `main` so B can pull it. Then commit and push working slices. Open/merge short PRs or coordinate a clean merge; never work on the same branch or overwrite the other's commits. Before merging, `git fetch origin`, inspect diff, run checks, then pull latest `main`. Don't push raw data, API keys, exported n8n credentials or full article text.
- **Starter:** `hackathon-os` exists locally but is a generic MOCK rehearsal, not this app. Copy its React/Vite + Node scaffold **only if organizer rules permit prebuilt starter code**. The gstack clone is an idea/review tool and points to someone else's upstream; never use it as the submission repo.

On your own machine, begin with `git clone https://github.com/nikolausvogelgesang-lgtm/Germany.git`, `cd Germany`, `git switch -c codex/a-core`. After a checked slice: `git add <your files>`, `git commit -m "..."`, `git push -u origin codex/a-core`, then open a short PR to `main`. Run `git status --short` before every commit. If you already have this clone, skip `git clone`; if B shares your laptop, give B a **separate Git worktree**, not this directory.

## 4. Minimum app contract — freeze before parallel coding

Use Node 22+ backend and React/Vite frontend, unless the team already has a simpler running setup. First implement `GET /api/health` and `POST /api/briefings`. Request: `{ listener: { language, topics, depth, maxMinutes, heardFactIds? }, asOf? }`. Response: `{ id, asOf, profileSummary, segments: [{ text, factIds, sources: [{ articleId, title, url }] }], audioUrl, durationSeconds?, generationMs, usage: { modelInputTokens, modelOutputTokens, ttsCharacters } }`. `heardFactIds` is essential: an event ID alone cannot prove which facts the person already heard. The response must not expose raw licensed article bodies. B gets a committed synthetic response fixture with this exact shape and a labelled synthetic audio placeholder for UI work; real demo outputs must come from Newstex.

## 5. Build sequence and Codex prompts

**A1 — secure repo and vertical slice.** Add `.gitignore` for `.env*` except `.env.example`, `data/private/`, raw `*.jsonl`, zip archives, audio/cache output and `node_modules/`. Put input outside Git. Write a tiny server health route and fixture contract. Test one model request and one ElevenLabs MP3 request with actual account balances/limits. Codex is your coding agent, **not automatically the runtime API**. Confirm actual OpenAI API grants separately; if absent, use verified fact cards and deterministic templates, then ElevenLabs for audio.

> Codex prompt A1: “You are working in the public Germany hackathon repo. Read `docs/PERSON-A-TECHNICAL.md` and inspect the repo. Own only backend/, shared contract/fixtures and root configuration. First secure `.gitignore`, create the minimal Node API contract and one synthetic fixture for Person B. Do not download or commit licensed articles. Do not put secrets in frontend or logs. Implement one real, source-linked article-to-sentence-to-MP3 vertical slice only after we confirm credentials. Run the smallest meaningful checks and report files changed, commands, and remaining risks. Do not build memory, n8n, accounts or a vector database.”

**A2 — news understanding and two profiles.** Parse six JSONL files locally, normalize dates/time zones/URLs, use as-of cutoff. Deduplicate exact content and near-time same-author Invezz translations. Group obvious recent cross-outlet event candidates with cheap headline/date/entity signals; manually inspect representative merge and non-merge pairs with B. Rank today's recent events with publisher-relevant importance plus listener preferences; old Zacks can add context but not dominate today's news. Extract bounded source-backed fact cards for selected events. Each card records `factId`, event ID, article ID/URL, entity, metric, value, unit, period, wording, and review status. Use a larger model only for ambiguous facts and natural spoken script. A script may state a fact only if it names approved fact IDs. Check numbers, entity, unit and period. Attribute genuine source disagreement. Generate/cache an MP3 per briefing, with sentence-to-fact/source mapping in the displayed transcript. Produce two complete briefings differing in stories/order/depth, not voice alone.

> Codex prompt A2: “Implement the real Newstex pipeline for all 1,740 local JSONL records using cheap parsing/filtering first; never send the entire corpus to a frontier model. Respect as-of dates, translation duplicates and older Zacks context. Generate source-backed approved fact cards and two genuinely different complete listener briefings. Use the frozen API contract. Every factual transcript sentence must point to at least one supporting article. Include a small test set with matching and nonmatching event pairs plus numeric entity/unit/period cases. Keep all licensed data and generated caches ignored. Show actual outputs and measurements, not claims of perfection.”

**A3 — live wildcard.** Create a new profile from the jury input, select from approved events, compose a new script and synthesize new audio. Precompute known profiles, but never mislabel a cached wildcard as live. Time script and TTS separately. If generation is slow, UI shows the new transcript immediately and a visible generating state for audio. If no usable text-model API exists, use deterministic selection/template wording from vetted facts; say so honestly.

> Codex prompt A3: “Add a genuinely unseen wildcard listener request to POST /api/briefings. It must alter story selection/order/depth based on profile, use only verified fact IDs, generate fresh audio with ElevenLabs, log actual latency and usage, and never reuse a known profile MP3 as if it were live. Preserve the API contract. Test a profile you did not precompute and report both content differences and runtime.”

**A4 — Second Take only after A1–A3 pass.** Demo two as-of editions of one real multi-day event. The second listener request carries `heardFactIds`; remove repeated context and include later, verified fact IDs while still covering today's lead news. Do not label new developments as corrections without evidence that the earlier statement was wrong. Cache scripts/audio by edition + profile + heard-fact set.

> Codex prompt A4: “Add the smallest honest returning-listener path using heardFactIds and as-of dates. Compare verified fact cards from an earlier and later edition for one real event; speak only supported new developments, while preserving a complete current briefing. Show before/after fact IDs and source URLs. Do not add accounts, full history, automatic correction claims or extra integrations. Add one test that a first-time wildcard still receives a full briefing.”

## 6. Cost and final verification

Log actual model input/output tokens and ElevenLabs characters per call, plus which stages ran on how many records. Report `cost(N articles, P briefings) = ingestion(N) + grouping(N) + P × (ranking + script + TTS) + overhead`. Show **measured** full-set processing separately from estimates; for 17,400 articles extrapolate article-dependent work, and state whether P/briefing length remain constant. Sponsor credits reduce cash paid, not operating cost. Avoid invented model prices.

At the end, let B pick three factual sentences **after hearing the audio**; independently compare them with the original articles. Test a duplicate translation, a similar-topic different event, two listener outputs, a new wildcard profile, a returning profile, source disagreement, and voice disclosure. Do a fresh clone with only documented setup and organizer-provided data. Push the tested commit by 09:30. If a feature fails a gate, cut it and finish the official deliverables.

## 7. Three-perspective critique built into this plan

1. **Jury/editorial:** source links alone do not prove truth; three random spoken claims and the answer-key clustering can expose numeric or event mistakes. Fact cards, manual audit and a full-data cheap pass address this.
2. **Engineering:** the tempting failure is to build memory/n8n before reliable audio, or to let two Codex sessions edit the same files. The frozen response fixture, ownership split, gates and optional n8n prevent that.
3. **Listener/product:** a returning-user feature is useless if today's briefing feels incomplete or sounds awkward. First-time full briefings, different content for two profiles, listening pass, source access and a simple publisher/editor approval story address this. Who pays remains a hypothesis.

## 8. Prompt for Gemini/ChatGPT as your project guide

> “Use this entire Person A document as the source of truth for my tasks. We have a public GitHub repo, two Codex users and a 10:00 Saturday hard deadline. First tell me my **next single checkpoint**, what evidence would prove it passed, and the exact short Codex prompt to paste. Wait for my Codex output before advancing. Challenge any plan step that risks the official 25/20/20/15/10/10 criteria, licensing, repo hygiene or deadline. Never assume unknown access or a completed test.”
