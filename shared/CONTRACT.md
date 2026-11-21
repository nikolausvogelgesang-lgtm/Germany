# Daily briefing API (compatible v1)

See [Memory](../docs/MEMORY.md) for replay. A usable script may have null audio after a TTS failure. Additive flags: `repairApplied` (a repair draft was adopted) and `usageComplete` (no known provider failure during this run).

`POST /api/briefings` request:

```json
{
  "listener": {
    "language": "en",
    "topics": ["markets"],
    "depth": "brief",
    "maxMinutes": 2,
    "heardFactIds": []
  },
  "asOf": "2026-11-19T23:59:59Z"
}
```

`asOf` and `heardFactIds` are optional. The first visit has no heard facts. The HTTP endpoint requires 1–6 nonempty topics, supported language and a valid cap; no eligible topic match yields a diagnostic error, not general news. `heardFactIds` is accepted but does not change daily news; the separate Memory route uses stable update IDs. The server must never return raw licensed article bodies.

`POST /api/briefings` response:

```json
{
  "id": "briefing-id",
  "asOf": "2026-11-19T23:59:59.000Z",
  "profileSummary": "Short market briefing",
  "segments": [
    {
      "text": "An independently checked spoken sentence.",
      "factIds": ["fact-1"],
      "sources": [{ "articleId": "article-1", "title": "Source title", "url": "https://source.example/story" }]
    }
  ],
  "audioUrl": "/api/audio/briefing-id.mp3",
  "durationSeconds": 60,
  "generationMs": 1000,
  "usage": { "modelInputTokens": 0, "modelOutputTokens": 0, "ttsCharacters": 0 }
}
```

`audioUrl` and `durationSeconds` are null for a withheld recording. The real endpoint must include a source for every factual segment. Nonfactual transitions may have empty `factIds` and `sources`. UI must show explicit loading/error states and synthetic-voice disclosure.

The real endpoint also adds `generationMode` (`source-checked-model` or `source-headline-fallback`), `modelStatus` (`ok`, `key_missing`, or a sanitized validation/provider error) and `audioStatus` (`generated`, `cached`, `key_missing`, or a sanitized provider error). These are diagnostic fields. A `null` audio URL means **audio is not ready**, so the demo must not claim that a playable briefing exists yet. A fallback response must be labelled as such in the UI. The fallback may combine accepted, source-checked sentences with attributed source headlines for uncovered stories.

The live endpoint also reports `scriptMs` and `ttsMs` alongside `generationMs`. `usage.ttsCharacters` is zero on a cached MP3, because that request did not call ElevenLabs. `usage.verifierInputTokens`/`verifierOutputTokens` and `usage.repairInputTokens`/`repairOutputTokens` are included in the corresponding model token totals; use them to price the stronger verifier and conditional repair separately. These fields let the team show measured wildcard latency and API consumption; they do not claim a currency cost.

`topicMatchStatus:matched` accompanies selected relevant coverage. On a miss: no generation, no TTS and no unrelated native-headline substitute. `editionStatus` distinguishes `complete` (deliverable), `transcript_only` (sufficient script, unavailable audio), and `incomplete`. `audioSha256` binds a completed edition to its admitted MP3 bytes. Repeated same-listener archive POSTs **in flight** return 409; at most three different daily jobs can run concurrently.

The backend writes a private, ignored `generated/fact-audit.jsonl` record for each briefing. Each daily audit pointer contains the fact/event/article IDs, article date, source `field` (`text` or emergency `headline`), `[start,end)` and `[focusStart,focusEnd)` UTF-16 offsets, SHA-256 hashes of the UTF-8 evidence window and final spoken sentence, and `needs-editorial-review` status. Look up the private normalized article by ID, slice the original field **without normalizing whitespace**, and compare hashes. Neither source passages nor transcript text are logged. The row also binds the ordered transcript hash, listener summary, cap and admitted audio URL/digest. Original links and final wording are on the ordered API segments. This is an audit queue for the final three-claim check; automated quote and number checks alone do not certify that a paraphrase preserves the source's meaning. The API exposes spoken text, identifiers and source metadata, not private body excerpts.


## Additive audio fields

Daily `segments` stay ordered. A story can have several claim segments with one stable evidence-derived fact ID and citation each. `storyId` groups adjacent segments for display; it is **not** a Memory update ID. `kind` is `summary` or `headline`; nonfactual openings have no sources. `sources` also has `publisher` and `publishedAt` where available. A fallback status can include only the surviving verified story if adding titles would dilute it. Do not present this as passing the full coverage gate.

The default daily maximum is 3 minutes; existing explicit 0.5–10-minute values still work. The app prefers ≤3 minutes even for a larger cap. `estimatedDurationSeconds` is based on the final script at 140 wpm; `durationSeconds` is the unrounded measured presentation duration (complete frame clock adjusted for recognized gapless metadata), null without deliverable audio. Voice/model/encoding and exact final text (ordered segments joined by two newlines) still form the MP3 cache key. No client text ever goes to TTS. Both generated and cached audio must fit. `over_time_limit` and `invalid_recording` return null audio and the truthful script. No automatic paid retry.


### Daily quality and diagnostics (additive)

`qualityStatus` is `sufficient_verified_content` only when the final, fitted summary sentences pass the coverage, detail and factual-word gates. Otherwise it is `insufficient_verified_content`, even if all surviving sentences are individually verified; no TTS/cache lookup on insufficient content. The compatible `source-headline-fallback` mode covers a verified-only partial as well as an explicitly attributed headline exception; distinguish `diagnostics.fallbackKind`. A successful script is not a successful TTS request: always check `audioStatus` and `audioUrl` separately.

The daily response and the corresponding private usage row (joined by briefing ID) include a safe `diagnostics` object; see [field definitions and local smoke](../docs/DAILY-EVIDENCE.md). `actualMp3DurationSeconds` can be present for a withheld over-limit file even though the public playback `durationSeconds` and `audioUrl` are null. Memory has no daily word or audio floor.
