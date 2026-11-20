import { useState } from 'react'
import profiles from '../../shared/listener-profiles.json'
import example from './briefing.synthetic.json'
import { requestBriefing } from './api'

function safeSourceUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export default function App() {
  const [selected, setSelected] = useState(profiles[0].id)
  const [custom, setCustom] = useState({
    language: 'en', topics: '', depth: 'brief', maxMinutes: 2,
  })
  const [result, setResult] = useState(null)
  const [synthetic, setSynthetic] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [audioError, setAudioError] = useState(false)
  const [duration, setDuration] = useState(null)
  const [latency, setLatency] = useState(null)

  function clearResult() {
    setResult(null)
    setSynthetic(false)
    setError('')
    setAudioError(false)
    setDuration(null)
    setLatency(null)
  }

  function choose(id) {
    clearResult()
    setSelected(id)
  }

  function update(event) {
    const { name, value } = event.target
    clearResult()
    setCustom(previous => ({ ...previous, [name]: value }))
  }

  async function generate(event) {
    event.preventDefault()
    clearResult()

    const listener = selected === 'custom'
      ? {
          language: custom.language,
          topics: custom.topics.split(',').map(t => t.trim()).filter(Boolean),
          depth: custom.depth,
          maxMinutes: Number(custom.maxMinutes),
        }
      : profiles.find(profile => profile.id === selected).listener

    if (!listener.topics.length) {
      setError('Please enter at least one topic.')
      return
    }

    setLoading(true)
    const started = performance.now()
    try {
      const data = await requestBriefing(listener)
      setResult(data)
      setLatency((performance.now() - started) / 1000)
    } catch (failure) {
      setError(
        `${failure.message || 'Connection failed.'} Check the backend connection and try again.`
      )
    } finally {
      setLoading(false)
    }
  }

  function showExample() {
    clearResult()
    setResult(example)
    setSynthetic(true)
  }

  return (
    <main>
      <header>
        <p className="label">PERSONAL AUDIO BRIEFINGS</p>
        <h1>Second Take</h1>
        <p>Don't repeat the news. Tell me what's changed.</p>
        <p>Personalized financial news with sentence-by-sentence sources.</p>
        <p>AI-generated voice · Not investment advice.</p>
        <p>Listening history and returning-listener updates are not enabled.</p>
      </header>

      <form className="card" onSubmit={generate}>
        <h2>Choose a listener</h2>
        <fieldset disabled={loading}>
          <legend>Listener profiles</legend>
          {profiles.map(profile => (
            <button
              key={profile.id}
              type="button"
              aria-pressed={selected === profile.id}
              onClick={() => choose(profile.id)}
            >
              {selected === profile.id ? '✓ ' : ''}{profile.name}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={selected === 'custom'}
            onClick={() => choose('custom')}
          >
            {selected === 'custom' ? '✓ ' : ''}Custom listener
          </button>

          {selected === 'custom' ? (
            <div className="fields">
              <label>Language
                <select name="language" value={custom.language} onChange={update}>
                  <option value="en">English</option>
                  <option value="de">German</option>
                  <option value="nl">Dutch</option>
                </select>
              </label>
              <label>Topics, separated by commas
                <input
                  name="topics"
                  value={custom.topics}
                  onChange={update}
                  placeholder="Energy, oil"
                  required
                />
              </label>
              <label>Depth
                <select name="depth" value={custom.depth} onChange={update}>
                  <option value="brief">Brief</option>
                  <option value="deep">Deep</option>
                </select>
              </label>
              <label>Maximum minutes
                <input
                  name="maxMinutes"
                  type="number"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={custom.maxMinutes}
                  onChange={update}
                  required
                />
              </label>
            </div>
          ) : (
            <p>
              Selected: {profiles.find(p => p.id === selected).name}
              {' · '}
              {profiles.find(p => p.id === selected).listener.language}
              {' · '}
              {profiles.find(p => p.id === selected).listener.topics.join(', ')}
              {' · brief · up to '}
              {profiles.find(p => p.id === selected).listener.maxMinutes} min
            </p>
          )}

          <button type="submit">
            {loading ? 'Generating…' : error ? 'Retry briefing' : 'Generate briefing'}
          </button>
        </fieldset>
        {loading && <p role="status">Generating a fresh briefing and audio…</p>}
        {error && <p role="alert">{error}</p>}
      </form>

      <button type="button" disabled={loading} onClick={showExample}>
        Show fictional interface example — not real news
      </button>

      {result && !loading && (
        <section className="card" aria-label="Briefing">
          {synthetic && (
            <p className="badge">SYNTHETIC EXAMPLE — fictional, not Newstex output</p>
          )}
          <h2>{result.profileSummary || 'Your briefing'}</h2>
          {result.asOf && <p>Edition: {result.asOf}</p>}
          {latency !== null && (
            <p>Measured request time: {latency.toFixed(1)} seconds</p>
          )}
          {result.generationMode === 'source-headline-fallback' && (
            <p className="badge">
              Some stories use attributed source headlines where a spoken claim did not pass verification.
            </p>
          )}
          {result.topicMatchStatus === 'general-fallback' && (
            <p className="badge">
              general-fallback — no clear topic match; this is general news.
            </p>
          )}

          {result.audioUrl && !synthetic ? (
            <>
              <p>AI-generated voice</p>
              <audio
                key={`${result.id}-${result.audioUrl}`}
                controls
                preload="metadata"
                src={result.audioUrl}
                onLoadedMetadata={event => {
                  const seconds = event.currentTarget.duration
                  setDuration(Number.isFinite(seconds) ? seconds : null)
                }}
                onError={() => setAudioError(true)}
              />
              {duration !== null && (
                <p>Audio duration: {Math.round(duration)} seconds</p>
              )}
              {audioError && (
                <p role="alert">Audio could not be played. Retry generation or check the backend.</p>
              )}
            </>
          ) : (
            <p role="status">
              {synthetic
                ? 'This fictional example has no audio.'
                : 'Audio unavailable. This briefing is not ready for an audio demo.'}
            </p>
          )}

          <h2>Transcript and sources</h2>
          <ol>
            {result.segments.map((segment, index) => (
              <li key={index}>
                <p>{segment.text}</p>
                <ul>
                  {(segment.sources || []).map((source, sourceIndex) => {
                    const href = safeSourceUrl(source.url)
                    return (
                      <li key={`${source.articleId || 'source'}-${sourceIndex}`}>
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer">
                            {source.title || 'Source article'} ↗
                          </a>
                        ) : <span>Source link unavailable: {source.title}</span>}
                      </li>
                    )
                  })}
                </ul>
                {segment.factIds?.length > 0 && !segment.sources?.length && (
                  <p role="alert">Source missing for this factual segment.</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  )
}
