import {Fragment, useEffect, useRef, useState} from 'react'
import {sourceHref} from './api'

const dates = new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'})
export function editionDate(value) {
  return value && Number.isFinite(Date.parse(value)) ? dates.format(new Date(value)) : ''
}

export function DateStamp({value}) {
  if (!editionDate(value)) return null
  const parts = dates.formatToParts(new Date(value))
  const get = key => parts.find(part => part.type === key)?.value
  return <time className="date-stamp" dateTime={value} aria-label={editionDate(value)}>
    <span className="date-day">{get('day')}</span>
    <span className="date-month">{get('month')} {get('year')}</span>
  </time>
}

export const languageName = code => ({en: 'English', de: 'German', nl: 'Dutch'})[code] || code

function SourceNote({entry}) {
  const {source, number, href} = entry
  const meta = [source.publisher, editionDate(source.publishedAt)].filter(Boolean).join(' · ')
  return <li className="source-note">
    <span className="note-number" aria-hidden="true">[{number}]</span>
    <div>
      {meta && <p className="source-meta">{meta}</p>}
      {href ? <a href={href} target="_blank" rel="noopener noreferrer">
        {source.title || 'Original reporting'} <span aria-hidden="true">↗</span>
      </a> : <p>{source.title}<small>Source link unavailable</small></p>}
    </div>
  </li>
}

function Citation({entry}) {
  const {number, source, href} = entry
  const label = ['Source ' + number, source.publisher, editionDate(source.publishedAt), source.title].filter(Boolean).join(' · ')
  return href
    ? <a className="citation" href={href} target="_blank" rel="noopener noreferrer"
        aria-label={label+' (opens in a new tab)'}
        lang="en" title={label}>[{number}]</a>
    : <span className="citation no-link" title="Source link unavailable">[{number}]</span>
}

const sourceKey = s => JSON.stringify([s.articleId, s.url, s.title, s.publisher, s.publishedAt])
export function sourceIndex(segments) {
  const index = new Map()
  for (const segment of segments) {
    for (const source of segment.sources || []) {
      const key = sourceKey(source)
      if (!index.has(key)) index.set(key, {number: index.size + 1, source, href: sourceHref(source.url)})
    }
  }
  return index
}

// Numbers refer to source records, not stories. Each sentence links to its own
// records; the margin prints their metadata once per run of adjacent segments.
export function Sentences({segments, language, compact = false, index = sourceIndex(segments)}) {
  const groups = []
  for (const segment of segments) {
    const sources = segment.sources || []
    const id = segment.storyId || segment.updateId || sources[0]?.articleId
    let group = groups.at(-1)
    if (!id || group?.id !== id) {
      group = {id, lines: [], notes: new Set()}
      groups.push(group)
    }
    const refs = sources.map(source => {
      const entry = index.get(sourceKey(source))
      group.notes.add(entry)
      return entry
    })
    group.lines.push({segment, refs})
  }

  return <div className="sentences">
    {groups.map(({lines, notes}, i) => {
      const factual = notes.size > 0 || lines.some(({segment}) => segment.factIds?.length)
      const first = notes.values().next().value?.source
      const credit = notes.size === 1 && (first.publisher || editionDate(first.publishedAt))
      const list = notes.size > 0 && <ul className="source-list" aria-label="Original reporting">
        {Array.from(notes, entry => <SourceNote key={entry.number} entry={entry}/>)}
      </ul>
      return <div key={i} className={factual ? 'passage' : 'voice-line'}>
        <p className="script-text" lang={language}>
          {lines.map(({segment, refs}, j) => <Fragment key={j}>
            {j > 0 && ' '}<span className="spoken">{segment.text}</span>
            {refs.map((entry, k) => <Citation key={k} entry={entry}/>)}
            {!refs.length && !!segment.factIds?.length && <small className="missing-source" lang="en">Source missing</small>}
          </Fragment>)}
        </p>
        {list && (compact
          ? <details className="source-fold">
              <summary><span>Original {notes.size === 1 ? 'source' : `sources (${notes.size})`}
                {credit && <span className="fold-credit"> · {credit}</span>}</span></summary>
              {list}
            </details>
          : list)}
      </div>
    })}
  </div>
}

const audioReasons = {
  key_missing: 'ElevenLabs is not configured.',
  not_requested: 'No recording was made.',
  unverified_cache: 'The saved audio no longer matches its recording receipt.',
  decoder_unavailable: 'The server could not check playback.',
  tts_failed: 'The voice service could not finish the recording.',
  invalid_recording: 'The recording’s length could not be verified.',
  over_time_limit: 'The edition exceeds your listening time limit.',
  below_minimum_duration: 'The recording fell short of the full-briefing duration target.',
}

export function hasRecording(result) {
  if (!result?.audioUrl || !['generated', 'cached'].includes(result.audioStatus) || !(result.durationSeconds>0)) return false
  return result.generationMode ? result.qualityStatus==='sufficient_verified_content' && result.generationMode==='source-checked-model' : true
}

// A keyboard-triggered request can replace its own button. Hand focus to
// the result, but never pull it back from another control or an inactive view.
export function useRequestFocus(busy) {
  const region = useRef(null)
  const trigger = useRef(null)
  function remember(e) {
    trigger.current = e.currentTarget.matches(':focus-visible') ? e.currentTarget : null
  }
  useEffect(() => {
    if (busy || !trigger.current) return
    if (document.activeElement === document.body || document.activeElement === trigger.current) region.current?.focus()
    trigger.current = null
  }, [busy])
  return [region, remember]
}

// Only deliverable recordings get native controls. Script quality and the
// decision to mark an update as heard are deliberately outside this component.
export function Player({result, title, script, autoPlay = false}) {
  const [failed, setFailed] = useState(false)
  const [startOnLoad, setStartOnLoad] = useState(autoPlay)
  const [transport, setTransport] = useState('Loading recording…')
  const media = useRef(null)
  const playable = hasRecording(result)

  useEffect(() => {
    const node = media.current
    return () => node?.pause()
  }, [result.audioUrl, failed])

  if (!playable || failed) {
    const reason = Object.hasOwn(audioReasons, result.audioStatus)
      ? audioReasons[result.audioStatus] : 'There is no playable recording for this edition.'
    return <div className="sound-note">
      <div role="status">
        {script && <div className="request-state"><span>{script.label}</span>{script.detail && <small>{script.detail}</small>}</div>}
        <p><strong>{failed ? 'Playback failed.' : 'Audio unavailable.'}</strong>{' '}
          {failed ? 'Your browser could not play this recording.' : reason}{!!result.segments.length && ' The transcript is below.'}</p>
      </div>
      {failed && <button className="text-action" onClick={() => {setTransport('Loading recording…'); setStartOnLoad(true); setFailed(false)}}>Retry playback</button>}
    </div>
  }
  const label = script?.withAudio || script?.label
  return <section className="player" aria-label="Edition player">
    <div className="player-line">
      <div className="request-state" role="status">
        <span>{transport==='Ready to listen' ? (label || transport) : transport}</span>
        {script?.detail && <small>{script.detail}</small>}
      </div>
      <span>AI-generated voice{result.audioStatus === 'cached' && ' · Cached recording'}</span>
    </div>
    <audio ref={media} controls preload="metadata" autoPlay={startOnLoad} aria-label={title + ' recording'}
      src={result.audioUrl} onLoadStart={()=>setTransport('Loading recording…')}
      onLoadedMetadata={()=>setTransport('Ready to listen')} onWaiting={()=>setTransport('Buffering…')} onPlaying={() => setTransport('Now playing')}
      onPause={e => {if (!e.currentTarget.ended) setTransport('Paused')}}
      onEnded={() => setTransport('Playback finished')} onError={() => setFailed(true)}/>
  </section>
}
