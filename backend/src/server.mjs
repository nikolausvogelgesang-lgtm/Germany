import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { groupArticles, loadArticles } from './news.mjs';
import { makeScript } from './briefing.mjs';
import { audioPath, synthesize } from './tts.mjs';

const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const port = Number(process.env.PORT ?? 3001);
const dataset = await loadArticles(process.env.NEWSTEX_DATA_DIR);
const { groups, diagnostics } = groupArticles(dataset);
const usagePath = fileURLToPath(new URL('../../generated/usage.jsonl', import.meta.url));
const auditPath = fileURLToPath(new URL('../../generated/fact-audit.jsonl', import.meta.url));

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': 'http://localhost:5173' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 20_000) throw new Error('Request body too large');
  }
  try { return JSON.parse(body); } catch { throw new Error('Invalid JSON'); }
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'access-control-allow-origin': 'http://localhost:5173', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' });
    response.end();
    return;
  }
  if (request.method === 'GET' && request.url === '/api/health') {
    json(response, 200, { status: 'ok', articles: dataset.length, groups: groups.length, groupingDiagnostics: diagnostics, textModelConfigured: Boolean(process.env.OPENAI_API_KEY), ttsConfigured: Boolean(process.env.ELEVENLABS_API_KEY) });
    return;
  }
  if (request.method === 'GET' && request.url?.startsWith('/api/audio/')) {
    const path = audioPath(request.url.slice('/api/audio/'.length));
    if (!path) { json(response, 404, { error: 'audio_not_found' }); return; }
    try {
      const bytes = await readFile(path);
      response.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=3600', 'access-control-allow-origin': 'http://localhost:5173' });
      response.end(bytes);
    } catch { json(response, 404, { error: 'audio_not_found' }); }
    return;
  }
  if (request.method === 'POST' && request.url === '/api/briefings') {
    try {
      const start = Date.now();
      const input = await readJson(request);
      const asOf = input.asOf ? new Date(input.asOf).toISOString() : new Date().toISOString();
      const script = await makeScript(groups, input.listener, asOf);
      const scriptMs = Date.now() - start;
      let audio;
      try { audio = await synthesize(script.segments); }
      catch (error) { audio = { audioUrl: null, ttsCharacters: 0, audioStatus: error.message }; }
      const ttsMs = Date.now() - start - scriptMs;
      const result = {
        id: `briefing-${Date.now()}`,
        asOf,
        profileSummary: `${script.listener.language.toUpperCase()} · ${script.listener.topics.join(', ') || 'general'} · ${script.listener.depth}`,
        segments: script.segments,
        audioUrl: audio.audioUrl,
        durationSeconds: null,
        generationMs: Date.now() - start,
        scriptMs,
        ttsMs,
        usage: { ...script.usage, ttsCharacters: audio.ttsCharacters },
        generationMode: script.generationMode,
        modelStatus: script.modelStatus,
        audioStatus: audio.audioStatus,
      };
      await mkdir(fileURLToPath(new URL('../../generated/', import.meta.url)), { recursive: true });
      await appendFile(usagePath, `${JSON.stringify({ time: new Date().toISOString(), generationMode: result.generationMode, modelStatus: result.modelStatus, audioStatus: result.audioStatus, generationMs: result.generationMs, scriptMs, ttsMs, usage: result.usage })}\n`);
      await appendFile(auditPath, `${JSON.stringify({ briefingId: result.id, asOf, profileSummary: result.profileSummary, factCards: script.factCards })}\n`);
      json(response, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      json(response, /required|Invalid|must be|No eligible|too large/.test(message) ? 400 : 502, { error: message });
    }
    return;
  }
  json(response, 404, { error: 'not_found' });
});

server.listen(port, () => {
  process.stdout.write(`Second Take backend ready on http://localhost:${port} (${dataset.length} private articles)\n`);
});
