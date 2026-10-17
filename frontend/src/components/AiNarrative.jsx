import React, { useEffect } from 'react'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { useTypedText } from '../hooks'

/* Cache of narratives that have already completed typing once.
   When the user switches tabs (e.g. Dataset -> AI Analyst -> Dataset),
   the stored narrative renders immediately with zero delay or re-typing. */
const seenNarratives = new Set()

export default function AiNarrative({
  payload,
  busy,
  label = 'ARGUS AI SUMMARY',
  compact = false,
  tight = false,
}) {
  const text = payload?.text || ''
  const alreadySeen = Boolean(text && seenNarratives.has(text))
  const { text: typed, done, skip } = useTypedText(text, { delay: 15, chunkSize: 3, active: !alreadySeen })

  useEffect(() => {
    if (text && done) {
      seenNarratives.add(text)
    }
  }, [text, done])

  const handleSkip = (e) => {
    if (e) e.stopPropagation()
    if (text) seenNarratives.add(text)
    skip()
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
        {!done && (
          <button
            type="button"
            className="ai-skip-btn"
            onClick={handleSkip}
            title="Show full summary instantly"
          >
            ⚡ Show Full
          </button>
        )}
      </div>
      <p className="ai-narrative-body">
        {typed}
        {!done && <span className="ai-cursor" aria-hidden="true" />}
      </p>
      {done && payload?.note && <span className="ai-narrative-note">{payload.note}</span>}
    </div>
  )
}
