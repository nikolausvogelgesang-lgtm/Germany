import {useEffect, useRef, useState} from 'react'
import {api} from './api'
import {editionDate, hasRecording, languageName, Player, Sentences, sourceIndex, useRequestFocus} from './Reading'
import {historyKey, markHeard, readHistory, resetHistory} from './history'

function HistoryNote({segments, language, caughtUp, references}) {
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 46rem)').matches)
  return <aside className="previous">
    <details open={open} onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>Previously heard</summary>
      <p className="caption">{caughtUp ? 'Saved for this listener.' : 'Not in this edition’s script.'}</p>
      <Sentences language={language} segments={segments} index={references} compact/>
    </details>
  </aside>
}

async function fetchEdition(story, asOf, heard, maxMinutes, withAudio, signal) {
  const data = await api('memory', {storyId: story.storyId, asOf, heardUpdateIds: heard, maxMinutes, withAudio}, signal)
  if (data.storyId !== story.storyId || Date.parse(data.asOf) !== Date.parse(asOf) || data.synthetic !== story.synthetic)
    throw new Error('The timeline changed. Reopen What’s changed to load the current story.')
  if (!Array.isArray(data.updateIds) || !Array.isArray(data.previouslyHeard) || !['catch-up', 'continuation', 'no-change'].includes(data.kind))
    throw new Error('This edition could not be read. Try opening it again.')
  return data
}

function Edition({story, asOf, heard, onMark, maxMinutes, hasNext}) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [preparing, setPreparing] = useState(false)
  const [requested, setRequested] = useState(false)
  const audioJob = useRef(null)
  const [resultRegion, rememberFocus] = useRequestFocus(preparing)

  useEffect(() => {
    const ctrl = new AbortController()
    fetchEdition(story, asOf, heard, maxMinutes, false, ctrl.signal)
      .then(data => {if (!ctrl.signal.aborted) setResult(data)})
      .catch(e => {if (!ctrl.signal.aborted) setError(e.message)})
    return () => {ctrl.abort(); audioJob.current?.abort()}
  }, [story, asOf, heard, maxMinutes, attempt])

  async function listen(event) {
    if (audioJob.current) return
    rememberFocus(event)
    const ctrl = new AbortController()
    audioJob.current = ctrl
    setPreparing(true); setRequested(true); setError('')
    try {
      const data = await fetchEdition(story, asOf, heard, maxMinutes, true, ctrl.signal)
      if (!ctrl.signal.aborted) setResult(data)
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e.message || 'The recording could not be requested.')
    } finally {
      if (!ctrl.signal.aborted) {audioJob.current = null; setPreparing(false)}
    }
  }

  if (!result) return error
    ? <div className="fetch-error"><p role="alert">{error}</p><button className="secondary" onClick={() => {setError(''); setAttempt(n => n + 1)}}>Retry edition</button></div>
    : <p className="opening" role="status">Opening this edition…</p>

  const changed = result.kind === 'continuation'
  const caughtUp = result.kind === 'no-change'
  const previous = result.previouslyHeard.length > 0
  const playable = hasRecording(result)
  const showPlayer = !preparing && !error && (requested || result.audioStatus !== 'not_requested')
  const retryable = !['over_time_limit', 'below_minimum_duration'].includes(result.audioStatus)
  const count = result.updateIds.length
  const references = sourceIndex([...result.previouslyHeard, ...result.segments])
  return <div className={'edition-body' + (previous ? ' with-history' : '')}>
    {caughtUp ? <section className="caught-up" role="status">
      <h3>All caught up</h3>
      <p>Nothing new in this edition since your last listen.</p>
      {hasNext && <p className="caption">Open the next edition to continue.</p>}
    </section> : <h3 id="update-heading" className={'edition-heading' + (changed ? ' delta' : '')}>
      {changed ? 'New since your last listen' : <>Catch-up edition <small>· {count} {count === 1 ? 'development' : 'developments'}</small></>}
    </h3>}
    {previous && <HistoryNote segments={result.previouslyHeard} language={story.language} caughtUp={caughtUp} references={references}/>}
    {!caughtUp && <section className="current" aria-labelledby="update-heading" tabIndex="-1" ref={resultRegion}>
      {!playable && retryable && <div className="listen-row">
        <button className={requested && !preparing ? 'secondary' : 'action'} disabled={preparing} onClick={listen}>
          {!preparing && <span className="play-glyph" aria-hidden="true"/>}
          {preparing ? 'Preparing audio…' : requested ? 'Retry recording' : changed ? "Listen to what's changed" : 'Listen to this edition'}
        </button>
        {!requested && <span className="caption">{languageName(story.language)} · AI voice</span>}
        {preparing && <span role="status" className="caption">Recording the script…</span>}
      </div>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {showPlayer && <div className={playable ? 'memory-player' : 'unavailable'}>
        <Player result={result} title={story.title} autoPlay={requested}/>
      </div>}
      <Sentences language={story.language} segments={result.segments} index={references} compact/>
      <button className="secondary mark" disabled={preparing || !count} onClick={() => onMark(result.updateIds)}>Mark as heard</button>
    </section>}
  </div>
}

function Timeline({story, profile, maxMinutes, entering}) {
  const key = historyKey(profile, story.storyId)
  const stops = useRef([])
  const [index, setIndex] = useState(0)
  const [storageError, setStorageError] = useState('')
  const [heard, setHeard] = useState(() => {try {return readHistory(key)} catch {return []}})

  useEffect(() => {
    function sync(e) {
      if (e && e.key !== key && e.key !== null) return
      try {
        const ids = readHistory(key)
        setHeard(old => JSON.stringify(old) === JSON.stringify(ids) ? old : ids)
        setStorageError('')
      } catch {setStorageError('Browser storage is unavailable. Your history cannot be saved.')}
    }
    sync()
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [key])

  useEffect(() => {
    if (entering.current) {stops.current[0]?.focus(); entering.current = false}
  }, [entering])

  function change(save, focusIndex) {
    try {
      setHeard(save()); setStorageError(''); stops.current[focusIndex]?.focus()
    } catch {setStorageError('History was not changed. Allow browser storage and try again.')}
  }
  const last = story.editions.length - 1
  return <article className="timeline workspace" aria-labelledby="story-title">
    <header className="story-head">
      <p className={'editorial' + (story.synthetic ? ' rehearsal' : '')}>
        {story.synthetic ? 'Fictional rehearsal · Not real news' : 'Editorially approved timeline'}
      </p>
      <h2 id="story-title" lang={story.language}>{story.title}</h2>
      {!heard.length && <p className="caption">Mark the earlier edition as heard, then open the next to hear only the change.</p>}
    </header>
    <div className="editions" role="group" aria-label="Story edition">
      {story.editions.map((date, i) => <button key={date} ref={el => {stops.current[i] = el}}
        aria-pressed={index === i} onClick={() => setIndex(i)}>
        <span className="edition-order">{i === 0 ? 'FIRST EDITION' : 'NEXT EDITION'}</span>
        <time dateTime={date}>{editionDate(date)}</time>
      </button>)}
    </div>
    {storageError && <p className="inline-error" role="alert">{storageError}</p>}
    <Edition key={index + ':' + JSON.stringify(heard)} asOf={story.editions[index]} story={story} heard={heard}
      maxMinutes={maxMinutes} hasNext={index < last}
      onMark={ids => change(() => markHeard(key, ids), Math.min(last, index + 1))}/>
    <footer className="history-foot">
      <p>History stays with this listener and story in this browser.</p>
      <button className="text-action" disabled={!heard.length} onClick={() => change(() => resetHistory(key), index)}>Reset listening history</button>
    </footer>
  </article>
}

export default function Memory({profile, maxMinutes}) {
  const [story, setStory] = useState(null)
  const [error, setError] = useState('')
  const [rehearse, setRehearse] = useState(false)
  const entering = useRef(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const ctrl = new AbortController()
    api('memory', null, ctrl.signal).then(s => {
      if (typeof s.synthetic !== 'boolean' || !s.storyId || !s.title || !s.editions?.length)
        throw new Error('No reviewed timeline is available.')
      if (!ctrl.signal.aborted) setStory(s)
    }).catch(e => {if (!ctrl.signal.aborted) setError(e.message)})
    return () => ctrl.abort()
  }, [attempt])

  if (error) return <section className="workspace fetch-error">
    <h2>Story unavailable</h2><p role="alert">{error}</p>
    <button className="secondary" onClick={() => {setError(''); setAttempt(n => n + 1)}}>Retry story</button>
  </section>
  if (!story) return <p className="workspace opening" role="status">Opening the timeline…</p>
  if (story.synthetic && !rehearse) return <article className="workspace gate">
    <h2>One story, two editions.</h2>
    <p className="gate-intro">Mark the earlier reporting as heard. The later edition plays only what’s new.</p>
    <div className="gate-note">
      <p><strong>No real-news timeline is approved here.</strong> The rehearsal uses fictional port notices.</p>
      <button className="action" onClick={e => {entering.current = e.currentTarget.matches(':focus-visible'); setRehearse(true)}}>Open fictional rehearsal <span className="arrow" aria-hidden="true">→</span></button>
    </div>
  </article>
  return <Timeline key={historyKey(profile, story.storyId)} story={story} profile={profile} maxMinutes={maxMinutes} entering={entering}/>
}
