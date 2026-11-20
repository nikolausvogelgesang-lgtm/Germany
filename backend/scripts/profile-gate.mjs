const base = process.env.BACKEND_URL || 'http://localhost:3001';
const { readFile } = await import('node:fs/promises');
const asOf = '2026-11-19T23:59:59Z';
const presets = JSON.parse(await readFile(new URL('../../shared/listener-profiles.json', import.meta.url), 'utf8'));
const profiles = [
  ...presets,
  { name: 'wildcard-energy-de', listener: { language: 'de', topics: ['Energie', 'Öl'], depth: 'brief', maxMinutes: 2 } },
];

const results = [];
for (const profile of profiles) {
  const response = await fetch(`${base}/api/briefings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ listener: profile.listener, asOf }),
  });
  const briefing = await response.json();
  if (!response.ok) throw new Error(`${profile.name}: HTTP ${response.status}: ${briefing.error}`);
  const facts = briefing.segments.filter((item) => item.factIds.length);
  if (facts.length < 2 || facts.some((item) => !item.sources.length || item.sources.some((source) => !source.url))) {
    throw new Error(`${profile.name}: incomplete or unsourced briefing`);
  }
  if (!briefing.audioUrl) throw new Error(`${profile.name}: no audio`);
  const audio = await fetch(`${base}${briefing.audioUrl}`);
  if (!audio.ok || !audio.headers.get('content-type')?.includes('audio/mpeg')) throw new Error(`${profile.name}: audio unavailable`);
  results.push({
    name: profile.name,
    mode: briefing.generationMode,
    facts: facts.length,
    sourceIds: facts.flatMap((item) => item.sources.map((source) => source.articleId)),
    scriptMs: briefing.scriptMs,
    ttsMs: briefing.ttsMs,
    totalMs: briefing.generationMs,
    audioStatus: briefing.audioStatus,
    usage: briefing.usage,
  });
}

const overlap = new Set(results[0].sourceIds).intersection(new Set(results[1].sourceIds)).size;
if (overlap === results[0].sourceIds.length && overlap === results[1].sourceIds.length) {
  throw new Error('The two listener profiles selected the same stories');
}
console.log(JSON.stringify({ asOf, overlap, results }, null, 2));
