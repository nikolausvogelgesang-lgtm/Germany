# Frontend integration handoff — 20 November 2026

Person A's backend is already running locally and reads the six private Newstex feeds from `NEWSTEX_DATA_DIR` in the ignored root `.env`. Use Node 22 or newer. From the repository root, start it with `npm --prefix backend start`; verify `http://localhost:3001/api/health` reports `articles: 1740`. The browser API base on **the same laptop** is `http://localhost:3001`. CORS allows a Vite page at `http://localhost:5173` (confirmed by a live OPTIONS request).

Person B is developing on another laptop. `localhost:3001` in B's browser points to **B's** laptop, not A's. For the joint integration test, push the frontend branch, pull it onto A's laptop and run Vite and the backend together there. Do not expose the unauthenticated private-data API to the public internet just to connect two laptops.

Use the exact two preset `listener` objects in `shared/listener-profiles.json`. A first-time request is:

```json
{
  "listener": { "language": "en", "topics": ["FX", "central bank"], "depth": "brief", "maxMinutes": 2 },
  "asOf": "2026-11-19T23:59:59Z"
}
```

Send JSON to `POST http://localhost:3001/api/briefings` with `Content-Type: application/json`. `asOf` is optional; omitting it uses the server's current clock. For a reproducible dataset demo, use the fixed cutoff above. The custom wildcard must send its own editable listener payload to the same endpoint.

A real response was observed with HTTP 200 and these fields: `id`, `asOf`, `profileSummary`, `topicMatchStatus`, `segments`, `audioUrl`, `durationSeconds`, `generationMs`, `scriptMs`, `ttsMs`, `usage`, `generationMode`, `modelStatus`, `audioStatus`. A shortened, sanitized example from that response:

```json
{
  "asOf": "2026-11-19T23:59:59.000Z",
  "profileSummary": "EN · FX, central bank · brief",
  "topicMatchStatus": "matched",
  "generationMode": "source-headline-fallback",
  "audioStatus": "cached",
  "audioUrl": "/api/audio/9e9613791dedfd62433e54bc.mp3",
  "durationSeconds": null,
  "segments": [
    { "text": "Good morning. This briefing is spoken by a synthetic voice.", "factIds": [], "sources": [] },
    { "text": "Invezz reports: “EUR/USD signal: forecast as the US Dollar Index rallies ahead of FOMC minutes.”", "factIds": ["fact-f29f6269f98c25d0"], "sources": [{ "articleId": "INVZ-10009737-01M7M1F8DYGQ5KXPF831415G52", "title": "EUR/USD signal: forecast as the US Dollar Index rallies ahead of FOMC minutes", "url": "https://invezz.com/news/2026/11/17/eur-usd-signal-forecast-as-the-us-dollar-index-rallies-ahead-of-fomc-minutes/" }] }
  ]
}
```

That audio file exists **only on A's current laptop**; do not treat the example URL as a deployed asset or a canned wildcard result. For an actual response, resolve `audioUrl` against the backend base, e.g. `new URL(briefing.audioUrl, 'http://localhost:3001')`, then give that absolute URL to the `<audio>` element. A live GET returned HTTP 200, `audio/mpeg`, 662,508 bytes. The MP3 is synthesized from the final `segments[].text` sequence.

UI states: show a spinner while the synchronous POST runs; show an error/retry state on non-200 or `audioUrl: null`. A factual segment has one or more `factIds` and matching `sources`; make each source title clickable next to its spoken sentence. The intro has empty arrays. Show the synthetic-voice disclosure. Label `generationMode: source-headline-fallback` as an attributed-headline fallback, and `topicMatchStatus: general-fallback` as general news because the requested topics had no clear match. Do not claim the model always passes: one real smoke call used the playable fallback while a later three-profile gate returned source-checked audio for all three.

No private article body or API key belongs in the frontend. `durationSeconds` can be null; use browser audio metadata for playback duration. The backend currently does not implement returning-listener memory even though `heardFactIds` is accepted.
