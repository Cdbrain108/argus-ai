import React, { useState, useEffect } from 'react'
import { LoaderCircle, RotateCcw, Sparkles } from 'lucide-react'
import { useTypedText } from '../hooks'

export default function AiNarrative({
  payload,
  busy,
  label = 'ARGUS AI SUMMARY',
  compact = false,
  tight = false,
}) {
  const text = payload?.text || ''
  const [replayCount, setReplayCount] = useState(0)

  // Natural typewriter pacing: 1 word every 26ms (~38 words/sec) with glowing cyan cursor
  // ignoreReducedMotion ensures Windows visual performance settings don't bypass animation
  const { text: typed, done, skip, replay } = useTypedText(text, {
    delay: 26,
    chunkSize: 1,
    active: true,
    ignoreReducedMotion: true,
  })

  // Whenever text updates or user requests replay, trigger typewriter from start
  useEffect(() => {
    if (text) {
      replay()
    }
  }, [text, replayCount])

  const handleSkip = (e) => {
    if (e) e.stopPropagation()
    skip()
  }

  const handleReplay = (e) => {
    if (e) e.stopPropagation()
    setReplayCount((c) => c + 1)
  }

  const size = `${compact ? ' compact' : ''}${tight ? ' tight' : ''}`

  if (busy && !text) {
    return (
      <div className={`ai-narrative waiting${size}`}>
        <span className="eyebrow">
          <Sparkles size={12} /> {label}
        </span>
        <p className="ai-narrative-body">
          <LoaderCircle size={13} className="spin" /> Reading the data and generating grounded description…
        </p>
      </div>
    )
  }

  if (!text) return null

  const deterministic = payload?.source === 'deterministic'

  return (
    <div
      className={`ai-narrative${done ? ' done' : ' typing'}${size}`}
      onClick={done ? undefined : handleSkip}
      title={done ? '' : 'Click to show full description'}
    >
      <div className="ai-narrative-header-row">
        <span className="eyebrow">
          <Sparkles size={12} /> {label}
          {deterministic && <em className="ai-narrative-tag">computed, not generated</em>}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {!done ? (
            <button
              type="button"
              className="ai-skip-btn"
              onClick={handleSkip}
              title="Show full summary instantly"
            >
              ⚡ Show Full
            </button>
          ) : (
            <button
              type="button"
              className="ai-skip-btn"
              onClick={handleReplay}
              title="Replay typing animation"
              style={{ opacity: 0.85 }}
            >
              <RotateCcw size={11} /> Replay
            </button>
          )}
        </div>
      </div>
      <p className="ai-narrative-body">
        {typed}
        {!done && <span className="ai-cursor" aria-hidden="true" />}
      </p>
      {done && payload?.note && <span className="ai-narrative-note">{payload.note}</span>}
    </div>
  )
}
