# Final acceptance · licensed Mac only

**This checklist predates the 21 November live tests.** Two exact real-news recordings (FX and Dutch AI) now passed the saved-edition technical gate; see [the current one-take status](ONE-TAKE-DEMO.md). Full human editorial approval and real-news Memory remain open. The custom German edition did not pass. The steps below remain the complete acceptance path, not a claim that all three editions are ready.

## 1 · Cold setup

Start from a fresh directory so an older model run or unsigned audio cache cannot stand in for a cold provider test. In Terminal:

```sh
umask 077
release=$(mktemp -d "$HOME/second-take-jury.XXXXXX")
unzip -q "$HOME/Downloads/second-take-JURY-STRESS-HARDENED.zip" -d "$release"
cd "$release/second-take"
pwd                       # use this project directory in the second terminal too
node --version            # 22.16+ (22.x) or 24.x
test -x /usr/bin/afconvert
cp .env.example .env && chmod 600 .env
```

Set these **privately in that root .env** using your local editor (inherited environment variables take precedence). No Playground, browser secrets or payment information:

- `PORT=3001`; `NEWSTEX_DATA_DIR` = absolute authorized directory containing `actionforex.jsonl`, `ibtimes_uk.jsonl`, `invezz_de.jsonl`, `invezz_en.jsonl`, `invezz_nl.jsonl`, `zacks.jsonl`. Use the supplied 1,740-record export. Do not “fix” source text to get a passing check.
- `OPENAI_API_KEY`, `OPENAI_MODEL` (draft), `OPENAI_VERIFIER_MODEL` (independent check), `OPENAI_REPAIR_MODEL` (only if needed); `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`. Use approved processing rights and account-entitled models/voice. Defaults are the existing project choices, not claims about your account.
- `MEMORY_LEDGER_FILE` blank unless a responsible editor has completed **step 4**. If preparing an approved track, finish that review **before** starting the demo services.

## 2 · No-generation preflight and startup

```sh
npm --prefix frontend ci --no-audit --no-fund
npm --prefix frontend run lint && npm --prefix frontend run build
npm --prefix backend test && node --test tests/history.test.mjs
npm --prefix backend run preflight
npm --prefix backend run preflight -- --providers
```

Use `ci --offline` if the locked packages are already cached. No new project dependencies. The first preflight runs the actual local feed/selection path at the archive cutoff: require 1,740 rows, at least two body-supported event plans per scenario and a decoder. Counts are **opportunities**, not proof of 140 accepted words. The second performs read-only GETs of the configured OpenAI model metadata (deduplicated), ElevenLabs voice and model catalogue, not drafts or synthesis. No passages sent. **READY here means metadata only.** 401 → authentication; 403/404/missing resource → model/voice access unavailable (403 may be only a metadata permission); 429 → rate limit; timeout/network → connection not verified; other provider errors → stop. Configuration and account credit, inference permissions and actual speech are separate.

```sh
npm --prefix backend start
```

In the second terminal **from the same project directory**:

```sh
npm --prefix frontend run preview -- --host 127.0.0.1 --port 5173 --strictPort
```

Open **http://127.0.0.1:5173/api/health** through the frontend proxy. Confirm 1,740 articles and both configured flags. Then open **http://127.0.0.1:5173**. Keep this origin and tab.

## 3 · One authorized daily POST per profile

Prepare a private download folder: `mkdir -p "$HOME/second-take-review" && chmod 700 "$HOME/second-take-review"`. Only proceed if authorized for charges. In **Today’s briefing**, select **Archive edition · 19 Nov 2026** (cutoff `2026-11-19T23:59:59Z`). In sequence:

| Select in this tab | Required configuration | Save review copy as |
|---|---|---|
| FX trader | en · FX, central bank · brief · 3 | fx-trader.json |
| Dutch AI investor | nl · AI, cloud · brief · 3 | dutch-ai-investor.json |
| **Custom listener** | Topics: `Energie, Öl` · German · Brief · Maximum minutes: 3 | custom.json |

For **each**: click **Generate briefing once**. One app POST can entail one draft/check, at most one repair/recheck and at most one cold voice call. Never run a paid load loop. Inspect the result, play to the end at normal speed in the native player, try a seek, and compare what is actually said (including figures, pronunciation and conditions) to the displayed sentences. Require intelligible native language, relevant coverage, ≥2 distinct verified events, ≥140 factual words, 60–180 s of playable audio. A body-insufficient profile is a finding, **not a passing substitute**. For a claim of fresh ElevenLabs success, require `audioStatus:generated` on the cold run; `cached` only proves reuse. Do not force another call to hide a failed attempt.

Use **Production details → Save private review copy (.json)** on each result. Put the three files in a local private directory, for example `$HOME/second-take-review/`; do not share them. No cache/receipt edits. Then, in a terminal at the same project:

```sh
review="$HOME/second-take-review"
export BACKEND_URL=http://127.0.0.1:3001 AS_OF=2026-11-19T23:59:59Z
npm --prefix backend run profile-gate -- --saved \
  "$review/fx-trader.json" "$review/dutch-ai-investor.json" "$review/custom.json"
```

**Read-only:** re-download the returned MP3s, measure the presentation clocks from complete frames, check actual byte digests, time budgets and transcript receipts, resolve the ordered fact pointers against the private export, and compare delivered event groups (not translated leads). Inspect IDs, sources, timing, repair and usage per edition. Keep the results open; switching listener in the tab reuses its purchased result. Do **not** also run `smoke` or `profile-gate --live` after these UI jobs.

**Three representative claims, then the rest:** the gate prints a `reviewCue` per edition (factual sentence number excluding intro, fact/article ID, date, UTF-16 evidence offsets). Start with a **numerical FX claim** if available, a **Dutch condition or attribution**, and a **German operational or price detail**. If only another edition has a number, use that numerical claim. For each:

1. Record the exact edition ID, audio URL/digest, sentence and playback timestamp privately. Compare the **heard words** with the transcript.
2. Open its inline numbered link; confirm publisher, original URL, article ID, timestamp ≤ cutoff and the same event. Read the original around the exact evidence window, not just the headline.
3. Check **who said what**, proposal vs outcome, sign, unit/currency, denominator, reporting period and every qualification. Mark pass/fail with initials; withhold on any mismatch, inaccessible original or unclear translation. Repeat for **every** factual sentence before public release. See [private worksheet](EDITORIAL-CHECK.md).

A model verdict, source hash, MP3 receipt or correct URL cannot replace this review.

## 4 · Memory: no approval by default

With the authorized export run `npm --prefix backend run memory-candidate` to stage the two named source pointers and a **needs-review** draft. Failure to resolve either → stop. A human editor must inspect **both full, dated originals** and rights, choose one whole supporting sentence per update, author the approved spoken paraphrases, keep the semantic IDs/cutoffs, and sign with `reviewedBy`, UTC `reviewedAt`, `status:editor-approved` in a private file **outside the project**. [Exact IDs, ledger schema and checks](MEMORY.md).

16 Nov: establish Musk’s role in the reinstatement campaign, not a completed return. 17 Nov: establish Huang’s **conditional willingness if requested**, preserving the exact party and full condition in that report. “Unlikely” is not a formal rejection. Never reconstruct evidence from this description. Set `MEMORY_LEDGER_FILE` only after genuine approval; restart and confirm `/api/memory` shows the expected story, dates and `synthetic:false`. These fields record an attestation; they cannot authenticate the reviewer. Missing approval → **fictional rehearsal only**; invalid configured ledger → track unavailable.

Before going on stage, play First edition; explicitly **Mark as heard**; open Next edition and play the entire new-only update. Check the earlier item is in **Previously heard**, excluded from this audio. Mark again: **All caught up**, no player/voice request. Verify refresh, profile isolation and reset in the actual browser. Reset the demonstration listener and select First edition. No 60-second floor applies here. Identical admitted Memory recordings can replay without a new voice call.

## 5 · 90 seconds on stage

| Time | Action |
|---|---|
| 0–15 s | State the problem. Play a short excerpt of the **staged** FX edition. |
| 15–30 s | Switch to Dutch AI; play a different event. Show the Custom German selection, not a third preset. |
| 30–42 s | Click the inline source of a checked detail; point out figure, period and original date. |
| 42–65 s | Open What’s changed. Play the earlier development, explicitly mark it heard, open the later cutoff. |
| 65–78 s | Contrast Previously heard with New since your last listen. Play the whole condition, not just its opening. |
| 78–90 s | Name the paying licensed publisher, editor’s hold point, and the [same-edition 1,740 / 17,400 cost comparison](../backend/MEASUREMENTS.md). |

**Remaining blockers until personally witnessed:** locked frontend build/lint and Mac startup/proxy, real model/voice entitlement and speech for A/B/C, real archive relevance and group identity, private source access and human audio review, genuine real-news Memory approval, actual-origin history persistence, rights and one uninterrupted staged rehearsal. If a gate fails, show a labelled transcript/rehearsal or postpone. Do not announce READY.
