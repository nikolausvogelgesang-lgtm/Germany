# Verification index

- [Initial jury audit, corrections, final scores and evidence matrix](JURY-RELEASE-AUDIT.md)
- [Exact authorized Mac verification and release blockers](FINAL-LIVE-ACCEPTANCE.md)
- [Local timing experiments and historical cost assumptions](../backend/MEASUREMENTS.md)

Repeat the backend and history suites with `npm --prefix backend test` and `node --test tests/history.test.mjs`. They use temporary directories and local fixture transports, not the project's private configuration. Optional speech/decode tests need local eSpeak and FFmpeg/ffprobe; skipped codec tests are not playback passes. Fresh audio admission needs the platform decoder. `node backend/scripts/bench-intake.mjs` is a bounded fictional six-feed benchmark, with no provider traffic.

**Optional installed-browser tests.** With a local Python Playwright and Chromium, set `CHROMIUM_BIN` to the installed executable. Run Vite on port 5173. For `python tests/browser_profiles.py`, stop the real backend: the test must start its own disposable fixture instance on 3001. It renders the application, plays locally narrated MP3s, checks 3 viewports, source hrefs, faults, Memory, reload and reset; it must not use a private provider. For `python tests/browser_rehearsal.py`, instead run a separate blank, no-feed/no-key/no-cache backend on 3001. The latter is a script-only missing-input rehearsal.

The shell's browser result in the audit used the real application components in an in-document fixture harness, not the installed Vite build or a normal same-origin navigation. Run the installed tests and the separate live procedure on the actual demo machine.
