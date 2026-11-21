# One story; two edition cutoffs

Memory is an editorial ledger, not article- or quote-hash deduplication. Assign a durable story ID and update IDs by **meaning**. Another translation, paraphrase or later report of the same fact is not another update. Daily evidence hashes are audit IDs only. The replay code considers only eligible records at or before the selected edition and partitions them into spoken vs previously heard. No unseen records = no spoken segments, no TTS. The frontend sends IDs only for the selected listener and story. No backend listener account or history log.

## API

- `GET /api/memory`: public catalogue: storyId, neutral story title, language, two UTC edition cutoffs and synthetic flag. Not a list of later developments.
- `POST /api/memory`: JSON object: `{storyId, asOf, heardUpdateIds: [...], withAudio: false, maxMinutes: 3}`. Supply one exact cutoff from the catalogue. Outcome: `catch-up`, `continuation` or `no-change` in `kind`. Response includes `segments`, `previouslyHeard`, `updateIds` (only the current unheard IDs), `asOf`, synthetic status and audio status. Each factual segment has its update ID and source title, URL, article ID and publication timestamp.
- `withAudio:true` asks for audio of the resulting script, **never client-supplied text**. A no-change response never synthesizes. The optional maxMinutes (0.5–10) gates playback; the UI passes the listener’s cap. An over-budget curated script is never edited to squeeze it in. Preview is free of model/TTS calls. A fictional disclosure is spoken in every sample recording. Relative fixture links resolve against the API origin and return clearly labelled text/plain notices. Private quotes never use this route.
- LocalStorage values contain only short update IDs; the namespaced key includes the story and preset or normalized custom configuration. Malformed storage is read as empty, write failures are shown. Marking is explicit; reset removes one key. A storage event refreshes another tab on the same origin. No guaranteed atomic merge of simultaneous edits in two tabs.

## The Nvidia review gate — on the authorized machine only

The upload supplies two IDs, expected dates and first-sentence hashes. These are **lookup aids**, not evidence that the story happened. There are no locally approved Newstex passages or signed-off spoken claims in this distribution. A publisher URL or matching hash alone is insufficient.

1. Set `NEWSTEX_DATA_DIR` in the root `.env` to the licensed six-feed export. Run `npm --prefix backend run memory-candidate`. It must resolve the two records below, match their expected lead hashes and check their dates. If missing, changed or mismatched, stop; do not bypass the check to present the story. It writes `generated/memory-candidate.json` with `needs-review` status, private review material and **empty** spoken text. The draft is never loaded automatically.
2. Copy the draft to a private file **outside the project** (e.g. `cp generated/memory-candidate.json /absolute/private/memory-ledger.json`). Open **both complete original records and their publisher permalinks**. Establish rights, provenance, reliability, dates/timezones, attribution, and context. If the content is hypothetical, materially ambiguous, unsupported or contradicted, keep the real-news demo closed.

| Edition (UTC cutoff) | Licensed record ID | Required reading, not an approved script |
|---|---|---|
| 16 Nov 2026, 23:59:59Z | INVZ-10009737-01M7HKN100QWRFZXPSMS8WWFQ1 | Check Musk’s exact role in the reinstatement campaign. Do not add a board position, imply success or import Huang’s later statement. |
| 17 Nov 2026, 23:59:59Z | INVZ-10009737-01M7N83B6HGJSN8P6PRG6ZJBNJ | Check Huang’s **conditional** willingness to return if requested, including any more specific condition the later record actually establishes. Not an actual return, commitment, board decision or reversal. |

3. For this English candidate, select one **whole exact source sentence** per update as `evidenceQuote`; compose one independently intelligible `spokenText` (≤280 characters). Keep the draft’s two semantic update IDs unchanged. No `boardEvidenceQuote` is needed. For edition two, preserve the complete trailing condition introduced by “if”, “provided that” or “on condition that” (including “only if”). Identify the requesting party and preserve any board-decision or best-interest clause **only as supported by that record**. A request is not a completed return. Never truncate or edit the evidence to fit. Check the approval timestamp is no earlier than either report. If the original uses a different construction, stop for review of the gate against that original. Do not invent a matching sentence. Default to one short claim. Any optional detail must satisfy the same dated claim/condition gate; it is not a way around it. If one link cannot support its whole segment, **do not approve**. Keep title neutral and IDs stable. No publisher material other than approved spoken wording, headline and source metadata is returned by the API.
4. Only the responsible editor may set `status` to `editor-approved`, fill `reviewedBy` and `reviewedAt` (ISO UTC, ending `Z`), and authorize use. Set `MEMORY_LEDGER_FILE=/absolute/private/memory-ledger.json` and restart the backend. `curl -s http://127.0.0.1:3001/api/memory` must now show `storyId: nvidia-huang-return`, `synthetic: false` and the two exact cutoffs. Failure → inspect configuration/approval; do not present a sample as the approved pair.
5. Run the [listening sequence](DEMO-RUNBOOK.md) and [three-claim audit](EDITORIAL-CHECK.md) on the final audio. A matching quote only proves presence, not the meaning of the paraphrase. Do not treat startup success as an independent fact check.

Do not turn “unlikely” into “rejected,” or conditional willingness into a decision. If the actual dated evidence does not establish the distinctions in the review table, keep the candidate held; the table is not a source.

**Length is subordinate to novelty.** Short approved scripts remain unchanged. Only if the same report contains substantial additional evidence about the *same* development, an editor can add up to five `details: [{spokenText, evidenceQuote}]` entries to that update before sign-off. Each entry is one independently supported paraphrase, ≤280 characters, bound to an exact passage in that dated article; never include acknowledged background, boilerplate or a new historical event. Re-review the complete spoken update. Aim for ~40–75 seconds when justified, not by adding a long introduction. Details travel with the existing update ID for all cutoff/mark/no-change decisions. No automatic expansion, new lookups or new approvals.

The existing daily hold still excludes the candidate and its grouped reports. The private Memory loader alone can resolve the exact two held IDs under this story ID, in this order, after explicit approval. Blank ledger setting enables only the opt-in fictional rehearsal. Curated audio has the language of the ledger; switching listeners changes listening history, not the approved wording.

### A quick replay without frontend dependencies

With the blank rehearsal backend running, these two local requests demonstrate the actual edition logic. The second request explicitly represents acknowledgement of the first response's update; merely fetching the first response does not write history.

```sh
curl -s http://127.0.0.1:3001/api/memory
curl -s -H 'Content-Type: application/json' http://127.0.0.1:3001/api/memory \
  -d '{"storyId":"sample-tideglass-crossing","asOf":"2026-11-16T18:00:00Z","heardUpdateIds":[]}'
curl -s -H 'Content-Type: application/json' http://127.0.0.1:3001/api/memory \
  -d '{"storyId":"sample-tideglass-crossing","asOf":"2026-11-17T18:00:00Z","heardUpdateIds":["inspection-suspends-freight"]}'
```
