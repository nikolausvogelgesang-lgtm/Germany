const base = process.env.BACKEND_URL || 'http://localhost:3001';

const healthResponse = await fetch(`${base}/api/health`);
if (!healthResponse.ok) throw new Error(`Backend health failed: ${healthResponse.status}`);
const health = await healthResponse.json();

const response = await fetch(`${base}/api/briefings`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    listener: { language: 'en', topics: ['FX', 'central bank'], depth: 'brief', maxMinutes: 2 },
    asOf: '2026-11-19T23:59:59Z',
  }),
});
const briefing = await response.json();
if (!response.ok) throw new Error(`Briefing request failed: ${briefing.error ?? response.status}`);
const factualSegments = briefing.segments.filter((segment) => segment.factIds.length);
if (factualSegments.length < 2 || factualSegments.some((segment) => !segment.sources.length)) {
  throw new Error('A factual spoken segment has no source');
}

let audioBytes = 0;
if (briefing.audioUrl) {
  const audioResponse = await fetch(`${base}${briefing.audioUrl}`);
  if (!audioResponse.ok || !audioResponse.headers.get('content-type')?.includes('audio/mpeg')) {
    throw new Error(`Audio fetch failed: ${audioResponse.status}`);
  }
  audioBytes = (await audioResponse.arrayBuffer()).byteLength;
}

console.log(JSON.stringify({
  articles: health.articles,
  groups: health.groups,
  modelConfigured: health.textModelConfigured,
  ttsConfigured: health.ttsConfigured,
  generationMode: briefing.generationMode,
  modelStatus: briefing.modelStatus,
  audioStatus: briefing.audioStatus,
  factualSegments: factualSegments.length,
  generationMs: briefing.generationMs,
  audioBytes,
  usage: briefing.usage,
}, null, 2));

if (briefing.generationMode !== 'source-checked-model' || audioBytes < 1000) {
  process.exitCode = 1;
}
