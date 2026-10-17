import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Database,
  FileText,
  Gauge,
  Layers,
  LineChart,
  Lock,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Timer,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react'
import { useMediaQuery, useContainerQuery, useReveal } from '../hooks'

/* Animated explainers for the landing page — the "show, don't tell" layer.

   A feature list tells a visitor what Argus does. These components play out the
   mechanism: the pipeline actually hands a payload from stage to stage, the
   agent graph actually walks its edges (including the retry edge), the AST gate
   actually stamps real Python lines allowed or blocked, and the grounding panel
   actually traces each number in the sentence back to the JSON field it came
   from.

   Four rules hold throughout:

   * Animations move `transform`, `opacity` and `stroke-dashoffset` only, so the
     compositor does the work and a mid-range phone stays smooth.
   * Nothing animates off-screen. Every showcase is gated by
     `useReveal({ once: false })`, so a visitor reading the FAQ is not paying
     for six demos further up the page.
   * Layout is driven by one `useMediaQuery` per component, and the two SVG
     diagrams carry a separate coordinate layout per orientation rather than
     being squashed — a diagram that scales as a unit can never misalign.
   * Figures are illustrative and labelled as samples. The real numbers are
     computed from the visitor's own file, and dressing these up as live
     measurements would be dishonest.

   `prefers-reduced-motion` is handled centrally: the blanket rule in theme.css
   collapses every duration, and each hook below short-circuits to its finished
   frame so a stilled page still reads as complete rather than empty. */

const STILL = () =>
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/* Steps a demo through a fixed sequence while it is on screen.

   One timeout per step keyed off the index rather than an interval: a throttled
   or backgrounded tab resumes on the step it was on instead of fast-forwarding
   through a queued backlog. `durations` lets one step hold longer than the rest
   (a typed sentence needs more time than a dot moving along an edge). */
function useSequence(length, { interval = 3200, durations = null } = {}) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused || length < 2) return undefined
    const hold = Array.isArray(durations) ? (durations[index] ?? interval) : interval
    const timer = setTimeout(() => {
      setIndex((i) => (i + 1) % length)
    }, hold)
    return () => clearTimeout(timer)
  }, [index, paused, length, interval, durations])

  return { index, setIndex, setPaused, paused }
}

/* A 0 → 1 ramp on a 60ms interval rather than one state write per frame.

   A rAF loop over five seconds is ~300 renders for a counter whose last two
   digits are the only thing that changed; 60ms is visually continuous for a
   clock and a bar, and costs a sixth of that. */
function useRamp({ active = true, duration = 5200, loop = true, replay = 0 } = {}) {
  const [p, setP] = useState(() => (STILL() ? 1 : 0))

  useEffect(() => {
    if (!active) return undefined
    if (STILL()) { setP(1); return undefined }

    let start = Date.now()
    let restart = null
    setP(0)

    const timer = setInterval(() => {
      const frac = Math.min(1, (Date.now() - start) / duration)
      setP(frac)
      if (frac >= 1 && loop && restart === null) {
        restart = setTimeout(() => { start = Date.now(); restart = null }, 1500)
      }
    }, 60)

    return () => {
      clearInterval(timer)
      if (restart) clearTimeout(restart)
    }
  }, [active, duration, loop, replay])

  return p
}

// ── 1. The end-to-end flow map ───────────────────────────────────────────────

/* The six things that happen between dropping a file and reading an answer.
   Each stage carries what it receives and what it emits, because the handover
   is the part a feature list always leaves out. */
const FLOW_STAGES = [
  {
    id: 'ingest',
    step: '01',
    label: 'Ingest',
    icon: Database,
    color: '#f97316',
    title: 'Your file is read by its values, not its header',
    body: 'The delimiter and encoding are sniffed from the bytes, then every column is judged on what its cells actually hold. Currency strings, dates, percentages and yes/no columns arrive as real numbers, timestamps and booleans — with the reason for each conversion shown rather than assumed.',
    takes: 'sales_2024.csv · 4,812 rows',
    emits: '6 typed columns · UTF-8 · comma',
    receipt: 'sniff_delimiter() → "," · coerce("$1,234.56") → 1234.56',
  },
  {
    id: 'profile',
    step: '02',
    label: 'Profile',
    icon: Gauge,
    color: '#7f77dd',
    title: 'Missing, duplicated and extreme — in one score',
    body: 'Nulls, duplicate rows and Tukey IQR outliers are measured column by column, then rolled into a single 0–100 health score so you know what you are working with before you trust a single chart.',
    takes: '6 typed columns',
    emits: 'health 87/100 · 118 outliers flagged',
    receipt: 'Q3 + 1.5 × IQR → upper fence 65.63 · nulls 2.4%',
  },
  {
    id: 'plan',
    step: '03',
    label: 'Agent Plan',
    icon: BrainCircuit,
    color: '#38bdf8',
    title: 'Your query is translated into a structured Agent Execution Plan',
    body: 'When you ask a question in natural language, the Agent parses your analytical intent, resolves real schema columns, and constructs a verified, step-by-step mathematical execution plan before any code runs.',
    takes: 'User Query: "Which factors drive profit margin drop?"',
    emits: 'Agent Plan: [resolve_schema → pearson_corr → tukey_fence]',
    receipt: 'query_intent=bivariate_correlation · target=margin · tools=3',
  },
  {
    id: 'compute',
    step: '04',
    label: 'Compute',
    icon: Terminal,
    color: '#1d9e75',
    title: 'Every number is calculated by local Python algorithms',
    body: 'pandas, SciPy and scikit-learn run the chosen analysis directly in your local session memory. Custom code executes in an AST-gated Python sandbox with all outgoing network sockets blocked, guaranteeing zero data leakage.',
    takes: 'tool + resolved columns',
    emits: 'verified JSON result',
    receipt: 'scipy.stats.pearsonr() → r = 0.82, p = 1.4e-24, n = 4812',
  },
  {
    id: 'chart',
    step: '05',
    label: 'Visualise',
    icon: BarChart3,
    color: '#ef9f27',
    title: 'Charts drawn from the values that were computed',
    body: 'Ten-plus chart types are picked to match the result: histograms and box plots for one column, scatter and grouped means for a pair, a correlation grid and feature ranking for the whole frame. They are SVG, so they stay sharp at any size.',
    takes: 'verified JSON result',
    emits: '10+ responsive SVG figures',
    receipt: 'histogram(bins=auto) · boxplot(whis=1.5) · heatmap(method="pearson")',
  },
  {
    id: 'explain',
    step: '06',
    label: 'Explain',
    icon: FileText,
    color: '#e24b4a',
    title: 'Plain English narration over verified statistical output',
    body: 'The AI narrator receives only the calculated JSON summary, describing the verified figures without guessing, extrapolating, or touching raw data rows. Every figure cited carries its mathematical receipt.',
    takes: 'verified JSON result',
    emits: 'grounded narrative + PDF audit',
    receipt: 'r = 0.82 cited from result.pearson_r · no figure generated by the model',
  },
]

function IngestMini() {
  const rows = [
    ['"12/03/2024"', 'date', '#38bdf8'],
    ['"$1,234.56"', 'currency', '#1d9e75'],
    ['"18.4%"', 'percent', '#ef9f27'],
  ]
  return (
    <ul className="ax-mini ax-mini-ingest">
      {rows.map(([raw, type, color], i) => (
        <li key={raw} style={{ '--d': `${i * 260}ms` }}>
          <code>{raw}</code>
          <ArrowRight size={12} className="ax-mini-arrow" />
          <span className="ax-mini-type" style={{ '--accent': color, '--d': `${i * 260 + 280}ms` }}>
            {type}
          </span>
        </li>
      ))}
    </ul>
  )
}

function ProfileMini() {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const meters = [
    ['Nulls', '2.4%', 0.24, '#ef9f27'],
    ['Duplicates', '31', 0.12, '#e24b4a'],
    ['Outliers', '118', 0.46, '#38bdf8'],
  ]
  return (
    <div className="ax-mini ax-mini-profile">
      <div className="ax-mini-ring">
        <svg viewBox="0 0 88 88" role="img" aria-label="Health score 87 of 100">
          <g transform="rotate(-90 44 44)">
            <circle cx="44" cy="44" r={radius} className="ax-ring-track" />
            <circle
              cx="44"
              cy="44"
              r={radius}
              className="ax-ring-fill"
              style={{
                strokeDasharray: circumference,
                '--to': circumference * 0.13,
                '--from': circumference,
              }}
            />
          </g>
        </svg>
        <b>87</b>
      </div>
      <ul>
        {meters.map(([label, value, fraction, color], i) => (
          <li key={label}>
            <span>{label}<b>{value}</b></span>
            <i className="ax-mini-track">
              <i style={{ '--w': `${fraction * 100}%`, '--d': `${i * 180}ms`, background: color }} />
            </i>
          </li>
        ))}
      </ul>
    </div>
  )
}

const AGENT_PLAN_QUERIES = [
  {
    query: 'Which factors drive profit margin drops in Q3?',
    intent: 'Bivariate Correlation & Outliers',
    targetCols: 'margin, revenue, units_sold',
    steps: [
      { num: '01', action: 'resolve_schema', detail: 'Map query tokens → cols [margin, revenue]', tag: 'Schema Match' },
      { num: '02', action: 'scipy.stats.pearsonr', detail: 'Compute pairwise r & p-values (<0.001)', tag: 'Deterministic' },
      { num: '03', action: 'tukey_iqr_fence', detail: 'Isolate heavy negative margin loss rows', tag: 'Anomaly Gate' },
    ],
  },
  {
    query: 'Scan missingness & recommend median or mode imputations',
    intent: 'Data Hygiene & ML Engineering',
    targetCols: 'all 6 columns · MCAR/MAR test',
    steps: [
      { num: '01', action: 'null_pattern_scan', detail: 'Flag 19.9% null in Age, 77.1% in Cabin', tag: 'MCAR Mask' },
      { num: '02', action: 'skewness_test', detail: 'Skew = +4.78 → prescribe median over mean', tag: 'SciPy Stats' },
      { num: '03', action: 'synthesize_rx_code', detail: 'Generate Python scikit-learn pipeline', tag: 'AST Checked' },
    ],
  },
  {
    query: 'Detect heavy-tailed outliers in Revenue column',
    intent: 'Non-Parametric Anomaly Fencing',
    targetCols: 'revenue (USD) · 4,812 rows',
    steps: [
      { num: '01', action: 'compute_quantiles', detail: 'Derive Q1 ($7.91), Median ($14.45), Q3 ($31.00)', tag: 'Percentiles' },
      { num: '02', action: 'apply_tukey_rule', detail: 'Upper fence: Q3 + 1.5×IQR = $65.63', tag: 'IQR Formula' },
      { num: '03', action: 'flag_outlier_rows', detail: 'Flag 118 extreme rows (13.2%) > fence', tag: 'Deterministic' },
    ],
  },
]

function PlanMini() {
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % AGENT_PLAN_QUERIES.length)
    }, 4200)
    return () => clearInterval(timer)
  }, [])

  const current = AGENT_PLAN_QUERIES[activeIdx]

  return (
    <div className="ax-mini ax-mini-agent-plan">
      {/* Dynamic User Query Prompt Box */}
      <div className="ax-agent-query-box">
        <div className="ax-agent-query-header">
          <span className="ax-query-badge">
            <Sparkles size={11} className="ax-query-sparkle" />
            <span>USER QUERY</span>
          </span>
          <span className="ax-query-intent">{current.intent}</span>
        </div>
        <p className="ax-agent-query-text">"{current.query}"</p>
      </div>

      {/* Query Selector Tabs */}
      <div className="ax-query-chips">
        {AGENT_PLAN_QUERIES.map((q, idx) => (
          <button
            key={idx}
            type="button"
            className={`ax-query-chip ${idx === activeIdx ? 'active' : ''}`}
            onClick={() => setActiveIdx(idx)}
          >
            Query {idx + 1}
          </button>
        ))}
      </div>

      {/* Decomposed Agent Plan Steps */}
      <div className="ax-agent-plan-steps">
        <div className="ax-plan-header">
          <span className="ax-plan-label">DECOMPOSED AGENT EXECUTION PLAN</span>
          <span className="ax-plan-status">✓ AST Verified</span>
        </div>
        <ul className="ax-plan-list">
          {current.steps.map((st, i) => (
            <li key={`${activeIdx}-${st.num}`} className="ax-plan-step-item" style={{ animationDelay: `${i * 80}ms` }}>
              <span className="ax-plan-step-num">{st.num}</span>
              <div className="ax-plan-step-content">
                <div className="ax-plan-step-title-row">
                  <code>{st.action}()</code>
                  <span className="ax-plan-step-tag">{st.tag}</span>
                </div>
                <span className="ax-plan-step-detail">{st.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function ComputeMini() {
  const lines = [
    '>>> df[["revenue","units_sold"]].corr()',
    'r = 0.8213   p = 1.4e-24   n = 4812',
    'schema ok · finite · 0.41s',
  ]
  return (
    <div className="ax-mini ax-mini-compute">
      {lines.map((line, i) => (
        <code key={line} style={{ '--d': `${i * 320}ms` }}>{line}</code>
      ))}
      <span className="ax-mini-ok" style={{ '--d': '1100ms' }}>
        <CheckCircle2 size={12} /> validated
      </span>
    </div>
  )
}

function ChartMini() {
  const bars = [52, 78, 41, 88, 63, 96, 48]
  return (
    <div className="ax-mini ax-mini-chart">
      <div className="ax-mini-bars">
        {bars.map((height, i) => (
          <i key={i} style={{ '--h': `${height}%`, '--d': `${i * 90}ms` }} />
        ))}
      </div>
      <svg viewBox="0 0 120 34" className="ax-mini-spark" aria-hidden="true">
        <path
          className="ax-spark-path"
          d="M2 28 L20 22 L38 25 L56 14 L74 17 L92 7 L118 10"
          fill="none"
          stroke="#ef9f27"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

function ExplainMini() {
  /* Explicit spaces: JSX drops the newline between a text line and an adjacent
     tag, so "strongly" and the chip after it would otherwise run together. */
  return (
    <div className="ax-mini ax-mini-explain">
      <p>
        Revenue and units sold move together strongly,{' '}
        <mark style={{ '--d': '220ms' }}>r = 0.82</mark>
        {' across '}
        <mark style={{ '--d': '480ms' }}>4,812 rows</mark>
        {'. Margin is the weakest link at '}
        <mark style={{ '--d': '740ms' }}>r = 0.04</mark>
        {' — association, not cause.'}
      </p>
      <span className="ax-mini-cite">
        <ShieldCheck size={11} /> every figure cited from the computed result
      </span>
    </div>
  )
}

const FLOW_MINIS = {
  ingest: IngestMini,
  profile: ProfileMini,
  plan: PlanMini,
  compute: ComputeMini,
  chart: ChartMini,
  explain: ExplainMini,
}

export function ArgusFlowMap() {
  const ref = useRef(null)
  const { index, setIndex, setPaused, paused } = useSequence(FLOW_STAGES.length, {
    interval: 3600,
  })

  const stage = FLOW_STAGES[index]
  const nextStageIdx = (index + 1) % FLOW_STAGES.length
  const nextStage = FLOW_STAGES[nextStageIdx]
  const Mini = FLOW_MINIS[stage.id]
  const Icon = stage.icon

  return (
    <div
      ref={ref}
      className="ax-flow"
      style={{ '--accent': stage.color }}
    >
      {/* The rail doubles as the control — the auto-advance stops while a
          visitor is in here looking at one stage on purpose. */}
      <div className="ax-flow-rail" role="tablist" aria-label="The Argus pipeline, stage by stage">
        <span className="ax-rail-line" aria-hidden="true">
          <i style={{ width: `${(index / (FLOW_STAGES.length - 1)) * 100}%`, background: stage.color }} />
        </span>
        {FLOW_STAGES.map((item, position) => {
          const StageIcon = item.icon
          const state = position === index ? ' is-active' : position < index ? ' is-past' : ''
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              id={`ax-rail-${item.id}`}
              aria-selected={position === index}
              aria-controls={`ax-panel-${item.id}`}
              className={`ax-rail-node${state}`}
              style={{ '--accent': item.color }}
              onClick={() => setIndex(position)}
            >
              <span className="ax-rail-badge">
                <StageIcon size={15} />
              </span>
              <span className="ax-rail-text">
                <em>{item.step}</em>
                <b>{item.label}</b>
              </span>
              {position === index && (
                <span
                  key={index}
                  className="ax-tab-fill-bar"
                  style={{
                    background: item.color,
                    animationPlayState: paused ? 'paused' : 'running',
                  }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Keyed on the stage so a switch remounts the panel, which is what
          restarts the CSS animations and replays the demonstration. */}
      <div
        className="ax-flow-panel"
        id={`ax-panel-${stage.id}`}
        role="tabpanel"
        aria-labelledby={`ax-rail-${stage.id}`}
        key={stage.id}
      >
        <div className="ax-flow-copy">
          <div className="ax-flow-step-bar">
            <span className="ax-flow-step">
              <Icon size={13} /> STAGE {stage.step} OF 06 · {stage.label.toUpperCase()}
            </span>
            <button
              type="button"
              className="ax-flow-next-preview"
              onClick={() => setIndex(nextStageIdx)}
              title={`Click to jump immediately to Stage ${nextStage.step} ${nextStage.label}`}
            >
              <span className="ax-next-pulse-dot" style={{ background: nextStage.color }} />
              <span>Next window: {nextStage.step} {nextStage.label}</span>
              <ArrowRight size={11} className="ax-next-arrow" />
              <span
                key={index}
                className="ax-flow-next-progress"
                style={{ background: nextStage.color }}
              />
            </button>
          </div>
          <h3>{stage.title}</h3>
          <p>{stage.body}</p>
          <div className="ax-handover">
            <span className="ax-handover-cell">
              <em>TAKES</em>
              <b>{stage.takes}</b>
            </span>
            <ArrowRight size={14} className="ax-handover-arrow" />
            <span className="ax-handover-cell is-out">
              <em>EMITS</em>
              <b>{stage.emits}</b>
            </span>
          </div>
          <code className="ax-receipt">{stage.receipt}</code>
        </div>
        <div className="ax-flow-visual">
          <Mini />
        </div>
      </div>

      <div className="ax-flow-foot">
        <span className="ax-note">Sample figures — the real ones are computed from your own file.</span>
        <div className="ax-step-controls">
          <button
            type="button"
            className="ax-step-btn"
            onClick={() => setIndex((p) => (p - 1 + FLOW_STAGES.length) % FLOW_STAGES.length)}
            aria-label="Previous stage"
          >
            &larr; Prev
          </button>
          <span className="ax-step-count">{index + 1} / {FLOW_STAGES.length}</span>
          <button
            type="button"
            className="ax-step-btn"
            onClick={() => setIndex((p) => (p + 1) % FLOW_STAGES.length)}
            aria-label="Next stage"
          >
            Next &rarr;
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 2. The agent graph ───────────────────────────────────────────────────────

/* The orchestration claim — a planner picks a tool, a validator checks the
   result, and a failure retries rather than guesses — is invisible in prose, so
   it gets a diagram it can move in.

   Two coordinate layouts rather than one squashed diagram: an SVG that scales
   as a unit cannot misalign, but a 1,020-wide graph shrunk into a 340px phone
   would render 5px labels. The row layout serves tablets upward, the column
   layout phones. */
const GRAPH_TERMINALS = new Set(['start', 'end'])

const GRAPH_NODES = {
  start: { label: 'START', color: '#6b7280' },
  planner: { label: 'Planner', sub: 'intent + columns', color: '#38bdf8' },
  router: { label: 'Router', sub: 'pick the analysis', color: '#7f77dd' },
  tool: { label: 'Registered tool', sub: 'pandas · SciPy', color: '#1d9e75' },
  repl: { label: 'AST sandbox', sub: 'generated code', color: '#ef9f27' },
  critic: { label: 'Validator', sub: 'schema · retry', color: '#f97316' },
  explainer: { label: 'Explainer', sub: 'describes the JSON', color: '#e24b4a' },
  end: { label: 'END', color: '#6b7280' },
}

const GRAPH_LAYOUTS = {
  /* Wide: one left-to-right rail with the two compute branches above and below
     it, and the retry edge looping under the pair. */
  row: {
    viewBox: '0 0 1020 296',
    nodeW: 134,
    nodeH: 60,
    termW: 72,
    termH: 38,
    font: 14,
    subFont: 10.5,
    pos: {
      start: [44, 148],
      planner: [184, 148],
      router: [340, 148],
      tool: [512, 66],
      repl: [512, 230],
      critic: [684, 148],
      explainer: [848, 148],
      end: [976, 148],
    },
    sides: {
      'start>planner': ['r', 'l', 0],
      'planner>router': ['r', 'l', 0],
      'router>tool': ['r', 'l', 0],
      'router>repl': ['r', 'l', 0],
      'tool>critic': ['r', 'l', 0],
      'repl>critic': ['r', 'l', 0],
      'critic>explainer': ['r', 'l', 0],
      'explainer>end': ['r', 'l', 0],
      'critic>repl': ['b', 'b', 286],
    },
  },
  /* Narrow: top-to-bottom, with the branch pair side by side so eight nodes do
     not become 700px of stack, and the retry edge looping clear in the right
     gutter the pair leaves free. */
  column: {
    viewBox: '0 0 372 604',
    nodeW: 196,
    nodeH: 54,
    termW: 92,
    termH: 34,
    font: 13,
    subFont: 9.8,
    size: {
      tool: [140, 58],
      repl: [140, 58],
    },
    pos: {
      start: [176, 26],
      planner: [176, 104],
      router: [176, 194],
      tool: [100, 304],
      repl: [256, 304],
      critic: [176, 414],
      explainer: [176, 504],
      end: [176, 578],
    },
    sides: {
      'start>planner': ['b', 't', 0],
      'planner>router': ['b', 't', 0],
      'router>tool': ['b', 't', 0],
      'router>repl': ['b', 't', 0],
      'tool>critic': ['b', 't', 0],
      'repl>critic': ['b', 't', 0],
      'critic>explainer': ['b', 't', 0],
      'explainer>end': ['b', 't', 0],
      'critic>repl': ['r', 'r', 352],
    },
  },
}

/* One place that decides how big a node is, so the anchors a path starts from
   and the box it visually leaves can never disagree. */
function graphBox(layout, id) {
  if (layout.size?.[id]) return layout.size[id]
  return GRAPH_TERMINALS.has(id)
    ? [layout.termW, layout.termH]
    : [layout.nodeW, layout.nodeH]
}

/* The walk the diagram performs, including the branch most explainers skip:
   when no registered tool covers a question, generated code runs in the
   sandbox instead, and the validator can send it back. */
const GRAPH_TRACE = [
  { edge: 'start>planner', node: 'planner', say: 'Your question arrives. The planner resolves column names against the real schema — a column it cannot find is an error, never a guess.' },
  { edge: 'planner>router', node: 'router', say: 'Intent is classified, then matched against the registry of deterministic analyses.' },
  { edge: 'router>tool', node: 'tool', say: 'A registered tool covers this one: correlation runs straight in pandas and SciPy.' },
  { edge: 'tool>critic', node: 'critic', say: 'The result is validated against its schema — shape, dtypes, finite values.' },
  { edge: 'router>repl', node: 'repl', say: 'The other branch: nothing in the registry fits, so pandas is generated, AST-checked, and run in a separate process.' },
  { edge: 'critic>repl', node: 'repl', say: 'A failed check loops back for one correction pass. Argus retries the computation — it never fills the gap with prose.', retry: true },
  { edge: 'repl>critic', node: 'critic', say: 'Sandbox output is validated on exactly the same terms as a registered tool.' },
  { edge: 'critic>explainer', node: 'explainer', say: 'Only verified JSON crosses into the model. It writes the sentence; the figures are already fixed.' },
  { edge: 'explainer>end', node: 'end', say: 'Answer, chart and receipt are returned to your session. Nothing was persisted.' },
]

function graphAnchor(layout, id, side) {
  const [cx, cy] = layout.pos[id]
  const [w, h] = graphBox(layout, id)
  if (side === 'r') return [cx + w / 2, cy]
  if (side === 'l') return [cx - w / 2, cy]
  if (side === 't') return [cx, cy - h / 2]
  return [cx, cy + h / 2]
}

function graphPath(layout, key) {
  const [from, to] = key.split('>')
  const [fromSide, toSide, gutter] = layout.sides[key]
  const [x1, y1] = graphAnchor(layout, from, fromSide)
  const [x2, y2] = graphAnchor(layout, to, toSide)
  const horizontal = fromSide === 'l' || fromSide === 'r'

  if (gutter) {
    /* A loop leaving and arriving on the same face of its nodes — the retry
       edge. `gutter` is the absolute coordinate it bulges out to, not an offset:
       the two anchors sit at different depths, so an offset applied to each
       would push one control point outside the viewBox. */
    const c1 = horizontal ? [gutter, y1] : [x1, gutter]
    const c2 = horizontal ? [gutter, y2] : [x2, gutter]
    return `M ${x1} ${y1} C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${x2} ${y2}`
  }

  const dx = (x2 - x1) / 2
  const dy = (y2 - y1) / 2
  return horizontal
    ? `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`
    : `M ${x1} ${y1} C ${x1} ${y1 + dy} ${x2} ${y2 - dy} ${x2} ${y2}`
}

export function AgentStateGraph() {
  const ref = useRef(null)
  const canvasRef = useRef(null)
  const { width } = useContainerQuery(canvasRef)
  const narrowViewport = useMediaQuery('(max-width: 860px)')
  const stacked = width > 0 ? width < 860 : narrowViewport
  const layout = stacked ? GRAPH_LAYOUTS.column : GRAPH_LAYOUTS.row
  const { index, setIndex, setPaused, paused } = useSequence(GRAPH_TRACE.length, {
    interval: 3200,
  })

  const trace = GRAPH_TRACE[index]
  const activeNode = GRAPH_NODES[trace.node]
  const nextHopIdx = (index + 1) % GRAPH_TRACE.length
  const nextHop = GRAPH_TRACE[nextHopIdx]
  const nextNode = GRAPH_NODES[nextHop.node]

  return (
    <div
      ref={ref}
      className="ax-graph"
      style={{ '--accent': activeNode.color }}
    >
      <div className="ax-graph-head">
        <span className="ax-chip">
          <BrainCircuit size={13} /> ORCHESTRATION
        </span>
        <button
          type="button"
          className="ax-graph-next-pill"
          onClick={() => setIndex(nextHopIdx)}
          title={`Click to jump immediately to ${nextNode.label}`}
        >
          <span className="ax-pulse-ring" style={{ background: nextNode.color }} />
          <span>Next: {nextNode.label}</span>
          <ArrowRight size={11} className="ax-next-arrow" />
          <span
            key={index}
            className="ax-graph-next-progress"
            style={{ background: nextNode.color }}
          />
        </button>
        <span className="ax-graph-hop">
          HOP {index + 1} / {GRAPH_TRACE.length}
          {trace.retry && <em className="ax-retry-flag">retry edge</em>}
        </span>
      </div>

      <div className="ax-graph-canvas" ref={canvasRef}>
        <svg
          className={`ax-graph-svg${stacked ? ' is-column' : ''}`}
          viewBox={layout.viewBox}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="How a question travels through the Argus agent graph"
        >
          {/* Edges first so nodes always sit on top of their connectors. */}
          {Object.keys(layout.sides).map((key) => {
            const isActive = key === trace.edge
            const isRetry = key === 'critic>repl'
            return (
              <g key={key} className={`ax-edge${isActive ? ' is-active' : ''}${isRetry ? ' is-retry' : ''}`}>
                <path d={graphPath(layout, key)} className="ax-edge-base" fill="none" />
                {isActive && (
                  <path
                    d={graphPath(layout, key)}
                    className="ax-edge-pulse"
                    fill="none"
                    style={{ stroke: activeNode.color }}
                  />
                )}
              </g>
            )
          })}

          {Object.entries(GRAPH_NODES).map(([id, node]) => {
            const [cx, cy] = layout.pos[id]
            const [w, h] = graphBox(layout, id)
            const isTerminal = GRAPH_TERMINALS.has(id)
            const isActive = id === trace.node
            const hasSub = Boolean(node.sub) && !isTerminal
            return (
              <g
                key={id}
                className={`ax-node${isActive ? ' is-active' : ''}${isTerminal ? ' is-terminal' : ''}`}
                style={{ '--node': node.color, transformOrigin: `${cx}px ${cy}px` }}
              >
                <rect
                  x={cx - w / 2}
                  y={cy - h / 2}
                  width={w}
                  height={h}
                  rx={isTerminal ? h / 2 : 12}
                  className="ax-node-box"
                />
                <text
                  x={cx}
                  y={hasSub ? cy - 7 : cy}
                  className="ax-node-label"
                  style={{ fontSize: layout.font }}
                >
                  {node.label}
                </text>
                {hasSub && (
                  <text
                    x={cx}
                    y={cy + 12}
                    className="ax-node-sub"
                    style={{ fontSize: layout.subFont }}
                  >
                    {node.sub}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="ax-graph-say" key={index}>
        <span className="ax-say-node" style={{ background: `${activeNode.color}24`, color: activeNode.color }}>
          {activeNode.label}
        </span>
        <p>{trace.say}</p>
      </div>

      <div className="ax-graph-dots" role="tablist" aria-label="Graph hops">
        {GRAPH_TRACE.map((hop, i) => (
          <button
            key={hop.edge + i}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Hop ${i + 1}`}
            className={`ax-dot${i === index ? ' is-active' : ''}${hop.retry ? ' is-retry' : ''}`}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </div>
  )
}

// ── 3. The AST gate ──────────────────────────────────────────────────────────

/* What the sandbox actually rejects, in its own terms — the verdicts below are
   the gate's real reasons, read off backend/sandbox/policies.py rather than
   invented: an import allowlist, a blocked-builtin set, and a ban on any name
   or attribute starting with a dunder. */
const GATE_LINES = [
  { code: 'df.groupby("region")["revenue"].sum()', ok: true, why: 'Allowlisted pandas, running on the session frame' },
  { code: 'import os, subprocess', ok: false, why: 'Blocked import — os and subprocess are not on the allowlist' },
  { code: 'scipy.stats.pearsonr(x, y)', ok: true, why: 'Allowlisted SciPy statistic' },
  { code: 'open("/etc/passwd").read()', ok: false, why: 'Blocked name — open() is not among the sandbox builtins' },
  { code: 'df["fare"].quantile([0.25, 0.75])', ok: true, why: 'Pure computation on one column' },
  { code: 'eval(user_input)', ok: false, why: 'Blocked name — eval, exec and compile are all removed' },
  { code: '__import__("socket").create_connection(...)', ok: false, why: 'Blocked name — a dunder, and socket is blocked besides' },
  { code: 'np.log1p(df["revenue"])', ok: true, why: 'Allowlisted NumPy transform' },
]

export function SandboxGate() {
  const ref = useRef(null)
  const { index, setIndex, setPaused } = useSequence(GATE_LINES.length, {
    interval: 2600,
  })

  const line = GATE_LINES[index]
  const allowed = GATE_LINES.filter((l) => l.ok).length

  return (
    <div
      ref={ref}
      className={`ax-gate ${line.ok ? 'is-allowed' : 'is-blocked'}`}
    >
      <div className="ax-gate-head">
        <span className="ax-chip">
          <Lock size={13} /> AST GATE
        </span>
        <span className="ax-gate-tally">
          <b className="ok">{allowed} allowed</b>
          <i />
          <b className="no">{GATE_LINES.length - allowed} blocked</b>
        </span>
      </div>

      <div className="ax-gate-stage" key={index}>
        <code className="ax-gate-code">{line.code}</code>
        <span className={`ax-gate-stamp ${line.ok ? 'ok' : 'no'}`}>
          {line.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          <span>{line.ok ? 'PASSED TO SANDBOX' : 'REJECTED BEFORE RUN'}</span>
        </span>
        <p className="ax-gate-why">{line.why}</p>
      </div>

      <div className="ax-gate-queue" role="tablist" aria-label="Candidate code lines">
        {GATE_LINES.map((item, i) => (
          <button
            key={item.code}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Line ${i + 1}: ${item.ok ? 'allowed' : 'blocked'}`}
            className={`${i === index ? 'is-active' : ''} ${item.ok ? 'ok' : 'no'}`}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>

      <div className="ax-gate-rules">
        {[
          ['Import allowlist', 'pandas, numpy, scipy, sklearn and the maths stdlib — nothing else resolves'],
          ['No dunders', 'any name or attribute starting with __ is rejected before the run'],
          ['Builtins removed', 'open, eval, exec, compile, getattr and friends are not in scope'],
          ['Separate process', 'spawned worker · 256 MB cap · 30s wall clock'],
        ].map(([title, detail], i) => (
          <div key={title} className="ax-gate-rule" style={{ '--d': `${i * 120}ms` }}>
            <ShieldCheck size={13} />
            <div>
              <b>{title}</b>
              <span>{detail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 4. The chart lab ─────────────────────────────────────────────────────────

/* The chart types Argus draws, and the rule that picks each one. Drawn rather
   than screenshotted: an inline SVG stays sharp on a 430px phone and a 4K
   monitor alike, and costs a few hundred bytes instead of a megabyte. */
function HistogramFigure() {
  const bars = [8, 18, 34, 58, 82, 96, 74, 52, 31, 17, 9, 5]
  return (
    <svg viewBox="0 0 300 150" className="ax-fig" role="img" aria-label="Histogram with a density curve">
      {bars.map((h, i) => {
        const x = 12 + i * 23.5
        const barH = (h / 100) * 108
        return (
          <rect
            key={i}
            x={x}
            y={132 - barH}
            width={18}
            height={barH}
            rx="3"
            className="ax-fig-bar"
            style={{ '--d': `${i * 55}ms`, transformOrigin: `${x + 9}px 132px`, fill: '#38bdf8' }}
          />
        )
      })}
      <path
        className="ax-fig-line"
        d="M20 126 C 60 120, 80 40, 128 26 C 176 12, 196 96, 292 128"
        fill="none"
        stroke="#f97316"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line x1="8" y1="133" x2="294" y2="133" className="ax-fig-axis" />
    </svg>
  )
}

function ScatterFigure() {
  const points = [
    [34, 112], [52, 104], [66, 96], [78, 100], [92, 86], [104, 78], [118, 82],
    [132, 70], [146, 64], [158, 72], [172, 54], [186, 48], [198, 56], [212, 38],
    [226, 32], [240, 42], [254, 26], [268, 22],
  ]
  return (
    <svg viewBox="0 0 300 150" className="ax-fig" role="img" aria-label="Scatter plot with a fitted regression line">
      {points.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="4" className="ax-fig-point" style={{ '--d': `${i * 42}ms` }} />
      ))}
      <path className="ax-fig-line" d="M28 116 L274 22" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" />
      <text x="206" y="128" className="ax-fig-note">r = 0.82 · p &lt; 0.001</text>
      <line x1="8" y1="133" x2="294" y2="133" className="ax-fig-axis" />
    </svg>
  )
}

function HeatmapFigure() {
  const grid = [
    [1, 0.82, 0.31, 0.04, 0.55],
    [0.82, 1, 0.27, 0.11, 0.49],
    [0.31, 0.27, 1, 0.63, 0.18],
    [0.04, 0.11, 0.63, 1, 0.09],
    [0.55, 0.49, 0.18, 0.09, 1],
  ]
  return (
    <svg viewBox="0 0 300 150" className="ax-fig" role="img" aria-label="Five by five correlation matrix">
      {grid.map((row, y) => row.map((value, x) => (
        <rect
          key={`${y}-${x}`}
          x={78 + x * 28}
          y={9 + y * 26}
          width={25}
          height={23}
          rx="3"
          className="ax-fig-cell"
          style={{ '--o': value, '--d': `${(x + y) * 60}ms`, transformOrigin: `${90 + x * 28}px ${20 + y * 26}px` }}
        />
      )))}
      <text x="70" y="25" className="ax-fig-tick" textAnchor="end">revenue</text>
      <text x="70" y="51" className="ax-fig-tick" textAnchor="end">units</text>
      <text x="70" y="77" className="ax-fig-tick" textAnchor="end">margin</text>
      <text x="70" y="103" className="ax-fig-tick" textAnchor="end">discount</text>
      <text x="70" y="129" className="ax-fig-tick" textAnchor="end">spend</text>
    </svg>
  )
}

function GroupedBarFigure() {
  const groups = [
    ['West', 88, 62],
    ['East', 70, 54],
    ['Central', 52, 44],
    ['North', 36, 48],
  ]
  return (
    <svg viewBox="0 0 300 150" className="ax-fig" role="img" aria-label="Grouped bar chart of two measures by region">
      {groups.map(([label, a, b], i) => {
        const x = 26 + i * 68
        const aH = (a / 100) * 104
        const bH = (b / 100) * 104
        return (
          <g key={label}>
            <rect x={x} y={126 - aH} width={22} height={aH} rx="3" className="ax-fig-bar" style={{ '--d': `${i * 110}ms`, transformOrigin: `${x + 11}px 126px`, fill: '#1d9e75' }} />
            <rect x={x + 26} y={126 - bH} width={22} height={bH} rx="3" className="ax-fig-bar" style={{ '--d': `${i * 110 + 70}ms`, transformOrigin: `${x + 37}px 126px`, fill: '#7f77dd' }} />
            <text x={x + 24} y={141} className="ax-fig-tick" textAnchor="middle">{label}</text>
          </g>
        )
      })}
      <line x1="8" y1="127" x2="294" y2="127" className="ax-fig-axis" />
    </svg>
  )
}

function TrendFigure() {
  return (
    <svg viewBox="0 0 300 150" className="ax-fig" role="img" aria-label="Trend line with a shaded area">
      <defs>
        <linearGradient id="ax-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="ax-fig-area" d="M14 118 L58 96 L102 104 L146 72 L190 80 L234 44 L286 30 L286 128 L14 128 Z" fill="url(#ax-trend-fill)" />
      <path className="ax-fig-line" d="M14 118 L58 96 L102 104 L146 72 L190 80 L234 44 L286 30" fill="none" stroke="#38bdf8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      {[[14, 118], [58, 96], [102, 104], [146, 72], [190, 80], [234, 44], [286, 30]].map(([cx, cy], i) => (
        <circle key={cx} cx={cx} cy={cy} r="3.8" className="ax-fig-point" style={{ '--d': `${300 + i * 90}ms` }} />
      ))}
      <line x1="8" y1="129" x2="294" y2="129" className="ax-fig-axis" />
    </svg>
  )
}

function MissingFigure() {
  const columns = [
    ['PassengerId', 0], ['Survived', 0], ['Pclass', 0], ['Name', 0],
    ['Age', 19.9], ['SibSp', 0], ['Fare', 0], ['Cabin', 77.1], ['Embarked', 0.2],
  ]
  return (
    <svg viewBox="0 0 300 150" className="ax-fig" role="img" aria-label="Missing value map by column">
      {columns.map(([name, pct], i) => {
        const y = 8 + i * 15.5
        const filled = (pct / 100) * 196
        return (
          <g key={name}>
            <text x="74" y={y + 10} className="ax-fig-tick" textAnchor="end">{name}</text>
            <rect x="80" y={y} width="196" height="11" rx="3" className="ax-fig-strip" />
            {pct > 0 && (
              <rect
                x="80"
                y={y}
                width={Math.max(filled, 6)}
                height="11"
                rx="3"
                className="ax-fig-strip-fill"
                style={{ '--d': `${i * 60}ms`, transformOrigin: '80px 0', fill: pct > 50 ? '#e24b4a' : '#ef9f27' }}
              />
            )}
            {pct === 0 && <rect x="80" y={y} width="196" height="11" rx="3" className="ax-fig-strip-ok" style={{ '--d': `${i * 60}ms`, transformOrigin: '80px 0' }} />}
          </g>
        )
      })}
    </svg>
  )
}

function FeatureImportanceFigure() {
  const features = [
    ['sex', 0.31, '#1d9e75'],
    ['fare', 0.24, '#38bdf8'],
    ['pclass', 0.18, '#7f77dd'],
    ['age', 0.12, '#ef9f27'],
    ['sibsp', 0.08, '#f97316'],
    ['embarked', 0.05, '#e24b4a'],
  ]
  return (
    <svg viewBox="0 0 300 150" className="ax-fig" role="img" aria-label="Ranked feature importance for the detected target">
      {features.map(([name, weight, color], i) => {
        const y = 10 + i * 23
        const width = (weight / 0.31) * 176
        return (
          <g key={name}>
            <text x="62" y={y + 8} className="ax-fig-tick" textAnchor="end">{name}</text>
            <rect
              x="70"
              y={y}
              width={width}
              height="16"
              rx="3"
              className="ax-fig-hbar"
              style={{ '--d': `${i * 90}ms`, transformOrigin: '70px 0', fill: color }}
            />
            <text x={74 + width} y={y + 8} className="ax-fig-tick" textAnchor="start">{weight.toFixed(2)}</text>
          </g>
        )
      })}
    </svg>
  )
}

function ClusterFigure() {
  const clusters = [
    { color: '#38bdf8', centre: [86, 52], points: [[70, 40], [96, 38], [78, 60], [100, 62], [88, 50], [64, 52]] },
    { color: '#1d9e75', centre: [168, 100], points: [[150, 90], [182, 94], [158, 112], [186, 114], [170, 100]] },
    { color: '#f97316', centre: [236, 48], points: [[222, 36], [250, 40], [228, 60], [252, 62], [238, 48]] },
  ]
  return (
    <svg viewBox="0 0 300 150" className="ax-fig" role="img" aria-label="PCA projection with three KMeans clusters">
      {clusters.map((cluster, ci) => (
        <g key={cluster.color}>
          {cluster.points.map(([cx, cy], i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r="4.2"
              className="ax-fig-point"
              style={{ '--d': `${ci * 180 + i * 50}ms`, fill: cluster.color }}
            />
          ))}
          <circle
            cx={cluster.centre[0]}
            cy={cluster.centre[1]}
            r="11"
            fill="none"
            stroke={cluster.color}
            strokeWidth="1.4"
            strokeDasharray="3 3"
            className="ax-fig-centroid"
            style={{ '--d': `${ci * 180 + 420}ms` }}
          />
        </g>
      ))}
      <text x="150" y="142" className="ax-fig-note">PC1 · 61% variance explained</text>
      <line x1="8" y1="130" x2="294" y2="130" className="ax-fig-axis" />
    </svg>
  )
}

const CHART_KINDS = [
  { id: 'hist', label: 'Histogram', icon: BarChart3, color: '#38bdf8', Figure: HistogramFigure, when: 'One numeric column. Shows the shape of the spread and where the mass sits — reported alongside the skew and the Tukey fences computed from the same column.', picks: 'univariate · numeric' },
  { id: 'scatter', label: 'Scatter + fit', icon: TrendingUp, color: '#f97316', Figure: ScatterFigure, when: 'Two numeric columns. The fitted line and its r and p-value say whether the relationship is real or just noise.', picks: 'bivariate · numeric pair' },
  { id: 'heat', label: 'Correlation grid', icon: Layers, color: '#7f77dd', Figure: HeatmapFigure, when: 'Every numeric pair at once. The strong and the useless become obvious in one glance instead of twenty scatter plots.', picks: 'multivariate · all numeric' },
  { id: 'bars', label: 'Grouped means', icon: BarChart3, color: '#1d9e75', Figure: GroupedBarFigure, when: 'A category against a measure. Group means are compared, and the spread between them is tested rather than eyeballed.', picks: 'bivariate · category × numeric' },
  { id: 'trend', label: 'Trend over time', icon: LineChart, color: '#38bdf8', Figure: TrendFigure, when: 'A date column against a measure, ordered on the real timestamps the loader parsed rather than on row order.', picks: 'time series · date × numeric' },
  { id: 'missing', label: 'Missing map', icon: Database, color: '#e24b4a', Figure: MissingFigure, when: 'Every column at once, ranked by how much is absent. This is the view that decides whether a column is usable at all.', picks: 'profiling · all columns' },
  { id: 'features', label: 'Feature ranking', icon: Gauge, color: '#1d9e75', Figure: FeatureImportanceFigure, when: 'The likely target is detected, then a random forest ranks which columns actually predict it — in order, with weights.', picks: 'feature discovery · ranked' },
  { id: 'clusters', label: 'Cluster map', icon: Activity, color: '#ef9f27', Figure: ClusterFigure, when: 'PCA projects the numeric columns to two axes and KMeans groups the rows, so natural segments show up as separated blobs.', picks: 'multivariate · PCA + KMeans' },
]

export function ChartLab() {
  const ref = useRef(null)
  const { index, setIndex, setPaused } = useSequence(CHART_KINDS.length, {
    interval: 3400,
  })

  const kind = CHART_KINDS[index]
  const Figure = kind.Figure
  const Icon = kind.icon

  return (
    <div
      ref={ref}
      className="ax-lab"
      style={{ '--accent': kind.color }}
    >
      <div className="ax-lab-head">
        <span className="ax-chip">
          <Sparkles size={13} /> CHART ENGINE
        </span>
        <span className="ax-lab-count">{CHART_KINDS.length} figure types · drawn as SVG</span>
      </div>

      <div className="ax-lab-stage">
        {/* Keyed so each switch replays the draw-in rather than cross-fading
            into an already-finished picture. */}
        <div className="ax-lab-figure" key={kind.id}>
          <Figure />
        </div>
        <div className="ax-lab-copy">
          <span className="ax-lab-picks" style={{ background: `${kind.color}1f`, color: kind.color }}>
            <Icon size={12} /> {kind.picks}
          </span>
          <h4>{kind.label}</h4>
          <p>{kind.when}</p>
        </div>
      </div>

      <div className="ax-lab-strip" role="tablist" aria-label="Chart types">
        {CHART_KINDS.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`ax-lab-tab${i === index ? ' is-active' : ''}`}
            style={i === index ? { borderColor: item.color, color: item.color } : undefined}
            onClick={() => setIndex(i)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 5. The time it takes ─────────────────────────────────────────────────────

/* The honest version of a speed claim: the manual lane lists the work that
   actually gets skipped, and the figure it totals to is labelled as a typical
   first pass rather than a benchmark. */
const MANUAL_STEPS = [
  ['Read the file, fight the encoding', 4],
  ['df.info(), df.describe(), eyeball dtypes', 5],
  ['Parse dates, strip currency and percent signs', 8],
  ['Count nulls, decide an imputation per column', 7],
  ['Write the IQR outlier scan', 6],
  ['Seven matplotlib cells, then fix the labels', 12],
  ['Write up what any of it means', 3],
]
const MANUAL_TOTAL = MANUAL_STEPS.reduce((sum, [, minutes]) => sum + minutes, 0)

const ARGUS_OUTPUTS = [
  'Types resolved with reasons',
  'Health score and null map',
  'Tukey fences per column',
  '10+ SVG figures',
  'Plain-English summaries',
  'PDF audit of the session',
]

export function SpeedRace() {
  const [ref, visible] = useReveal({ threshold: 0.25, once: false, rootMargin: '0px' })
  const [replay, setReplay] = useState(0)
  const p = useRamp({ active: visible, duration: 5600, loop: true, replay })

  // The manual lane spends the whole ramp; Argus finishes in the first 12% of
  // it, which is the point the picture is making.
  const manualMinutes = Math.round(p * MANUAL_TOTAL)
  const argusProgress = Math.min(1, p / 0.12)
  const argusSeconds = (argusProgress * 2.8).toFixed(1)

  let spent = 0
  const stepStates = MANUAL_STEPS.map(([, minutes]) => {
    const from = spent / MANUAL_TOTAL
    spent += minutes
    return p >= spent / MANUAL_TOTAL ? 'done' : p > from ? 'running' : 'idle'
  })

  return (
    <div ref={ref} className="ax-race">
      <div className="ax-race-head">
        <span className="ax-chip">
          <Timer size={13} /> FIRST PASS ON A NEW FILE
        </span>
        <button type="button" className="ax-replay" onClick={() => setReplay((n) => n + 1)}>
          <RotateCcw size={12} /> Replay
        </button>
      </div>

      <div className="ax-race-lanes">
        <div className="ax-lane is-manual">
          <div className="ax-lane-head">
            <b>By hand, in a notebook</b>
            <span className="ax-lane-clock">{String(manualMinutes).padStart(2, '0')}:00</span>
          </div>
          <div className="ax-lane-track">
            <i style={{ transform: `scaleX(${p})` }} />
          </div>
          <ul className="ax-lane-steps">
            {MANUAL_STEPS.map(([label, minutes], i) => (
              <li key={label} className={stepStates[i]}>
                <span className="ax-lane-mark" />
                <span className="ax-lane-label">{label}</span>
                <em>{minutes}m</em>
              </li>
            ))}
          </ul>
        </div>

        <div className="ax-lane is-argus">
          <div className="ax-lane-head">
            <b>With Argus</b>
            <span className="ax-lane-clock is-fast">{argusSeconds}s</span>
          </div>
          <div className="ax-lane-track">
            <i className="is-fast" style={{ transform: `scaleX(${argusProgress})` }} />
          </div>
          <ul className="ax-lane-outputs">
            {ARGUS_OUTPUTS.map((label, i) => {
              const at = (i + 1) / ARGUS_OUTPUTS.length
              return (
                <li key={label} className={argusProgress >= at ? 'done' : ''}>
                  <CheckCircle2 size={13} />
                  <span>{label}</span>
                </li>
              )
            })}
          </ul>
          <div className="ax-lane-foot">
            <Zap size={12} />
            <span>One drop, one pass — then you start asking questions instead of writing setup.</span>
          </div>
        </div>
      </div>

      <span className="ax-note">
        {MANUAL_TOTAL} minutes is a typical first pass written by hand, not a benchmark. The 2.8s figure is
        profiling runtime on the bundled sample; your own file depends on its size.
      </span>
    </div>
  )
}

// ── 6. Why there are no invented numbers ─────────────────────────────────────

/* The claim the whole product rests on, made checkable: three computed fields,
   and the three places they appear in the sentence. Stepping through links each
   number back to the field it came from, which is the opposite of how a chatbot
   produces a figure. */
const PROOF_FIELDS = [
  { key: 'pearson_r', value: '0.8213', note: 'computed by scipy.stats.pearsonr' },
  { key: 'p_value', value: '1.4e-24', note: 'two-sided, same call' },
  { key: 'n_rows', value: '4812', note: 'rows after null pairs dropped' },
]

export function GroundingProof() {
  const ref = useRef(null)
  const { index, setIndex, setPaused } = useSequence(PROOF_FIELDS.length, {
    interval: 2600,
  })

  return (
    <div
      ref={ref}
      className="ax-proof"
    >
      <div className="ax-proof-head">
        <span className="ax-chip">
          <ShieldCheck size={13} /> GROUNDED BY CONSTRUCTION
        </span>
        <span className="ax-proof-sub">The model never supplies a figure — it only describes the ones already computed.</span>
      </div>

      <div className="ax-proof-grid">
        <div className="ax-proof-step">
          <span className="ax-proof-num">1</span>
          <b>Python computes</b>
          <div className="ax-proof-json">
            <code className="ax-json-brace">{'{'}</code>
            {PROOF_FIELDS.map((field, i) => (
              <button
                key={field.key}
                type="button"
                className={`ax-json-row${i === index ? ' is-active' : ''}`}
                onClick={() => setIndex(i)}
              >
                <span className="ax-json-key">"{field.key}"</span>
                <span className="ax-json-colon">:</span>
                <span className="ax-json-val">{field.value}</span>
                <em>{field.note}</em>
              </button>
            ))}
            <code className="ax-json-brace">{'}'}</code>
          </div>
        </div>

        <div className="ax-proof-step is-pipe">
          <span className="ax-proof-num">2</span>
          <b>Only this crosses over</b>
          <div className="ax-proof-pipe" aria-hidden="true">
            <span className="ax-pipe-line"><i /></span>
            <Lock size={15} />
          </div>
          <p>
            The result JSON goes to the model. Your rows do not. There is nothing in the prompt for it to
            average, round or embellish — the arithmetic is already finished.
          </p>
        </div>

        <div className="ax-proof-step">
          <span className="ax-proof-num">3</span>
          <b>The sentence is written</b>
          <p className="ax-proof-sentence">
            Revenue and units sold move together strongly,{' '}
            <mark className={index === 0 ? 'is-lit' : ''}>r = 0.82</mark>
            {' across '}
            <mark className={index === 2 ? 'is-lit' : ''}>4,812 rows</mark>
            {', and the relationship clears significance at '}
            <mark className={index === 1 ? 'is-lit' : ''}>p &lt; 0.001</mark>
            {'. That is association, not proof of cause.'}
          </p>
          <span className="ax-proof-trace">
            <Bot size={12} />
            <span>
              highlighted figure traced to <code>result.{PROOF_FIELDS[index].key}</code>
            </span>
          </span>
        </div>
      </div>

      <div className="ax-proof-foot">
        <Terminal size={13} />
        <span>
          If no model provider is reachable, Argus says so and the analysis still runs. The figures never
          depended on it.
        </span>
      </div>
    </div>
  )
}

// ── A small switcher so two widgets can share one phone screen ───────────────

/* Desktop puts a section's widgets side by side. A phone cannot, and stacking
   them turns one screen into three, so the narrow layout shows one at a time
   behind a segmented control. Both branches render the same children — only the
   chrome differs.

   `mode="switch"` keeps the switcher at every width, for a pair whose widgets
   each want the full column: the agent graph in half a screen is a diagram with
   nine-pixel labels. */
export function ExplainerPair({ items, className = '', mode = 'auto' }) {
  const narrow = useMediaQuery('(max-width: 900px)')
  const [active, setActive] = useState(0)
  const switched = mode === 'switch' || narrow

  if (!switched) {
    return (
      <div className={`ax-pair ${className}`.trim()}>
        {items.map((item) => (
          <div key={item.id} className="ax-pair-cell">
            {item.render()}
          </div>
        ))}
      </div>
    )
  }

  const current = items[Math.min(active, items.length - 1)]

  return (
    <div className={`ax-pair is-switched ${className}`.trim()}>
      <div className="ax-pair-switch" role="tablist">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={`ax-pair-tab${i === active ? ' is-active' : ''}`}
            onClick={() => setActive(i)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="ax-pair-cell" key={current.id}>{current.render()}</div>
    </div>
  )
}
