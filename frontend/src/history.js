// A profile is a preset ID, or an exact normalized wildcard configuration.
// Keep an array of semantic IDs, never responses, source passages or media.
export function profileKey(selected, listener) {
  if (selected !== 'custom') return selected
  const topics = [...new Set(listener.topics.map(t => t.toLowerCase().trim()).filter(Boolean))].sort()
  return 'custom:' + JSON.stringify([listener.language, topics, listener.depth, listener.maxMinutes])
}
export const historyKey = (profile, story) => 'second-take:v1:' + JSON.stringify([profile, story])
const clean = ids => Array.isArray(ids)
  ? [...new Set(ids.filter(s => typeof s === 'string' && /^[a-z0-9-]{1,80}$/.test(s)))].slice(-100) : []
export function readHistory(key, store = window.localStorage) {
  const value = store.getItem(key)
  try { return clean(JSON.parse(value)) } catch { return [] }
}
export function markHeard(key, ids, store = window.localStorage) {
  const next = clean([...readHistory(key, store), ...clean(ids)])
  store.setItem(key, JSON.stringify(next))
  return next
}
export function resetHistory(key, store = window.localStorage) { store.removeItem(key); return [] }
