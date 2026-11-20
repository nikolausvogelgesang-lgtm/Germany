# Second Take

Second Take turns licensed financial news into personalized audio briefings. The browser shows the transcript with source links next to the corresponding claims. The voice is AI-generated. Briefings are not investment advice.

## What works

- Two listener presets: **FX trader** (English, FX and central banks, brief, up to 2 minutes) and **Dutch AI investor** (Dutch, AI and cloud, brief, up to 1.5 minutes).
- A custom listener can choose English, German or Dutch, enter topics, select a depth and set a time limit. Generating a briefing sends a fresh API request.
- The UI plays the returned MP3 when audio is available. It labels headline fallback and general-news fallback explicitly. The fictional UI example is separate from live briefings and has no audio.
- Returning-listener memory is not implemented. Joint browser verification of live MP3 playback is still pending.

## Run locally

Use Node.js 22 or newer. Run the backend and frontend on the same laptop for the demo. A public clone does not contain the six private Newstex JSONL feeds or the service credentials.

**Terminal 1 — backend.** Before starting, set the backend environment variables in this terminal session using your team's private configuration:

- `NEWSTEX_DATA_DIR`
- `OPENAI_API_KEY`, `OPENAI_MODEL`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`
- `PORT`

Keep credentials server-side. The default frontend development proxy expects the backend at `http://localhost:3001`.

From the repository root:

```sh
cd backend
npm start
```

**Terminal 2 — frontend.** From the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite. To check the production build, run `npm run build` from `frontend/`. `VITE_API_BASE_URL` can override the browser's API base; it is public configuration, not a place for credentials.

## Try the demo

Select **FX trader**, generate a briefing, play the MP3 if available, and open a source link next to a transcript sentence. Switch to **Dutch AI investor** to compare the coverage. Then enter a new custom profile and generate its briefing live. A labelled fallback or an unavailable audio message is not a successful live audio test.

## Data and limitations

Keep licensed article bodies, API keys, private audit logs and generated MP3s out of Git. The frontend links to publisher sources without displaying full article bodies. Automated checks do not replace editorial verification against the original sources.
