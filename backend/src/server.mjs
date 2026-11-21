import {randomUUID} from 'node:crypto';
import { createServer } from 'node:http';
import { loadConfig } from './config.mjs';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { catalogue, replay, approvedStory, sample } from './memory.mjs';
import { candidate, eligibleGroups, editionIndex } from './editorial.mjs';
import { groupArticles, loadArticles } from './news.mjs';
import { ProviderFailure } from './providers.mjs';
import { makeScript, validateListener, NoDailyScript, auditPointers } from './briefing.mjs';
import { publishedAudio, sha256, transcript, synthesize } from './tts.mjs';

import { dailyAudioFloor, validateMinutes } from './timing.mjs';

loadConfig();

const port = Number(process.env.PORT ?? 3001);
const dataset = process.env.NEWSTEX_DATA_DIR ? await loadArticles(process.env.NEWSTEX_DATA_DIR) : [];
const { groups, diagnostics } = groupArticles(dataset);
const selectable = eligibleGroups(groups);
const windowGroups=editionIndex(dataset), active=new Set();
let story = sample;
if (process.env.MEMORY_LEDGER_FILE) {
  try {
    const ledger = JSON.parse(await readFile(process.env.MEMORY_LEDGER_FILE, 'utf8'));
    story = approvedStory(ledger, ledger.storyId === candidate.storyId
      ? dataset.filter(a => candidate.articleIds.includes(a.id)) : selectable.flat());
  } catch {
    // Do not enable a broken real timeline, or take daily news offline.
    story = null;
    console.error('Memory disabled: review the private ledger and its sources.');
  }
}
const usagePath = fileURLToPath(new URL('../../generated/usage.jsonl', import.meta.url));
const auditPath = fileURLToPath(new URL('../../generated/fact-audit.jsonl', import.meta.url));

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control':'no-store','x-content-type-options':'nosniff' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 20_000) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error();
    return input;
  } catch { throw new Error('Invalid JSON object'); }
}

async function recordUsage(record) {
  await mkdir(new URL('../../generated/', import.meta.url), {recursive:true, mode:0o700});
  await appendFile(usagePath, JSON.stringify({time:new Date().toISOString(), ...record}) + '\n', {mode:0o600});
}

function requestError(response, error) {
  const message = error instanceof Error ? error.message : '';
  if (/^Invalid |^No eligible |^No (en|de|nl) source headlines|^Request body too large|^listener is required|^language must be|^maxMinutes must be/.test(message)) {
    json(response, message === 'Request body too large' ? 413 : 400, {error: message});
  } else {
    json(response, 502, {error: 'The backend could not finish this request. Check server configuration and storage.'});
  }
}

async function safeAudio(segments, maxSeconds, daily) {
  try { return await synthesize(segments, undefined, undefined, maxSeconds,
    daily ? seconds => { daily.actualMp3DurationSeconds=seconds; } : undefined, daily ? dailyAudioFloor(maxSeconds) : 0); }
  catch (e) {
    if (daily && e instanceof ProviderFailure) daily.providerFailures.push(e.diagnostic());
    else if (daily) daily.audioFailure='local_audio_storage';
    return {audioUrl: null, ttsCharacters: 0, audioStatus: 'tts_failed'};
  }
}

const server = createServer(async (request, response) => {
  // Loopback-only app; browsers use the same-origin Vite proxy. Accept a
  // CLI with no Origin, never grant arbitrary origins access to a paid API.
  const localHost=/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;
  if (!localHost.test(request.headers.host??'') || (request.headers.origin &&
      !['http://localhost:5173','http://127.0.0.1:5173','http://'+request.headers.host].includes(request.headers.origin))) {
    json(response,403,{error:'Local listening desk only.'});return;
  }
  if(request.headers.origin) {
    response.setHeader('access-control-allow-origin',request.headers.origin);response.setHeader('vary','Origin');
  }
  if(request.method==='OPTIONS') {
    response.writeHead(204,{'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'content-type'});response.end();return;
  }
  // Form submissions from unrelated websites must not trigger paid jobs.
  if (request.method === 'POST' && !/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) {
    json(response, 415, {error: 'JSON content type required'}); return;
  }
  if (request.url === '/api/memory' && (request.method === 'GET' || request.method === 'POST')) {
    if (!story) { json(response, 503, {error: 'Memory is unavailable pending editorial review.'}); return; }
    if (request.method === 'GET') { json(response, 200, catalogue(story)); return; }
    try {
      const input = await readJson(request);
      const start = Date.now();
      const maxSeconds = input.maxMinutes == null ? Infinity : validateMinutes(input.maxMinutes) * 60;
      const edition = replay(story, input);
      const requested = input.withAudio === true && edition.segments.length > 0;
      const audio = requested && edition.estimatedDurationSeconds > maxSeconds
        ? {audioUrl:null, audioStatus:'over_time_limit', ttsCharacters:0}
        : requested ? await safeAudio(edition.segments, maxSeconds) : {audioUrl: null, audioStatus: 'not_requested', ttsCharacters: 0};
      if (audio.audioStatus !== 'not_requested') {
        await recordUsage({track:'memory', synthetic:story.synthetic, audioStatus:audio.audioStatus,
          generationMs:Date.now()-start, usageComplete:audio.audioStatus !== 'tts_failed',
          usage:{modelInputTokens:0, modelOutputTokens:0, ttsCharacters:audio.ttsCharacters}});
      }
      json(response, 200, {...edition, ...audio});
    } catch (error) { requestError(response, error); }
    return;
  }
  if (request.method === 'GET' && request.url?.startsWith('/api/memory/sources/')) {
    const u = sample.updates.find(u => u.sourceUrl === request.url);
    if (!u) { json(response, 404, {error: 'not_found'}); return; }
    response.writeHead(200, {'content-type': 'text/plain; charset=utf-8', 'x-content-type-options':'nosniff'});
    response.end(['SECOND TAKE  /  FICTIONAL SOURCE', '', u.sourceTitle, u.publishedAt, '', u.evidenceQuote,
      '', 'Written for the Memory demonstration. Not a licensed article or real news.'].join('\n'));
    return;
  }
  if (request.method === 'GET' && request.url === '/api/health') {
    json(response, 200, { status: 'ok', articles: dataset.length, heldGroups: groups.length - selectable.length, groups: groups.length, groupingDiagnostics: diagnostics, textModelConfigured: Boolean(process.env.OPENAI_API_KEY), ttsConfigured: Boolean(process.env.ELEVENLABS_API_KEY) });
    return;
  }
  if (request.method === 'GET' && request.url?.startsWith('/api/audio/')) {
    const name=request.url.slice('/api/audio/'.length);
    try {
      const bytes=await publishedAudio(name);
      if(!bytes) {json(response,404,{error:'audio_not_found'});return;}
      const headers = { 'content-type':'audio/mpeg', 'cache-control':'private, no-store',
        'x-content-type-options':'nosniff', 'accept-ranges':'bytes' };
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, bytes.length - Number(range[2]));
        const end = !range[1] || !range[2] ? bytes.length - 1 : Math.min(Number(range[2]), bytes.length - 1);
        if (start > end || start >= bytes.length) {
          response.writeHead(416, {...headers, 'content-range':`bytes */${bytes.length}`});
          response.end();
        } else {
          response.writeHead(206, {...headers, 'content-range':`bytes ${start}-${end}/${bytes.length}`, 'content-length':end-start+1});
          response.end(bytes.subarray(start,end+1));
        }
      } else {
        response.writeHead(200, {...headers, 'content-length':bytes.length});
        response.end(bytes);
      }
    } catch { json(response, 404, { error: 'audio_not_found' }); }
    return;
  }
  if (request.method === 'POST' && request.url === '/api/briefings') {
    const id=`briefing-${randomUUID()}`, start=Date.now();
    let jobKey;
    try {
      const input = await readJson(request);
      if(input.asOf!==undefined && (typeof input.asOf!=='string' || !/^\d{4}-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d))?$/.test(input.asOf) ||
        !Number.isFinite(Date.parse(input.asOf.slice(0,10))) || new Date(input.asOf.slice(0,10)).toISOString().slice(0,10)!==input.asOf.slice(0,10))) throw new Error('Invalid asOf date');
      const asOfDate=input.asOf===undefined?new Date():new Date(input.asOf);
      if (!Number.isFinite(asOfDate.getTime())) throw new Error('Invalid asOf date');
      const asOf = asOfDate.toISOString();
      if (!dataset.length) { json(response, 503, {error: 'Daily news requires the six licensed feeds. Configure NEWSTEX_DATA_DIR and restart the backend.'}); return; }
      const listener=validateListener(input.listener,true);
      const key=JSON.stringify([input.asOf===undefined?'current':asOf,listener.language,listener.depth,listener.maxMinutes,[...listener.topics].sort()]);
      if(active.has(key)) {json(response,409,{error:'This listener’s edition is already being prepared.'});return;}
      if(active.size>=3) {json(response,429,{error:'The listening desk is busy. Wait for a briefing to finish.'});return;}
      active.add(key);jobKey=key;
      const script=await makeScript(windowGroups(asOf),listener,asOf);
      const scriptMs = Date.now() - start;
      // Fail closed BEFORE even looking up audio. A verified partial or a
      // labelled headline remains useful on screen, never as a full edition.
      const requestAudio = script.qualityStatus === 'sufficient_verified_content' && script.generationMode === 'source-checked-model';
      const audio = requestAudio ? await safeAudio(script.segments, script.listener.maxMinutes * 60, script.diagnostics)
        : {audioUrl:null, audioStatus:'not_requested', ttsCharacters:0};
      const ttsMs = requestAudio ? Date.now() - start - scriptMs : 0;
      const result = {
        id,
        asOf,
        editionStatus: audio.audioUrl?'complete':requestAudio?'transcript_only':'incomplete',
        profileSummary: `${script.listener.language.toUpperCase()} · ${script.listener.topics.join(', ') || 'general'} · ${script.listener.depth}`,
        topicMatchStatus: script.topicMatchStatus,
        segments: script.segments,
        audioUrl: audio.audioUrl,
        audioSha256: audio.audioSha256??null,
        durationSeconds: audio.durationSeconds ?? null,
        estimatedDurationSeconds: script.estimatedDurationSeconds,
        generationMs: Date.now() - start,
        scriptMs,
        ttsMs,
        usage: { ...script.usage, ttsCharacters: audio.ttsCharacters },
        generationMode: script.generationMode,
        qualityStatus: script.qualityStatus,
        diagnostics: {...script.diagnostics,audioStatus:audio.audioStatus},
        modelStatus: script.modelStatus,
        repairApplied: script.repairApplied,
        usageComplete: script.usageComplete && ['cached', 'generated', 'over_time_limit', 'below_minimum_duration', 'invalid_recording', 'key_missing', 'not_requested'].includes(audio.audioStatus),
        audioStatus: audio.audioStatus,
      };
      await recordUsage({track:'daily', briefingId:id, asOf, language:script.listener.language, maxMinutes:script.listener.maxMinutes, diagnostics:result.diagnostics, qualityStatus:result.qualityStatus, generationMode:result.generationMode, modelStatus:result.modelStatus,
        audioStatus:result.audioStatus, usageComplete:result.usageComplete, generationMs:result.generationMs,
        scriptMs, ttsMs, usage:result.usage});
      await appendFile(auditPath, `${JSON.stringify({ briefingId: result.id, asOf, maxMinutes:listener.maxMinutes, profileSummary:result.profileSummary, transcriptSha256:sha256(transcript(result.segments)), audioUrl:result.audioUrl, audioSha256:result.audioSha256, factCards: auditPointers(script.factCards) })}\n`, {mode:0o600});
      json(response, 200, result);
    } catch (error) {
      if (error instanceof NoDailyScript) {
        const diagnostics={...error.diagnostics,audioStatus:'not_requested'};
        try {
          await recordUsage({track:'daily',briefingId:id,diagnostics,generationMode:diagnostics.generationMode,
            qualityStatus:diagnostics.qualityStatus,usageComplete:error.usageComplete,generationMs:Date.now()-start,usage:error.usage});
        } catch { requestError(response,new Error('Local storage unavailable')); return; }
        json(response,diagnostics.providerFailures.length?502:400,{id,error:error.message,editionStatus:'incomplete',qualityStatus:diagnostics.qualityStatus,diagnostics}); return;
      }
      requestError(response, error);
    } finally { if(jobKey) active.delete(jobKey); }
    return;
  }
  json(response, 404, { error: 'not_found' });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Second Take backend ready on http://127.0.0.1:${server.address().port} (${dataset.length} private articles)\n`);
});
