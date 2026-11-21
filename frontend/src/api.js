const base = (import.meta.env.VITE_API_BASE_URL || window.location.origin).replace(/\/+$/, '')

export function sourceHref(value) {
  if (typeof value !== 'string') return null
  if (value === '/example-source.txt') return value
  try {
    const url = /^\/api\/memory\/sources\/[a-z0-9-]+$/.test(value)
      ? new URL(value, base) : new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}

export async function api(path, body, signal) {
  const response = await fetch(base + '/api/' + path, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  } : {signal})
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || `Backend unavailable (HTTP ${response.status}).`)
  if (!data || (body && !Array.isArray(data.segments))) throw new Error('Unexpected API response.')
  if (data.audioUrl) {
    if (!/^\/api\/audio\/[a-f0-9]{24}\.mp3$/.test(data.audioUrl)) throw new Error('Invalid audio reference.')
    data.audioUrl = new URL(data.audioUrl, base).href
  }
  return data
}

export function requestBriefing(listener, signal, asOf) {
  return api('briefings', {listener, asOf}, signal)
}
