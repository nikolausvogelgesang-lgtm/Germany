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

`asOf` and `heardFactIds` are optional. The first visit has no heard facts. The response contains a complete current briefing, including for an unseen wildcard listener. Returning listeners may receive a short update to previously heard stories **in addition** to today's lead news. The server must never return raw licensed article bodies.

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
