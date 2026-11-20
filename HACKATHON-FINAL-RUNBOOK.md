# Second Take — FINAL EXECUTION RUNBOOK
**Snapshot:** Friday 20 November 2026, approximately 20:17 Europe/Amsterdam. **Internal GitHub submission:** Saturday 21 November, 09:30. **Hard ready-by:** 10:00. Confirm the actual organizer submission procedure separately.
**Repo baseline checked:** main at 6b2bf536eb14a2a4d6c9f775236d86b5628487db before this plan was added.
**Authority:** This runbook supersedes outdated timings and assumptions in docs/PERSON-A-TECHNICAL.md, docs/PERSON-B-PRODUCT.md, docs/B1-ui-plan.md and README.md. It does **not** claim those older documents are updated. No application code is changed by this plan.

## 1. Mission and score
Second Take is a personalized, source-linked financial news audio briefing from the licensed Newstex dataset. A first-time listener gets a useful daily briefing. A returning listener *may* get a carefully sourced update on what actually changed since the last heard edition, without losing today's important stories.

Official jury rubric supplied by team: trust/accuracy 25%; fit to listener 20%; news understanding/clustering 20%; scalability/cost 15%; listening 10%; path to product 10%. The jury checks three spoken claims, tries a live wildcard, and tests grouping against its answer key. Winning the mandatory 65% (trust, listener fit, news sense) takes precedence over memory and UI polish. Two distinct listener profiles, source-linked playable audio, a genuinely fresh wildcard briefing, cost report for 1,740 and estimated 17,400 records, editorial/voice disclosure, and reproducible setup are nonnegotiable.

## 2. Verified repo / team-reported state — do not conflate
- GitHub main: Node backend present; GET /api/health, POST /api/briefings, /api/audio/...; shared contract; shared/listener-profiles.json; six private feeds expected; backend tests and measurement documentation exist. No frontend/ directory on main at the baseline commit. No open PRs found at inspection.
- Team reports: 17 backend tests passed. Real three-profile gate produced different source sets and playable MP3s. Latest reported one-off totals: FX 3.6s, Dutch AI 2.7s, German-energy wildcard 3.8s. Do **not** present these as guaranteed response times or overwrite older different runs documented in backend/MEASUREMENTS.md.
- Documented full data: 1,740 records, about 1,490 event groups and 238 translation matches. Conservative cross-outlet grouping is **not** proven correct against the jury's answer key. The synthetic 17,400-record stress test is a runtime test with copied distributions, not a real 10x Newstex quality test.
- Source-audit records are local, private, and marked needs-editorial-review. Automatic quote/number checks are **not** full semantic verification.
- The current code validates listener.heardFactIds but makeScript does not yet use it. Existing factId hashes article ID + evidence quote (or fallback headline), so a different source or wording may yield a different ID for the same real-world fact. A simple set difference is **not** sufficient to detect genuine updates.
- Person B's merged PR #9 added docs/B1-ui-plan.md only. B reports active work, but no committed frontend on main; do not call it ready.
- The cofounder says teams invent their own listener profiles. Presets are final demo choices in shared/listener-profiles.json: English FX trader and Dutch AI investor. Ignore legacy instructions to wait for four official profiles. Public releases remain unlocated / UNKNOWN.
- Newstex article bodies, API keys, audio generation cache and private fact-audit logs stay outside the public repo. Source URLs and small justified excerpts are fine within the license; do not republish article bodies.
- README incorrectly says the app is not implemented. docs/B1-ui-plan.md says profiles are provisional. Person B must correct both later in their owned files.

## 3. Strict file ownership
Person A alone edits backend/, shared/CONTRACT.md, shared/fixtures/, shared/listener-profiles.json, root .env.example/.gitignore and backend/MEASUREMENTS.md. Person B alone edits frontend/, README.md, docs/B1-ui-plan.md, pitch/demo/editorial documents in docs/. Neither Codex user edits the other's work.
This runbook is a one-time shared coordination file: neither teammate should edit it during the final hours. Both work in separate clones/branches and merge tested slices; check git status and latest main before commit/merge. Avoid sending private source text or keys to public PR descriptions.
Integration is jointly tested, but ownership of the fix follows the failing side. No overlapping edits or simultaneous pushes to the same branch.

## 4. Timeline, Europe/Amsterdam, with hard decisions
| Deadline | Person A — technical lead | Person B — product/UI/editorial | Joint acceptance gate |
| --- | --- | --- | --- |
| Fri 20:17–20:45 | Re-run tests, health, actual API/MP3; send B one real sanitized response and exact URL/shape; identify an honest multi-date candidate story privately. | Pull latest main, inspect current work, give A exact frontend progress; use two preset listener objects unchanged; stop any UI-only planning. | A can show a real response, source links and playing MP3. B confirms actual code status. |
| By 22:00 | Stabilize API, audio serving/CORS/diagnostics. No memory code. | Build minimal real React/Vite page: preset buttons, custom wildcard input, loading/error, audio control, transcript sentence/source links, synthetic voice label, fallback label. Commit/push own branch. | Browser can call real endpoint and play a returned MP3, not just fixture. |
| By 23:00 | Re-run exact two presets and one genuinely unseen custom profile using browser inputs; fix only backend failures. | Integrate frontend; show two distinct story sets, custom live profile and traceable sources; fix UI issues. | Mandatory **CORE GATE**: two profiles, wildcard, sourced audio all work end-to-end in browser. If FAIL, NO memory tonight. |
| 23:00–00:00 | Check event/translation pairs; confirm candidate earlier/later real timeline with two verifiable developments; prepare reproducible asOf requests. | Listen to one complete real edition; fix unnatural fallback labelling and key audio UX; start README setup and claim-audit sheet. | **MEMORY GO/NO-GO AT 00:00**: core gate still green, real timeline exists, stable preapproved update evidence exists, enough time remains. Otherwise memory becomes explicitly roadmap only. |
| 00:00–01:30, conditional | Implement ONE narrowly scoped returning-listener timeline; stable fact/update records for chosen real story; asOf cutoff; use heard IDs; preserve normal lead stories; tests. | Add tiny local listener history for the selected preset, visible “New since last listen”/“Catch me up”, reset and honest before/after view; do not build accounts. | **MEMORY ACCEPTANCE BY 01:30** or revert/disable. No invented correction, no repeated unchanged update, no future information. |
| 01:30–02:00 | Run all backend tests, one post-change end-to-end; measure actual call timing; finalize measured vs estimated cost facts. | Verify audio really matches the new transcript; ensure history is only recorded after playback completion or explicit “Mark heard”. | Release candidate stable; no new features after 02:00. |
| 02:00–06:15 | Staggered rest and/or bounded critical bug fixes. Preserve working demo state. | Staggered rest; finalize pitch and screenshot/short backup recording if permitted. | Do not spend these hours on optional integrations. |
| 06:15–07:30 | Assist source-audit lookup in local private data, verify selected story grouping, rerun tests, check source link/MP3 responses. | Independent **three-claim audit from actual played final audio**, including a number if spoken; check entity, metric, unit/currency, date/period, attribution and exact source support; record pass/fail. | Any unsupported claim is fixed or removed and MP3 regenerated before it is demoed. |
| 07:30–08:15 | Fresh clone in separate temporary directory; backend setup from docs + organizer-provided private feeds + env vars; smoke/test. | Fresh clone frontend install/build/run; fix README inaccurate claims and old profiles note in B-owned docs. | A teammate other than the original author can follow setup without private data committed to Git. |
| 08:15–09:00 | Final measured numbers and explicit 10x assumptions, sanity test wildcard. | Full timed pitch/demo rehearsal, listening pass, publisher/approval/AI-voice disclosure story, source clickthrough. | All judged flows work. **Feature freeze at 09:00.** |
| 09:00–09:30 | Review repo for secrets/private material, merge only tested branches, verify commit SHA and backend instructions. | Verify README, audio source links and demo backup, submit exact repository link/SHA per organizer instructions. | **Submission confirmed by 09:30.** |
| 09:30–10:00 | Emergency buffer only. | Emergency buffer only. | 10:00 = ready, not the moment to start submitting. |

If actual time slips: preserve ordering, skip the memory interval and use it for core integration or editorial validation. Any later organizer time is unverified and not a reason to defer.

## 5. Nonnegotiable CORE acceptance gate
1. Person A: GET /api/health returns OK and the expected licensed record count with local private data; backend test suite passes. The actual API can return transcript segments, fact IDs, source titles/URLs and an audioUrl; GET audioUrl serves an MP3. Model/TTS failure is explicit, not silently presented as success.
2. Person B: from the **browser**, exact shared listener objects for FX trader and Dutch AI investor produce materially different content (not just different language/voice) and playable audio. Source link sits alongside the factual sentence. Synthetic voice disclosure is visible.
3. Wildcard: a new profile *not included in the presets* triggers a new real request, yields its own relevant content or visibly labelled general-news fallback, and receives playable audio. Loading/error and retry are honest. Record actual script/TTS/end-to-end timing of this run, not a guaranteed latency.
4. Editorial: the script does not recommend investments, invent conflicts, or cite a translation as independent corroboration. Any fallback mode is visibly identified.
5. Delivery: no browser console/API errors; public Git has no JSONL, article bodies, private logs, secret keys, cached MP3s or private data URLs.
If the UI is not integrated by 23:00, stop optional work immediately.

## 6. Memory — implement ONLY after core gate
### Product contract
First-time listener = normal complete current briefing. Returning listener = normal relevant lead stories PLUS a distinct “what changed” segment for a previously heard event. A wildcard without history is always first-time. The memory feature is not required by Sourcera; it is the team's distinguishing demo.

### Technical pitfalls discovered in real repo
- listener.heardFactIds is accepted but currently unused by backend.
- factId(articleId + text quote) is stable only if same article/quote is selected again; it does NOT represent semantic equivalence across articles.
- The news grouper is conservative, typically merges nearby matches (48h window); it does not guarantee multi-day story identity. Do not equate an event group with a persistent evolving story.
- asOf must exclude future articles and updates; test two edition times explicitly.
- A final MP3 must be synthesized from the **final filtered/continuation transcript**; do not play stale audio for new text.
- B must not mark a segment heard merely on API generation. For a small honest prototype, mark only after audio ended or an explicit “Mark as heard” user action.

### Safe smallest implementation
1. Choose ONE real event timeline with at least two source-backed updates on different known publication times. Person B confirms the changes are genuine; a new article/rewording alone does not equal a factual change. If no suitable event exists, do **not** fake one or claim broad continuity.
2. Person A builds a **stable, private approved update ledger for this one story** (story key, update key, article ID/URL, evidence, published timestamp, validated spoken claim). Map existing fact IDs or expose a small additive update field **only after coordinating with B**. Do NOT filter merely on article-ID/LLM-quote hashes and do not build generalized semantic matching, login, vector DB or cross-device sync.
3. For earlier asOf, return the earlier evidence only; for later asOf with heard updates, include truly newer validated updates, clearly labelled, in addition to current top headlines. Do not say “correction” unless the underlying earlier statement is documented as wrong.
4. Person B persists heard IDs locally per demo listener (localStorage only), offers a clear reset and manually visible history state. Avoid claiming cross-device/publisher-level retention.
5. If the edition contains no meaningful new developments, say so rather than repeating the event or inventing a delta.
6. Add tests: earlier timeline, later timeline, unchanged source ignored, genuine later fact included, wildcard without history gets full briefing, source URLs retained, audio matches transcript, listener history is only marked after user action.

### HARD MEMORY ACCEPTANCE at 01:30
A complete first-listen real Newstex audio with proof; same listener later gets a truly different and sourced continuation without reciting the unchanged prior claim; different listener/wildcard gets appropriate context; no future-dated facts; UI persistence is honest; backend tests and both presets still pass. If any fail, revert/disable memory and explain it as intended next feature, NOT as working.

## 7. Person A — immediate next Codex checkpoint (only if needed)
**Checkpoint A-now:** verify current code, not rewrite it. Send B the actual response shape and sanitized sample; confirm main tests; profile-gate scripts, audio endpoint, model/fallback status and CORS. Identify a real multi-day event separately without coding memory. B needs working integration more than another backend feature.

**Short Codex prompt:** “Inspect the current Germany repo at latest main. OWN ONLY backend/, shared/ and root runtime configuration. Do not reimplement working ingestion, clustering, API, validation or ElevenLabs. Re-run backend tests and the real three-profile smoke gate (with private data available locally), record exact measured results, and deliver to Person B one sanitized real API response and start instructions. Verify audio URLs and source links; report any contract differences. Separately identify one actual multi-date story with two independently verified factual developments for a possible memory demo. DO NOT implement memory until the UI/core gate has passed. Do not touch frontend/, README or docs/.”

**Checkpoint A-memory (ONLY after 00:00 GO):** “Build the narrowest honest one-story returning-listener delta using the verified private story/update ledger and asOf cutoffs. Current heardFactIds are unused, and current IDs may differ across sources/wording, so do not claim naive set diff means meaningful change. Preserve full lead news, source links, actual transcript/audio alignment and first-visit wildcard. Change only backend/ or explicitly agreed shared contract, add tests, report limitations and measured before/after outputs. Stop if it cannot pass by 01:30.”

## 8. Person B — immediate next Codex checkpoint
**Checkpoint B-now:** the actual frontend does not exist on baseline main. Build and integrate it FIRST using the real contract, not a plan-only PR. Use shared/listener-profiles.json exactly; DO NOT wait for official profiles, as the cofounder said teams create them.

**Short Codex prompt:** “Inspect latest main and my own unmerged UI work. OWN ONLY frontend/; do not touch backend/ or shared/. Build a minimal working Vite/React listener page that calls POST /api/briefings at the correct backend URL and plays the returned /api/audio MP3. Use the exact two preset listener objects from shared/listener-profiles.json; add a genuinely editable wildcard profile form (language en/de/nl, topics, depth, maxMinutes), loading/retry and error states, transcript sentence-by-sentence source links, synthetic-voice disclosure, and an honest label for source-headline-fallback or general-fallback. Run build, open in browser against A's running API, and report files changed, exact evidence, and remaining errors. DO NOT implement memory or redesign the UI until the core gate passes.”

**Checkpoint B-memory (ONLY after 00:00 GO):** “Only after A's one-story memory endpoint works, add one per-listener localStorage heard-update/history state with reset, an explicit catch-up/what-changed path, and an audio-ended or deliberate mark-heard action. Never mark generated content as heard; never claim cross-device memory. Do not modify backend or shared contract without agreement. Test first-time vs returning vs wildcard using real sourced outputs. Stop at 01:30 if unreliable.”

**Checkpoint B-editorial + README:** “Independent of coding, listen to the FINAL real audio and pick three factual spoken sentences after playback. Compare each against the privately available linked original, verifying number, unit, company, date/period and surrounding meaning. Record three pass/fail results. Then correct README's false ‘not implemented’ claim and docs/B1-ui-plan.md's false ‘wait for official profiles’ claim; include exact setup for private NEWSTEX_DATA_DIR, backend/frontend run, env variable NAMES only, measured runs vs estimates, 17,400 synthetic assumptions, licensing, voice disclosure and known limitations. Never paste article bodies/keys.”

## 9. Cost, rights and the product story
Measure one-time local ingestion and grouping of 1,740 records separately from per-request model and ElevenLabs costs. Document model input/output tokens, TTS characters, retries and cache state. 17,400-record runtime was tested using synthetic copies: not actual article variety or verified clustering quality. Explicit cost equation: processing(N) + number_of_briefings × (selection + script + TTS) + infrastructure. **10× articles ≠ 10× audio charges** if number of generated briefings and lengths remain constant. Mark model/TTS rates with source and date, calculations as estimates, and individual observed latencies as sample measurements only. Credits lower cash paid, not economic operating cost.

Buyer: a finance publisher/newsroom is a hypothesis; it could approve fact cards then publish listener-specific synthetic voice briefings. Never claim paying buyers or an existing newsroom integration. Show visible synthetic voice disclosure and no personalized investment advice.

## 10. Rehearsal and release checklist
- Real browser: FX and Dutch AI preset; each gets different sourced stories and playable audio; new custom wildcard (not a canned response).
- Pick three **final spoken claims** blindly after playing audio; one numeric if possible; source link resolves and supports the exact statement; if not, fix/remove and regenerate.
- Translation duplicate merge sanity example and similarly themed separate-event nonmerge example. Do not claim perfect answer-key performance.
- Voice: listen at natural speed for pacing, length, pronunciation and awkward fallback. Do not hide limitations.
- Continuity, **only if it passes**: first heard state, later development, no repetition of unchanged fact, other listener gets context, no fabricated correction, stable source URLs.
- Fresh clone: install per README; place private organizer-provided six JSONL feeds OUTSIDE Git; set env vars; backend health, tests, frontend build/run, one sourced playable response; record any external access requirements.
- Secrets/license scan; no private data/traces/MP3s committed; successful backend tests and frontend build; latest main; resolve/merge branches safely; check the submitted SHA.
- Screenshot or backup demo may show genuine recorded earlier output, honestly labelled. Do not represent pre-generated audio as live.
- Feature freeze 09:00; GitHub submit by 09:30; 09:30–10:00 buffer.

## 11. Cut priorities and escalation
Cut in this order: n8n/other integrations → animations/polish → memory → multiple timeline support → extra voices/languages/profiles. **Never cut:** working playable sourced audio, two distinct presets, real wildcard path, three-claim audit, 1x/10x cost explanation, license/secret hygiene and runnable instructions.
If A's live generation becomes unreliable, use the validated/source-attributed fallback visibly and keep TTS, do not fake model success. If a source claim cannot be verified, remove it. If frontend is missing at 23:00, all effort goes to integration and a reliable minimal page, no memory. If memory is unproven at 01:30, disable it rather than risk core.

## 12. Unresolved facts, not assumed
Actual organizer submission method/deadline; judge ability to use private dataset from fresh clone; whether public release reference files will arrive; availability of independent journalistic coverage for chosen multi-day story; final runtime API quotas; semantic accuracy of all produced spoken claims; publisher willingness to pay. The repo's individual local run data and the user's newest results are snapshots, not future guarantees.
