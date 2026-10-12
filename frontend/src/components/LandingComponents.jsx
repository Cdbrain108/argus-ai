import React, { useState, useEffect } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Database,
  Download,
  FileText,
  Layers,
  LineChart,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react'

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

// ── Bento-Style Features Matrix ─────────────────────────────────────────────
export function BentoFeatures() {
  return (
    <div className="arg-bento-grid">
      {/* 1. Large Feature Card: Instant Automated EDA */}
      <article className="arg-bento-card bento-hero-card" style={{ '--accent': '#f97316' }}>
        <div className="bento-badge" style={{ background: '#f9731622', color: '#f97316' }}>
          <Zap size={13} />
          <span>FLAGSHIP SPEED</span>
        </div>
        <h3>Instant Automated EDA</h3>
        <p>
          Drop any dataset in and get 10+ publication-ready charts in under 3 seconds. Histograms, correlation matrices, box plots, and feature rankings are computed instantly without writing a single line of pandas.
        </p>
        <div className="bento-chart-strip">
          <div className="chart-preview-bar"><span style={{ height: '45%' }} /><span style={{ height: '80%' }} /><span style={{ height: '62%' }} /><span style={{ height: '95%' }} /><span style={{ height: '38%' }} /><span style={{ height: '70%' }} /></div>
          <div className="chart-preview-meta">
            <span className="pill">⚡ 2.8s generation</span>
            <span className="pill">10+ SVG charts</span>
            <span className="pill">Deterministic compute</span>
          </div>
        </div>
      </article>

      {/* 2. AI Column Descriptions */}
      <article className="arg-bento-card" style={{ '--accent': '#7f77dd' }}>
        <div className="bento-badge" style={{ background: '#7f77dd22', color: '#7f77dd' }}>
          <BrainCircuit size={13} />
          <span>DEEP PROFILING</span>
        </div>
        <h3>AI Column Descriptions</h3>
        <p>
          Every column explained in plain English — distribution skew, outliers, missingness, and statistical anomalies with actionable guidance.
        </p>
        <div className="bento-chip-preview">
          <code>customer_age: median 34.2 · skew +0.41 · 0 nulls</code>
          <span className="chip-sub">✓ Normal Gaussian distribution</span>
        </div>
      </article>

      {/* 3. Grounded AI Chat */}
      <article className="arg-bento-card" style={{ '--accent': '#1d9e75' }}>
        <div className="bento-badge" style={{ background: '#1d9e7522', color: '#1d9e75' }}>
          <Bot size={13} />
          <span>GROUNDED NARRATIVE</span>
        </div>
        <h3>Grounded AI Analyst</h3>
        <p>
          Ask questions in natural language. Argus chooses deterministic Python tools, calculates exact statistics locally, and explains what was computed.
        </p>
        <div className="bento-query-bubble">
          <span className="q">"Which category drives the highest margin?"</span>
          <span className="a">✓ Enterprise Tier (+38.4% gross margin)</span>
        </div>
      </article>

      {/* 4. Anomaly & Outlier Detection */}
      <article className="arg-bento-card" style={{ '--accent': '#e24b4a' }}>
        <div className="bento-badge" style={{ background: '#e24b4a22', color: '#e24b4a' }}>
          <Activity size={13} />
          <span>DATA HYGIENE</span>
        </div>
        <h3>Outlier & Anomaly Detection</h3>
        <p>
          Outliers flagged with mathematical IQR fencing and z-scores. Negative counts, impossible zero prices, and extreme anomalies caught on arrival.
        </p>
        <div className="bento-stat-highlight">
          <b className="val red">118 Outliers</b>
          <span className="sub">Flagged via Q3 + 1.5×IQR boundary</span>
        </div>
      </article>

      {/* 5. Dataset Health Score */}
      <article className="arg-bento-card" style={{ '--accent': '#378add' }}>
        <div className="bento-badge" style={{ background: '#378add22', color: '#378add' }}>
          <Activity size={13} />
          <span>QUALITY PULSE</span>
        </div>
        <h3>Dataset Health Score</h3>
        <p>
          A single 0–100 composite index summarizing missing values, duplicate rows, skewness, and outlier severity so you judge dataset readiness instantly.
        </p>
        <div className="bento-health-mini">
          <div className="score-ring">
            <span className="num">87</span>
            <span className="lbl">/100</span>
          </div>
          <div className="score-details">
            <span>2.4% missing</span>
            <span>0 duplicate rows</span>
            <span>Clean formatting</span>
          </div>
        </div>
      </article>

      {/* 6. Smart Prescriptive Next Steps */}
      <article className="arg-bento-card" style={{ '--accent': '#ef9f27' }}>
        <div className="bento-badge" style={{ background: '#ef9f2722', color: '#ef9f27' }}>
          <CheckCircle2 size={13} />
          <span>ACTIONABLE ML</span>
        </div>
        <h3>Prescriptive Next Steps</h3>
        <p>
          AI recommends concrete data engineering tasks: median imputation for missing features, log transforms for right-skewed columns, and categorical encoding.
        </p>
        <ul className="bento-checklist">
          <li>✓ Impute missing Age with median (28.0)</li>
          <li>✓ Log-transform skewed Fare (skew: 4.79)</li>
          <li>✓ Target-encode multi-level categories</li>
        </ul>
      </article>
    </div>
  )
}

// ── Interactive Workspace Showcase (Replacing generic robot hand in Gallery) ──
export function WorkspaceShowcase({ onEnter, onDemo }) {
  const [activeTab, setActiveTab] = useState('analyst') // 'analyst' | 'dataset' | 'reports'

  return (
    <div className="arg-workspace-showcase">
      {/* Mobile-Friendly Segmented View Switcher */}
      <div className="arg-showcase-tab-bar" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'analyst'}
          className={`arg-showcase-tab ${activeTab === 'analyst' ? 'active' : ''}`}
          onClick={() => setActiveTab('analyst')}
        >
          <Bot size={15} />
          <span>AI Analyst</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'dataset'}
          className={`arg-showcase-tab ${activeTab === 'dataset' ? 'active' : ''}`}
          onClick={() => setActiveTab('dataset')}
        >
          <Database size={15} />
          <span>Dataset Health</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'reports'}
          className={`arg-showcase-tab ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          <FileText size={15} />
          <span>Explore & Reports</span>
        </button>
      </div>

      <div className="arg-showcase-split">
        {/* Main Interactive Studio Screen */}
        <div className="arg-showcase-monitor">
          <div className="monitor-topbar">
            <div className="monitor-window-controls" aria-hidden="true">
              <span className="dot red" />
              <span className="dot yellow" />
              <span className="dot green" />
            </div>
            <div className="monitor-filename">
              <span>demo_data.csv</span>
              <span className="badge-ready">● Workspace Ready</span>
            </div>
            <div className="monitor-engine-tag">Python 3.11 · Local AST Sandbox</div>
          </div>

          <div className="monitor-content">
            {activeTab === 'analyst' && (
              <div className="showcase-view-pane arg-fade-in">
                {/* Chat Query Bar */}
                <div className="showcase-prompt-bar">
                  <div className="prompt-avatar user">U</div>
                  <div className="prompt-text">
                    "Compare monthly revenue across sales regions and flag any anomalies in performance."
                  </div>
                </div>

                {/* Agent Execution Flow */}
                <div className="showcase-agent-trace">
                  <span className="trace-item planner">
                    <span className="trace-dot" /> Planner: Route Dispatched
                  </span>
                  <span className="trace-arrow">→</span>
                  <span className="trace-item engine">
                    <span className="trace-dot" /> pandas.pivot_table · SciPy ANOVA
                  </span>
                  <span className="trace-arrow">→</span>
                  <span className="trace-item visualizer">
                    <span className="trace-dot" /> SVG Chart Render
                  </span>
                </div>

                {/* Rendered Chart Result */}
                <div className="showcase-chart-card">
                  <div className="chart-header">
                    <h5>Monthly Revenue by Region (USD Thousands)</h5>
                    <span className="chart-pill">Bivariate Grouped Summary</span>
                  </div>
                  <div className="chart-bars-demo">
                    <div className="bar-col">
                      <span className="bar-val">$412K</span>
                      <div className="bar-fill west" style={{ height: '88%' }} />
                      <span className="bar-lbl">West</span>
                    </div>
                    <div className="bar-col">
                      <span className="bar-val">$328K</span>
                      <div className="bar-fill east" style={{ height: '70%' }} />
                      <span className="bar-lbl">East</span>
                    </div>
                    <div className="bar-col">
                      <span className="bar-val">$245K</span>
                      <div className="bar-fill central" style={{ height: '52%' }} />
                      <span className="bar-lbl">Central</span>
                    </div>
                    <div className="bar-col">
                      <span className="bar-val">$172K</span>
                      <div className="bar-fill north" style={{ height: '36%' }} />
                      <span className="bar-lbl">North</span>
                    </div>
                  </div>
                </div>

                {/* Grounded Narrative Card */}
                <div className="showcase-ai-narrative">
                  <div className="narrative-tag">
                    <Sparkles size={13} />
                    <span>GROUNDED TAKEAWAY</span>
                  </div>
                  <p>
                    The Western region accounts for $412K (35.6% of gross revenue), outperforming Northern sales by 2.4×. 
                    ANOVA testing confirms regional differences are statistically significant (F = 18.42, p &lt; 0.001). 
                    Q3 showed an outlier spike of +44% in wholesale orders that drove the divergence.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'dataset' && (
              <div className="showcase-view-pane arg-fade-in">
                {/* 4 Metric Cards */}
                <div className="showcase-metric-cards">
                  <div className="m-card">
                    <span className="m-lbl">ROWS</span>
                    <b className="m-val orange">891</b>
                    <span className="m-sub">Parsed cleanly</span>
                  </div>
                  <div className="m-card">
                    <span className="m-lbl">COLUMNS</span>
                    <b className="m-val orange">12</b>
                    <span className="m-sub">6 Logical types</span>
                  </div>
                  <div className="m-card">
                    <span className="m-lbl">MISSING VALUES</span>
                    <b className="m-val yellow">866</b>
                    <span className="m-sub">Concentrated in 2 cols</span>
                  </div>
                  <div className="m-card">
                    <span className="m-lbl">HEALTH SCORE</span>
                    <b className="m-val green">74/100</b>
                    <span className="m-sub">Ready for cleaning</span>
                  </div>
                </div>

                {/* Analysis Map */}
                <div className="showcase-analysis-map">
                  <span className="map-title">● ADAPTIVE ANALYSIS MAP:</span>
                  <span className="map-pill num">5 Numeric</span>
                  <span className="map-pill cat">3 Categorical</span>
                  <span className="map-pill date">1 Datetime</span>
                  <span className="map-pill text">3 Free Text</span>
                </div>

                {/* Column Health Rows */}
                <div className="showcase-health-table">
                  <div className="health-row">
                    <span className="col-id">Age</span>
                    <span className="type-badge num">Numeric (Float)</span>
                    <span className="null-stat yellow">177 missing (19.9%)</span>
                    <span className="action-tag">Impute: Median (28.0)</span>
                  </div>
                  <div className="health-row">
                    <span className="col-id">Fare</span>
                    <span className="type-badge money">Currency</span>
                    <span className="null-stat green">0 missing (0.0%)</span>
                    <span className="action-tag warn">116 Outliers (Max $512.33)</span>
                  </div>
                  <div className="health-row">
                    <span className="col-id">Embarked</span>
                    <span className="type-badge cat">Categorical</span>
                    <span className="null-stat yellow">2 missing (0.2%)</span>
                    <span className="action-tag">Mode imputation ('S')</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="showcase-view-pane arg-fade-in">
                <div className="showcase-reports-layout">
                  <div className="report-hero-badge">
                    <FileText size={16} />
                    <span>AUTOMATED EXECUTIVE PDF REPORT ENGINE</span>
                  </div>
                  <h4>Complete Statistical Audit & Visual Dossier</h4>
                  <p>
                    Every computed histogram, bivariate relationship, correlation matrix, outlier summary, and AI narrative is assembled into a publication-ready PDF in seconds.
                  </p>

                  <div className="report-cards-preview">
                    <div className="rep-card">
                      <div className="rep-card-icon"><BarChart3 size={20} /></div>
                      <b>10+ High-Res Charts</b>
                      <span>Vector-crisp SVG & PDF renderings</span>
                    </div>
                    <div className="rep-card">
                      <div className="rep-card-icon"><Database size={20} /></div>
                      <b>Data Hygiene Audit</b>
                      <span>Missingness matrix, duplicates & skewness</span>
                    </div>
                    <div className="rep-card">
                      <div className="rep-card-icon"><BrainCircuit size={20} /></div>
                      <b>ML Feature Rankings</b>
                      <span>Random forest & mutual info importances</span>
                    </div>
                  </div>

                  <div className="report-download-preview">
                    <div className="rep-file-pill">
                      <FileText size={18} className="file-icon" />
                      <div className="rep-meta">
                        <b>argus_eda_report_demo_data.pdf</b>
                        <span>14 Pages · Complete Statistical Profile · Generated Locally</span>
                      </div>
                    </div>
                    <button className="rep-action-btn" onClick={onDemo}>
                      <Download size={14} />
                      <span>Generate with Demo Data</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Interactive Side Selector Cards */}
        <div className="arg-showcase-sidebar">
          <button
            type="button"
            className={`arg-showcase-side-card ${activeTab === 'analyst' ? 'active' : ''}`}
            onClick={() => setActiveTab('analyst')}
          >
            <div className="side-card-top">
              <Bot size={18} className="side-icon" style={{ color: '#1d9e75' }} />
              <h4>AI Analyst</h4>
              <span className="side-indicator" />
            </div>
            <p>Ask questions in natural language. Watch Argus pick the right tool, compute locally in Python, and describe the answers in plain English.</p>
          </button>

          <button
            type="button"
            className={`arg-showcase-side-card ${activeTab === 'dataset' ? 'active' : ''}`}
            onClick={() => setActiveTab('dataset')}
          >
            <div className="side-card-top">
              <Database size={18} className="side-icon" style={{ color: '#378add' }} />
              <h4>Dataset Health Scorecard</h4>
              <span className="side-indicator" />
            </div>
            <p>Instant ingestion profiling: automated logical type sniffing, missingness penalty index, and IQR outlier boundaries at a glance.</p>
          </button>

          <button
            type="button"
            className={`arg-showcase-side-card ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            <div className="side-card-top">
              <FileText size={18} className="side-icon" style={{ color: '#7f77dd' }} />
              <h4>Explore & Reports</h4>
              <span className="side-indicator" />
            </div>
            <p>Examine univariate and bivariate charts by hand, fine-tune aggregation methods, and export comprehensive PDF reports in one click.</p>
          </button>

          <div className="arg-showcase-live-action">
            <button className="arg-btn-primary full-width" onClick={onDemo}>
              <Zap size={16} />
              <span>Launch Live Workspace Now</span>
            </button>
            <span className="live-action-sub">Pre-loaded with Titanic demo dataset · No login required</span>
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
              <li><a href="#how-it-works">How It Works</a></li>
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
      </div>
    </footer>
  )
}
