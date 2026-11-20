# Briefing API contract (v1)

Person A owns changes to this contract. Person B builds the UI against `fixtures/briefing.synthetic.json` until the real endpoint is ready. The fixture is intentionally fictional and must never be presented as Newstex output.

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

`asOf` and `heardFactIds` are optional. The first visit has no heard facts. The response contains a complete current briefing, including for an unseen wildcard listener. `heardFactIds` is accepted but does not yet change the briefing; returning-listener memory remains a candidate feature. The server must never return raw licensed article bodies.

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

`audioUrl` and `durationSeconds` may be `null` while audio generation is pending or in the labelled synthetic UI fixture. The real endpoint must include a source for every factual segment. Nonfactual transitions may have empty `factIds` and `sources`. UI must show explicit loading/error states and synthetic-voice disclosure.

The real endpoint also adds `generationMode` (`source-checked-model` or `source-headline-fallback`), `modelStatus` (`ok`, `key_missing`, or a sanitized validation/provider error) and `audioStatus` (`generated`, `cached`, `key_missing`, or a sanitized provider error). These are diagnostic fields. A `null` audio URL means **audio is not ready**, so the demo must not claim that a playable briefing exists yet. A fallback response must be labelled as such in the UI. The fallback may combine accepted, source-checked sentences with attributed source headlines for uncovered stories.

The live endpoint also reports `scriptMs` and `ttsMs` alongside `generationMs`. `usage.ttsCharacters` is zero on a cached MP3, because that request did not call ElevenLabs. `usage.verifierInputTokens` and `usage.verifierOutputTokens` are included in the corresponding model token totals; use them to price the stronger verifier separately. These fields let the team show measured wildcard latency and API consumption; they do not claim a currency cost.

`topicMatchStatus` is `matched` or `general-fallback`. When an unseen topic has no clear headline match in the supplied dataset, the briefing explicitly says it is general news; the UI should show the same label instead of presenting it as topical personalization.

The backend writes a private, ignored `generated/fact-audit.jsonl` record for each briefing. Each fact card contains its stable fact ID, source article ID and URL, short evidence quote, spoken wording, numeric expressions and `needs-editorial-review` status. This is an audit queue for Person B's three-claim check; automated quote and number checks alone do not certify that a paraphrase preserves the source's meaning. The API response still exposes only the spoken sentence, fact ID and source link.
