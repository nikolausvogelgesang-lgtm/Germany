# Second Take

**Don’t repeat the news. Tell me what’s changed.**

- **Today’s briefing:** choose **FX trader**, **Dutch AI investor**, or set your own topics, language, depth and time limit. Generate once, play the recording, and open the numbered link beside a spoken sentence. The default window is a dated **archive**, not today’s live market.
- **What’s changed:** open an earlier edition of **one editor-curated story**, listen and explicitly mark it heard. The later edition speaks only unacknowledged developments. Playing audio does not change history.

**Release decision: NOT READY for a real-news jury demonstration.** The three scenarios work on fictional feeds with mock models and locally decoded narration. No licensed daily edition, live provider recording or approved Nvidia timeline has been certified here. [Audit and evidence](docs/JURY-RELEASE-AUDIT.md) · [Mac acceptance, one generation per listener](docs/FINAL-LIVE-ACCEPTANCE.md) · [Demo runbook](docs/DEMO-RUNBOOK.md).

## Run locally

macOS, Node 22.16+ (22.x) or 24.x, npm. From the extracted `second-take/` directory:

```sh
umask 077
test -f .env || cp .env.example .env
npm --prefix frontend ci --no-audit --no-fund
npm --prefix frontend run lint && npm --prefix frontend run build
npm --prefix backend test
node --test tests/history.test.mjs
npm --prefix backend start
```

Second terminal, same directory:

```sh
npm --prefix frontend run preview -- --host 127.0.0.1 --port 5173 --strictPort
```

Open **http://127.0.0.1:5173**. Vite dev and preview proxy `/api` to the loopback backend on port 3001. For development use `npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173` instead of preview. Backend has no npm dependencies. Frontend needs the locked packages on the machine or in its approved registry/cache. New audio admission uses the system decoder: stock `/usr/bin/afconvert` on macOS; local FFmpeg on Linux.

## Private operating modes

Only the backend and operator CLIs load the project-root `.env`. Restart after changes. No keys in the browser, commands, screenshots or `VITE_*` variables.

| Inputs | Result |
|---|---|
| No feeds, ledger or keys | No fictional substitution for daily news. Explicitly labelled fictional Memory rehearsal, citations, mark/reset; no voice without a matching admitted cache. |
| Six authorized Newstex files in `NEWSTEX_DATA_DIR` | Rank and group the eligible seven-day window. No topic match → no job. Without model access, only matching native headlines, if available, explicitly transcript-only. |
| Feeds + authorized OpenAI + ElevenLabs | Bounded drafting, separate claim verification, conditional reverified repair. Only a sufficient script can request TTS. Failed voice or delivery gates leave the transcript, not a “complete” edition. |
| Approved private ledger + referenced originals | The approved two-edition Memory track; not automatic memory for arbitrary daily stories. A configured invalid ledger disables Memory, not daily news. |

Default daily: 3-minute **maximum**; 140 independently accepted factual words minimum, prefer 180–300 when supported. Require multiple verified events when eligible evidence supports them. The delivered MP3 must measure **60–180 seconds**, without padding the script or truncating a claim. Shorter explicit caps and short new-only continuations are supported. See [evidence and audio gates](docs/DAILY-EVIDENCE.md) and [API contract](shared/CONTRACT.md).

The three listener slots keep their current results **in this tab’s memory**: switching listeners stops the player, not the purchase. Reload, changing window or changing Custom settings can discard a result. Heard IDs persist per listener/story in browser storage. Use **Production details → Save private review copy** for a read-only audit of the exact daily edition; this is not a public distribution or re-import feature.

`generated/` contains private local usage, audit records and admitted audio/receipts. Exclude it, saved editions, private editorial files, feeds and secrets from any distribution. Only use providers and material authorized under the licence; delete derived artifacts according to retention requirements.

[Publisher pitch](docs/PUBLISHER-PITCH.md) · [1,740 vs 17,400 articles: costs and CPU](backend/MEASUREMENTS.md) · [Private Memory approval](docs/MEMORY.md) · [Final claim review](docs/EDITORIAL-CHECK.md)
