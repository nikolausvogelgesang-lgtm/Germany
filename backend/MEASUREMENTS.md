# Cost per publisher intake and per edition

**Current live cost per published briefing: not measured.** Count articles once per intake, model work per generation request, TTS per new recording and delivery per play. A failed edition can still consume tokens or TTS characters. Presentation length alone is not a bill.

The default writer is now `gpt-5.4` after a live FX script reached the evidence and audio gates with that model. The archived mini-writer illustration below is **not** a price estimate for the current default; use actual provider billing and the private per-edition usage log for the final cost figure.

## Live two-listener demo, 21 November 2026

The exact saved archive editions passed the private source/audio/profile gate on the 1,740-article export. The figures below use reported API usage and [GPT-5.4 standard token rates](https://developers.openai.com/api/docs/models/gpt-5.4) of $2.50 input / $15 output per million plus the [ElevenLabs Flash API rate](https://elevenlabs.io/pricing/api) of $0.05 per 1,000 characters. They are estimates, not a provider invoice; plans, taxes, data rights, retries and local infrastructure are excluded.

| Edition | Model input / output tokens | New voice characters | Measured MP3 | Estimated provider cost |
|---|---:|---:|---:|---:|
| English FX | 7,100 / 1,124 | 1,130 | 76.2 s | $0.0911 |
| Dutch AI | 6,510 / 1,587 | 1,673 | 126.9 s | $0.1237 |
| **Two cold editions** | **13,610 / 2,711** | **2,803** | — | **$0.2148** |

At 17,400 articles, the same two shortlisted edition workloads would still be about $0.2148 in model/voice usage; local intake work and licensing grow. Twenty equivalent cold editions would be about $2.15 in provider usage. Failed drafts also cost tokens, so use the billing dashboard for an actual paid-run total. A prepared recording can be replayed without another model or voice call.

## 1,740 vs 17,400 articles

| Stage | Cost driver |
|---|---|
| Intake | Load and normalize the full authorized feeds, group for corpus diagnostics at startup. Before daily selection, group only the edition window, then reuse the groups across listeners (bounded four-window cache). **Zero model/TTS calls for ingestion.** Pay for rights, CPU, memory and storage. Within-window pair comparisons can grow faster than article count. |
| Selection and draft | Rank eligible groups per listener/cutoff locally. Send a bounded outline, not the whole intake, to one writer. Cost = writer input and output tokens at their respective rates. |
| Verification | One separate batch on the surviving sentences and their specific evidence. Pay for verifier input and output even if every claim fails. |
| Repair | At most one targeted addition when the script misses its gate and evidence might close the gap. Pay separately for the repair writer **and** a verifier batch on surviving additions. No automatic provider-error retries. |
| Recording | Insufficient script: no TTS. Sufficient script, cache miss: price the exact final transcript characters. Count a generated but withheld MP3 too; a duration refusal is not a refund. |
| Replay and editions | Serving an already-generated MP3 costs storage/network, no new model or voice calls. Another **Generate** reruns text processing; only identical text, voice, model and format can reuse a recording. No shared script cache. Each genuinely different audience edition gets its own budget. |

**Recorded historical CPU, not a benchmark of this revision:** an earlier six-feed run parsed 1,740 articles in 142 ms; older grouping ran in 106–113 ms (1,490 groups). In a historical **synthetic** stress test the same older grouping took 3,866 ms for 17,400 replicated records with the same time distribution. Ten times the articles does not imply ten times the API cost, nor guaranteed linear grouping time.

## MEASURED · this revision, synthetic CPU only

One Node 22.16.0 Linux process, one pass at each size, no providers. Reproduce with `node backend/scripts/bench-intake.mjs`. Six disposable JSONL streams, seven days, repeated financial vocabulary/bylines, independent IDs, some deliberate translations and wire copies. Times exclude fixture creation; each cell is **elapsed ms / process CPU ms** (user + system). The plan stage includes ranking and evidence outlines for all three listeners, not model latency.

| Fictional records | Parse / normalize | Group | Three plans | Groups |
|---:|---:|---:|---:|---:|
| 1,740 | 26.2 / 27.2 | 84.8 / 118.6 | 89.0 / 74.2 | 1,582 |
| 17,400 | 212.6 / 203.7 | 2,139.6 / 2,145.1 | 249.6 / 250.3 | 15,825 |

Byline buckets, time-windowed exact-hash/alias indexes and token-prefix candidates reduce many irrelevant comparisons. Dense repeated headlines can still be quadratic. At 10× volume cold grouping took about 25× the elapsed time in this sample; do not promise linear scaling. Original Newstex timing on this revision, real event precision, peak production throughput and provider latency: **NOT TESTED**.

## Transparent planning example, not measured spend

Use the account's actual model, voice plan and prices. For comparison **only**, the archived rate assumptions were [mini writer](https://developers.openai.com/api/docs/models/gpt-5.4-mini) $0.75/$4.50 per million input/output tokens; [strong verifier/repair](https://developers.openai.com/api/docs/models/gpt-5.4) $2.50/$15; [Flash TTS](https://elevenlabs.io/pricing/api) $0.04 per thousand new input characters.

| Per edition | Illustrative input / output | Estimated USD at those assumptions |
|---|---:|---:|
| Writer | 3,000 / 400 tokens (assumed) | .00405 |
| Independent check | 2,400 / 240 tokens (assumed) | .00960 |
| Optional repair | 1,400 / 170 tokens (assumed) | +.00605 |
| Optional repair recheck | 800 / 80 tokens (assumed) | +.00320 |
| Cold FX / Dutch / German TTS | 1,412 / 1,381 / 1,482 **characters** respectively (measured fictional scripts) | .05648 / .05524 / .05928 |

- **ESTIMATED, supplied dataset size (1,740), three cold editions, no repair:** 3 × ($.00405 + $.00960) + 4,275/1,000 × $.04 = **$0.21195** in provider charges under the archived assumptions. Character counts are from exact fictional scripts (221/220/204 factual words); token counts and prices are assumptions, not provider measurements. This is not the bill for processing the real dataset.
- **ESTIMATED, hypothetical 17,400, same three editions:** **$0.21195** only if evidence/token volumes, accepted characters and cache/repair outcomes stay fixed. More shared local work; no model per article. One repair/recheck at the example token sizes adds **$.00925**, plus any change in cold recording length.
- **30 distinct cold editions** in this mix would instead be **$2.11950**. Thirty plays of three already-published files: **$0 incremental generation/TTS**, not zero hosting cost. Switching between staged results or GET/seek does not rerun the writer. A deliberate new Generate does. Missing cache integrity is a refusal, not an automatic paid retry.

These variable-cost examples omit licensing, editorial labour, CPU/storage, delivery, subscription minimums and tax. Do not quote the historical rates as current. Authorize a pilot against current account rates and reconciled usage per **accepted** edition.

## Historical short-script usage (different pipeline)

An older conditional-repair run recorded the following provider counters. Its roughly **$0.085 total estimated** for three **short** recordings is not a quote for the current target length, and these rows are not tied to the durations of a different laptop run.

| Profile | Total input/output tokens | Of total: verifier | Of total: repair writer | Cold TTS chars | Estimated USD |
|---|---:|---:|---:|---:|---:|
| FX (mixed fallback) | 5,493 / 486 | 798 / 128 | 2,365 / 178 | 319 | .0278 |
| Dutch AI (source-checked) | 7,038 / 500 | 795 / 106 | 3,139 / 196 | 288 | .0291 |
| German energy (mixed fallback) | 5,483 / 483 | 370 / 53 | 2,574 / 189 | 356 | .0282 |

**Measure on the licensed host:** join private `generated/usage.jsonl` to the exact briefing ID. Separately for input/output, writer tokens = model totals − verifier − repair. Verifier counters **include** any repair verifier; repair counters are the repair writer only. Do not charge these subsets twice. Price reported `ttsCharacters` (JavaScript input-string length) against the plan and reconcile with the provider’s actual billable units; distinguish `generated`, `cached`, withheld audio and `not_requested`. Keep unsuccessful attempts in the cost-per-published-edition numerator. Treat `usageComplete:false` as incomplete, not free; reconcile with provider billing. No current licensed generation or charge was measured here.
