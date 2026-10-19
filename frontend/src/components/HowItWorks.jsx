import { useCountUp, useCycle, useMountFlag, useReveal, useTypedText } from '../hooks'

/* Animated explainers for the landing page.

   The old "4 steps" grid told a visitor what Argus does; these show it. Each
   stage of the pipeline plays out the thing it is describing — the type sniffer
   actually resolves five raw values into five types, the health gauge actually
   sweeps to its score, the bars actually grow, the AI answer actually types
   itself out of the same `useTypedText` hook the real workspace uses.

   Three rules hold throughout, matching the motion layer already in theme.css:

   * Every animation moves only `transform`, `opacity`, `stroke-dashoffset` or
     `background-position`, so the compositor handles it and a phone stays at
     60fps.
   * Nothing runs off-screen. `useReveal({ once: false })` gates the whole
     showcase, so a visitor reading the FAQ is not paying for a demo two
     sections up.
   * Timings live in CSS as a `--d` custom property handed down from here, so a
     stagger is one inline value rather than a timer per element.

   The numbers in the mock data are illustrative and labelled as a sample — the
   real figures in the product are computed, and it would be dishonest to dress
   these up as measurements from a live dataset. */

// ── The pipeline, stage by stage ──────────────────────────────────────────────

const STAGES = [
  {
    id: 'upload',
    label: 'Upload',
    color: '#F97316',
    headline: 'Argus reads the values, not the header',
    blurb: 'Drop in a CSV, TSV or Excel file. The delimiter and encoding are sniffed, then every column is judged on what it actually holds.',
    bullets: ['CSV, TSV, TXT, Excel', 'Dates, money, %, booleans', 'Instant preview'],
  },
  {
    id: 'profile',
    label: 'Profile',
    color: '#7F77DD',
    headline: 'Missing, duplicated and extreme, in one score',
    blurb: 'Nulls, duplicate rows and IQR outliers are measured column by column, then rolled into a single 0-100 health score.',
    bullets: ['IQR outlier scan', 'Duplicate detection', 'Health score'],
  },
  {
    id: 'analyse',
    label: 'Analyse',
    color: '#1D9E75',
    headline: 'Ten-plus charts, from real computed statistics',
    blurb: 'Univariate, bivariate, correlation and feature-importance tools run on pandas, SciPy and scikit-learn — never on a guess.',
    bullets: ['10+ chart types', 'Correlation matrix', 'Feature ranking'],
  },
  {
    id: 'explain',
    label: 'Explain',
    color: '#378ADD',
    headline: 'Every graph explained in plain English',
    blurb: 'Ask in plain English, or just run an analysis: each chart carries its own description, written over the exact values plotted.',
    bullets: ['A summary per graph', 'Suggested next steps', 'Interactive AI insights'],
  },
]

// ── Stage 1: the type sniffer ────────────────────────────────────────────────

/* The five conversions Argus really performs on arrival, which is the single
   least obvious thing about the upload step: a column of "$1,234.56" strings
   becomes a numeric column, and the reason is shown rather than assumed. */
const SNIFFED = [
  ['order_date', '"12/03/2024"', 'date', '#378ADD'],
  ['revenue', '"$1,234.56"', 'money', '#1D9E75'],
  ['margin', '"18.4%"', 'percent', '#EF9F27'],
  ['returned', '"Yes"', 'boolean', '#7F77DD'],
  ['region', '"North"', 'category', '#38BDF8'],
]

function UploadStage() {
  return (
    <div className="arg-demo">
      <div className="arg-demo-file">
        <span className="arg-demo-doc" aria-hidden="true" />
        <div className="arg-demo-file-meta">
          <b>sales_2024.csv</b>
          <em>4,812 rows · 5 columns · comma-delimited, UTF-8</em>
        </div>
        <span className="arg-demo-scan" aria-hidden="true" />
      </div>
      <ul className="arg-sniff">
        {SNIFFED.map(([column, raw, type, color], index) => (
          <li key={column} className={index >= 3 ? 'desktop-only-sniff' : ''} style={{ '--d': `${260 + index * 230}ms` }}>
            <code>{column}</code>
            <span className="arg-sniff-raw">{raw}</span>
            <i className="arg-sniff-arrow" aria-hidden="true">→</i>
            <span
              className="arg-sniff-type"
              style={{ '--d': `${560 + index * 230}ms`, '--accent': color }}
            >
              {type}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Stage 2: the health gauge ────────────────────────────────────────────────

const SCORE = 87
const METERS = [
  ['Missing values', '2.4%', 0.24, '#EF9F27'],
  ['Duplicate rows', '31', 0.12, '#E24B4A'],
  ['Outliers flagged', '118', 0.46, '#38BDF8'],
]

function ProfileStage() {
  const on = useMountFlag()
  const score = useCountUp(String(SCORE), true)
  const radius = 52
  const circumference = 2 * Math.PI * radius

  return (
    <div className="arg-demo arg-demo-split">
      <div className="arg-gauge">
        <svg viewBox="0 0 130 130" role="img" aria-label={`Dataset health score ${SCORE} out of 100`}>
          {/* Rotated so the sweep starts at twelve o'clock rather than three. */}
          <g transform="rotate(-90 65 65)">
            <circle className="arg-gauge-track" cx="65" cy="65" r={radius} />
            <circle
              className="arg-gauge-fill"
              cx="65"
              cy="65"
              r={radius}
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: on ? circumference * (1 - SCORE / 100) : circumference,
              }}
            />
          </g>
        </svg>
        <div className="arg-gauge-mid">
          <b>{score}</b>
          <span>HEALTH</span>
        </div>
      </div>
      <ul className="arg-meters">
        {METERS.map(([label, value, fraction, color], index) => (
          <li key={label}>
            <span>{label}<b>{value}</b></span>
            <div className="arg-meter-track">
              <i
                className={on ? 'arg-meter-fill on' : 'arg-meter-fill'}
                style={{ '--w': `${fraction * 100}%`, '--d': `${index * 160}ms`, background: color }}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="arg-profile-verdict">
        <span className="verdict-dot" />
        <span><strong>Audit Verdict:</strong> Clean Schema · 19.9% Nulls in Age · 118 Tukey Outliers</span>
      </div>
    </div>
  )
}

// ── Stage 3: the charts ──────────────────────────────────────────────────────

const BARS = [62, 88, 45, 71, 96, 38, 57]
/* A 5×5 correlation matrix, symmetric with a unit diagonal, so the picture
   reads as a real matrix rather than noise in a grid. */
const HEAT = [
  [1, 0.82, 0.31, 0.04, 0.55],
  [0.82, 1, 0.27, 0.11, 0.49],
  [0.31, 0.27, 1, 0.63, 0.18],
  [0.04, 0.11, 0.63, 1, 0.09],
  [0.55, 0.49, 0.18, 0.09, 1],
]

function AnalyseStage() {
  const on = useMountFlag()
  return (
    <div className="arg-demo arg-demo-duo">
      <figure className="arg-mini">
        <figcaption>Revenue by region</figcaption>
        <div className={on ? 'arg-bars on' : 'arg-bars'}>
          {BARS.map((height, index) => (
            <i
              key={index}
              style={{ '--h': `${height}%`, '--d': `${index * 80}ms` }}
            />
          ))}
        </div>
      </figure>
      <figure className="arg-mini">
        <figcaption>Correlation matrix</figcaption>
        <div className={on ? 'arg-heat on' : 'arg-heat'}>
          {HEAT.map((row, y) => row.map((value, x) => (
            <i
              key={`${y}-${x}`}
              style={{ '--o': value, '--d': `${(y + x) * 60}ms` }}
              title={`r = ${value.toFixed(2)}`}
            />
          )))}
        </div>
      </figure>
    </div>
  )
}

// ── Stage 4: the grounded answer ─────────────────────────────────────────────

const ANSWER = 'Revenue and units sold move together strongly — r = 0.82 across 4,812 rows, p < 0.001. Margin is the weakest link in the matrix at r = 0.04, so pricing is not tracking volume at all. That is association, not proof of cause.'
const ROUTE = ['run_correlation_analysis', 'pandas · SciPy', 'grounded answer']

function ExplainStage() {
  const { text, done } = useTypedText(ANSWER, { delay: 58 })
  return (
    <div className="arg-demo">
      <p className="arg-bubble user">Which columns actually move together?</p>
      <div className="arg-route" aria-hidden="true">
        {ROUTE.map((step, index) => (
          <span key={step} style={{ '--d': `${index * 280}ms` }}>{step}</span>
        ))}
      </div>
      <div className={done ? 'arg-bubble ai done' : 'arg-bubble ai'}>
        <span className="arg-bubble-eyebrow">WHAT THIS GRAPH SHOWS</span>
        <p>
          {text}
          {!done && <i className="arg-bubble-caret" aria-hidden="true" />}
        </p>
      </div>
    </div>
  )
}

const VISUALS = {
  upload: UploadStage,
  profile: ProfileStage,
  analyse: AnalyseStage,
  explain: ExplainStage,
}

// ── The showcase ─────────────────────────────────────────────────────────────

export function PipelineShowcase() {
  // `once: false` so the cycle stops the moment the section leaves the screen
  // and picks up again when it comes back.
  const [ref, visible] = useReveal({ threshold: 0.25, once: false, rootMargin: '0px' })
  const { index, setIndex, setPaused } = useCycle(STAGES.length, { active: visible })
  const stage = STAGES[index]
  const Visual = VISUALS[stage.id]

  return (
    <div
      ref={ref}
      className="arg-showcase"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* The rail doubles as the control: a visitor who wants to look at one
          stage clicks it, and the auto-advance stops while they are in here. */}
      <div className="arg-rail" role="tablist" aria-label="How Argus works">
        {STAGES.map((item, position) => {
          const state = position === index ? ' active' : position < index ? ' past' : ''
          return (
            <button
              key={item.id}
              role="tab"
              id={`arg-rail-${item.id}`}
              aria-selected={position === index}
              aria-controls={`arg-stage-${item.id}`}
              className={`arg-rail-node${state}`}
              style={{ '--accent': item.color }}
              onClick={() => setIndex(position)}
            >
              <span className="arg-rail-dot">{position + 1}</span>
              <span className="arg-rail-label">{item.label}</span>
            </button>
          )
        })}
        <span className="arg-rail-line" aria-hidden="true">
          <i style={{ width: `${(index / (STAGES.length - 1)) * 100}%`, background: stage.color }} />
        </span>
      </div>

      <div
        className="arg-stage"
        id={`arg-stage-${stage.id}`}
        role="tabpanel"
        aria-labelledby={`arg-rail-${stage.id}`}
        style={{ '--accent': stage.color }}
      >
        <div className="arg-stage-copy">
          <span className="arg-stage-step" style={{ color: stage.color }}>
            STEP {index + 1} / {STAGES.length}
          </span>
          <h3>{stage.headline}</h3>
          <p>{stage.blurb}</p>
          <ul className="arg-step-list">
            {stage.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
          </ul>
          <span className="arg-stage-hint">Sample figures — the real ones are computed from your file.</span>
        </div>
        {/* Keyed on the stage so switching remounts the visual, which is what
            restarts its CSS animations and replays the demonstration. */}
        <div className="arg-stage-visual" key={stage.id}>
          <Visual />
        </div>
      </div>

      {/* Mobile Stage Switcher Controls */}
      <div className="pipeline-mobile-nav">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((p) => Math.max(0, p - 1))}
          className="pipeline-nav-btn"
        >
          &larr; Prev Stage
        </button>
        <span className="pipeline-nav-indicator">Stage {index + 1} of {STAGES.length}</span>
        <button
          type="button"
          disabled={index === STAGES.length - 1}
          onClick={() => setIndex((p) => Math.min(STAGES.length - 1, p + 1))}
          className="pipeline-nav-btn"
        >
          Next Stage &rarr;
        </button>
      </div>
    </div>
  )
}

// ── The grounded-analysis flow ───────────────────────────────────────────────

/* The claim the whole product rests on — that no number is ever generated by a
   model — is invisible in a feature list, so it gets a diagram it can move in.
   The pulse travelling the rail is the question; the eye in the middle is
   ported from the Streamlit build's animated logo. */
const FLOW = [
  ['Your question', 'asked in plain English', '#38BDF8'],
  ['Tool chosen', 'a deterministic route', '#7F77DD'],
  ['Computed in Python', 'pandas · SciPy · sklearn', '#1D9E75'],
  ['Answer phrased', 'described, never invented', '#F97316'],
]

export function ArgusEye({ size = 58 }) {
  return (
    <svg
      className="arg-eye"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Argus"
    >
      <circle
        className="arg-eye-ring"
        cx="32" cy="32" r="27"
        fill="none" stroke="#F97316" strokeWidth="1.5" strokeDasharray="7 9"
      />
      <ellipse cx="32" cy="32" rx="21" ry="12.5" fill="none" stroke="#FAC775" strokeWidth="1.3" opacity="0.65" />
      <g className="arg-eye-pupil">
        <circle cx="32" cy="32" r="6.5" fill="#F97316" />
        <circle cx="32" cy="32" r="2.4" fill="#0a0e1a" />
      </g>
      <line className="arg-eye-scan" x1="9" y1="32" x2="55" y2="32" stroke="#38BDF8" strokeWidth="1" />
    </svg>
  )
}

export function GroundedFlow() {
  const [ref, visible] = useReveal({ threshold: 0.3, once: false, rootMargin: '0px' })
  return (
    <div ref={ref} className={visible ? 'arg-flow live' : 'arg-flow'}>
      <div className="arg-flow-mark">
        <ArgusEye />
        <b>Grounded by construction</b>
        <span>The model chooses the analysis and describes the result. It never supplies a figure.</span>
      </div>
      <div className="arg-flow-pipeline">
        <ol className="arg-flow-steps">
          {FLOW.map(([title, sub, color], index) => (
            <li key={title} style={{ '--accent': color, '--d': `${index * 380}ms` }}>
              <span className="arg-flow-dot" aria-hidden="true" />
              <b>{title}</b>
              <em>{sub}</em>
            </li>
          ))}
          {/* An <li> rather than a <span> because an <ol> may only hold list
              items. It is absolutely positioned, so it is out of flow and never
              takes a column of the grid. */}
          <li className="arg-flow-line" aria-hidden="true" />
        </ol>
      </div>
    </div>
  )
}
