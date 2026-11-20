# Second Take — demo runbook

## Before the demo

Run Vite and the configured backend on the same laptop. Confirm that the API loads the licensed feeds and that a real briefing plays in the browser. Use the live briefing controls, not the fictional UI example. Do not merge or present the audio path as verified until the joint browser test passes.

## 60-second browser walkthrough

| Time | Action |
| --- | --- |
| 0–20 s | Choose **FX trader** and generate. Play a short excerpt when the MP3 is ready. Open one publisher link next to a factual sentence and show how the article supports that sentence. |
| 20–40 s | Choose **Dutch AI investor** and generate. Play a short Dutch excerpt and point out a different story or source, not just a different voice. |
| 40–60 s | Choose **Custom listener**. Select German and enter an energy topic live, ideally one suggested by the jury. Choose **Brief**, set the limit to **2 minutes**, and click **Generate briefing**. Show the loading state, then play the returned MP3 when ready. |

If generation runs past the minute, finish the wildcard playback in the judge interaction. If there is no clear topic match, point out the general-news fallback. If headline fallback is used, identify it as attributed headlines. If audio fails, say so; do not substitute a recording and call it live.

## 30-second pitch

> Financial news moves quickly, but a general roundup makes listeners sift through stories that aren't relevant to them. Second Take turns licensed reporting into a short audio briefing tailored to the listener, with a source next to each factual claim. A financial newsroom could review the evidence before publishing different briefings from the same reporting. The voice is AI-generated and clearly disclosed. Updates for returning listeners are a future feature, not part of this demo.

## Cost and scale — if asked

- **Measured locally:** parsing 1,740 articles took 142 ms in one run. Grouping took 106–113 ms in two runs of the earlier grouping version. That local processing used no model or TTS calls.
- **Measured synthetic stress test:** grouping 17,400 synthetic records took 3,866 ms in one run of the earlier version. This is a runtime result, not a test of clustering quality on 17,400 independent articles.
- **Estimated API cost:** use the measured tokens and new TTS characters with the list-rate assumptions in [Backend measurements](../backend/MEASUREMENTS.md). Paid usage depends on the number and length of briefings, retries, and cache hits. The recorded Dutch cache hit had zero new TTS characters; that is not the cost of a fresh Dutch edition. Do not quote the older per-edition estimates as current prices.
