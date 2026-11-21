// Plan conservatively; the MP3 frame clock (not this estimate) gates playback.
export const WORDS_PER_MINUTE = 140;
export const wordCount = text => text.trim().split(/\s+/u).filter(Boolean).length;
export const wordBudget = minutes => Math.floor(Math.min(minutes, 3) * 128);
export const estimatedSeconds = segments => Math.ceil(segments.reduce((n,s) => n + wordCount(s.text), 0) * 60 / WORDS_PER_MINUTE);

// Daily scripts use at most the three-minute planning budget even for larger
// caps. Shorter custom editions keep their existing cap; Memory has no floor.
export const dailyAudioFloor = maxSeconds => maxSeconds >= 180 ? 60 : 0;
export function durationFailure(timing, maxSeconds, minSeconds = 0) {
  if (!timing || timing.playableSeconds <= 0) return 'invalid_recording';
  if (timing.playableSeconds > maxSeconds) return 'over_time_limit';
  if (timing.playableSeconds < minSeconds) return 'below_minimum_duration';
  return null;
}

export function validateMinutes(value) {
  const minutes=value===undefined?3:typeof value==='number'||typeof value==='string'&&value.trim()?Number(value):NaN;
  if (!Number.isFinite(minutes) || minutes < 0.5 || minutes > 10) throw new Error('maxMinutes must be between 0.5 and 10');
  return minutes;
}

// A Xing/Info header frame is not played. For LAME / FFmpeg gapless MP3s,
// decoders also discard the encoder delay and end padding (12 bits each).
// Never use a tag's declared file length/frame count to pass the gate.
function presentationSamples(bytes, first, frameEnd, end, frames) {
  const total=frames*1152;
  const sideInfo=(bytes[first+3]>>6)===3?17:32;
  const base=first+4+sideInfo;
  // LAME retains the usual tag offset even on CRC-protected header frames.
  const offsets=(bytes[first+1]&1)?[base]:[base,base+2];
  const tag=offsets.find(i=>i+8<=frameEnd && ['Info','Xing'].includes(bytes.toString('latin1',i,i+4)));
  if (tag===undefined) return total;
  const flags=bytes.readUInt32BE(tag+4);
  // These counters NEVER substitute for walking frames. They can disprove
  // completeness, including a download cut exactly on a frame boundary.
  if (flags & ~15) return 0;
  let cursor=tag+8;
  for (const [bit,actual] of [[1,frames-1],[2,end-first]]) if (flags & bit) {
    if (cursor+4>frameEnd || bytes.readUInt32BE(cursor)!==actual) return 0;
    cursor+=4;
  }
  const encoder=tag+8+((flags&1)?4:0)+((flags&2)?4:0)+((flags&4)?100:0)+((flags&8)?4:0);
  if (encoder>frameEnd) return 0; // malformed tag
  let samples=total-1152;
  if (encoder+24<=frameEnd && /^(LAME|Lavc|Lavf)$/.test(bytes.toString('latin1',encoder,encoder+4))) {
    const trim=bytes.readUIntBE(encoder+21,3);
    samples-=(trim>>12)+(trim&0xfff);
  }
  return samples;
}

// Walk complete frames of the requested ElevenLabs MPEG-1 Layer III / 44.1 kHz
// format. Count samples rather than dividing file size (ID3, padding, VBR).
// Includes encoder padding: a conservative upper bound on presentation time.
export function measureMp3(bytes) {
  let i = 0, frames = 0, end = bytes.length;
  if (bytes.toString('ascii', 0, 3) === 'ID3') {
    const size = bytes.subarray(6, 10);
    if (size.length !== 4 || size.some(b => b > 127)) return null;
    i = 10 + size.reduce((n,b) => n * 128 + b, 0) + (bytes[3] === 4 && (bytes[5] & 16) ? 10 : 0);
  }
  if (end >= 128 && bytes.toString('ascii',end-128,end-125) === 'TAG') end -= 128;
  const kbps = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0];
  const first=i; let frameEnd;
  while (i + 4 <= end) {
    if (bytes[i] !== 255 || (bytes[i+1] & 254) !== 250 || (bytes[i+2] & 12) !== 0) return null;
    const rate = kbps[bytes[i+2] >> 4];
    if (!rate) return null;
    i += Math.floor(144000 * rate / 44100) + ((bytes[i+2] >> 1) & 1);
    if (!frames) frameEnd=i;
    frames++;
  }
  if (frames < 2 || i !== end) return null;
  const samples=presentationSamples(bytes,first,frameEnd,end,frames);
  return samples>0 ? {frameSeconds:frames*1152/44100, playableSeconds:samples/44100} : null;
}

// Compatible recorded frame clock, including encoder padding.
export const mp3Seconds = bytes => measureMp3(bytes)?.frameSeconds ?? null;
