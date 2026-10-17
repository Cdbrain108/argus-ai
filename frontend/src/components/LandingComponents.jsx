import React, { useState, useEffect, useRef } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  Database,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Gauge,
  Hash,
  HelpCircle,
  Home,
  Layers,
  LineChart,
  MapPin,
  Play,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  TrendingUp,
  User,
  Users,
  Zap,
} from 'lucide-react'

// ── What Argus Does Showcase (First Page Master Capability Console) ───────────────
export function WhatArgusDoesShowcase({ onEnter, onDemo }) {
  const [activeTab, setActiveTab] = useState(0)
  const [paused, setPaused] = useState(false)
  const containerRef = useRef(null)
  const [inView, setInView] = useState(false)

  // Observe entering view inside the landing-scroll container
  useEffect(() => {
    const node = containerRef.current
    if (!node) return undefined
    const scrollRoot = node.closest('.landing-scroll')
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting)
      },
      { root: scrollRoot || null, threshold: 0.08 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const capabilities = [
    {
      id: 'ingestion',
      tabLabel: 'Smart Ingestion',
      icon: <FileSpreadsheet size={15} color="#38BDF8" />,
      badge: 'ZERO-CONFIG INGESTION',
      badgeColor: '#38BDF8',
      title: 'Automated Type & Schema Detection',
      tagline: 'Drop in raw files. Argus types, cleans, and structures everything.',
      description: 'Zero manual schema definition. Argus auto-detects 10+ file types (CSV, XLSX, Parquet, JSON), smells delimiters, handles encoding anomalies (UTF-8, Latin-1, CP1252), and parses semantic types: ISO dates, timestamps, currencies, percentages, and categorical hierarchies.',
      highlights: [
        'Auto-sniffs dates, currencies, and boolean values on arrival',
        'Detects and reclaims corrupted rows and nulled string tokens',
        'Assigns statistical column roles for downstream machine learning'
      ],
      engineBadge: 'Python 3.11 · pandas.read_csv · auto_sniff_datetime',
      proof: '4,812 rows × 12 cols ingested & typed in 0.38s'
    },
    {
      id: 'profiling',
      tabLabel: 'Deep Profiling',
      icon: <Activity size={15} color="#1D9E75" />,
      badge: 'DETERMINISTIC STATS',
      badgeColor: '#1D9E75',
      title: 'Autonomous Statistical Profiling',
      tagline: '100% computed arithmetic. Zero estimates or hallucinations.',
      description: 'Calculates a 0–100 composite Dataset Health Score factoring missingness, duplicates, and anomaly severity. Computes Tukey IQR fences, tail skewness, kurtosis, and full Pearson and Spearman correlation matrices with statistical two-tailed p-values.',
      highlights: [
        '0-100 Dataset Health Score with breakdown penalties',
        'Tukey IQR fences (Q1 - 1.5*IQR, Q3 + 1.5*IQR) detect anomalies',
        'Pearson & Spearman correlation matrices with statistical significance'
      ],
      engineBadge: 'SciPy 1.11 · scipy.stats.skew · Tukey Fences',
      proof: '10+ publication-ready SVG statistical charts auto-generated'
    },
    {
      id: 'sandbox',
      tabLabel: 'AST Sandbox',
      icon: <ShieldCheck size={15} color="#EF9F27" />,
      badge: 'AIR-GAPPED PRIVACY',
      badgeColor: '#EF9F27',
      title: 'AST-Gated Python Execution Sandbox',
      tagline: 'Local memory execution. Your rows never touch the cloud.',
      description: 'Executes pandas and SciPy calculations inside an ephemeral, memory-isolated local subprocess. An AST static analysis gate inspects every line of generated code before execution, blocking all network sockets, file persistence, and malicious system calls.',
      highlights: [
        '100% in-memory computation — zero data persisted to disk',
        'AST gate blocks network, filesystem writes, and subprocess execution',
        'Ephemeral session memory purges immediately upon browser exit'
      ],
      engineBadge: 'Python ast.parse · Memory Isolation · Zero Cloud Sockets',
      proof: 'Passed 100% of AST security validation tests'
    },
    {
      id: 'agents',
      tabLabel: 'Grounded AI',
      icon: <BrainCircuit size={15} color="#F97316" />,
      badge: 'LANGGRAPH MULTI-AGENT',
      badgeColor: '#F97316',
      title: 'Multi-Agent Grounded Narration',
      tagline: 'Planner + Validator agents. Translates math into executive insight.',
      description: 'A multi-agent state graph coordinates a Planner, Tool Router, and Validator. Strict mathematical grounding guarantees the model never invents or guesses a number — it only explains already-computed statistics in boardroom-ready, plain English prose.',
      highlights: [
        'Autonomous query planning routes to deterministic statistical tools',
        'Self-correcting validator retries code errors rather than guessing',
        'Executive PDF audit report generated with 1 click'
      ],
      engineBadge: 'LangGraph StateGraph v0.2 · Grounded Construction',
      proof: '0 Hallucinations: every token traced to Python output'
    }
  ]

  // Auto-advance tabs every 4.5s only when visible and not hovered
  useEffect(() => {
    if (!inView || paused) return undefined
    const timer = setInterval(() => {
      setActiveTab((prev) => (prev + 1) % capabilities.length)
    }, 4500)
    return () => clearInterval(timer)
  }, [inView, paused, capabilities.length])

  const current = capabilities[activeTab]

  return (
    <div
      ref={containerRef}
      className="what-we-do-console"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      role="region"
      aria-label="What Argus Does Capability Showcase"
    >
      {/* Console Top Window Bar */}
      <div className="console-topbar">
        <div className="console-window-controls" aria-hidden="true">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
        </div>
        <div className="console-title">
          <span>WHAT ARGUS DOES</span>
          <span className="console-pill">Live Architecture</span>
        </div>
        <div className="console-speed">
          <span className="live-dot" />
          <span>Python 3.11 Local Kernel</span>
        </div>
      </div>

      {/* 4 Superpower Tab Strip */}
      <div className="console-tab-strip" role="tablist">
        {capabilities.map((cap, idx) => (
          <button
            key={cap.id}
            role="tab"
            aria-selected={activeTab === idx}
            className={`console-tab ${activeTab === idx ? 'active' : ''}`}
            onClick={() => setActiveTab(idx)}
          >
            {cap.icon}
            <span>{cap.tabLabel}</span>
          </button>
        ))}
      </div>

      {/* Main Capability Exhibition Body */}
      <div className="console-body" key={current.id}>
        <div className="console-cap-head">
          <div className="console-cap-badge" style={{ color: current.badgeColor, borderColor: `${current.badgeColor}40`, background: `${current.badgeColor}18` }}>
            <span>{current.badge}</span>
          </div>
          <span className="console-step-num">PILLAR {activeTab + 1} OF 4</span>
        </div>

        <h3 className="console-cap-title">{current.title}</h3>
        <p className="console-cap-tagline">{current.tagline}</p>
        <p className="console-cap-desc">{current.description}</p>

        {/* Feature Checkpoints */}
        <div className="console-checkpoints">
          {current.highlights.map((h, i) => (
            <div key={i} className="console-check-item">
              <CheckCircle2 size={14} className="check-icon" style={{ color: current.badgeColor }} />
              <span>{h}</span>
            </div>
          ))}
        </div>

        {/* Terminal Proof Bar */}
        <div className="console-terminal-bar">
          <Terminal size={13} className="term-icon" />
          <span className="term-cmd">{current.engineBadge}</span>
          <span className="term-proof">{current.proof}</span>
        </div>
      </div>

      {/* Console Bottom Action Strip */}
      <div className="console-foot-strip">
        <div className="console-dots-nav">
          {capabilities.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`c-dot ${i === activeTab ? 'active' : ''}`}
              onClick={() => setActiveTab(i)}
              aria-label={`Go to pillar ${i + 1}`}
            />
          ))}
        </div>
        <div className="console-foot-actions">
          <button
            type="button"
            className="console-next-btn"
            onClick={() => setActiveTab((p) => (p + 1) % capabilities.length)}
          >
            <span>Next Superpower</span>
            <ChevronRight size={13} />
          </button>
          <button
            type="button"
            className="console-launch-btn"
            onClick={onDemo}
          >
            <Zap size={13} />
            <span>Test Live in Workspace &rarr;</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// Mobile What We Do Cards Component
export function MobileWhatWeDoCards({ onEnter, onDemo }) {
  const [activeTab, setActiveTab] = useState(0)

  const capabilities = [
    {
      id: 'ingestion',
      label: '📁 Smart Types',
      badge: 'SMART INGESTION',
      color: '#38BDF8',
      title: '0-Config Schema Ingestion',
      desc: 'Auto-detects CSV, Excel, Parquet & JSON. Sniffs dates, currency, percentages and booleans with zero manual setup.',
      stat: '0.38s Ingestion Time'
    },
    {
      id: 'profiling',
      label: '📊 Profiling',
      badge: 'DEEP PROFILING',
      color: '#1D9E75',
      title: 'Tukey Fences & Health Scoring',
      desc: 'Computes a 0–100 data health index, Tukey outlier fences, skewness, and Pearson/Spearman correlation matrices.',
      stat: '10+ Auto-Drawn SVG Charts'
    },
    {
      id: 'sandbox',
      label: '🛡️ Sandbox',
      badge: 'AST-GATED PRIVACY',
      color: '#EF9F27',
      title: 'Air-Gapped Python Sandbox',
      desc: 'Runs 100% in-memory Python with AST code verification. Zero network calls, zero disk writes, zero data retention.',
      stat: '100% In-Memory Python'
    },
    {
      id: 'agents',
      label: '🤖 AI Agents',
      badge: 'LANGGRAPH AGENTS',
      color: '#F97316',
      title: 'Grounded AI Narration',
      desc: 'Autonomous planner and validator agents translate raw computed statistics into plain-English executive summaries.',
      stat: '0 Hallucinations Guaranteed'
    }
  ]

  const cur = capabilities[activeTab]

  return (
    <div className="mobile-what-we-do-shell">
      <div className="mobile-wwd-tabs">
        {capabilities.map((c, i) => (
          <button
            key={c.id}
            className={`mobile-wwd-tab ${activeTab === i ? 'active' : ''}`}
            onClick={() => setActiveTab(i)}
            style={activeTab === i ? { borderColor: c.color, color: '#fff', background: `${c.color}22` } : {}}
          >
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      <div className="mobile-wwd-card" key={cur.id}>
        <div className="mobile-wwd-card-head">
          <span className="mobile-wwd-badge" style={{ color: cur.color, borderColor: `${cur.color}40`, background: `${cur.color}18` }}>
            {cur.badge}
          </span>
          <span className="mobile-wwd-stat">{cur.stat}</span>
        </div>
        <h4 className="mobile-wwd-title">{cur.title}</h4>
        <p className="mobile-wwd-desc">{cur.desc}</p>
        <div className="mobile-wwd-foot">
          <span className="mobile-wwd-guarantee">✦ 100% Local Python Engine · 0 Cloud Retention</span>
        </div>
      </div>
    </div>
  )
}

// ── Hero Data Pulse (Interactive Mini-Studio Preview in Hero) ───────────────
export function HeroDataPulse({ onEnter, onDemo }) {
  const [activeTab, setActiveTab] = useState('pulse') // 'pulse' | 'insight' | 'matrix'
  const [hoveredCell, setHoveredCell] = useState(null)

  // Auto-cycle through tabs unless hovered
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return undefined
    const tabs = ['pulse', 'insight', 'matrix']
    const timer = setInterval(() => {
      setActiveTab((curr) => {
        const nextIdx = (tabs.indexOf(curr) + 1) % tabs.length
        return tabs[nextIdx]
      })
    }, 4500)
    return () => clearInterval(timer)
  }, [paused])

  return (
    <div
      className="arg-pulse-preview"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      role="region"
      aria-label="Interactive Argus Dataset Preview"
    >
      {/* Window Header */}
      <div className="arg-pulse-header">
        <div className="arg-pulse-dots" aria-hidden="true">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
        </div>
        <div className="arg-pulse-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'pulse'}
            className={`arg-pulse-tab ${activeTab === 'pulse' ? 'active' : ''}`}
            onClick={() => setActiveTab('pulse')}
          >
            <Activity size={13} className="tab-icon" />
            <span>Dataset Pulse</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'insight'}
            className={`arg-pulse-tab ${activeTab === 'insight' ? 'active' : ''}`}
            onClick={() => setActiveTab('insight')}
          >
            <Sparkles size={13} className="tab-icon" />
            <span>AI Column Insight</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'matrix'}
            className={`arg-pulse-tab ${activeTab === 'matrix' ? 'active' : ''}`}
            onClick={() => setActiveTab('matrix')}
          >
            <BarChart3 size={13} className="tab-icon" />
            <span>Correlation Matrix</span>
          </button>
        </div>
        <div className="arg-pulse-status">
          <span className="status-indicator live" />
          <span className="status-label">Local Engine v2.4</span>
        </div>
      </div>

      {/* Window Body */}
      <div className="arg-pulse-body">
        {activeTab === 'pulse' && (
          <div className="arg-pulse-pane arg-fade-in">
            <div className="arg-pulse-meta-bar">
              <div className="meta-dataset-info">
                <Database size={15} className="meta-icon" />
                <span className="meta-filename">sales_2024.csv</span>
                <span className="meta-badge">4,812 rows · 6 cols</span>
                <span className="meta-badge opt">UTF-8 · Comma</span>
              </div>
              <div className="meta-health-pill">
                <span className="health-num">87</span>
                <span className="health-lbl">/100 HEALTH</span>
              </div>
            </div>

            <div className="arg-pulse-types-grid">
              <div className="type-chip">
                <span className="col-name">order_date</span>
                <span className="col-raw">"12/03/2024"</span>
                <span className="col-arrow">→</span>
                <span className="col-type date">date</span>
              </div>
              <div className="type-chip">
                <span className="col-name">revenue</span>
                <span className="col-raw">"$1,234.56"</span>
                <span className="col-arrow">→</span>
                <span className="col-type money">currency</span>
              </div>
              <div className="type-chip">
                <span className="col-name">margin</span>
                <span className="col-raw">"18.4%"</span>
                <span className="col-arrow">→</span>
                <span className="col-type percent">percentage</span>
              </div>
              <div className="type-chip">
                <span className="col-name">returned</span>
                <span className="col-raw">"Yes"</span>
                <span className="col-arrow">→</span>
                <span className="col-type bool">boolean</span>
              </div>
              <div className="type-chip">
                <span className="col-name">region</span>
                <span className="col-raw">"North"</span>
                <span className="col-arrow">→</span>
                <span className="col-type cat">category</span>
              </div>
              <div className="type-chip">
                <span className="col-name">units_sold</span>
                <span className="col-raw">"42"</span>
                <span className="col-arrow">→</span>
                <span className="col-type num">integer</span>
              </div>
            </div>

            <div className="arg-pulse-banner">
              <span className="banner-accent">✦ Smart Type Ingestion:</span> Dates, currency, percentages and booleans are parsed as ground-truth types on arrival. Zero manual schema definition needed.
            </div>
          </div>
        )}

        {activeTab === 'insight' && (
          <div className="arg-pulse-pane arg-fade-in">
            <div className="arg-insight-card">
              <div className="insight-header">
                <div className="insight-col-badge">
                  <span className="col-tag">COLUMN FOCUS</span>
                  <h4>revenue (USD)</h4>
                  <span className="type-pill money">Currency · Continuous</span>
                </div>
                <div className="insight-stats">
                  <div className="stat-pill"><b>Mean:</b> $1,842.10</div>
                  <div className="stat-pill"><b>Median:</b> $1,234.56</div>
                  <div className="stat-pill warn"><b>Skew:</b> +1.84 (Right)</div>
                  <div className="stat-pill flag"><b>IQR Outliers:</b> 118 (2.4%)</div>
                </div>
              </div>

              <div className="insight-ai-bubble">
                <div className="ai-bubble-tag">
                  <Bot size={14} />
                  <span>ARGUS ANALYTICAL NARRATIVE · DETERMINISTIC COMPUTE</span>
                </div>
                <p>
                  Revenue shows a strong right-skewed log-normal distribution with median $1,234.56.
                  118 extreme transactions exceed Q3 + 1.5×IQR ($4,250.00). 
                  <strong> Actionable Next Step:</strong> Apply log-transformation before running parametric regression, or inspect high-ticket enterprise contracts in cluster #3.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'matrix' && (
          <div className="arg-pulse-pane arg-fade-in">
            <div className="arg-matrix-wrap">
              <div className="matrix-head-info">
                <span className="matrix-title">Computed Pearson Correlation Matrix (SciPy / pandas)</span>
                <span className="matrix-sub">Hover cells to reveal statistical significance & interpretation</span>
              </div>
              <div className="matrix-grid-interactive">
                {[
                  ['revenue', 'units_sold', 0.82, 'Strong Positive', '#1d9e75', 'p < 0.001 · High volume drives total revenue directly'],
                  ['revenue', 'margin', 0.04, 'Negligible', '#38bdf8', 'p = 0.42 · Pricing tiers are independent of top-line revenue'],
                  ['revenue', 'discount', -0.38, 'Moderate Inverse', '#f97316', 'p < 0.01 · Heavier discounting depresses revenue realization'],
                  ['units_sold', 'margin', -0.12, 'Weak Inverse', '#7f77dd', 'p = 0.08 · Marginal compression in wholesale volume batches'],
                  ['units_sold', 'discount', 0.64, 'Strong Positive', '#1d9e75', 'p < 0.001 · Promotional discount elasticity is highly effective'],
                  ['margin', 'discount', -0.68, 'Strong Negative', '#e24b4a', 'p < 0.001 · Unchecked discounting severely erodes gross margin'],
                ].map(([col1, col2, val, label, color, desc], idx) => (
                  <div
                    key={idx}
                    className={`matrix-cell-card ${hoveredCell === idx ? 'hovered' : ''}`}
                    onMouseEnter={() => setHoveredCell(idx)}
                    onMouseLeave={() => setHoveredCell(null)}
                    onClick={() => setHoveredCell((h) => (h === idx ? null : idx))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setHoveredCell((h) => (h === idx ? null : idx))
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-expanded={hoveredCell === idx}
                    style={{ '--accent': color }}
                  >
                    <div className="cell-pair">{col1} ↔ {col2}</div>
                    <div className="cell-val-row">
                      <span className="cell-val" style={{ color }}>r = {val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)}</span>
                      <span className="cell-label" style={{ background: `${color}22`, color }}>{label}</span>
                    </div>
                    <div className="cell-desc">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Window Footer / Quick CTA */}
      <div className="arg-pulse-footer">
        <span className="pulse-footer-note">✦ Zero code required. All computation runs deterministic Python in an isolated process.</span>
        <button className="pulse-footer-btn" onClick={onDemo}>
          <span>Test Live with Demo Data</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Streamlit-Inspired Modular EDA Features Workbench ───────────────────────
const PILLAR_KEYS = ['health', 'missing', 'outliers', 'correlation', 'prescriptions']

// Smooth, flicker-free count hook via requestAnimationFrame (starts close to target to prevent text layout jitter)
function useSmoothCount(target, from = Math.max(0, target - 16), duration = 400) {
  const [val, setVal] = useState(from)
  useEffect(() => {
    let startTimestamp = null
    let raf = null
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp
      const elapsed = timestamp - startTimestamp
      const progress = Math.min(elapsed / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setVal(Math.round(from + ease * (target - from)))
      if (progress < 1) {
        raf = requestAnimationFrame(step)
      }
    }
    raf = requestAnimationFrame(step)
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [target, from, duration])
  return val
}

// Sub-component: 📊 Health Score (Stable DOM, butter-smooth ring, zero re-mount flicker)
function HealthScoreWidget() {
  const score = useSmoothCount(87, 72, 450)

  return (
    <div className="eda-feature-widget health-widget animated-widget">
      <div className="health-gauge-row">
        <div className="health-ring-box">
          <svg width="96" height="96" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
            <circle
              cx="36"
              cy="36"
              r="28"
              fill="none"
              stroke="#1D9E75"
              strokeWidth="6"
              strokeDasharray="176 176"
              strokeDashoffset="23"
              strokeLinecap="round"
              transform="rotate(-90 36 36)"
              className="health-ring-fill-animated"
            />
          </svg>
          <div className="health-ring-center">
            <b className="num" style={{ color: '#1D9E75', fontVariantNumeric: 'tabular-nums' }}>{score}</b>
            <span className="lbl">/100</span>
          </div>
        </div>
        <div className="health-penalties">
          <div className="penalty-item">
            <div className="penalty-label-row">
              <span>Missing Values (19.9% in Age)</span>
              <span className="penalty-val red">-12</span>
            </div>
            <div className="penalty-track">
              <div className="penalty-bar red penalty-bar-missing-anim" />
            </div>
          </div>
          <div className="penalty-item">
            <div className="penalty-label-row">
              <span>Duplicate Rows</span>
              <span className="penalty-val green">0</span>
            </div>
            <div className="penalty-track">
              <div className="penalty-bar green" style={{ width: '0%' }} />
            </div>
          </div>
          <div className="penalty-item">
            <div className="penalty-label-row">
              <span>Tukey Outliers</span>
              <span className="penalty-val orange">-1</span>
            </div>
            <div className="penalty-track">
              <div className="penalty-bar orange penalty-bar-outlier-anim" />
            </div>
          </div>
        </div>
      </div>
      <div className="eda-widget-footnote">
        <span>Score formula: 100 - missing penalty - duplicate penalty - outlier penalty</span>
      </div>
    </div>
  )
}

// Sub-component: 🧱 Missing Heatmap (Solid, immediate appearance, zero black flash)
const MISSING_COLS = [
  { name: 'PassengerId', role: 'Key', Icon: Hash, pct: 0, status: 'clean', color: '#1D9E75', text: '0% Clean' },
  { name: 'Survived', role: 'Target', Icon: CheckCircle2, pct: 0, status: 'clean', color: '#1D9E75', text: '0% Clean' },
  { name: 'Pclass', role: 'Class', Icon: Layers, pct: 0, status: 'clean', color: '#1D9E75', text: '0% Clean' },
  { name: 'Age', role: 'Float', Icon: User, pct: 19.9, status: 'warn', color: '#EF9F27', text: '19.9% Null' },
  { name: 'SibSp', role: 'Count', Icon: Users, pct: 0, status: 'clean', color: '#1D9E75', text: '0% Clean' },
  { name: 'Parch', role: 'Count', Icon: Users, pct: 0, status: 'clean', color: '#1D9E75', text: '0% Clean' },
  { name: 'Fare', role: 'Price', Icon: DollarSign, pct: 0, status: 'clean', color: '#1D9E75', text: '0% Clean' },
  { name: 'Cabin', role: 'Sparse', Icon: Home, pct: 77.1, status: 'alert', color: '#E24B4A', text: '77.1% Null' },
  { name: 'Embarked', role: 'Port', Icon: MapPin, pct: 0.2, status: 'clean', color: '#1D9E75', text: '0.2% Low' },
]

function MissingHeatmapWidget() {
  return (
    <div className="eda-feature-widget missing-widget animated-widget">
      <div className="missing-tiles-grid missing-tiles-grid-enhanced">
        {MISSING_COLS.map((c) => {
          const ColIcon = c.Icon
          return (
            <div
              key={c.name}
              className={`missing-col-tile missing-tile-enhanced ${c.status}`}
              style={{
                borderColor: `${c.color}40`,
              }}
              title={`${c.name}: ${c.pct}% missing`}
            >
              <div className="tile-top-row">
                <div className="tile-col-badge">
                  <ColIcon size={12} style={{ color: c.color }} />
                  <span className="tile-name-full">{c.name}</span>
                </div>
                <span className="tile-role-pill">{c.role}</span>
              </div>
              <div className="tile-box-enhanced" style={{ background: `${c.color}18`, borderColor: `${c.color}38` }}>
                {c.status === 'clean' ? (
                  <CheckCircle2 size={13} style={{ color: c.color, flexShrink: 0 }} />
                ) : c.status === 'warn' ? (
                  <AlertTriangle size={13} style={{ color: c.color, flexShrink: 0 }} />
                ) : (
                  <AlertCircle size={13} style={{ color: c.color, flexShrink: 0 }} />
                )}
                <span className="tile-status-txt" style={{ color: c.color }}>{c.text}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="missing-legend">
        <span className="leg-item"><span className="leg-dot" style={{ background: '#1D9E75' }} /> Clean (0%)</span>
        <span className="leg-item"><span className="leg-dot" style={{ background: '#EF9F27' }} /> Low (&lt;20%)</span>
        <span className="leg-item"><span className="leg-dot" style={{ background: '#E24B4A' }} /> High (&ge;50%)</span>
      </div>
    </div>
  )
}

// Sub-component: 📐 Tukey Outliers (Stable IQR display, no strobe effect)
function TukeyOutliersWidget() {
  const outlierCount = useSmoothCount(118, 98, 450)

  return (
    <div className="eda-feature-widget outliers-widget animated-widget">
      <div className="outlier-stat-banner">
        <div className="outlier-metric-box">
          <span className="outlier-lbl">FLAGGED OUTLIERS</span>
          <b className="outlier-num red" style={{ fontVariantNumeric: 'tabular-nums' }}>{outlierCount} rows (13.2%)</b>
          <span className="outlier-sub">Column: Fare (USD)</span>
        </div>
        <div className="outlier-fences outlier-fences-anim">
          <div className="fence-row">
            <span className="f-lbl">Q1 (25%):</span>
            <span className="f-val">$7.91</span>
          </div>
          <div className="fence-row">
            <span className="f-lbl">Median:</span>
            <span className="f-val">$14.45</span>
          </div>
          <div className="fence-row">
            <span className="f-lbl">Q3 (75%):</span>
            <span className="f-val">$31.00</span>
          </div>
          <div className="fence-row fence-boundary">
            <span className="f-lbl">Upper Fence:</span>
            <span className="f-val red">$65.63</span>
          </div>
        </div>
      </div>
      <div className="eda-widget-footnote warn">
        <span>Skewness: +4.78 (Extreme log-normal tilt). Max value: $512.33. Recommend log1p transform.</span>
      </div>
    </div>
  )
}

// Sub-component: ⚡ Correlations (Solid cards, zero pop-in lag)
const CORR_PAIRS = [
  {
    names: 'Pclass ↔ Fare',
    tag: 'Strong Inverse',
    tagClass: 'neg',
    r: 'r = -0.55',
    rColor: '#E24B4A',
    p: 'p < 0.001 ★★★',
  },
  {
    names: 'SibSp ↔ Parch',
    tag: 'Moderate Positive',
    tagClass: 'pos',
    r: 'r = +0.41',
    rColor: '#1D9E75',
    p: 'p < 0.001 ★★★',
  },
  {
    names: 'Pclass ↔ Age',
    tag: 'Moderate Inverse',
    tagClass: 'neg',
    r: 'r = -0.37',
    rColor: '#EF9F27',
    p: 'p < 0.001 ★★★',
  },
]

function CorrelationsWidget() {
  return (
    <div className="eda-feature-widget correlation-widget animated-widget">
      <div className="corr-pairs-list">
        {CORR_PAIRS.map((p) => (
          <div
            key={p.names}
            className="corr-pair-card"
          >
            <div className="pair-names">
              <strong>{p.names}</strong>
              <span className={`pair-tag ${p.tagClass}`}>{p.tag}</span>
            </div>
            <div className="pair-metrics">
              <span className="r-num" style={{ color: p.rColor }}>{p.r}</span>
              <span className="p-pill">{p.p}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="eda-widget-footnote">
        <span>Calculated via scipy.stats.pearsonr with Bonferroni multiple testing corrections.</span>
      </div>
    </div>
  )
}

// Sub-component: 🛠️ ML Prescriptions (Clean actionable recommendations)
const RX_LIST = [
  {
    title: 'Impute missing Age with median (28.0 yrs)',
    detail: 'Preserves 177 rows without distorting normal distribution',
    color: '#1D9E75',
  },
  {
    title: 'Apply np.log1p transform to Fare',
    detail: 'Reduces skewness from +4.78 to +0.39 for linear algorithms',
    color: '#EF9F27',
  },
  {
    title: "Mode imputation for Embarked ('S')",
    detail: 'Only 2 null values (0.2%); safely assign modal category',
    color: '#38BDF8',
  },
]

function PrescriptionsWidget() {
  return (
    <div className="eda-feature-widget prescriptions-widget animated-widget">
      <ul className="prescriptions-list">
        {RX_LIST.map((r) => (
          <li
            key={r.title}
            className="rx-item"
          >
            <CheckCircle2 size={16} style={{ color: r.color, flexShrink: 0 }} />
            <div>
              <strong>{r.title}</strong>
              <span>{r.detail}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="eda-widget-footnote">
        <span>Export ready: generated transformation code can be copied into Python pipelines.</span>
      </div>
    </div>
  )
}

export function BentoFeatures() {
  const [activePillar, setActivePillar] = useState('health')
  const containerRef = useRef(null)

  const advanceToNext = () => {
    setActivePillar((prev) => {
      const idx = PILLAR_KEYS.indexOf(prev)
      const nextIdx = idx >= 0 ? (idx + 1) % PILLAR_KEYS.length : 0
      return PILLAR_KEYS[nextIdx]
    })
  }

  // Auto-run cycle across all 5 options:
  // 📊 Health Score -> 🧱 Missing Heatmap -> 📐 Tukey Outliers -> ⚡ Correlations -> 🛠️ ML Prescriptions
  useEffect(() => {
    const timer = setTimeout(() => {
      advanceToNext()
    }, 3800)
    return () => clearTimeout(timer)
  }, [activePillar])

  const pillars = {
    health: {
      id: 'health',
      emoji: '📊',
      label: 'Health Score',
      badge: 'AUTOMATED SCORING',
      accent: '#1D9E75',
      title: 'Dataset Health Score (0-100)',
      desc: 'An automated composite index computed on upload: 100 minus penalties for missingness, duplicate rows, and outlier severity.',
      metrics: [
        { k: 'COMPUTE ENGINE', v: 'Argus Deterministic Auditor' },
        { k: 'LATENCY', v: '< 3.5ms (In-Memory)' },
        { k: 'COMPUTE BASIS', v: '100% Deterministic SciPy' },
      ],
      tags: ['Zero Hallucination', 'Strict Scipy Penalty Matrix', 'Instant Health Index'],
      Widget: HealthScoreWidget,
    },
    missing: {
      id: 'missing',
      emoji: '🧱',
      label: 'Missing Heatmap',
      badge: 'COLUMN HYGIENE',
      accent: '#EF9F27',
      title: 'Col-by-Col Missing Value Heatmap',
      desc: 'Immediate visual scan of all columns: green for completely clean columns, yellow for low nulls, and red for high null concentration.',
      metrics: [
        { k: 'SCAN DEPTH', v: '891 Rows x 12 Columns' },
        { k: 'MASK PROFILER', v: 'MCAR / MAR Pattern Scan' },
        { k: 'MEMORY ALLOC', v: 'Zero-Copy Pandas Series' },
      ],
      tags: ['Column Sparsity Heatmap', 'Null Gradient Mask', 'Auto Impute Prescription'],
      Widget: MissingHeatmapWidget,
    },
    outliers: {
      id: 'outliers',
      emoji: '📐',
      label: 'Tukey Outliers',
      badge: 'ANOMALY FENCING',
      accent: '#E24B4A',
      title: 'Mathematical Tukey IQR Anomaly Fencing',
      desc: 'Automatic detection of heavy tails and mathematical outliers using interquartile fencing [Q1 - 1.5×IQR, Q3 + 1.5×IQR].',
      metrics: [
        { k: 'ALGORITHM', v: 'Tukey 1.5xIQR Fence Rule' },
        { k: 'SEVERITY TIER', v: 'Extreme Right Tilt (+4.78 Skew)' },
        { k: 'TREATMENT REC', v: 'np.log1p Mathematical Scale' },
      ],
      tags: ['Non-Parametric', 'Robust to Heavy Tails', 'Interquartile Breakdown'],
      Widget: TukeyOutliersWidget,
    },
    correlation: {
      id: 'correlation',
      emoji: '⚡',
      label: 'Correlations',
      badge: 'BIVARIATE STATS',
      accent: '#7F77DD',
      title: 'Pearson & Spearman Association Matrix',
      desc: 'Deterministic correlation pairs computed locally with p-value significance testing (<0.05) to isolate predictive drivers.',
      metrics: [
        { k: 'COEFFICIENTS', v: 'Pearson r & Spearman Matrix' },
        { k: 'SIGNIFICANCE', v: 'p < 0.001 (Bonferroni Corrected)' },
        { k: 'PAIRWISE SCAN', v: 'Complete Bivariate Space' },
      ],
      tags: ['Multicollinearity Alert', 'Hypothesis Test Gate', 'Predictive Driver Isolation'],
      Widget: CorrelationsWidget,
    },
    prescriptions: {
      id: 'prescriptions',
      emoji: '🛠️',
      label: 'ML Prescriptions',
      badge: 'PIPELINE READY',
      accent: '#38BDF8',
      title: 'Actionable Data Engineering Prescriptions',
      desc: 'Deterministic, verified recommendations to prepare raw data for downstream machine learning modeling and model deployment.',
      metrics: [
        { k: 'CODE SYNTHESIS', v: 'Python 3.11 & Scikit-Learn Ready' },
        { k: 'EXECUTION GATE', v: 'AST Grammar Sandbox Checked' },
        { k: 'PORTABILITY', v: 'Copyable Pipeline Script (.py)' },
      ],
      tags: ['Median Age Impute', 'Log1p Fare Scaling', 'Categorical Mode Fill'],
      Widget: PrescriptionsWidget,
    },
  }

  const current = pillars[activePillar]
  const currentIdx = PILLAR_KEYS.indexOf(activePillar)
  const nextPillarKey = PILLAR_KEYS[currentIdx >= 0 ? (currentIdx + 1) % PILLAR_KEYS.length : 0]
  const nextPillar = pillars[nextPillarKey]
  const ActiveWidget = current.Widget

  return (
    <div
      ref={containerRef}
      className="arg-eda-workbench"
    >
      {/* Pillar Selection Tabs — Clean emoji + label with active highlight & progress fill */}
      <div className="workbench-tabs" role="tablist">
        {Object.values(pillars).map((p) => {
          const isActive = activePillar === p.id
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={isActive}
              className={`workbench-tab ${isActive ? 'active' : ''}`}
              onClick={() => {
                setActivePillar(p.id)
              }}
              style={isActive ? { borderColor: p.accent, color: p.accent, background: `${p.accent}14` } : {}}
            >
              <span className="tab-emoji-icon">{p.emoji}</span>
              <span className="tab-label-text">{p.label}</span>
              {isActive && (
                <span
                  key={activePillar}
                  className="tab-progress-bar"
                  style={{
                    background: p.accent,
                  }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Main Feature Display Card — Outer container remains mounted without key re-mount flicker */}
      <div className="workbench-card" style={{ '--pillar-accent': current.accent }}>
        <div className="workbench-card-head">
          <div className="workbench-badge" style={{ background: `${current.accent}22`, color: current.accent }}>
            <span style={{ fontSize: '13px' }}>{current.emoji}</span>
            <span>{current.badge}</span>
          </div>
          <button
            type="button"
            className="workbench-next-pill"
            onClick={advanceToNext}
            title={`Click to jump immediately to ${nextPillar.label}`}
          >
            <span className="next-pulse-dot" style={{ background: nextPillar.accent }} />
            <span>Next window: {nextPillar.label}</span>
            <ArrowRight size={11} className="next-arrow-slide" />
            <span
              key={activePillar}
              className="workbench-next-pill-progress"
              style={{ background: nextPillar.accent }}
            />
          </button>
          <span className="workbench-engine-pill">Python 3.11 · Scipy &amp; Pandas</span>
        </div>

        <div className="workbench-body workbench-body-anim" key={activePillar}>
          <div className="workbench-text-col">
            <h3 className="workbench-title">{current.title}</h3>
            <p className="workbench-desc">{current.desc}</p>
            {current.metrics && (
              <div className="workbench-telemetry-row">
                {current.metrics.map((m, i) => (
                  <div key={i} className="wb-metric-chip">
                    <span className="wb-metric-k">{m.k}</span>
                    <span className="wb-metric-v">{m.v}</span>
                  </div>
                ))}
              </div>
            )}
            {current.tags && (
              <div className="workbench-tag-row">
                {current.tags.map((t, i) => (
                  <span key={i} className="wb-tag-pill" style={{ borderColor: `${current.accent}33`, color: '#cbd5e1' }}>
                    <span className="wb-tag-dot" style={{ background: current.accent }} />
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="workbench-visual-col">
            <ActiveWidget />
          </div>
        </div>
      </div>

      {/* Mobile Feature Switcher Controls */}
      <div className="workbench-mobile-nav">
        <button
          type="button"
          disabled={activePillar === Object.keys(pillars)[0]}
          onClick={() => {
            const keys = Object.keys(pillars)
            const idx = keys.indexOf(activePillar)
            if (idx > 0) {
              setActivePillar(keys[idx - 1])
            }
          }}
          className="wb-nav-btn"
        >
          &larr; Prev Feature
        </button>
        <span className="wb-nav-pill">
          Feature {Object.keys(pillars).indexOf(activePillar) + 1} of {Object.keys(pillars).length}
        </span>
        <button
          type="button"
          disabled={activePillar === Object.keys(pillars)[Object.keys(pillars).length - 1]}
          onClick={() => {
            const keys = Object.keys(pillars)
            const idx = keys.indexOf(activePillar)
            if (idx < keys.length - 1) {
              setActivePillar(keys[idx + 1])
            }
          }}
          className="wb-nav-btn"
        >
          Next Feature &rarr;
        </button>
      </div>
    </div>
  )
}

// ── Dynamic Workspace in Action with Live Typing & Simulation ─────────────────
export function WorkspaceShowcase({ onEnter, onDemo }) {
  const [scenarioIdx, setScenarioIdx] = useState(0)
  const [typedPrompt, setTypedPrompt] = useState('')
  const [execStage, setExecStage] = useState('done') // 'typing' | 'planning' | 'computing' | 'rendering' | 'done'
  const [narrativeText, setNarrativeText] = useState('')
  const [isUserInteracting, setIsUserInteracting] = useState(false)
  const rootRef = useRef(null)
  const [inView, setInView] = useState(true)
  const [reducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )

  /* Pause the simulation while off-screen: animation nobody watches is pure
     battery cost. Mirrors the ProjectOverview intersection pattern. */
  useEffect(() => {
    const node = rootRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return undefined
    const root = node.closest('.landing-scroll')
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { root: root || null, threshold: 0.15 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const scenarios = [
    {
      id: 'revenue',
      chip: 'Regional Revenue',
      icon: '📊',
      prompt: 'Compare monthly revenue across sales regions and flag any anomalies in performance.',
      planner: 'Planner: Bivariate Grouped Summary & ANOVA',
      engine: 'pandas.pivot_table() · SciPy ANOVA (F = 18.42, p < 0.001)',
      visualizer: 'Dynamic SVG Bar Chart Render',
      chartTitle: 'Monthly Revenue by Region (USD Thousands)',
      bars: [
        { label: 'West', val: '$412K', pct: '88%', color: '#38BDF8' },
        { label: 'East', val: '$328K', pct: '70%', color: '#1D9E75' },
        { label: 'Central', val: '$245K', pct: '52%', color: '#EF9F27' },
        { label: 'North', val: '$172K', pct: '36%', color: '#E24B4A' },
      ],
      narrative: 'Western region accounts for $412K (35.6% of gross revenue), outperforming Northern sales by 2.4×. ANOVA testing confirms regional divergence is statistically significant (F = 18.42, p < 0.001). Q3 showed an outlier spike of +44% in wholesale orders.',
    },
    {
      id: 'outliers',
      chip: 'Fare Skew & Outliers',
      icon: '🔍',
      prompt: 'Scan Fare distribution for extreme tail skewness and calculate Tukey fences.',
      planner: 'Planner: Univariate Distribution & Tukey Fencing',
      engine: 'scipy.stats.skew(clean_fare) · IQR = Q3 - Q1 ($23.09)',
      visualizer: 'Density Histogram & Boundary Overlay',
      chartTitle: 'Fare Spread & Outlier Boundary ($65.63)',
      bars: [
        { label: '$0-$15', val: '471', pct: '92%', color: '#1D9E75' },
        { label: '$15-$30', val: '200', pct: '48%', color: '#38BDF8' },
        { label: '$30-$65', val: '102', pct: '28%', color: '#EF9F27' },
        { label: '>$65 (Outliers)', val: '118', pct: '32%', color: '#E24B4A' },
      ],
      narrative: 'Heavy right-skew log-normal spread (skew: +4.78). 118 fares exceed the upper Tukey fence ($65.63), with maximum detected at $512.33. Recommend log1p transformation to stabilize variance before ML modeling.',
    },
    {
      id: 'correlation',
      chip: 'Missing & Correlation',
      icon: '⚡',
      prompt: 'Find missing values and compute Pearson correlation with survival rate.',
      planner: 'Planner: Missingness Matrix & Pearson Association',
      engine: 'df.isnull().sum() · df.corr(method="pearson")',
      visualizer: 'Bivariate Correlation Heatmap Strip',
      chartTitle: 'Predictive Association with Target Variable',
      bars: [
        { label: 'Sex (Cramer V)', val: '+0.54', pct: '85%', color: '#1D9E75' },
        { label: 'Pclass (r)', val: '-0.34', pct: '62%', color: '#E24B4A' },
        { label: 'Fare (r)', val: '+0.26', pct: '48%', color: '#38BDF8' },
        { label: 'Age (r)', val: '-0.08', pct: '18%', color: '#EF9F27' },
      ],
      narrative: '177 missing values in Age (19.9%). Age has negligible correlation (-0.08) with survival, whereas Sex shows dominant predictive power (Cramer V: 0.54). Impute Age with median (28.0) to preserve sample size.',
    },
  ]

  const currentScenario = scenarios[scenarioIdx]

  // Typing animation & state machine (skipped off-screen / reduced-motion)
  useEffect(() => {
    if (!inView) return undefined
    if (reducedMotion) {
      setTypedPrompt(currentScenario.prompt)
      setExecStage('done')
      setNarrativeText(currentScenario.narrative)
      return undefined
    }
    let cancelled = false
    let typeTimer = null
    let stageTimer = null

    const promptStr = currentScenario.prompt
    setTypedPrompt('')
    setExecStage('typing')
    setNarrativeText('')

    let charIdx = 0
    const typeChar = () => {
      if (cancelled) return
      if (charIdx <= promptStr.length) {
        setTypedPrompt(promptStr.slice(0, charIdx))
        charIdx++
        typeTimer = setTimeout(typeChar, 25)
      } else {
        // Prompt completed typing -> advance agent pipeline
        stageTimer = setTimeout(() => {
          if (cancelled) return
          setExecStage('planning')

          stageTimer = setTimeout(() => {
            if (cancelled) return
            setExecStage('computing')

            stageTimer = setTimeout(() => {
              if (cancelled) return
              setExecStage('rendering')

              stageTimer = setTimeout(() => {
                if (cancelled) return
                setExecStage('done')
                setNarrativeText(currentScenario.narrative)
              }, 400)
            }, 500)
          }, 450)
        }, 300)
      }
    }

    typeTimer = setTimeout(typeChar, 200)

    return () => {
      cancelled = true
      clearTimeout(typeTimer)
      clearTimeout(stageTimer)
    }
  }, [scenarioIdx, inView, reducedMotion])

  // Auto-cycle through scenarios every 9s unless user is interacting
  useEffect(() => {
    if (isUserInteracting || !inView || reducedMotion) return undefined
    const interval = setInterval(() => {
      setScenarioIdx((prev) => (prev + 1) % scenarios.length)
    }, 9000)
    return () => clearInterval(interval)
  }, [isUserInteracting, scenarios.length])

  return (
    <div
      ref={rootRef}
      className="arg-workspace-showcase dynamic-sim"
      onPointerEnter={() => setIsUserInteracting(true)}
      onPointerLeave={() => setIsUserInteracting(false)}
    >
      {/* Interactive Scenario Chips */}
      <div className="showcase-scenarios-strip" role="tablist">
        <span className="strip-title">Try Live Analytical Queries:</span>
        {scenarios.map((s, idx) => (
          <button
            key={s.id}
            type="button"
            className={`showcase-scenario-chip ${scenarioIdx === idx ? 'active' : ''}`}
            onClick={() => {
              setIsUserInteracting(true)
              setScenarioIdx(idx)
            }}
          >
            <span>{s.icon} {s.chip}</span>
          </button>
        ))}
      </div>

      {/* Main Interactive Studio Screen */}
      <div className="arg-showcase-monitor">
        {/* Top OS Window Bar */}
        <div className="monitor-topbar">
          <div className="monitor-window-controls" aria-hidden="true">
            <span className="dot red" />
            <span className="dot yellow" />
            <span className="dot green" />
          </div>
          <div className="monitor-filename">
            <span>titanic_master.csv</span>
            <span className="badge-ready">● Python Kernel Active</span>
          </div>
          <div className="monitor-engine-tag">
            <BrainCircuit size={11} className="spin-slow" />
            <span>LangGraph Multi-Agent StateGraph v0.2</span>
          </div>
        </div>

        {/* Studio Window Content */}
        <div className="monitor-content">
          {/* 1. Live Typing User Prompt Bar */}
          <div className="showcase-prompt-bar">
            <div className="prompt-avatar user">U</div>
            <div className="prompt-text dynamic-typewriter">
              <span>"{typedPrompt}"</span>
              {execStage === 'typing' && <i className="type-caret" />}
            </div>
          </div>

          {/* Dedicated LangGraph Multi-Agent Orchestration Bar */}
          <div className="showcase-langgraph-bar">
            <div className="lg-bar-left">
              <BrainCircuit size={13} style={{ color: '#38bdf8' }} />
              <strong>LangGraph StateGraph:</strong>
              <span className="lg-graph-nodes">START &rarr; Planner &rarr; AST Tool &rarr; Explainer &rarr; END</span>
            </div>
            <div className="lg-bar-right">
              <span className={`lg-state-tag ${execStage}`}>
                <span className="pulse-dot" /> NODE: {execStage.toUpperCase()}
              </span>
            </div>
          </div>

          {/* 2. Step-by-Step Agent Pipeline Trace */}
          <div className="showcase-agent-trace">
            <div className={`trace-item planner ${execStage !== 'typing' ? 'active pulse' : ''}`}>
              <span className="trace-role-chip">NODE 1: PLANNER</span>
              <span className="trace-text"><span className="trace-dot" /> {currentScenario.planner}</span>
            </div>
            <span className="trace-arrow">&rarr;</span>
            <div className={`trace-item engine ${['computing', 'rendering', 'done'].includes(execStage) ? 'active pulse' : ''}`}>
              <span className="trace-role-chip">NODE 2: REPL TOOL</span>
              <span className="trace-text"><span className="trace-dot" /> {currentScenario.engine}</span>
            </div>
            <span className="trace-arrow">&rarr;</span>
            <div className={`trace-item visualizer ${['rendering', 'done'].includes(execStage) ? 'active pulse' : ''}`}>
              <span className="trace-role-chip">NODE 3: EXPLAINER</span>
              <span className="trace-text"><span className="trace-dot" /> {currentScenario.visualizer}</span>
            </div>
          </div>

          {/* 3. Rendered Dynamic Chart */}
          <div className={`showcase-chart-card ${['rendering', 'done'].includes(execStage) ? 'visible' : 'pending'}`}>
            <div className="chart-header">
              <h5>{currentScenario.chartTitle}</h5>
              <span className="chart-pill">Deterministic Output</span>
            </div>
            <div className="chart-bars-demo">
              {currentScenario.bars.map((b) => (
                <div key={b.label} className="bar-col">
                  <span className="bar-val">{b.val}</span>
                  <div
                    className="bar-fill"
                    style={{
                      height: ['rendering', 'done'].includes(execStage) ? b.pct : '4px',
                      background: b.color,
                      transition: 'height 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  />
                  <span className="bar-lbl">{b.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Grounded AI Takeaway Box */}
          <div className={`showcase-ai-narrative ${execStage === 'done' ? 'visible' : 'pending'}`}>
            <div className="narrative-tag">
              <Sparkles size={13} />
              <span>LANGGRAPH EXPLAINER SYNTHESIS · 0 HALLUCINATIONS</span>
            </div>
            <p>{narrativeText || 'Synthesizing verified Python kernel output...'}</p>
          </div>
        </div>

        {/* Monitor Footer Action Strip */}
        <div className="monitor-footer-strip">
          <div className="monitor-footer-left">
            <span className="engine-status-dot" />
            <span>LangGraph Multi-Agent Engine · Ephemeral In-Memory Python Sandbox</span>
          </div>
          <div className="monitor-footer-actions">
            <button className="arg-btn-primary workspace-cta-btn" onClick={onEnter}>
              <span>Upload your dataset &rarr;</span>
            </button>
            <button className="arg-btn-secondary workspace-demo-btn" onClick={onDemo}>
              <Zap size={13} />
              <span>Try Live Demo</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Polished Product Footer ──────────────────────────────────────────────────
export function ArgusFooter() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <footer className="arg-footer-enhanced">
      <div className="arg-inner">
        <div className="arg-footer-grid">
          {/* Col 1: Brand & Philosophy */}
          <div className="footer-brand-col">
            <div className="footer-brand">
              <div className="brand-mark">A</div>
              <span className="brand-word">Argus</span>
            </div>
            <p className="brand-tagline">
              Automated Exploratory Data Analysis powered by local Python engines and grounded AI narration. No data is stored or shared.
            </p>
            <div className="system-status-pill">
              <span className="status-dot green" />
              <span>All Analysis Engines Operational</span>
            </div>
          </div>

          {/* Col 2: Navigation Links */}
          <div className="footer-nav-col">
            <h5>Product</h5>
            <ul className="footer-links">
              <li><a href="#top">Overview</a></li>
              <li><a href="#features">Features</a></li>
              <li><a href="#pipeline">Pipeline</a></li>
              <li><a href="#gallery">Workspace Studio</a></li>
              <li><a href="#about">Architecture</a></li>
              <li><a href="#faq">FAQ</a></li>
            </ul>
          </div>

          {/* Col 3: Engine Architecture Badges */}
          <div className="footer-nav-col">
            <h5>Architecture</h5>
            <ul className="footer-specs">
              <li><span className="spec-label">Computation:</span> pandas · SciPy · scikit-learn</li>
              <li><span className="spec-label">Security:</span> Local AST Sandboxed Process</li>
              <li><span className="spec-label">Privacy:</span> In-Memory Session · Zero Retention</li>
              <li><span className="spec-label">File Support:</span> CSV, Parquet, JSON, Excel (10+ formats)</li>
            </ul>
          </div>
        </div>

        <div className="arg-footer-bottom">
          <div className="footer-copy">
            <span>&copy; {new Date().getFullYear()} <strong>Argus EDA</strong>. Built for data scientists, analysts, and researchers.</span>
          </div>
          <button className="footer-back-to-top" onClick={scrollToTop} aria-label="Back to top">
            <span>Back to top ↑</span>
          </button>
        </div>

        {/* Dedicated Mobile Footer Strip */}
        <div className="arg-mobile-footer-strip">
          <div className="mobile-footer-brand">
            <span className="brand-dot green" />
            <span>Argus EDA · Local Python AST Engine</span>
          </div>
          <div className="mobile-footer-links">
            <a href="#top">Top</a>
            <span>•</span>
            <a href="#overview">Intel</a>
            <span>•</span>
            <a href="#features">Features</a>
            <span>•</span>
            <a href="#gallery">Studio</a>
            <span>•</span>
            <a href="#faq">FAQ</a>
          </div>
          <div className="mobile-footer-copy">
            <span>&copy; {new Date().getFullYear()} Argus. Built by Anuj Kesharwani.</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
