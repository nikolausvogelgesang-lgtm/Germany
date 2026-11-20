import { createHash } from 'node:crypto';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUDIO_DIR = new URL('../../generated/audio/', import.meta.url);

export async function synthesize(segments, apiKey = process.env.ELEVENLABS_API_KEY) {
  if (!apiKey) return { audioUrl: null, ttsCharacters: 0, audioStatus: 'key_missing' };
  const text = segments.map((segment) => segment.text).join('\n\n');
  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
  const modelId = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';
  const id = createHash('sha256').update(`${voiceId}:${modelId}:${text}`).digest('hex').slice(0, 24);
  const filename = `${id}.mp3`;
  await mkdir(AUDIO_DIR, { recursive: true });
  try {
    await stat(new URL(filename, AUDIO_DIR));
    return { audioUrl: `/api/audio/${filename}`, ttsCharacters: text.length, audioStatus: 'cached' };
  } catch { /* generation needed */ }
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: modelId }),
  });
  if (!response.ok) throw new Error(`ElevenLabs TTS request failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000) throw new Error('ElevenLabs returned an unexpectedly short audio file');
  await writeFile(new URL(filename, AUDIO_DIR), bytes);
  return { audioUrl: `/api/audio/${filename}`, ttsCharacters: text.length, audioStatus: 'generated' };
}

export function audioPath(filename) {
  if (!/^[a-f0-9]{24}\.mp3$/.test(filename)) return null;
  return join(fileURLToPath(AUDIO_DIR), filename);
}
