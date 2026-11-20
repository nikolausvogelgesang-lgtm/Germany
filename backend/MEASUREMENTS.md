# Backend measurements for the Sourcera demo

Measured locally on 20 November 2026 with Node 24 and the six private Newstex JSONL feeds. No article text or API keys are stored in this document.

| Stage | Input | Result | Wall time |
| --- | ---: | ---: | ---: |
| Parse all feeds | 1,740 articles | 1,740 normalized records | 142 ms (one run) |
| Event grouping | 1,740 articles | 1,490 groups | 106–113 ms (two runs after hash optimization) |
| Event grouping stress test | 17,400 synthetic copies of the same article/time distribution | 14,846 groups | 3,866 ms (one run) |

The 10× row is a **synthetic runtime stress test**, not a measured 17,400-article Newstex release or a claim of equivalent grouping quality. The copies keep the same dates and headlines and receive unique IDs/text suffixes. The grouping algorithm still compares nearby candidate pairs, so do not extrapolate a linear 10× cost from the 1× timing.

Recent live calls (each generated a source-linked script and MP3):

| Profile / run | Script | TTS | Total | Model input / output tokens | Characters sent to ElevenLabs |
| --- | ---: | ---: | ---: | ---: | ---: |
| FX, after relevance fix | 4,181 ms | 1,096 ms | 5,277 ms | 2,882 / 370 | 532 |
| AI/technology, before relevance fix | 6,911 ms | 1,322 ms | 8,233 ms | 4,023 / 326 | 736 |
| Unseen German energy wildcard, before relevance fix | 5,318 ms | 642 ms | 5,960 ms | 5,123 / 431 | 263 |

The German wildcard used the labelled source-headline fallback in that run after model validation rejected too many sentences. Another live run produced source-checked German speech, so model acceptance varies. Its fallback remained sourced and playable. Repeat the wildcard with the jury's actual input; do not promise this exact latency or model mode.

At public list rates checked on 20 November 2026, `gpt-5.4-mini` is $0.75 per million input tokens and $4.50 per million output tokens ([OpenAI model page](https://developers.openai.com/api/docs/models/gpt-5.4-mini)). ElevenLabs lists Flash/Turbo TTS API at $0.05 per 1,000 characters ([ElevenLabs API pricing](https://elevenlabs.io/pricing/api)); actual account plan/credits may differ. Applying those rates to the three calls above gives approximately **$0.0304 FX**, **$0.0413 AI**, and **$0.0189 German wildcard** for text generation plus TTS, excluding taxes and infrastructure. The recorded model totals include the retry when it happened. No full-dataset model pass was run: ingestion and grouping used local code, so their model/TTS API charge was $0 for this run.

The FX run after the relevance fix produced three factual spoken claims. Their source article text was manually checked for the stated number, direction and context. Person B should independently choose and check three claims after hearing the final demo audio.

For a cost estimate, use `ingestion(N) + grouping(N) + P × (ranking + script + TTS) + overhead`, where `N` is articles and `P` is generated briefings. The current cheap parser and grouping process the complete 1,740-record release once on server start; each briefing sends only selected event excerpts to the model. A 10× article count with the same number and length of briefings does **not** mean 10× model/TTS usage per briefing, but a 10× number of listeners or editions would multiply those paid calls. At the observed three-profile mix, one edition for each profile is about **$0.0906** at the cited list rates; ten editions for each would be about **$0.906** in API charges if text lengths, retry rate and model/TTS prices remained the same. This is an estimate, not a measured 10× workload. Sponsor credit changes cash paid, not operating cost.
