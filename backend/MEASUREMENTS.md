# Backend measurements for the Sourcera demo

Measured locally on 20 November 2026 with Node 24 and the six private Newstex JSONL feeds. No article text or API keys are stored in this document.

| Stage | Input | Result | Wall time |
| --- | ---: | ---: | ---: |
| Parse all feeds | 1,740 articles | 1,740 normalized records | 142 ms (one run) |
| Event grouping | 1,740 articles | 1,490 groups | 106–113 ms (two runs after hash optimization) |
| Event grouping stress test | 17,400 synthetic copies of the same article/time distribution | 14,846 groups | 3,866 ms (one run) |

The 10× row is a **synthetic runtime stress test**, not a measured 17,400-article Newstex release or a claim of equivalent grouping quality. The copies keep the same dates and headlines and receive unique IDs/text suffixes. The grouping algorithm still compares nearby candidate pairs, so do not extrapolate a linear 10× cost from the 1× timing.

After adding one narrowly checked cross-outlet match for the Elon Musk/Huang return campaign, the same 1,740-record dataset forms **1,489 groups**, with 238 translation pairs and 10 curated cross-outlet pairs. The table above records the earlier grouping version; its 10× synthetic count was not rerun after this change.

Recent live calls (each generated a source-linked script and MP3):

| Profile / run | Script | TTS | Total | Model input / output tokens | Characters sent to ElevenLabs |
| --- | ---: | ---: | ---: | ---: | ---: |
| FX, after relevance fix | 4,181 ms | 1,096 ms | 5,277 ms | 2,882 / 370 | 532 |
| AI/technology, before relevance fix | 6,911 ms | 1,322 ms | 8,233 ms | 4,023 / 326 | 736 |
| Unseen German energy wildcard, before relevance fix | 5,318 ms | 642 ms | 5,960 ms | 5,123 / 431 | 263 |

The German wildcard used the labelled source-headline fallback in that run after model validation rejected too many sentences. Another live run produced source-checked German speech, so model acceptance varies. Its fallback remained sourced and playable. Repeat the wildcard with the jury's actual input; do not promise this exact latency or model mode.

At public list rates checked on 20 November 2026, `gpt-5.4-mini` is $0.75 per million input tokens and $4.50 per million output tokens ([OpenAI model page](https://developers.openai.com/api/docs/models/gpt-5.4-mini)). ElevenLabs lists Flash/Turbo TTS API at **$0.04** per 1,000 characters ([ElevenLabs API pricing](https://elevenlabs.io/pricing/api)); actual account plan/credits may differ. Applying those rates to the three older calls above gives approximately **$0.0251 FX**, **$0.0339 AI**, and **$0.0163 German wildcard** for text generation plus TTS, excluding taxes and infrastructure. The recorded model totals include the retry when it happened. No full-dataset model pass was run: ingestion and grouping used local code, so their model/TTS API charge was $0 for this run.

The FX run after the relevance fix produced three factual spoken claims. Their source article text was manually checked for the stated number, direction and context. Person B should independently choose and check three claims after hearing the final demo audio.

After a separate claim-versus-quote verifier was added, one complete three-profile gate on 20 November produced the following live results. The model token counts include generation, verification and any retry. The Dutch MP3 was served from cache, so its zero TTS characters do **not** represent the cost of a new Dutch edition.

| Profile | Mode | Script / total | Model input / output tokens | New TTS characters |
| --- | --- | ---: | ---: | ---: |
| FX trader | source-checked-model, 2 facts | 4,576 / 5,120 ms | 3,294 / 411 | 218 |
| Dutch AI investor | source-headline-fallback, 3 facts | 8,254 / 8,255 ms | 7,492 / 673 | 0, cached |
| German energy wildcard | source-checked-model, 2 facts | 8,834 / 9,437 ms | 3,840 / 422 | 278 |

The stricter pass sometimes selects the attributed-headline fallback. That improves the evidence boundary but costs an extra model call and can increase latency. The older dollar estimates above were measured **before** this verifier and must not be presented as the current per-edition price. Audit records still require a human meaning check before a final demo claim is called editorially verified.

At those list rates, this **single post-verifier sample** would cost about **$0.0130 FX**, **$0.0244 Dutch AI** with a newly synthesized 393-character MP3, and **$0.0159 German wildcard**: about **$0.0533 for one cold edition of all three**. The observed Dutch request reused an MP3, reducing that run's estimated API charge to about $0.0086 and the three-request total to about $0.0376. These are rate-based estimates from measured tokens/characters, not provider invoices. A tenfold increase in the **number of equivalent briefings** would be about $0.533 for 30 cold briefings; a tenfold increase in **article count alone**, holding three briefings and selected excerpts constant, does not multiply these model/TTS charges by ten.

For a cost estimate, use `ingestion(N) + grouping(N) + P × (ranking + script + TTS) + overhead`, where `N` is articles and `P` is generated briefings. The current cheap parser and grouping process the complete 1,740-record release once on server start; each briefing sends only selected event excerpts to the model. A 10× article count with the same number and length of briefings does **not** mean 10× model/TTS usage per briefing, but a 10× number of listeners or editions would multiply those paid calls. The older pre-verifier sample above would now be about **$0.0753** for one edition of each profile, or **$0.753** for ten editions of each at the corrected list rate, if text lengths and retry rate stayed the same. Prefer the newer post-verifier sample for the current build, while explaining that both are individual runs rather than guaranteed future costs. Sponsor credit changes cash paid, not operating cost.

## Current candidate: numbered evidence sentences

On 20 November we changed generation to select a numbered source sentence instead of asking the text model to copy an evidence quote. The server retrieves the exact source sentence by index, then applies local checks and an independent `gpt-5.4` claim-versus-quote verifier. This removes the common failure where a model paraphrased the quote itself. The independent verifier can still reject an unsupported spoken claim. `source-headline-fallback` now may contain a surviving verified sentence plus attributed headlines for the missing stories. This is a candidate quality improvement, not an editorial sign-off.

One live gate with the full 1,740-article release, three distinct listener profiles and playable MP3s produced:

| Profile | Mode | Script / total | Total model input / output | Verifier input / output (included) | New TTS characters |
| --- | --- | ---: | ---: | ---: | ---: |
| FX trader | source-checked-model, 2 facts | 4,033 / 4,643 ms | 3,178 / 301 | 344 / 51 | 235 |
| Dutch AI investor | mixed source-headline-fallback, 3 stories | 7,274 / 8,047 ms | 6,958 / 489 | 723 / 103 | 358 |
| German energy wildcard | source-checked-model, 2 facts | 7,893 / 8,507 ms | 6,922 / 493 | 665 / 91 | 276 |

For that earlier variant, `gpt-5.4-mini` generation is listed at $0.75/$4.50 per million input/output tokens ([OpenAI mini model](https://developers.openai.com/api/docs/models/gpt-5.4-mini)); `gpt-5.4` verification is $2.50/$15 ([OpenAI model](https://developers.openai.com/api/docs/models/gpt-5.4)); ElevenLabs Flash/Turbo API is listed at $0.04 per 1,000 characters ([ElevenLabs](https://elevenlabs.io/pricing/api)). Subtract verifier tokens from total model tokens before applying mini rates. This earlier sample estimates **$0.0143 FX**, **$0.0241 Dutch**, and **$0.0206 German**, or **$0.0589 for all three cold editions**. These are rate calculations, not an invoice; a tenfold article count alone has a separate local grouping cost and need not multiply paid generation calls.

## Current conditional repair and three-story cap

The first draft still uses `gpt-5.4-mini`. Only when fewer than two distinct events survive validation does a numeric-free `gpt-5.4` repair draft run. Both drafts, when they contain candidate claims, receive the independent `gpt-5.4` verification pass. The brief edition now selects at most three lead stories from the complete release. Oil wildcard ranking prefers oil-led headlines so a mixed Anthropic story does not lead an oil briefing. A stricter verifier treats "under pressure" as different from an observed price fall.

One further live gate on all 1,740 records produced source links and playable MP3s for all three profiles. Outcomes varied by model sampling: the FX and German profiles used mixed attributed-headline fallback, while Dutch AI had two source-checked claims. This gate measured:

| Profile | Mode | Script / total | Total model input / output | Verifier input / output | Repair input / output | New TTS characters |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| FX trader | mixed fallback, 3 stories | 8,969 / 9,707 ms | 5,493 / 486 | 798 / 128 | 2,365 / 178 | 319 |
| Dutch AI investor | source-checked-model, 2 facts | 9,760 / 10,353 ms | 7,038 / 500 | 795 / 106 | 3,139 / 196 | 288 |
| German energy wildcard | mixed fallback, 3 stories | 8,059 / 8,818 ms | 5,483 / 483 | 370 / 53 | 2,574 / 189 | 356 |

At the same list rates above, subtract both verifier and repair tokens from each total before applying mini rates; use `gpt-5.4` rates for both stronger stages. This sample estimates **$0.0278 FX**, **$0.0291 Dutch**, and **$0.0282 German**, or **$0.0851 for three cold editions**. Thirty equivalent cold editions (ten of each) would be about **$0.851**, excluding infrastructure and taxes. This is a single measured rate-based estimate, not a guaranteed price or provider invoice. The briefings' paid API cost scales mainly with the number of editions, while local parsing and grouping handle the full article set.
