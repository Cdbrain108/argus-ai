import { useEffect, useRef, useState } from 'react'
import {
  Menu,
  X,
  User as UserIcon,
  Star,
  ArrowRight,
  BarChart3,
  Workflow,
  Zap,
  Sparkles,
  ChevronDown,
  Layers,
  Bot,
  BrainCircuit,
  Database,
  FileText,
  Activity,
  Home,
  ShieldCheck,
  Info,
} from 'lucide-react'
import { useScrollLock, useReveal, useCountUp, useScrolled, useMediaQuery } from './hooks'
import { MobilePhaseChrome, PhaseProgress, MobilePipelineStepper, MobileChartShowcase } from './components/MobilePerfect'
import { GroundedFlow } from './components/HowItWorks'
import { HeroDataPulse, WhatArgusDoesShowcase, MobileWhatWeDoCards, BentoFeatures, WorkspaceShowcase, ArgusFooter } from './components/LandingComponents'
import {
  AgentStateGraph,
  ArgusFlowMap,
  ChartLab,
  ExplainerPair,
  GroundingProof,
  SandboxGate,
  SpeedRace,
} from './components/ArgusExplainers'
import ProjectOverview from './components/ProjectOverview'
import * as api from './api'

/* ── Argus Landing Page (Samvaad-Style Viewport Snap & Responsive Architecture) ──
   Automated Exploratory Data Analysis with Grounded AI Intelligence

   Phases:
   1.  Home (#top)
   2.  Project Intel (#overview — interactive tabbed deep explainer)
   3.  Features (#features — EDA workbench)
   4.  Pipeline (#pipeline — animated six-stage flow map)
   5.  Agent graph (#agents — orchestration graph + AST gate)
   6.  Chart engine (#charts — figure gallery + time saved)
   7.  Workspace Studio (#gallery — interactive monitor preview)
   8.  Architecture (#about — grounding proof & deterministic compute)
   9.  FAQ (#faq)
   10. Launch Studio (#auth-cta — final CTA & product footer)

   Phases 4-6 and the grounding proof in 8 live in components/ArgusExplainers.jsx.
*/

const TYPED = ['in under 30 seconds', 'with zero hallucination', 'with local Python precision', 'with zero code required']

const HERO_PILLS = [
  ['⚡ 2.8s Instant Profiling', '#F97316', '#FAC775'],
  ['● 100% Local In-Memory Sandbox', '#1D9E75', '#5DCAA5'],
  ['✦ 10+ Publication SVG Charts', '#EF9F27', '#FAC775'],
  ['✓ Grounded AI Analyst Core', '#38BDF8', '#7DD3FC'],
]

const SAMPLE_PROMPTS = [
  { icon: '📊', short: 'Skew & Outliers', full: 'Analyze skewness & Tukey IQR outliers for Revenue' },
  { icon: '⚡', short: 'Peak Margin Tiers', full: 'Which customer tier drives peak gross profit margin?' },
  { icon: '🔍', short: 'Missing Imputations', full: 'Scan missingness & recommend median/mode imputations' },
  { icon: '📈', short: 'Correlation Matrix', full: 'Compute Pearson & Spearman correlation with p-values' },
]

const FAQS = [
  ['Is my data uploaded, persisted, or shared with third parties?', 'Never. Files are parsed inside an ephemeral Python sandbox subprocess and kept strictly in local memory for your session only. Data is never persisted to databases, vector clouds, or shared with third parties, and is purged immediately upon session close or browser exit.'],
  ['What file formats and complex schemas are supported?', 'CSV, TSV, TXT, Excel (XLSX, XLS, XLSM), JSON, JSONL, and Parquet up to 50MB. Encodings (UTF-8, Latin1, CP1252), delimiters (comma, semicolon, tab, pipe), and tricky types (currencies like "$1,200", dates, percentages, accounting negative parentheses) are auto-detected with clear conversion reasons.'],
  ['How are AI insights mathematically grounded without hallucinations?', 'Traditional AI models fabricate plausible numbers. Argus computes all statistical figures in Python (pandas, SciPy, scikit-learn) first. The AI analyst acts strictly as an analytical narrator over the verified JSON results — it never guesses or fabricates a metric.'],
  ['What is the AST Sandboxed execution engine?', 'Argus verifies all analytical Python code using an Abstract Syntax Tree (AST) parser before execution. Dangerous system calls (os, subprocess, network sockets, eval) are strictly rejected, ensuring secure, isolated computation in local sandboxes.'],
  ['Do I need to know Python or statistics to use Argus?', 'No. All statistical summaries, distributions, Tukey fences, and feature importance rankings run automatically with plain-English interpretations and prescriptive next steps. Senior data scientists can still view raw JSON statistics and Python snippets whenever needed.'],
  ['Can Argus run offline without internet connectivity?', 'Yes. All core statistical computing — automated type coercion, health scoring, Tukey anomaly fencing, Pearson/Spearman matrices, and exportable Python scripts — runs 100% locally in offline Python. The AI agent acts strictly as an orchestration planner and plain-English narrator over local JSON results; your raw dataset rows never leave your machine under any circumstances.'],
]

/* The scroll phases, in order. The side dot rail and mobile drawer list all 10,
   while the desktop floating pill navbar displays 4 core high-impact anchors. */
const LANDING_PHASES = [
  { id: 'top', label: 'Home', short: 'Home', icon: Home },
  { id: 'overview', label: 'Project Intel', short: 'Intel', icon: Info },
  { id: 'features', label: 'Features', short: 'Features', icon: Zap },
  { id: 'pipeline', label: 'Pipeline', short: 'Pipeline', icon: Workflow },
  { id: 'agents', label: 'Agent graph', short: 'Agents', icon: Bot },
  { id: 'charts', label: 'Chart engine', short: 'Charts', icon: BarChart3 },
  { id: 'gallery', label: 'Workspace', short: 'Studio', icon: Database },
  { id: 'about', label: 'Architecture', short: 'Architecture', icon: ShieldCheck },
  { id: 'faq', label: 'FAQ', short: 'FAQ', icon: BrainCircuit },
  { id: 'auth-cta', label: 'Get Started', short: 'Launch', icon: Sparkles },
]

/* Curated 6-phase journey tailored specifically for mobile viewports */
const MOBILE_LANDING_PHASES = [
  { id: 'top', label: 'Home', short: 'Home', icon: Home },
  { id: 'overview', label: 'Project Intel', short: 'Intel', icon: Info },
  { id: 'pipeline', label: '4-Step Pipeline', short: 'Pipeline', icon: Workflow },
  { id: 'charts', label: 'Charts & Analysis', short: 'Charts', icon: BarChart3 },
  { id: 'faq', label: 'FAQ', short: 'FAQ', icon: BrainCircuit },
  { id: 'auth-cta', label: 'Launch Studio', short: 'Launch', icon: Sparkles },
]

const DESKTOP_NAV_ITEMS = [
  { id: 'top', label: 'Home', matchIds: ['top'] },
  { id: 'overview', label: 'Intel', matchIds: ['overview'] },
  { id: 'features', label: 'Features', matchIds: ['features'] },
  { id: 'pipeline', label: 'Pipeline', matchIds: ['pipeline'] },
  { id: 'agents', label: 'Agents', matchIds: ['agents'] },
  { id: 'charts', label: 'Charts', matchIds: ['charts', 'gallery'] },
  { id: 'about', label: 'Architecture', matchIds: ['about'] },
  { id: 'faq', label: 'FAQ', matchIds: ['faq', 'auth-cta'] },
]

function useTypewriter(phrases, active = true) {
  const [text, setText] = useState('')
  const state = useRef({ index: 0, char: 0, deleting: false })

  // Reset to starting point whenever landed on home
  useEffect(() => {
    if (active) {
      state.current = { index: 0, char: 0, deleting: false }
      setText('')
    }
  }, [active])

  useEffect(() => {
    if (!active) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setText(phrases[0])
      return undefined
    }
    let timer
    const tick = () => {
      const s = state.current
      const phrase = phrases[s.index % phrases.length]
      s.char += s.deleting ? -1 : 1
      setText(phrase.slice(0, s.char))
      let delay = s.deleting ? 35 : 70
      if (!s.deleting && s.char === phrase.length) { delay = 2200; s.deleting = true }
      else if (s.deleting && s.char === 0) { s.deleting = false; s.index += 1; delay = 320 }
      timer = setTimeout(tick, delay)
    }
    timer = setTimeout(tick, 400)
    return () => clearTimeout(timer)
  }, [phrases, active])

  return text
}

function Reveal({ as: Tag = 'div', delay = 0, className = '', style, children, ...rest }) {
  const [ref, shown] = useReveal()
  return (
    <Tag
      ref={ref}
      className={`${className} arg-reveal${shown ? ' in' : ''}`.trim()}
      style={{ '--d': `${delay}ms`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

function Stat({ value, label, active }) {
  const display = useCountUp(value, active)
  return (
    <div className="arg-stat">
      <b>{display}</b>
      <span>{label}</span>
    </div>
  )
}

function Logo() {
  const [broken, setBroken] = useState(false)
  if (broken) return <div className="arg-nav-mark">A</div>
  return (
    <img
      className="arg-nav-logo"
      src="/argus_logo_opt.png"
      alt="Argus"
      onError={(e) => {
        if (!e.target.dataset.triedOriginal) {
          e.target.dataset.triedOriginal = 'true'
          e.target.src = '/argus_logo.png'
        } else {
          setBroken(true)
        }
      }}
    />
  )
}

function Section({ id, alt, tag, tagColor, title, subtitle, className = '', onNextPhase, children }) {
  return (
    <section id={id} className={`arg-section landing-phase ${alt ? 'alt' : ''} ${className}`.trim()}>
      <div className="arg-inner">
        <Reveal className="arg-section-head">
          {tag && (
            <div
              className="arg-section-tag"
              style={{ background: `${tagColor}26`, color: tagColor }}
            >
              {tag}
            </div>
          )}
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </Reveal>
        {children}
      </div>
    </section>
  )
}

function MobileHero({ typed, onEnter, onDemo, statsList, statsShown, statsRef, onScrollNext }) {
  return (
    <div className="arg-mobile-hero">
      <div className="arg-hero-badge">
        <span className="arg-pulse" />
        <span>AUTOMATED EDA &amp; SPREADSHEET INTELLIGENCE</span>
      </div>

      <h1 className="mobile-hero-h1">
        Upload your spreadsheet. <br />
        <span className="arg-type">{typed}</span>
        <i className="arg-caret" />
      </h1>

      <p className="mobile-hero-sub">
        Upload your structured Excel, CSV, or data file &mdash; Argus checks data quality, spots errors, draws interactive charts, and explains what everything means in plain English.
      </p>

      {/* Beginner Concept Pill */}
      <div className="arg-hero-beginner-explainer">
        <div className="beginner-explainer-tag">
          <Sparkles size={13} color="#f97316" />
          <span>NEW TO DATA OR EDA?</span>
        </div>
        <p>
          <strong>EDA (Exploratory Data Analysis)</strong> is exploring your spreadsheet to find averages, trends, mistakes, and connections between columns. <em>No coding or data science required</em> &mdash; Argus explains it all!
        </p>
      </div>

      <div className="mobile-hero-actions">
        <button className="arg-btn-primary mobile-cta-btn" onClick={onEnter}>
          <span>Upload your dataset &rarr;</span>
        </button>
        <button className="arg-btn-secondary mobile-demo-btn" onClick={onDemo}>
          <Zap size={14} />
          <span>Try Live Demo</span>
        </button>
      </div>

      {/* Interactive Mobile Live Capability Spotlight (Non-Redundant) */}
      <MobileWhatWeDoCards onEnter={onEnter} onDemo={onDemo} />

      {/* Anchored Bottom 4-Stat Strip & Scroll Indicator */}
      <div className="mobile-hero-bottom-dock">
        <div className="mobile-hero-stats-strip" ref={statsRef}>
          {statsList.map(([val, lbl]) => {
            const shortLabel = lbl.includes('dataset') ? 'Datasets' : lbl.includes('rating') ? 'Rating' : lbl.includes('chart') ? 'Charts' : 'Speed'
            return (
              <div key={lbl} className="mobile-stat-cell">
                <b>{val}</b>
                <span>{shortLabel}</span>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          className="mobile-scroll-hint"
          onClick={() => onScrollNext?.()}
          aria-label="Scroll to Project Overview"
        >
          <span>✦ Explore Argus Architecture</span>
          <ChevronDown size={13} className="bounce-arrow" />
        </button>
      </div>
    </div>
  )
}

function MobileArchitecture({ onDemo, onEnter, onNext }) {
  const pillars = [
    { title: 'Ephemeral RAM Memory', desc: 'Data lives strictly in volatile memory during your active session; zero database or cloud persistence.', icon: Database, color: '#1D9E75' },
    { title: 'AST Code-Gating Gate', desc: 'Analytical execution is parsed via Abstract Syntax Tree. Calls to OS, subprocesses or sockets are blocked.', icon: ShieldCheck, color: '#7F77DD' },
    { title: 'Subprocess Isolation', desc: 'Python compute is fenced inside an unprivileged worker subprocess with strict memory & CPU quotas.', icon: Layers, color: '#38BDF8' },
    { title: 'Deterministic Math Kernel', desc: 'All equations run in native NumPy, SciPy, and pandas; AI models only narrate verified JSON telemetry.', icon: BrainCircuit, color: '#EF9F27' },
  ]

  return (
    <div className="arg-mobile-architecture">
      <div className="mobile-arch-lead">
        <p>
          Eliminate 45m of EDA boilerplate. Every calculation runs locally in an isolated Python sandbox &mdash; with zero cloud data retention.
        </p>
      </div>

      <div className="mobile-arch-grid">
        {pillars.map((p) => {
          const Icon = p.icon
          return (
            <div key={p.title} className="mobile-arch-card" style={{ '--accent': p.color }}>
              <div className="mobile-arch-card-head">
                <Icon size={14} style={{ color: p.color }} />
                <h4>{p.title}</h4>
              </div>
              <p>{p.desc}</p>
            </div>
          )
        })}
      </div>

      <div className="mobile-arch-flow">
        <div className="arch-flow-title">
          <span className="dot" />
          <span>ZERO-TRUST EXECUTION PIPELINE</span>
        </div>
        <div className="arch-flow-steps">
          <span className="flow-step">💬 User Query</span>
          <span className="flow-arr">→</span>
          <span className="flow-step">🛡️ AST Gate</span>
          <span className="flow-arr">→</span>
          <span className="flow-step">🐍 Ephemeral REPL</span>
          <span className="flow-arr">→</span>
          <span className="flow-step">📊 Grounded Telemetry</span>
        </div>
      </div>

      <div className="mobile-arch-footer">
        <button className="mobile-cta-btn" onClick={onDemo}>
          <Zap size={13} />
          <span>⚡ Try Live Demo</span>
        </button>
        <button className="mobile-scroll-hint" onClick={onNext}>
          <span>✦ Explore Questions &amp; Answers</span>
          <ChevronDown size={13} className="bounce-arrow" />
        </button>
      </div>
    </div>
  )
}

function MobileFaq({ faqs, onDemo, onNext }) {
  const [openIndex, setOpenIndex] = useState(null)

  const toggleIndex = (idx) => {
    setOpenIndex((prev) => (prev === idx ? null : idx))
  }

  const categories = [
    { label: 'Privacy', icon: '🔒', color: '#10B981' },
    { label: 'Formats', icon: '📁', color: '#38BDF8' },
    { label: 'Grounding', icon: '⚖️', color: '#F97316' },
    { label: 'Sandbox', icon: '🛡️', color: '#7F77DD' },
    { label: 'No-Code', icon: '⚡', color: '#EAB308' },
    { label: 'Offline', icon: '🌐', color: '#06B6D4' },
  ]

  return (
    <div className="arg-mobile-faq-accordion">
      <div className="faq-accordion-list">
        {faqs.map((faq, idx) => {
          const isOpen = openIndex === idx
          const cat = categories[idx] || { label: 'Intel', icon: '✦', color: '#F97316' }
          return (
            <div
              key={idx}
              className={`faq-accordion-item ${isOpen ? 'is-open' : ''}`}
              style={{ '--cat-color': cat.color }}
            >
              <button
                type="button"
                className="faq-accordion-header"
                onClick={() => toggleIndex(idx)}
                aria-expanded={isOpen}
              >
                <div className="faq-header-left">
                  <span className="faq-cat-badge">
                    {cat.icon} {cat.label}
                  </span>
                  <h4 className="faq-question-title">{faq[0]}</h4>
                </div>
                <div className={`faq-chevron-wrap ${isOpen ? 'rotate' : ''}`}>
                  <ChevronDown size={16} />
                </div>
              </button>

              {isOpen && (
                <div className="faq-accordion-drawer">
                  <div className="faq-drawer-content">
                    <p className="faq-answer-text">{faq[1]}</p>
                    <div className="faq-drawer-badge">
                      <span className="badge-dot" style={{ background: cat.color }} />
                      <span>100% In-Memory Python Engine · Zero Cloud Retention</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mobile-faq-accordion-footer">
        <button type="button" className="mobile-scroll-hint" onClick={onNext}>
          <span>✦ Launch Argus Studio</span>
          <ChevronDown size={13} className="bounce-arrow" />
        </button>
      </div>
    </div>
  )
}

export default function Landing({ onEnter, onDemo, onOpenAuth, user, onOpenRating }) {
  const scrollRef = useRef(null)
  const activeRef = useRef(0)
  const [activePhaseIdx, setActivePhaseIdx] = useState(0)
  const typed = useTypewriter(TYPED, activePhaseIdx === 0)
  const [openFaq, setOpenFaq] = useState(-1)
  const [navOpen, setNavOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [statsRef, statsShown] = useReveal({ threshold: 0.35 })
  const [ratingStats, setRatingStats] = useState(null)
  /* Samvaad pattern: progress hairline painted via ref (no re-render per pixel). */
  const progressRef = useRef(null)

  // Fetch verified rating statistics
  useEffect(() => {
    let cancelled = false
    api.getRatingStats()
      .then((res) => {
        if (!cancelled && res?.avg) setRatingStats(res)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const closeNav = () => setNavOpen(false)
  useScrollLock(navOpen)

  const AUTO_HIDE_DELAY_MS = 1000

  // Smooth phase jumping
  const goToPhase = (id) => {
    const root = scrollRef.current
    const target = root?.querySelector(`#${id}`)
    if (!root || !target) return
    const isFirstPage = id === 'top'
    // Permanent visible on first page top; 1s auto-hide on all other sections
    showTaskbar(isFirstPage ? 0 : AUTO_HIDE_DELAY_MS)
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Auto-hide taskbar state & robust ref tracking (Samvaad reference architecture)
  const [taskbarVisible, setTaskbarVisible] = useState(true)
  const taskbarVisibleRef = useRef(true)
  const taskbarHideTimerRef = useRef(null)

  const showTaskbar = (autoHideDelayMs = 0) => {
    if (!taskbarVisibleRef.current) {
      taskbarVisibleRef.current = true
      setTaskbarVisible(true)
    }
    if (taskbarHideTimerRef.current) {
      clearTimeout(taskbarHideTimerRef.current)
      taskbarHideTimerRef.current = null
    }
    if (autoHideDelayMs > 0) {
      taskbarHideTimerRef.current = setTimeout(() => {
        hideTaskbar()
      }, autoHideDelayMs)
    }
  }

  const hideTaskbar = () => {
    if (taskbarHideTimerRef.current) {
      clearTimeout(taskbarHideTimerRef.current)
      taskbarHideTimerRef.current = null
    }
    // Never hide taskbar while navigation drawer is open
    if (navOpen) {
      return
    }
    // Never hide taskbar when resting at the very top of the first page
    const isAtTop = scrollRef.current ? scrollRef.current.scrollTop < 20 : activeRef.current === 0
    if (activeRef.current === 0 && isAtTop) {
      return
    }
    if (taskbarVisibleRef.current) {
      taskbarVisibleRef.current = false
      setTaskbarVisible(false)
    }
  }

  // 1. Initial land on very first page: permanent visible, no auto-hide
  useEffect(() => {
    showTaskbar(0)
    return () => {
      if (taskbarHideTimerRef.current) clearTimeout(taskbarHideTimerRef.current)
    }
  }, [])

  // 2. When active section changes:
  // On very first page: keep visible. On all other sections: visible for 1s then hides smoothly
  useEffect(() => {
    const isFirstPage = activePhaseIdx === 0 && (!scrollRef.current || scrollRef.current.scrollTop < 20)
    showTaskbar(isFirstPage ? 0 : AUTO_HIDE_DELAY_MS)
  }, [activePhaseIdx])

  // 3. User interaction & mobile touch: reveal on movement/scroll, auto-hide after 1s on other sections
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return undefined

    let lastScrollTop = root.scrollTop
    let touchStartY = 0

    const handleScrollActivity = () => {
      const currentScroll = root.scrollTop
      const scrollDiff = currentScroll - lastScrollTop

      // Ignore micro jitter
      if (Math.abs(scrollDiff) < 6) return

      lastScrollTop = currentScroll
      const isFirstPage = activeRef.current === 0 && root.scrollTop < 20

      // When moving/scrolling pages: taskbar appears immediately, and will hide after 1s (never on first page top)
      showTaskbar(isFirstPage ? 0 : AUTO_HIDE_DELAY_MS)
    }

    const handleTouchStart = (e) => {
      touchStartY = e.touches[0].clientY
      const isFirstPage = activeRef.current === 0 && (!root || root.scrollTop < 20)
      showTaskbar(isFirstPage ? 0 : AUTO_HIDE_DELAY_MS)
    }

    const handleTouchMove = () => {
      const isFirstPage = activeRef.current === 0 && (!root || root.scrollTop < 20)
      showTaskbar(isFirstPage ? 0 : AUTO_HIDE_DELAY_MS)
    }

    const handlePointerTop = (e) => {
      const y = e.touches ? e.touches[0].clientY : e.clientY
      if (y <= 55) {
        const isFirstPage = activeRef.current === 0 && (!root || root.scrollTop < 20)
        showTaskbar(isFirstPage ? 0 : AUTO_HIDE_DELAY_MS)
      }
    }

    root.addEventListener('scroll', handleScrollActivity, { passive: true })
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('pointermove', handlePointerTop, { passive: true })

    return () => {
      root.removeEventListener('scroll', handleScrollActivity)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('pointermove', handlePointerTop)
    }
  }, [])

  const activePhases = isMobile ? MOBILE_LANDING_PHASES : LANDING_PHASES

  // Active phase index tracking for side phase navigation (fast offset calculation, zero layout-thrashing)
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return undefined

    const elements = activePhases.map((p) => root.querySelector(`#${p.id}`))
    let ticking = false

    const updateActive = () => {
      ticking = false
      const currentScroll = root.scrollTop + root.clientHeight * 0.35
      let current = 0
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i]
        if (el && el.offsetTop <= currentScroll) {
          current = i
          break
        }
      }
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 50) {
        current = activePhases.length - 1
      }
      if (current !== activeRef.current) {
        activeRef.current = current
        setActivePhaseIdx(current)
      }
      /* Paint the top progress hairline without a state update. */
      if (progressRef.current) {
        const max = root.scrollHeight - root.clientHeight
        const p = max > 0 ? Math.min(1, Math.max(0, root.scrollTop / max)) : 0
        progressRef.current.style.transform = `scaleX(${p})`
      }
    }

    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(updateActive)
      }
    }

    updateActive()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [activePhases])

  // Keyboard navigation between sections
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return
      if (e.target !== document.body && e.target !== scrollRef.current) return
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault()
        const next = Math.min(activeRef.current + 1, activePhases.length - 1)
        goToPhase(activePhases[next].id)
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault()
        const prev = Math.max(activeRef.current - 1, 0)
        goToPhase(activePhases[prev].id)
      } else if (e.key === 'Home') {
        e.preventDefault()
        goToPhase('top')
      } else if (e.key === 'End') {
        e.preventDefault()
        goToPhase('auth-cta')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activePhases])


  const statsList = [
    ['13+', 'Master datasets'],
    [ratingStats?.avg ? `${ratingStats.avg.toFixed(1)}★` : '5.0★', ratingStats?.count ? `User rating (${ratingStats.count})` : 'User rating'],
    ['110+', 'SVG auto charts'],
    ['<3s', 'Profile runtime'],
  ]

  // "Try Argus" floating corner CTA only appears in 1st, 3rd, and 4th page sections (0-indexed: 0, 2, 3)
  const showCornerCta = [0, 2, 3].includes(activePhaseIdx)

  return (
    <div className="arg-landing landing-scroll" ref={scrollRef}>
      {/* Top scroll-progress hairline (Samvaad pattern, ref-painted) */}
      <div className="mp-scroll-progress" aria-hidden="true">
        <i ref={progressRef} />
      </div>

      {/* ── Fixed Smart Auto-Hiding Taskbar (Samvaad Pattern) ──────────── */}
      <nav
        className={`arg-nav ${!taskbarVisible ? 'is-taskbar-hidden' : ''}`}
        onClick={() => {
          if (!taskbarVisible) {
            showTaskbar(activeRef.current === 0 && (!scrollRef.current || scrollRef.current.scrollTop < 20) ? 0 : AUTO_HIDE_DELAY_MS)
          }
        }}
        onMouseEnter={() => showTaskbar(0)}
        onMouseLeave={() => showTaskbar(activeRef.current === 0 && (!scrollRef.current || scrollRef.current.scrollTop < 20) ? 0 : AUTO_HIDE_DELAY_MS)}
      >
        <a className="arg-nav-brand" href="#top" onClick={(e) => { e.preventDefault(); goToPhase('top'); closeNav(); }}>
          <Logo />
          <div className="arg-nav-brand-text">
            <span className="arg-nav-word">Argus</span>
            <span className="arg-nav-tagline">Automated EDA</span>
          </div>
        </a>

        {/* Dynamic Current Page Name Indicator (Samvaad ergonomics) */}
        <div
          className="arg-nav-mobile-page-pill"
          aria-live="polite"
          onClick={(e) => {
            e.stopPropagation()
            goToPhase(activePhases[activePhaseIdx]?.id || 'top')
          }}
        >
          <span className="mobile-page-dot" />
          <span className="mobile-page-name">
            {activePhases[activePhaseIdx]?.label || 'Home'}
          </span>
        </div>

        {/* Desktop Navigation Links (Clean 4-Pillar Ergonomics) */}
        <div className="arg-nav-desktop-center">
          <div className="arg-nav-links-desktop">
            {DESKTOP_NAV_ITEMS.map(({ id, label, matchIds }) => {
              const currentPhaseId = LANDING_PHASES[activePhaseIdx]?.id
              const isActive = matchIds.includes(currentPhaseId)
              return (
                <a
                  className={`arg-nav-link ${isActive ? 'active' : ''}`}
                  href={`#${id}`}
                  key={id}
                  onClick={(e) => { e.preventDefault(); goToPhase(id); }}
                >
                  {label}
                </a>
              )
            })}
          </div>
        </div>

        {/* Desktop Actions */}
        <div className="arg-nav-actions-desktop">
          {user ? (
            <button className="arg-nav-cta" onClick={onEnter}>
              Workspace ({user.name?.split(' ')[0] || 'User'})
            </button>
          ) : (
            <>
              <button className="arg-nav-login" onClick={() => onOpenAuth?.('login')}>
                Login
              </button>
              <button className="arg-nav-cta" onClick={() => onOpenAuth?.('signup')}>
                Get started free
              </button>
            </>
          )}
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="arg-nav-mobile-right">
          <button
            className="arg-nav-toggle"
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={navOpen}
            onClick={() => {
              setNavOpen((open) => {
                const next = !open
                if (next) showTaskbar(0)
                return next
              })
            }}
          >
            {navOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile Navigation Drawer */}
        <div className={navOpen ? 'arg-nav-drawer open' : 'arg-nav-drawer'}>
          <div className="arg-nav-mobile-header">
            <div className="mobile-brand">
              <Logo />
              <span>Argus EDA Platform</span>
            </div>
            <button className="mobile-close" onClick={closeNav} aria-label="Close menu">
              <X size={18} />
            </button>
          </div>
          <div className="arg-nav-mobile-list">
            {activePhases.map(({ id, label, icon: Icon }) => (
              <a
                className={`arg-nav-link ${activePhases[activePhaseIdx]?.id === id ? 'active' : ''}`}
                href={`#${id}`}
                key={id}
                onClick={(e) => { e.preventDefault(); closeNav(); goToPhase(id); }}
              >
                <div className="mobile-link-title">
                  <Icon size={16} className="mobile-link-icon" />
                  <span>{label}</span>
                </div>
                <ArrowRight size={14} className="mobile-link-arrow" />
              </a>
            ))}
          </div>
          <div className="arg-nav-mobile-actions">
            <button className="arg-btn-secondary mobile-demo-btn" onClick={() => { closeNav(); onDemo() }}>
              <Zap size={14} />
              <span>⚡ Try Live Demo Instantly</span>
            </button>
            {user ? (
              <button className="arg-nav-cta" onClick={() => { closeNav(); onEnter() }}>
                Workspace ({user.name?.split(' ')[0] || 'User'})
              </button>
            ) : (
              <>
                <button className="arg-nav-login" onClick={() => { closeNav(); onOpenAuth?.('login') }}>
                  Login to Account
                </button>
                <button className="arg-nav-cta" onClick={() => { closeNav(); onOpenAuth?.('signup') }}>
                  Get started free
                </button>
              </>
            )}
          </div>
        </div>
      </nav>
      {navOpen && <div className="arg-nav-scrim" onClick={closeNav} />}

      {/* ── Side Phase Dot Navigation (Samvaad Ergonomics) ────────────── */}
      <nav className="arg-phase-nav" aria-label="Page Sections Navigation">
        {activePhases.map((phase, index) => (
          <button
            key={phase.id}
            className={`arg-phase-dot ${index === activePhaseIdx ? 'is-active' : ''}`}
            onClick={() => goToPhase(phase.id)}
            aria-label={`Jump to ${phase.label}`}
          >
            <span className="arg-phase-dot-tooltip">{phase.label}</span>
          </button>
        ))}
      </nav>

      {isMobile ? (
        <>
          {/* ============================================================
              MOBILE PHASE 1: HERO VIEWPORT
              ============================================================ */}
          <header className="arg-hero landing-phase phase-hero" id="top">
            <MobileHero
              typed={typed}
              onEnter={onEnter}
              onDemo={onDemo}
              statsList={statsList}
              statsShown={statsShown}
              statsRef={statsRef}
              onScrollNext={() => goToPhase('overview')}
            />
          </header>

          {/* ============================================================
              MOBILE PHASE 2: PROJECT INTEL
              ============================================================ */}
          <Section
            id="overview"
            alt
            onNextPhase={goToPhase}
            tag="PROJECT OVERVIEW"
            tagColor="#F97316"
            title="What Argus is, in its own words"
            subtitle="Ask the five questions people actually ask — the purpose, the grounding, the privacy boundary, the agent layer and the stack."
          >
            <ProjectOverview onEnter={onEnter} onDemo={onDemo} onNextPhase={goToPhase} />
          </Section>

          {/* ============================================================
              MOBILE PHASE 3: 4-STEP INGESTION PIPELINE
              ============================================================ */}
          <Section
            id="pipeline"
            alt
            onNextPhase={goToPhase}
            className="phase-explainer"
            tag="4-STEP INGESTION PIPELINE"
            tagColor="#F97316"
            title="From File to Verified Payload"
            subtitle="Tap each stage to see exactly how your data transforms safely in local memory."
          >
            <MobilePipelineStepper onDemo={onDemo} onEnter={onEnter} />
          </Section>

          {/* ============================================================
              MOBILE PHASE 4: CHARTS & ANALYSIS SHOWCASE
              ============================================================ */}
          <Section
            id="charts"
            onNextPhase={goToPhase}
            className="phase-explainer"
            tag="CHART & INSIGHT SHOWCASE"
            tagColor="#EF9F27"
            title="Real Computed Visualizations"
            subtitle="Deterministic figures drawn from local statistics — zero hallucinations, 100% verified."
          >
            <MobileChartShowcase onDemo={onDemo} onEnter={onEnter} />
          </Section>

          {/* ============================================================
              MOBILE PHASE 5: QUESTIONS & ANSWERS (FAQ)
              ============================================================ */}
          <Section
            id="faq"
            alt
            onNextPhase={goToPhase}
            tag="FAQ"
            tagColor="#E24B4A"
            title="Questions, answered"
            subtitle="Clear facts on data privacy, air-gapped Python execution, AST sandboxing, and our grounded multi-agent architecture."
          >
            <MobileFaq faqs={FAQS} onDemo={onDemo} onNext={() => goToPhase('auth-cta')} />
          </Section>

          {/* ============================================================
              MOBILE PHASE 6: FINAL LAUNCH STAGE + UNIFIED FOOTER
              ============================================================ */}
          <section className="arg-cta landing-phase phase-cta" id="auth-cta">
            <div className="arg-cta-container">
              <Reveal className="arg-cta-hero-card">
                <div className="arg-cta-badge">
                  <Sparkles size={13} />
                  <span>START IN SECONDS · ZERO SETUP</span>
                </div>
                <h2>Point Argus at your next dataset</h2>
                <p>
                  Deterministic statistical profiling, Tukey IQR fences, correlation matrices, and grounded AI analyst narration.
                  100% local Python sandbox — no data leaves your session.
                </p>
                <div className="arg-cta-actions">
                  {user ? (
                    <button className="arg-btn-primary cta-main-btn" onClick={onEnter}>
                      <span>Open Workspace ({user.name?.split(' ')[0] || 'User'}) &rarr;</span>
                    </button>
                  ) : (
                    <button className="arg-btn-primary cta-main-btn" onClick={() => onOpenAuth?.('signup')}>
                      <span>Get Started Free &rarr;</span>
                    </button>
                  )}
                  <button className="arg-btn-secondary cta-demo-btn" onClick={onDemo}>
                    <Zap size={14} />
                    <span>Try Live Demo</span>
                  </button>
                </div>
                <div className="arg-cta-trust-pills">
                  <span className="trust-pill">🔒 100% In-Memory Python</span>
                  <span className="trust-pill-dot">•</span>
                  <span className="trust-pill">📊 10+ Publication SVG Charts</span>
                  <span className="trust-pill-dot">•</span>
                  <span className="trust-pill">⚡ &lt;3s Runtime</span>
                </div>
              </Reveal>
            </div>
            <ArgusFooter />
          </section>
        </>
      ) : (
        <>
          {/* ============================================================
              PHASE 1: HERO VIEWPORT STAGE
              ============================================================ */}
          <header className="arg-hero landing-phase phase-hero" id="top">
            <div className="arg-hero-inner">
              <div className="arg-hero-content">
                <div className="arg-hero-badge">
                  <span className="arg-pulse" />
                  <span>AI-POWERED AUTOMATED EDA & DATA INTELLIGENCE PLATFORM</span>
                </div>

                <h1>
                  Upload your spreadsheet.{' '}
                  <span className="arg-hero-title-break"><br /></span>
                  <span className="arg-type">{typed}</span>
                  <i className="arg-caret" />
                </h1>

                <p className="arg-hero-sub">
                  Upload your structured Excel, CSV, or data files &mdash; Argus types every column, scores data health,
                  draws interactive charts, and explains what everything means in plain English without requiring any Python or data science background.
                </p>

                {/* Beginner Explainer Callout */}
                <div className="arg-hero-beginner-explainer">
                  <div className="beginner-explainer-tag">
                    <Sparkles size={14} color="#f97316" />
                    <span>WHAT IS THIS PLATFORM FOR?</span>
                  </div>
                  <p>
                    <strong>Think of Argus as an AI data analyst friend for your spreadsheets.</strong> Instead of writing complex formulas or Python code, simply drop in your file. Argus uncovers missing data, draws instant distribution and relationship charts, and explains the story inside your numbers in clear, plain human English.
                  </p>
                </div>

                <div className="arg-hero-actions">
                  <button className="arg-btn-primary" onClick={onEnter}>
                    <span>Upload your dataset &rarr;</span>
                  </button>
                  <button className="arg-btn-secondary" onClick={onDemo}>
                    <Zap size={15} />
                    <span>Try Live Demo</span>
                  </button>
                </div>

                {/* Interactive Query Chips */}
                <div className="arg-hero-prompts-tray">
                  <span className="tray-label">EXPLORE INSTANTLY:</span>
                  <div className="tray-chips">
                    {SAMPLE_PROMPTS.map((prompt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="arg-prompt-chip"
                        onClick={onDemo}
                        title="Explore with live demo dataset"
                      >
                        <span className="chip-icon">{prompt.icon}</span>
                        <span className="chip-text">{prompt.full}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sleek Integrated 4-Stat Metric Dock */}
                <div className="arg-hero-metrics-dock" ref={statsRef}>
                  {statsList.map(([value, label]) => (
                    <div key={label} className="hero-metric-cell">
                      <span className="metric-val">{value}</span>
                      <span className="metric-lbl">{label}</span>
                    </div>
                  ))}
                </div>

                {/* Trust badges row */}
                <div className="arg-hero-trust-bar">
                  <span className="trust-item">🔒 100% In-Memory Python</span>
                  <span className="trust-dot">•</span>
                  <span className="trust-item">⚡ Zero Cloud Persistence</span>
                  <span className="trust-dot">•</span>
                  <span className="trust-item">🛡️ AST-Sandboxed</span>
                </div>
              </div>

              {/* Interactive What Argus Does Capability Showcase */}
              <div className="arg-hero-visual">
                <WhatArgusDoesShowcase onEnter={onEnter} onDemo={onDemo} />
              </div>
            </div>
          </header>

          {/* ============================================================
              PHASE 2: PROJECT INTEL (SAMVAAD-STYLE INTERACTIVE EXPLAINER)
              ============================================================ */}
          <Section
            id="overview"
            alt
            onNextPhase={goToPhase}
            tag="PROJECT OVERVIEW"
            tagColor="#F97316"
            title="What Argus is, in its own words"
            subtitle="Ask the five questions people actually ask — the purpose, the grounding, the privacy boundary, the agent layer and the stack — and read the answer as it is written."
          >
            <ProjectOverview onEnter={onEnter} onDemo={onDemo} onNextPhase={goToPhase} />
          </Section>

          {/* ============================================================
              PHASE 3: CORE BENTO FEATURES
              ============================================================ */}
          <Section
            id="features"
            onNextPhase={goToPhase}
            tag="FEATURES"
            tagColor="#7F77DD"
            title="Everything EDA, automated"
            subtitle="Health scoring, missing-value maps, Tukey fences, correlations and ML prescriptions — each one computed, not estimated."
          >
            <BentoFeatures />
          </Section>

          {/* ============================================================
              PHASE 4: END-TO-END PIPELINE (ANIMATED FLOW MAP)
              ============================================================ */}
          <Section
            id="pipeline"
            alt
            onNextPhase={goToPhase}
            className="phase-explainer"
            tag="END-TO-END PIPELINE"
            tagColor="#F97316"
            title="What happens between your file and your answer"
            subtitle="Six stages, each handing the next a verified payload. Tap any stage to watch that step run and see exactly what it takes in and gives back."
          >
            <ArgusFlowMap />
          </Section>

          {/* ============================================================
              PHASE 5: AGENT ORCHESTRATION + AST GATE
              ============================================================ */}
          <Section
            id="agents"
            alt
            onNextPhase={goToPhase}
            className="phase-explainer"
            tag="ORCHESTRATION & SANDBOX"
            tagColor="#38BDF8"
            title="How the agent decides — and what it is never allowed to do"
            subtitle="A planner routes your question to a deterministic tool, a validator checks the result and retries rather than guessing, and any generated code passes an AST gate before it runs."
          >
            <ExplainerPair
              mode="switch"
              className="ax-pair-wide"
              items={[
                { id: 'graph', label: '🤖 Agent graph', render: () => <AgentStateGraph /> },
                { id: 'gate', label: '🛡️ AST gate', render: () => <SandboxGate /> },
              ]}
            />
          </Section>

          {/* ============================================================
              PHASE 6: CHART ENGINE + TIME SAVED
              ============================================================ */}
          <Section
            id="charts"
            onNextPhase={goToPhase}
            className="phase-explainer"
            tag="CHART ENGINE"
            tagColor="#EF9F27"
            title="The figures Argus draws, and the rule that picks each one"
            subtitle="Every chart is drawn from values that were already computed — and the lane beside it shows the first-pass work that buys you."
          >
            <ExplainerPair
              className="ax-pair-even"
              items={[
                { id: 'lab', label: '📊 Chart engine', render: () => <ChartLab /> },
                { id: 'race', label: '⏱️ Time saved', render: () => <SpeedRace /> },
              ]}
            />
          </Section>

          {/* ============================================================
              PHASE 7: WORKSPACE STUDIO GALLERY
              ============================================================ */}
          <Section
            id="gallery"
            alt
            onNextPhase={goToPhase}
            tag="WORKSPACE STUDIO"
            tagColor="#38BDF8"
            title="Live workspace in action"
            subtitle="The environment you land in after your first upload: ask in plain English, watch the planner route it, read the answer with its receipt."
          >
            <WorkspaceShowcase onEnter={onEnter} onDemo={onDemo} />
          </Section>

          {/* ============================================================
              PHASE 8: ARCHITECTURE & THE GROUNDING PROOF
              ============================================================ */}
          <Section
            id="about"
            onNextPhase={goToPhase}
            className="phase-explainer"
            tag="ARCHITECTURE"
            tagColor="#1D9E75"
            title="Why Argus exists"
            subtitle="Deterministic computing underneath, plain-English narration on top — and a clear line between the two that the panel below traces number by number."
          >
            <div className="arg-about-unified">
              <GroundingProof />
            </div>
          </Section>

          {/* ============================================================
              PHASE 9: QUESTIONS & ANSWERS (FAQ)
              ============================================================ */}
          <Section
            id="faq"
            alt
            onNextPhase={goToPhase}
            tag="FAQ"
            tagColor="#E24B4A"
            title="Questions, answered"
            subtitle="Clear facts on data privacy, air-gapped Python execution, AST sandboxing, and our grounded multi-agent architecture."
          >
            <div className="arg-inner" style={{ maxWidth: 860 }}>
              {FAQS.map(([question, answer], index) => {
                const open = openFaq === index
                return (
                  <Reveal
                    className={open ? 'arg-faq-item open' : 'arg-faq-item'}
                    key={question}
                    delay={index * 60}
                  >
                    <button
                      className="arg-faq-q"
                      aria-expanded={open}
                      aria-controls={`arg-faq-a-${index}`}
                      onClick={() => setOpenFaq(open ? -1 : index)}
                    >
                      <span>{question}</span>
                      <div className="arg-faq-toggle-icon" aria-hidden="true">
                        <ChevronDown size={18} className={open ? 'rotated' : ''} />
                      </div>
                    </button>
                    <div className="arg-faq-a-wrap" id={`arg-faq-a-${index}`} aria-hidden={!open}>
                      <div><p className="arg-faq-a">{answer}</p></div>
                    </div>
                  </Reveal>
                )
              })}
            </div>
          </Section>

          {/* ============================================================
              PHASE 10: FINAL LAUNCH STAGE + UNIFIED FOOTER
              ============================================================ */}
          <section className="arg-cta landing-phase phase-cta" id="auth-cta">
            <div className="arg-cta-container">
              <Reveal className="arg-cta-hero-card">
                <div className="arg-cta-badge">
                  <Sparkles size={13} />
                  <span>START IN SECONDS · ZERO SETUP</span>
                </div>
                <h2>Point Argus at your next dataset</h2>
                <p>
                  Deterministic statistical profiling, Tukey IQR fences, correlation matrices, and grounded AI analyst narration.
                  100% local Python sandbox — no data leaves your session.
                </p>
                <div className="arg-cta-actions">
                  {user ? (
                    <button className="arg-btn-primary cta-main-btn" onClick={onEnter}>
                      <span>Open Workspace ({user.name?.split(' ')[0] || 'User'}) &rarr;</span>
                    </button>
                  ) : (
                    <button className="arg-btn-primary cta-main-btn" onClick={() => onOpenAuth?.('signup')}>
                      <span>Get Started Free &rarr;</span>
                    </button>
                  )}
                  <button className="arg-btn-secondary cta-demo-btn" onClick={onDemo}>
                    <Zap size={14} />
                    <span>Try Live Demo</span>
                  </button>
                </div>
                <div className="arg-cta-trust-pills">
                  <span className="trust-pill">🔒 100% In-Memory Python</span>
                  <span className="trust-pill-dot">•</span>
                  <span className="trust-pill">📊 10+ Publication SVG Charts</span>
                  <span className="trust-pill-dot">•</span>
                  <span className="trust-pill">⚡ &lt;3s Runtime</span>
                </div>
              </Reveal>
            </div>
            <ArgusFooter />
          </section>
        </>
      )}

      {/* ── Samvaad-Style Floating Corner Action Button (Try Argus) ──── */}
      <button
        type="button"
        className={`arg-floating-corner-cta ${showCornerCta ? 'is-visible' : 'is-hidden'}`}
        onClick={onDemo}
        aria-label="Try Argus - Understand your data"
      >
        <div className="corner-cta-icon-box" aria-hidden="true">
          <span className="corner-cta-emoji">🪷</span>
        </div>
        <div className="corner-cta-text">
          <span className="corner-cta-title">Try Argus</span>
          <span className="corner-cta-sub">Understand your data &rarr;</span>
        </div>
      </button>
    </div>
  )
}
