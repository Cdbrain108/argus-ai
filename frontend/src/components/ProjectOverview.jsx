import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Activity,
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Database,
  ExternalLink,
  Flame,
  Layers,
  Lock,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react'

const PROJECT_TOPICS = [
  {
    id: 'why-argus',
    tabLabel: '⚡ Why Argus?',
    shortLabel: '⚡ Purpose',
    tag: 'CORE MISSION',
    accent: '#f97316',
    question: 'What is ARGUS, and why did you build an automated EDA platform?',
    mobilePoints: [
      '✦ Eliminates 45m of repetitive pandas & matplotlib boilerplate',
      '✦ Ingests currencies, dates, % & booleans with zero schema setup',
      '✦ Produces 10+ publication SVG charts & health scores in <2.8s',
    ],
    answer: `Argus eliminates the 45 minutes of repetitive Python boilerplate that data teams write on every new dataset.

Instead of manually importing pandas, inspecting df.info(), calculating IQR outliers, and writing matplotlib code, Argus handles it all in <2.8 seconds:

✦ Instant Type Ingestion: Converts currency "$1,234.56", dates, %, and booleans on arrival.
✦ Comprehensive Health Score: 0–100 index summarizing missingness, skew, and outliers.
✦ 10+ Publication SVG Charts: Histograms, Tukey boxplots, and Pearson correlation heatmaps.
✦ Zero-Code Accessibility: Plain-English insights with full access to underlying Python and JSON stats.`,
  },
  {
    id: 'deterministic',
    tabLabel: '⚖️ Deterministic Truth',
    shortLabel: '⚖️ Grounding',
    tag: 'NO HALLUCINATIONS',
    accent: '#1d9e75',
    question: 'How does Argus guarantee that AI insights are 100% mathematically grounded?',
    mobilePoints: [
      '1. Local Python compute first (pandas, SciPy, scikit-learn)',
      '2. Verified ground-truth JSON payload — zero LLM hallucination',
      '3. Execution receipts show mathematical equations & Python operations',
    ],
    answer: `Traditional AI tools fabricate numbers. Argus strictly separates deterministic computation from language generation:

1. Local Python Compute First: Every metric is calculated locally using pandas, SciPy, and scikit-learn.
2. Verified Ground-Truth Payload: Exact calculated values are formatted into deterministic JSON statistics.
3. Grounded Narration: The LLM narrates only verified figures — zero guessing, zero hallucinations.
4. Execution Receipts: Every chart displays the exact mathematical boundaries and Python operations.`,
  },
  {
    id: 'security',
    tabLabel: '🛡️ AST-Sandboxed Sandbox',
    shortLabel: '🛡️ Privacy',
    tag: 'DATA PRIVACY',
    accent: '#38bdf8',
    question: 'Where is my data processed, and is any sensitive information uploaded?',
    mobilePoints: [
      '✦ 100% In-memory processing inside ephemeral Python sandboxes',
      '✦ Zero cloud persistence; session data purged immediately on exit',
      '✦ AST parser blocks dangerous OS, socket, and subprocess calls',
    ],
    answer: `Privacy and security are non-negotiable for real-world enterprise datasets:

✦ 100% In-Memory Processing: Files are parsed in an ephemeral local Python sandbox process.
✦ Zero Cloud Persistence: Data is never saved to external clouds or databases; memory is purged immediately upon session close.
✦ AST Code-Gating: Python execution is verified via an AST parser to block dangerous system calls (os, subprocess, socket).
✦ Complete Local Autonomy: All profiling, outlier fencing, and SVG charts run 100% locally in Python with zero cloud dependencies.
✦ Zero Raw Data Leakage: Conversational AI agents only receive aggregated statistical JSON summaries, ensuring sensitive data rows never leave your machine.`,
  },
  {
    id: 'analyst',
    tabLabel: '🤖 LangGraph Multi-Agent',
    shortLabel: '🤖 LangGraph',
    tag: 'LANGGRAPH STATEGRAPH',
    accent: '#7f77dd',
    question: 'Where and how is the LangGraph multi-agent orchestration architecture used?',
    mobilePoints: [
      '✦ LangGraph StateGraph v0.2 coordinates autonomous analytical agents',
      '✦ Planner Node → Tool REPL Node → Self-Correction Critic Node',
      '✦ Grounded Explainer Node synthesizes verified deterministic telemetry',
    ],
    answer: `Argus is powered by an autonomous LangGraph Multi-Agent StateGraph (backend/agents/graph.py):

✦ 1. Planner Node: Parses user intent, resolves exact dataset column subsets, and chooses the optimal statistical execution strategy.
✦ 2. Tool Router & Canned Node: Dispatches high-speed deterministic EDA primitives (pandas groupby, Tukey IQR, SciPy ANOVA).
✦ 3. AST Sandbox REPL Node: Generates and runs custom pandas code inside an isolated, AST-gated Python subprocess.
✦ 4. Self-Correction Critic Node: Detects runtime exceptions, validates data shapes, and self-corrects code before answering.
✦ 5. Grounded Explainer Node: Synthesizes calculated figures into verified executive narratives and dynamic SVG figures.`,
  },
  {
    id: 'creator',
    tabLabel: '🚀 Full-Stack Architecture & Creator',
    shortLabel: '🚀 Creator',
    tag: 'CREATOR & STACK',
    accent: '#ef9f27',
    question: 'Who created Argus, and what technology stack powers this tool?',
    mobilePoints: [
      '✦ Architected & built by Anuj Kesharwani — Gen AI & Agentic Developer',
      '✦ Backend: FastAPI, Python 3.11, pandas, SciPy, scikit-learn, AST Sandboxing',
      '✦ Agentic Core: LangGraph multi-agent planning & verified execution receipts',
    ],
    answer: `Argus was architected and built by Anuj Kesharwani — Aspiring Gen AI & Agentic AI Developer passionate about production-ready autonomous multi-agent systems and high-performance local AI engines.

Technical Architecture Highlights:
✦ Backend: FastAPI, Python 3.11, pandas, SciPy, scikit-learn, AST-sandboxed isolated subprocess.
✦ Frontend: React 18, Vite, GPU-accelerated CSS motion layer, custom responsive SVG charting.
✦ Agentic Core: LangGraph multi-agent planning, dynamic tool dispatch, and verified execution telemetry.
✦ Production Ready: Supports files up to 50MB, handles 13+ dirty formats, and generates publication PDF data audits.`,
  },
]

export default function ProjectOverview({ onEnter, onDemo }) {
  const [activeTab, setActiveTab] = useState(0)
  const activeTopic = PROJECT_TOPICS[activeTab]

  const [typedText, setTypedText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [inView, setInView] = useState(false)
  const [hasLandedIntro, setHasLandedIntro] = useState(false)

  const containerRef = useRef(null)
  const bodyRef = useRef(null)
  const animationTimerRef = useRef(null)
  const introRunRef = useRef(false)

  // Telemetry receipts customized for each topic
  const TELEMETRY_RECEIPTS = [
    { label: 'INGESTION TRACE', detail: 'CSV/XLSX/Parquet · 5 Types Auto-Sniffed · <2.8s Run' },
    { label: 'GROUNDING TRACE', detail: 'SciPy 1.13 + pandas 2.2 · Exact Math · 0 Hallucination' },
    { label: 'SECURITY BOUNDARY', detail: 'AST Code-Gated Subprocess · Ephemeral RAM · 0 B Cloud' },
    { label: 'AGENTIC DISPATCH', detail: 'LangGraph Planner · Dynamic REPL · Prescriptive ML' },
    { label: 'FULL-STACK STACK', detail: 'FastAPI + React 18 · Python 3.11 Kernel · Anuj Kesharwani' },
  ]

  // Detect when section enters view
  useEffect(() => {
    const node = containerRef.current
    if (!node) return undefined
    const scrollRoot = node.closest('.landing-scroll')
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (!introRunRef.current) {
            introRunRef.current = true
            setHasLandedIntro(true)
          }
        }
      },
      { root: scrollRoot || null, threshold: 0.15 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Clear running animation timers
  const clearTimers = useCallback(() => {
    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current)
      clearInterval(animationTimerRef.current)
      animationTimerRef.current = null
    }
  }, [])

  // Instant skip on click
  const skipTyping = useCallback(() => {
    clearTimers()
    setIsThinking(false)
    setTypedText(activeTopic.answer)
    setIsTyping(false)
  }, [activeTopic, clearTimers])

  // Stream typing response from top cleanly
  const streamAnswer = useCallback((text) => {
    clearTimers()
    setTypedText('')
    setIsThinking(true)
    setIsTyping(false)

    // Ensure we start neatly from the top — question fully visible
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0
    }

    // Reduced motion support: instant render
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    ) {
      setIsThinking(false)
      setTypedText(text)
      setIsTyping(false)
      return
    }

    const thinkingDelay = setTimeout(() => {
      setIsThinking(false)
      setIsTyping(true)

      let charIdx = 0
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
      const step = isMobile ? 6 : 5
      const interval = 12

      const timer = setInterval(() => {
        charIdx += step
        if (charIdx >= text.length) {
          clearInterval(timer)
          setTypedText(text)
          setIsTyping(false)
          animationTimerRef.current = null
        } else {
          setTypedText(text.slice(0, charIdx))
          // Only scroll if content genuinely overflows past the view boundary
          if (bodyRef.current) {
            const el = bodyRef.current
            const maxScroll = el.scrollHeight - el.clientHeight
            if (maxScroll > 15 && el.scrollTop < maxScroll) {
              el.scrollTop = maxScroll
            }
          }
        }
      }, interval)

      animationTimerRef.current = timer
    }, 180)

    animationTimerRef.current = thinkingDelay
  }, [clearTimers])

  // Animate response whenever in view and tab changes
  useEffect(() => {
    if (!inView) {
      setTypedText(activeTopic.answer)
      return undefined
    }

    streamAnswer(activeTopic.answer)
    return () => clearTimers()
  }, [activeTab, inView, activeTopic, streamAnswer, clearTimers])

  // Replay button
  const replayTyping = (e) => {
    e.stopPropagation()
    streamAnswer(activeTopic.answer)
  }

  // ── Standard, contained wheel scroll (zero effect on parent page) ──────────
  useEffect(() => {
    const bodyEl = bodyRef.current
    if (!bodyEl) return undefined

    const handleWheel = (e) => {
      const { scrollTop, scrollHeight, clientHeight } = bodyEl
      const maxScroll = Math.max(0, scrollHeight - clientHeight)

      // If content fits completely inside the window, don't trap the wheel
      if (maxScroll <= 0) {
        return
      }

      // Scrolling UP at the very top boundary: prevent leaking to page
      if (e.deltaY < 0 && scrollTop <= 0) {
        e.preventDefault()
        return
      }

      // Scrolling DOWN at the very bottom boundary: prevent leaking to page
      if (e.deltaY > 0 && scrollTop >= maxScroll - 1) {
        e.preventDefault()
        return
      }

      // While scrolling inside text: isolate from parent slide snapping
      e.stopPropagation()
    }

    bodyEl.addEventListener('wheel', handleWheel, { passive: false })
    return () => bodyEl.removeEventListener('wheel', handleWheel)
  }, [])

  return (
    <div className="arg-project-overview" ref={containerRef}>
      <div
        className={`arg-overview-window ${hasLandedIntro ? 'overview-intro-active' : ''}`}
        style={{ '--accent-theme': activeTopic.accent }}
      >
        {/* Intro Scanline Glow on first land */}
        {hasLandedIntro && <div className="overview-boot-scanline" aria-hidden="true" />}

        {/* Top Header Bar */}
        <div className="arg-overview-topbar">
          <div className="overview-window-dots" aria-hidden="true">
            <span className="dot red" />
            <span className="dot yellow" />
            <span className="dot green" />
          </div>
          <div className="overview-header-title">
            <Bot size={15} style={{ color: activeTopic.accent }} />
            <strong>Argus Architecture &amp; Intel</strong>
            <span className="overview-live-chip">
              <span className="pulse-dot" /> LIVE EXPLAINER
            </span>
          </div>
          <div className="overview-header-tag" style={{ color: activeTopic.accent, background: `${activeTopic.accent}1c` }}>
            {activeTopic.tag}
          </div>
        </div>

        {/* Live Interactive Dialogue Body (Standard self-contained scroll) */}
        <div className="arg-overview-body" ref={bodyRef}>
          {/* User Inquiry Bubble (Always visible at top) */}
          <div className="overview-msg user-msg">
            <div className="msg-avatar user-avatar">U</div>
            <div className="msg-bubble user-bubble">
              <div className="msg-meta">
                <span>Inquiry</span>
                <small>Architectural question</small>
              </div>
              <p className="question-text">{activeTopic.question}</p>
            </div>
          </div>

          {/* AI Grounded Live Response Bubble */}
          <div className="overview-msg ai-msg">
            <div className="msg-avatar ai-avatar" style={{ background: activeTopic.accent }}>
              <Bot size={16} color="#ffffff" />
            </div>
            <div className="msg-bubble ai-bubble" onClick={isTyping ? skipTyping : undefined}>
              {/* Mobile quick-take bullets */}
              {activeTopic.mobilePoints && (
                <ul className="overview-quicktake">
                  {activeTopic.mobilePoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              )}

              <div className="msg-meta">
                <span style={{ color: activeTopic.accent }}>Argus Grounded Engine</span>
                <small>Local Python 3.11 Kernel</small>
                {isThinking ? (
                  <span className="ai-thinking-pulse">
                    <Sparkles size={11} />
                    <span>✦ Initializing Python kernel...</span>
                  </span>
                ) : isTyping ? (
                  <span className="typing-indicator-chip" title="Click to show complete text">
                    Streaming... (click to skip)
                  </span>
                ) : (
                  <button
                    type="button"
                    className="typing-replay-chip"
                    onClick={replayTyping}
                    title="Replay live typing animation"
                  >
                    <RotateCcw size={10} />
                    <span>Replay</span>
                  </button>
                )}
              </div>

              {/* Streaming Typed Content */}
              <div className="overview-typed-content">
                {typedText.split('\n\n').map((paragraph, pIdx) => {
                  const lines = paragraph.split('\n')
                  return (
                    <div key={pIdx} className="overview-para-group">
                      {lines.map((line, lIdx) => {
                        const trimmed = line.trim()
                        if (!trimmed) return null
                        const isBullet =
                          trimmed.startsWith('✦') ||
                          trimmed.startsWith('1.') ||
                          trimmed.startsWith('2.') ||
                          trimmed.startsWith('3.') ||
                          trimmed.startsWith('4.')
                        return (
                          <p key={lIdx} className={isBullet ? 'overview-bullet' : 'overview-text'}>
                            {line}
                          </p>
                        )
                      })}
                    </div>
                  )
                })}
                {isTyping && <span className="typing-cursor" aria-hidden="true" />}
              </div>

              {/* Verified Telemetry Receipt Bar */}
              <div className="overview-receipt-strip">
                <ShieldCheck size={11} style={{ color: activeTopic.accent }} />
                <span className="receipt-tag">{TELEMETRY_RECEIPTS[activeTab].label}:</span>
                <span className="receipt-detail">{TELEMETRY_RECEIPTS[activeTab].detail}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Samvaad-Style Domain Selector (Below dialogue) */}
        <div className="arg-overview-selector-tray">
          <div className="selector-tray-head">
            <span>SELECT ARCHITECTURAL DOMAIN:</span>
          </div>
          <div className="arg-overview-tabs" role="tablist">
            {PROJECT_TOPICS.map((topic, index) => {
              const isActive = index === activeTab
              return (
                <button
                  key={topic.id}
                  role="tab"
                  aria-selected={isActive}
                  className={`arg-overview-tab ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveTab(index)}
                  style={isActive ? { borderColor: topic.accent, color: topic.accent } : {}}
                >
                  <span className="tab-label-full">{topic.tabLabel}</span>
                  <span className="tab-label-mobile">{topic.shortLabel}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer Quick Action Bar */}
        <div className="arg-overview-footer">
          <div className="overview-footer-left">
            <Sparkles size={14} style={{ color: activeTopic.accent }} />
            <span>&ldquo;Deterministic Python compute separated from LLM generation.&rdquo;</span>
          </div>
          <div className="overview-footer-actions">
            <button className="overview-action-demo" onClick={onDemo}>
              <Zap size={13} />
              <span>⚡ Explore Live Workspace Demo</span>
            </button>
            <button className="overview-action-primary desktop-only-btn" onClick={onEnter}>
              <span>Upload Dataset &rarr;</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
