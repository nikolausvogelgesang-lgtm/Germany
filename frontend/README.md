# Second Take frontend

This React/Vite app lets listeners choose an FX or Dutch AI preset, or create a custom profile. It sends the selected profile to the briefing API and displays the returned transcript, source links and audio availability.

## Start locally

First start the backend on the same laptop using the [root README](../README.md). Then, from the repository root, run:

```sh
cd frontend
npm ci
npm run dev
```

Open the URL printed by Vite. To verify the production build, run `npm run build` from `frontend/`.

By default, the Vite development server proxies `/api` to the local backend on port 3001. Set `VITE_API_BASE_URL` before starting Vite only if the browser needs a different backend address. Never put API keys in frontend configuration.

## Browser check

- **Show fictional interface example** checks transcript and source-link rendering without calling the backend. The example is labelled fictional and intentionally has no audio.
- **Generate briefing** makes a real API request. Verify the transcript, source links and playback of the returned MP3 against the configured backend. If audio is unavailable, the UI says so.
- Headline fallback and general-news fallback are labelled. The voice is AI-generated. Returning-listener memory is not implemented.
