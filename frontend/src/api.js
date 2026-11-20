const backendBase = (
  import.meta.env.VITE_API_BASE_URL || window.location.origin
).replace(/\/+$/, '')

export function resolveAudioUrl(audioUrl) {
  if (!audioUrl) return null
  const url = new URL(audioUrl, `${backendBase}/`)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Unsupported audio URL')
  }
  return url.href
}

export async function requestBriefing(listener, signal) {
  const response = await fetch(`${backendBase}/api/briefings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listener }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Briefing request failed (HTTP ${response.status}).`)
  }

  const data = await response.json()
  if (!Array.isArray(data.segments)) {
    throw new Error('The backend returned an invalid briefing.')
  }

  return { ...data, audioUrl: resolveAudioUrl(data.audioUrl) }
}
