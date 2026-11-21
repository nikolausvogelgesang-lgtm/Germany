import {useEffect, useRef, useState} from 'react'
import profiles from '../../shared/listener-profiles.json'
import example from './briefing.synthetic.json'
import {requestBriefing} from './api'
import {profileKey} from './history'
import Memory from './Memory'
import {DateStamp, hasRecording, languageName, Player, Sentences, useRequestFocus} from './Reading'

const archive = '2026-11-19T23:59:59Z'
const subjects = {'fx-trader': 'Currencies & central banks', 'dutch-ai-investor': 'AI & cloud'}
const editionKey = (selected, listener, cutoff) => 'second-take-edition:' + JSON.stringify([selected, listener, cutoff])

function savedEdition(key) {
  try {
    const result = JSON.parse(window.sessionStorage.getItem(key))
    const audio = new URL(result?.audioUrl)
    return result?.editionStatus === 'complete' && result?.qualityStatus === 'sufficient_verified_content' &&
      Array.isArray(result.segments) && audio.origin === window.location.origin &&
      /^\/api\/audio\/[a-f0-9]{24}\.mp3$/.test(audio.pathname) ? {...result, restoredFromSession: true} : null
  } catch { return null }
}

function rememberEdition(key, result) {
  if (!key || result?.editionStatus !== 'complete' || result?.qualityStatus !== 'sufficient_verified_content') return
  try { window.sessionStorage.setItem(key, JSON.stringify(result)) } catch { /* storage is optional */ }
}

function scriptState(result) {
  if (!result.segments.length) return {label: 'No transcript available'}
  if (result.generationMode === 'source-headline-fallback') {
    const kinds = result.segments.filter(s => s.sources?.length).map(s => s.kind)
    const kind = result.diagnostics?.fallbackKind
    const description = kind === 'headlines_only' || (kinds.length && kinds.every(k => k === 'headline'))
      ? 'Only attributed source headlines are available.'
      : kind === 'verified_and_headlines' || kinds.includes('headline')
        ? 'The partial script includes attributed source headlines.'
        : 'Only part of the planned briefing passed source checks.'
    return {label: 'Incomplete verified content', detail: description}
  }
  if (result.qualityStatus === 'insufficient_verified_content')
    return {label: 'Incomplete verified content', detail: 'There is not enough verified reporting for a full edition.'}
  if (result.qualityStatus === 'sufficient_verified_content')
    return {label: 'Verified script ready', withAudio: 'Verified briefing ready'}
  return {label: 'Script available', detail: 'Full-briefing verification is unconfirmed.'}
}

function Listener({selected, onSelect, custom, onEdit, topicsOK, minutesOK, daily}) {
  return <aside className="listener" aria-labelledby="listener-heading">
    <h2 id="listener-heading" className="rail-title">{daily ? 'Choose a listener' : 'Listening history for'}</h2>
    <div className="presets" role="group" aria-label="Listener presets">
      {profiles.map(p => <button key={p.id} className="preset" aria-label={p.name}
        aria-pressed={selected === p.id} onClick={() => onSelect(p.id)}>
        <span className="choice-dot" aria-hidden="true"/>
        <span className="preset-name">{p.name}</span>
      </button>)}
    </div>
    <button className="custom-choice" aria-pressed={selected === 'custom'} onClick={() => onSelect('custom')}>
      <span aria-hidden="true">{selected === 'custom' ? '✓' : '+'}</span> Custom listener
    </button>
    {selected === 'custom' && <fieldset className="custom-fields">
      <legend className="sr-only">Custom listener preferences</legend>
      <label className="wide">Topics (comma-separated)
        <input name="topics" value={custom.topics} onChange={onEdit} maxLength={310} placeholder="e.g. energy, oil"
          aria-invalid={!topicsOK} aria-describedby={!topicsOK ? 'topics-help' : undefined}/>
      </label>
      {!topicsOK && <p className="field-note wide" id="topics-help">Enter 1–6 topics, up to 50 characters each.</p>}
      <label><span id="custom-language-label">Language</span><select aria-labelledby="custom-language-label" name="language" value={custom.language} onChange={onEdit}>
        <option value="en">English</option><option value="de">German</option><option value="nl">Dutch</option>
      </select></label>
      <label><span id="custom-depth-label">Depth</span><select aria-labelledby="custom-depth-label" name="depth" value={custom.depth} onChange={onEdit}>
        <option value="brief">Brief</option><option value="deep">Deep</option>
      </select></label>
      <label className="wide">Maximum minutes
        <input name="maxMinutes" type="number" min=".5" max="10" step="any" value={custom.maxMinutes} onChange={onEdit}
          aria-invalid={!minutesOK} aria-describedby={!minutesOK ? 'minutes-help' : undefined}/>
      </label>
      {!minutesOK && <p className="field-note wide" id="minutes-help">Choose a limit between 0.5 and 10 minutes.</p>}
    </fieldset>}
  </aside>
}

const minutesSeconds = seconds => {
  const n = Math.ceil(seconds)
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}

function Production({result, selected}) {
  function saveReview() {
    // Save just the public edition, never a private evidence passage or token.
    const copy={...result,audioUrl:result.audioUrl ? new URL(result.audioUrl).pathname : null}
    const url=URL.createObjectURL(new Blob([JSON.stringify(copy,null,2)],{type:'application/json'}))
    const a=document.createElement('a')
    a.href=url; a.download=selected+'.json'; a.click()
    window.setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  return <details className="production">
    <summary>Production details</summary>
    <dl>
      <div><dt>Edition cutoff (UTC)</dt><dd>{result.asOf || 'Not supplied'}</dd></div>
      {result.profileSummary && <div><dt>Listener</dt><dd>{result.profileSummary}</dd></div>}
      {Number.isFinite(result.estimatedDurationSeconds) && <div><dt>Script estimate</dt><dd>≈ {minutesSeconds(result.estimatedDurationSeconds)}</dd></div>}
      {hasRecording(result) && Number.isFinite(result.durationSeconds) && <div><dt>Recording length</dt><dd>{minutesSeconds(result.durationSeconds)}</dd></div>}
      {Number.isFinite(result.generationMs) && <div><dt>Generation time</dt><dd>{(result.generationMs / 1000).toFixed(1)} s</dd></div>}
      {Number.isFinite(result.usage?.ttsCharacters) && <div><dt>Voice characters this request</dt><dd>{result.usage.ttsCharacters}</dd></div>}
      {typeof result.repairApplied === 'boolean' && <div><dt>Repair draft</dt><dd>{result.repairApplied ? 'Used' : 'Not used'}</dd></div>}
      {result.usageComplete === false && <div><dt>Usage figures</dt><dd>Partial</dd></div>}
    </dl>
    <button className="text-action" onClick={saveReview}>Save private review copy (.json)</button>
  </details>
}

function Daily({listener, selected, valid, active, cutoff, setCutoff}) {
  const key = cutoff ? editionKey(selected, listener, cutoff) : null
  const [result, setResult] = useState(() => key ? savedEdition(key) : null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)
  const pending = useRef(null)
  const [resultRegion, rememberFocus] = useRequestFocus(loading)
  useEffect(() => () => pending.current?.abort(), [])

  async function generate(event) {
    if (!valid || pending.current) return
    rememberFocus(event)
    const ctrl = new AbortController()
    pending.current = ctrl
    setResult(null); setPreview(false); setError(''); setLoading(true)
    try {
      const data = await requestBriefing(listener, ctrl.signal, cutoff || undefined)
      if (!ctrl.signal.aborted) { rememberEdition(key, data); setResult(data) }
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e.message?.includes('six licensed feeds')
        ? 'The six licensed feeds are not connected. You can still open the fictional example below.'
        : e.message || 'Check your connection and try again.')
    } finally {
      if (!ctrl.signal.aborted) {pending.current = null; setLoading(false)}
    }
  }
  function changeWindow(e) {
    setCutoff(e.target.value); setResult(null); setPreview(false); setError('')
  }

  // Keep this listener's purchased result across track switches, never its player.
  if (!active) return null
  const title = subjects[selected] || listener.topics.slice(0,2).join(' & ') || 'Custom briefing'
  const [state, note] = loading
    ? ['Generating your briefing', 'Checking sources and preparing audio…']
    : error ? ['Briefing unavailable', '']
      : ['Personal audio briefing', valid ? 'Selected from licensed financial reporting.' : 'Finish your listener settings to generate a briefing.']

  return <article className="daily workspace" aria-label="Today’s briefing">
    <section className={'jacket' + (hasRecording(result) ? ' recorded' : '')} aria-labelledby="edition-title">
      <header className="edition-cover">
        <label className="window-control">
          <span className="sr-only">Edition window</span>
          <select value={cutoff} disabled={loading} onChange={changeWindow}>
            <option value={archive}>Archive edition</option>
            <option value="">Current edition</option>
          </select>
        </label>
        <DateStamp value={result?.asOf || cutoff}/>
        <h2 id="edition-title">{title}</h2>
        <p className="cover-meta">{languageName(listener.language)}<span className="meta-divider" aria-hidden="true"/>
          {valid ? `Up to ${listener.maxMinutes} min` : 'Custom listener'}
        </p>
      </header>
      <div className="jacket-base" ref={resultRegion} tabIndex="-1" role="region" aria-label="Briefing audio">
        {result ? <><Player key={result.id || result.asOf} result={result} title={title} script={scriptState(result)}/>
            {result.restoredFromSession && <p className="saved-note">Previously prepared in this tab.</p>}</>
          : <div className="request-row">
              <div className={'request-state' + (loading ? ' busy' : '')} role="status">
                <span>{state}</span>{note && <small>{note}</small>}
              </div>
              <button className="action" disabled={loading || !valid} onClick={generate}>
                {loading ? 'Generating…' : error ? 'Retry briefing' : 'Generate briefing'}
                {!loading && <span className="arrow" aria-hidden="true">→</span>}
              </button>
            </div>}
        {error && <p className="request-error" role="alert">{error}</p>}
      </div>
    </section>

    <section className="transcript" aria-labelledby="transcript-heading">
      <header className="transcript-head">
        <div>
          <h3 id="transcript-heading">{preview ? 'Fictional transcript' : 'Transcript & sources'}</h3>
          <p className="caption">{result ? 'Source checks are automated, not editorial approval.'
            : preview ? 'Interface example only · Not real news · No audio'
              : loading ? 'Waiting for the source checks to finish…'
                : 'Your script will appear here with links to the original reporting.'}</p>
        </div>
        {result ? <button className="text-action" onClick={generate}>Generate again</button>
          : <button className="text-action" aria-expanded={preview} disabled={loading} onClick={() => setPreview(!preview)}>
              {preview ? 'Close example' : 'View a fictional interface example'}
            </button>}
      </header>
      {result && <><Sentences segments={result.segments} language={listener.language}/><Production result={result} selected={selected}/></>}
      {preview && <Sentences segments={example.segments} language="en"/>}
    </section>
  </article>
}

export default function App() {
  const [track, setTrack] = useState('daily')
  const [selected, setSelected] = useState(profiles[0].id)
  const [cutoff, setCutoff] = useState(archive)
  const [custom, setCustom] = useState({language: 'en', topics: '', depth: 'brief', maxMinutes: 3})
  function edit(e) {
    const {name, value} = e.target
    setCustom(prev => ({...prev, [name]: value}))
  }
  const preset = profiles.find(p => p.id === selected)
  const customListener = {...custom, topics: custom.topics.split(',').map(t => t.trim()).filter(Boolean), maxMinutes: Number(custom.maxMinutes)}
  const listener=preset?.listener || customListener
  const topicsOK = listener.topics.length > 0 && listener.topics.length <= 6 && listener.topics.every(t => t.length <= 50)
  const minutesOK = listener.maxMinutes >= 0.5 && listener.maxMinutes <= 10
  const valid = topicsOK && minutesOK
  const daily = track === 'daily'

  return <div className="app">
    <a className="skip" href="#listening-desk">Skip to listening desk</a>
    <header className="mast">
      <div className="wrap nameplate">
        <h1><svg aria-hidden="true" viewBox="0 0 36 36" fill="none">
          <path d="M4 25V5h23M12 14h20v17H12z" stroke="currentColor" strokeWidth="4"/>
        </svg>Second Take</h1>
        <p className="promise">Don’t repeat the news. <strong>Tell me what’s changed.</strong></p>
      </div>
    </header>
    <div className="nav-rule"><nav className="wrap tracks" aria-label="Listening experience">
      <button aria-pressed={daily} onClick={() => setTrack('daily')}>Today’s briefing</button>
      <button aria-pressed={!daily} onClick={() => setTrack('memory')}>What’s changed</button>
    </nav></div>
    <main className="wrap desk" id="listening-desk" tabIndex="-1">
      <Listener selected={selected} onSelect={setSelected} custom={custom} onEdit={edit}
        topicsOK={topicsOK} minutesOK={minutesOK} daily={daily}/>
      {/* Three small session slots, never three players. An in-flight paid
          job survives a listener switch; inactive desks render no media. */}
      {[...profiles,{id:'custom',listener:customListener}].map(p=>
        <Daily key={JSON.stringify([p.id,p.listener,cutoff])} active={daily && selected===p.id}
          listener={p.listener} selected={p.id} cutoff={cutoff} setCutoff={setCutoff} valid={p.id!=='custom' || valid}/>)}
      {!daily && (valid ? <Memory profile={profileKey(selected, listener)} maxMinutes={listener.maxMinutes}/>
        : <section className="empty workspace"><h2>What’s changed</h2><p>Finish your listener settings to open this story’s history.</p></section>)}
    </main>
    <footer className="wrap colophon"><span>Second Take <span aria-hidden="true">/</span> Financial audio</span>
      <span>Not investment advice</span></footer>
  </div>
}
