import React, { useState, useEffect } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Cpu,
  Database,
  FileSpreadsheet,
  FileText,
  Layers,
  LineChart,
  Lock,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Upload,
  Zap,
} from 'lucide-react'

/* Per-phase mobile explainer copy — Samvaad pattern: every section says in 1-2
   lines what happens here, then offers the next step. Short labels keep the
   mobile progress chrome to one line. */
const PHASE_NOTES = {
  top: {
    short: 'Home',
    what: 'Upload a file — Argus types columns, scores health and charts it locally.',
    next: 'overview',
    nextLabel: 'What Argus is',
  },
  overview: {
    short: 'Intel',
    what: 'Five questions people actually ask: purpose, grounding, privacy, agents, stack.',
    next: 'features',
    nextLabel: 'Features',
  },
  features: {
    short: 'Features',
    what: 'Health score, missing maps, Tukey fences, correlations — all computed, not guessed.',
    next: 'pipeline',
    nextLabel: 'Pipeline',
  },
  pipeline: {
    short: 'Pipeline',
    what: 'Your file → verified stats → grounded answer. It advances on its own — tap any stage to inspect its input and output.',
    next: 'agents',
    nextLabel: 'Agents',
  },
  agents: {
    short: 'Agents',
    what: 'Planner routes to a tool, validator retries instead of guessing, AST gate blocks danger.',
    next: 'charts',
    nextLabel: 'Charts',
  },
  charts: {
    short: 'Charts',
    what: 'Every figure is drawn from computed values — plus the manual work it saves you.',
    next: 'gallery',
    nextLabel: 'Workspace',
  },
  gallery: {
    short: 'Studio',
    what: 'The workspace after upload: ask in English, watch routing, read the answer with receipt.',
    next: 'about',
    nextLabel: 'Architecture',
  },
  about: {
    short: 'Arch',
    what: 'Deterministic Python underneath, plain-English narration on top — traced number by number.',
    next: 'faq',
    nextLabel: 'FAQ',
  },
  faq: {
    short: 'FAQ',
    what: 'Data privacy, AST sandboxing, and how local Python compute pairs with AI agents.',
    next: 'auth-cta',
    nextLabel: 'Launch',
  },
  'auth-cta': {
    short: 'Launch',
    what: 'Point Argus at your next dataset — free, under 3 seconds, rows never leave your session.',
    next: null,
    nextLabel: null,
  },
}

/* Slim Samvaad-style progress chrome, mobile only (CSS hides it on desktop).
   Shows position inside the 11-phase journey without stealing vertical room. */
export function PhaseProgress({ index, total, label }) {
  const pct = total > 1 ? Math.round(((index + 1) / total) * 100) : 100
  return (
    <div className="mp-progress" aria-hidden="true">
      <span className="mp-progress-count">
        {String(index + 1).padStart(2, '0')}/{String(total).padStart(2, '0')}
      </span>
      <span className="mp-progress-label">{label}</span>
      <span className="mp-progress-track">
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="mp-progress-pct">{pct}%</span>
    </div>
  )
}

/* Full-width 48px touch target that moves one phase forward. */
export function PhaseNext({ label, onNext }) {
  if (!label || !onNext) return null
  return (
    <button type="button" className="mp-next" onClick={onNext}>
      <span>
        Next · {label}
      </span>
      <ChevronDown size={15} />
    </button>
  )
}

/* Mobile-only per-phase explainer + next step, in formal stepper manner:
   hairline rule with journey fill, numbered step, quiet caption, and one
   restrained continue action. Rendered at the end of each Section on small
   screens so every viewport answers "what am I looking at?" and offers
   exactly one way forward — the Samvaad one-idea-per-screen rule. */
export function MobilePhaseChrome({ phaseId, onNext }) {
  const note = PHASE_NOTES[phaseId]
  if (!note) return null
  const order = Object.keys(PHASE_NOTES)
  const index = Math.max(0, order.indexOf(phaseId))
  const total = order.length
  const pct = Math.round(((index + 1) / total) * 100)
  return (
    <div className="mp-chrome">
      <div className="mp-rule" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="mp-step-row">
        <span className="mp-step">
          Step {String(index + 1).padStart(2, '0')} of {String(total).padStart(2, '0')}
        </span>
        {note.next && note.nextLabel && (
          <span className="mp-step-next">Next — {note.nextLabel}</span>
        )}
      </div>
      <p className="mp-note">{note.what}</p>
      {note.next && note.nextLabel && (
        <button
          type="button"
          className="mp-next"
          onClick={() => onNext?.(note.next)}
        >
          <span>
            Continue to {note.nextLabel}
          </span>
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  )
}

/* Mobile-first workspace empty state: stacked 48px CTAs, 3-step mini guide,
   format pills. Replaces the desktop-centred EmptyState below 768px so the
   first workspace screen fits without scrolling and explains itself. */
export function MobileWorkspaceEmpty({
  title = 'Bring a dataset into focus',
  subtitle = 'Drop a file anywhere, or start below. Schemas, missingness and Tukey outliers are detected automatically — charts are publication-grade.',
  onUpload,
  onDemo,
}) {
  const steps = [
    ['1', 'Choose a file', 'CSV, Excel, Parquet or JSON · up to 50 MB'],
    ['2', 'Argus profiles it', 'Types, health score, outliers in <3s'],
    ['3', 'Chat with results', 'Plain-English answers with receipts'],
  ]
  return (
    <div className="mp-empty">
      <div className="mp-empty-icon">
        <Database size={22} />
      </div>
      <p className="mp-empty-kicker">ARGUS WORKSPACE · STEP 01</p>
      <h2>{title}</h2>
      <p className="mp-empty-sub">{subtitle}</p>
      <div className="mp-empty-actions">
        <button type="button" className="mp-empty-primary" onClick={onUpload}>
          <Upload size={16} />
          <span>Choose dataset</span>
        </button>
        {onDemo && (
          <button type="button" className="mp-empty-demo" onClick={onDemo}>
            <Zap size={14} />
            <span>Load Titanic demo</span>
          </button>
        )}
      </div>
      <ol className="mp-empty-steps">
        {steps.map(([n, stepTitle, sub]) => (
          <li key={n}>
            <i>{n}</i>
            <div>
              <strong>{stepTitle}</strong>
              <span>{sub}</span>
            </div>
          </li>
        ))}
      </ol>
      <div className="mp-empty-pills">
        {['CSV', 'Excel', 'Parquet', 'JSON', 'Max 50MB'].map((fmt) => (
          <span key={fmt}>{fmt}</span>
        ))}
      </div>
    </div>
  )
}

/* 4-Stage Interactive Pipeline Card Stepper built specifically for mobile screens */
export function MobilePipelineStepper({ onDemo, onEnter }) {
  const [activeStage, setActiveStage] = useState(0)

  const stages = [
    {
      id: 'ingest',
      step: '01',
      title: 'Sniff & Coerce Types',
      desc: 'Sniffs delimiters & encodings. Coerces "$1,200", dates, %, and booleans into true numeric and datetime dtypes.',
      icon: Database,
      color: '#F97316',
      receipt: 'sniff_delimiter() → "," · coerce("$1,234.56") → 1234.56',
      badge: 'BYTE PARSING',
    },
    {
      id: 'profile',
      step: '02',
      title: 'Quality & Health Index',
      desc: 'Calculates null gradients, duplicate rows, and Tukey IQR fences into a unified 0–100 dataset health score.',
      icon: Activity,
      color: '#7F77DD',
      receipt: 'upper_fence = Q3 + 1.5×IQR · health 87/100',
      badge: 'STATISTICAL AUDIT',
    },
    {
      id: 'plan',
      step: '03',
      title: 'Agent Execution Plan',
      desc: 'Translates natural queries into deterministic steps. Verifies schema column names before execution.',
      icon: BrainCircuit,
      color: '#38BDF8',
      receipt: 'intent = bivariate_corr · cols = [revenue, units] · tools = 3',
      badge: 'SCHEMA VERIFIED',
    },
    {
      id: 'compute',
      step: '04',
      title: 'Isolated Python REPL',
      desc: 'Executes equations in offline pandas/SciPy. AST gate blocks unauthorized system calls or external sockets.',
      icon: ShieldCheck,
      color: '#1D9E75',
      receipt: 'sandbox_ok · AST_rules = 8 · runtime = 0.38s · memory = 12MB',
      badge: 'AST GUARDED',
    },
  ]

  // Auto-advance stages smoothly with reset on manual click
  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveStage((prev) => (prev + 1) % stages.length)
    }, 3800)
    return () => clearTimeout(timer)
  }, [activeStage])

  const current = stages[activeStage]
  const Icon = current.icon

  return (
    <div className="mp-pipeline-container">
      {/* Horizontal Step Indicator Pills */}
      <div className="mp-pipeline-pills" role="tablist">
        {stages.map((st, idx) => (
          <button
            key={st.id}
            role="tab"
            aria-selected={activeStage === idx}
            className={`mp-pipeline-pill ${activeStage === idx ? 'active' : ''}`}
            onClick={() => setActiveStage(idx)}
            style={{ '--accent': st.color }}
          >
            <span className="pill-step">{st.step}</span>
            <span className="pill-title">{st.title.split(' ')[0]}</span>
            {activeStage === idx && (
              <span
                key={activeStage}
                className="tab-progress-bar"
                style={{ background: st.color }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Active Stage Spotlight Card */}
      <div className="mp-stage-card" style={{ '--accent': current.color }}>
        <div className="mp-stage-header">
          <div className="mp-stage-icon-box">
            <Icon size={18} style={{ color: current.color }} />
          </div>
          <div className="mp-stage-title-wrap">
            <span className="mp-stage-tag">{current.badge}</span>
            <h4 className="mp-stage-title">STAGE {current.step} · {current.title}</h4>
          </div>
        </div>

        <p className="mp-stage-desc">{current.desc}</p>

        <div className="mp-stage-receipt">
          <span className="receipt-dot" />
          <code>{current.receipt}</code>
        </div>
      </div>

      {/* Quick Navigation Footer */}
      <div className="mp-pipeline-actions">
        <button
          type="button"
          className="mp-pipe-btn prev"
          disabled={activeStage === 0}
          onClick={() => setActiveStage((p) => Math.max(0, p - 1))}
        >
          &larr; Prev Stage
        </button>
        <span className="mp-pipe-count">
          {activeStage + 1} of {stages.length}
        </span>
        <button
          type="button"
          className="mp-pipe-btn next"
          disabled={activeStage === stages.length - 1}
          onClick={() => setActiveStage((p) => Math.min(stages.length - 1, p + 1))}
        >
          Next Stage &rarr;
        </button>
      </div>
    </div>
  )
}

/* Mobile-first interactive chart switcher (Histogram, Correlation, Outliers, AI Summary) */
export function MobileChartShowcase({ onDemo, onEnter }) {
  const [activeTab, setActiveTab] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveTab((prev) => (prev + 1) % 4)
    }, 3800)
    return () => clearTimeout(timer)
  }, [activeTab])

  const items = [
    {
      id: 'distribution',
      label: '📊 Distribution',
      title: 'Tukey Outliers & Skewness',
      stat: 'r = 0.82',
      badge: 'HISTOGRAM & DENSITY',
      desc: 'Automatic bins, density curves, and interquartile boundary detection computed in native SciPy.',
      bullets: [
        '✦ Tukey IQR fence: Q3 + 1.5×IQR boundary',
        '✦ Skewness & Kurtosis tail risk detection',
        '✦ 100% computed from exact float matrix',
      ],
      color: '#F97316',
    },
    {
      id: 'correlation',
      label: '📈 Correlations',
      title: 'Pearson & Spearman Matrices',
      stat: 'p < 0.001',
      badge: 'HEATMAP ENGINE',
      desc: 'Pairwise linear and non-linear associations paired with two-tailed p-values to prevent random false links.',
      bullets: [
        '✦ Bivariate correlation with p-value significance',
        '✦ Non-linear monotonic rank detection',
        '✦ Dynamic SVG rendering with 0 canvas blur',
      ],
      color: '#38BDF8',
    },
    {
      id: 'health',
      label: '🎯 Health Audit',
      title: '0–100 Quality Health Index',
      stat: '87 / 100',
      badge: 'QUALITY SCORE',
      desc: 'Instant synthesis of missingness, duplicate rows, zero-variance columns, and extreme values.',
      bullets: [
        '✦ Missingness penalty scaling with column count',
        '✦ Duplicate row identifier with hash grouping',
        '✦ Actionable data cleaning recommendations',
      ],
      color: '#1D9E75',
    },
    {
      id: 'explainer',
      label: '🤖 AI Narrator',
      title: 'Evidence-Grounded Explanations',
      stat: '0 Hallucinations',
      badge: 'GROUNDED AI',
      desc: 'The LLM never invents numbers. It acts as an analytical reader over verified JSON telemetry from Python.',
      bullets: [
        '✦ Mathematical citations for every sentence',
        '✦ Prescriptive next steps for business analysts',
        '✦ Exportable PDF reports & Python scripts',
      ],
      color: '#7F77DD',
    },
  ]

  const current = items[activeTab]

  return (
    <div className="mp-showcase-container">
      {/* Tab Switcher */}
      <div className="mp-showcase-tabs" role="tablist">
        {items.map((it, idx) => (
          <button
            key={it.id}
            role="tab"
            aria-selected={activeTab === idx}
            className={`mp-showcase-tab ${activeTab === idx ? 'active' : ''}`}
            onClick={() => setActiveTab(idx)}
            style={{ '--accent': it.color }}
          >
            {it.label}
            {activeTab === idx && (
              <span
                key={activeTab}
                className="tab-progress-bar"
                style={{ background: it.color }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Feature Showcase Card */}
      <div className="mp-showcase-card" style={{ '--accent': current.color }}>
        <div className="mp-showcase-head">
          <div className="mp-showcase-tag">{current.badge}</div>
          <div className="mp-showcase-stat" style={{ color: current.color }}>{current.stat}</div>
        </div>

        <h4 className="mp-showcase-title">{current.title}</h4>
        <p className="mp-showcase-desc">{current.desc}</p>

        <ul className="mp-showcase-bullets">
          {current.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>

        <div className="mp-showcase-footer">
          <button type="button" className="mp-showcase-demo-btn" onClick={onDemo}>
            <Zap size={13} />
            <span>⚡ Test in Live Demo</span>
          </button>
        </div>
      </div>
    </div>
  )
}

/* Mobile-first tab switcher for the AI Analyst page between Chat and Schema Data Fields */
export function MobileAnalystSwitcher({ activeTab, onChange, columnCount = 0 }) {
  return (
    <div className="mp-analyst-switch" role="tablist" aria-label="AI Analyst Mobile View Switcher">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'chat'}
        className={`mp-analyst-tab ${activeTab === 'chat' ? 'active' : ''}`}
        onClick={() => onChange('chat')}
      >
        <Bot size={14} />
        <span>AI Analyst Chat</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'schema'}
        className={`mp-analyst-tab ${activeTab === 'schema' ? 'active' : ''}`}
        onClick={() => onChange('schema')}
      >
        <Database size={14} />
        <span>Data Fields</span>
        {columnCount > 0 && <span className="mp-analyst-badge">{columnCount}</span>}
      </button>
    </div>
  )
}

