import { useEffect, useRef, useState } from 'react'
import { Menu, X, User as UserIcon, Star, ArrowRight, Zap, Sparkles, ChevronDown } from 'lucide-react'
import { useScrollLock, useReveal, useCountUp, useScrolled, useMediaQuery } from './hooks'
import { GroundedFlow, PipelineShowcase } from './components/HowItWorks'
import { HeroDataPulse, BentoFeatures, WorkspaceShowcase, ArgusFooter } from './components/LandingComponents'
import AuthModal from './components/AuthModal'
import * as api from './api'

/* Argus Landing Page
   Automated Exploratory Data Analysis with Grounded AI Intelligence
   
   Motion lives in theme.css under "Motion layer" — GPU compositor friendly.
   All styles strictly scoped to .arg-* and .arg-landing to protect the internal workspace. */

const TYPED = ['in under 30 seconds', 'with AI intelligence', 'with zero code']

const HERO_PILLS = [
  ['⚡ 2.8s Fast Profiling', '#F97316', '#FAC775'],
  ['● 100% Local Sandbox', '#1D9E75', '#5DCAA5'],
  ['✦ 10+ Auto SVG Charts', '#EF9F27', '#FAC775'],
  ['✓ Grounded AI Insights', '#38BDF8', '#7DD3FC'],
]

const SAMPLE_PROMPTS = [
  { icon: '📊', short: 'Skew & Outliers', full: 'Analyze skewness & IQR outliers for Revenue' },
  { icon: '⚡', short: 'Peak Margin Tiers', full: 'Which customer tier drives peak profit margin?' },
  { icon: '🔍', short: 'Missing Imputations', full: 'Scan missingness & recommend median imputations' },
  { icon: '📈', short: 'Correlation Matrix', full: 'Generate Spearman correlation matrix with p-values' },
]

const FAQS = [
  ['Is my data uploaded or stored anywhere?', 'No. Your files are parsed locally in the Argus Python sandbox process and kept strictly in memory for your session only. Data is never persisted to databases or shared with third parties, and is purged immediately upon session close.'],
  ['What file formats are supported?', 'CSV, TSV, TXT, Excel (XLSX, XLS), JSON, and Parquet. Encodings, delimiters, and tricky types (currency like "$1,200", dates, accounting negatives) are auto-detected with conversion reasons displayed.'],
  ['Do I need to know Python or statistics?', 'No. All statistical computations run automatically with plain-English interpretations and recommendations. For data scientists, raw JSON statistics and Python snippets remain fully accessible.'],
  ['How are AI answers grounded?', 'Argus runs deterministic statistical calculations in Python (pandas, SciPy, scikit-learn) first. The AI model only describes the exact figures calculated — it never fabricates numbers.'],
  ['What happens if the AI provider is unavailable?', 'All core EDA features — data cleaning, histograms, correlations, health scoring, and report exports — continue running 100% locally without interruption.'],
]

function useTypewriter(phrases) {
  const [text, setText] = useState('')
  const state = useRef({ index: 0, char: 0, deleting: false })

  useEffect(() => {
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
    timer = setTimeout(tick, 500)
    return () => clearTimeout(timer)
  }, [phrases])

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
        // Fallback to original logo if optimized not yet served
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

function Section({ id, alt, tag, tagColor, title, subtitle, children }) {
  return (
    <section id={id} className={alt ? 'arg-section alt' : 'arg-section'}>
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

const NAV_LINKS = [
  ['#top', 'Home'],
  ['#features', 'Features'],
  ['#how-it-works', 'How it works'],
  ['#gallery', 'Workspace'],
  ['#about', 'Architecture'],
  ['#faq', 'FAQ'],
]

export default function Landing({ onEnter, onDemo, onOpenAuth, user, onOpenRating }) {
  const typed = useTypewriter(TYPED)
  const [openFaq, setOpenFaq] = useState(0)
  const [navOpen, setNavOpen] = useState(false)
  const scrolled = useScrolled(24)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [statsRef, statsShown] = useReveal({ threshold: 0.35 })
  const [ratingStats, setRatingStats] = useState(null)

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

  const statsList = [
    ['13+', 'Master datasets'],
    [ratingStats?.avg ? `${ratingStats.avg.toFixed(1)}★` : '5.0★', ratingStats?.count ? `User rating (${ratingStats.count})` : 'User rating'],
    ['110+', 'SVG auto charts'],
    ['<3s', 'Profile runtime'],
  ]

  return (
    <div className="arg-landing">
      {/* ── Navigation Bar ────────────────────────────────────────────── */}
      <nav className={scrolled ? 'arg-nav scrolled' : 'arg-nav'}>
        <a className="arg-nav-brand" href="#top" onClick={closeNav}>
          <Logo />
          <span className="arg-nav-word">Argus</span>
        </a>

        {/* Desktop Navigation Links */}
        <div className="arg-nav-desktop-center">
          <div className="arg-nav-links-desktop">
            {NAV_LINKS.map(([href, label]) => (
              <a className="arg-nav-link" href={href} key={href}>{label}</a>
            ))}
          </div>
        </div>

        {/* Desktop Actions */}
        <div className="arg-nav-actions-desktop">
          <button className="arg-nav-demo-btn" onClick={onDemo} title="Try instantly with demo data">
            <Zap size={13} />
            <span>Try Live Demo</span>
          </button>
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
        <button
          className="arg-nav-toggle"
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={navOpen}
          onClick={() => setNavOpen((open) => !open)}
        >
          {navOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Mobile Navigation Drawer */}
        <div className={navOpen ? 'arg-nav-drawer open' : 'arg-nav-drawer'}>
          <div className="arg-nav-mobile-header">
            <div className="mobile-brand">
              <Logo />
              <span>Argus EDA</span>
            </div>
            <button className="mobile-close" onClick={closeNav} aria-label="Close menu">
              <X size={18} />
            </button>
          </div>
          <div className="arg-nav-mobile-list">
            {NAV_LINKS.map(([href, label]) => (
              <a className="arg-nav-link" href={href} key={href} onClick={closeNav}>
                <span>{label}</span>
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

      {/* ── Hero Section (Viewport Stage) ────────────────────────────── */}
      <header className="arg-hero" id="top">
        <div className="arg-hero-inner">
          <div className="arg-hero-content">
            <div className="arg-hero-badge">
              <span className="arg-pulse" />
              <span>AI-POWERED AUTOMATED EDA PLATFORM</span>
            </div>

            <h1>
              Understand your data{' '}
              <span className="arg-hero-title-break"><br /></span>
              <span className="arg-type">{typed}</span>
              <i className="arg-caret" />
            </h1>

            <p className="arg-hero-sub">
              Instant statistical profiling, outlier fencing, and publication-ready charts from raw CSV, Excel, or Parquet files &mdash; powered by local Python engines with zero code.
            </p>

            <div className="arg-hero-actions">
              <button className="arg-btn-primary" onClick={onEnter}>
                <span>Upload your dataset &rarr;</span>
              </button>
              <button className="arg-btn-secondary" onClick={onDemo}>
                <Zap size={15} />
                <span>Try Live Demo</span>
              </button>
            </div>

            {/* Interactive Query Chips (Samvaad style) */}
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
                    <span className="chip-text">{isMobile ? prompt.short : prompt.full}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="arg-hero-pills">
              {HERO_PILLS.map(([label, bg, fg], index) => (
                <span
                  key={label}
                  className="arg-pill"
                  style={{ background: `${bg}22`, color: fg, '--d': `${index * 420}ms` }}
                >
                  {label}
                </span>
              ))}
            </div>

            {/* ── Stats Strip ────────────────────────────────────────── */}
            <div className="arg-stats" ref={statsRef}>
              {statsList.map(([value, label]) => (
                <Stat key={label} value={value} label={label} active={statsShown} />
              ))}
            </div>
          </div>

          {/* ── Interactive Hero Data Pulse Preview (Anchors the Hero) ── */}
          <div className="arg-hero-visual">
            <HeroDataPulse onEnter={onEnter} onDemo={onDemo} />
          </div>
        </div>
      </header>

      <div className="arg-divider" />

      {/* ── Core Features Section ────────────────────────────────────── */}
      <Section
        id="features"
        tag="FEATURES"
        tagColor="#7F77DD"
        title="Everything EDA, automated"
        subtitle="Deterministic Python precision meets grounded AI narration"
      >
        <BentoFeatures />
      </Section>

      <div className="arg-divider" />

      {/* ── How It Works (Pipeline Showcase) ─────────────────────────── */}
      <Section
        id="how-it-works"
        alt
        tag="PROCESS FLOW"
        tagColor="#EF9F27"
        title="Data to Insight in 4 Steps"
        subtitle="No maintenance. No setup. No learning curve."
      >
        <PipelineShowcase />
      </Section>

      <div className="arg-divider" />

      {/* ── Gallery / Interactive Workspace Studio ───────────────────── */}
      <Section
        id="gallery"
        tag="WORKSPACE STUDIO"
        tagColor="#38BDF8"
        title="See the live workspace in action"
        subtitle="The interactive analysis environment you land in after your first upload"
      >
        <WorkspaceShowcase onEnter={onEnter} onDemo={onDemo} />
      </Section>

      <div className="arg-divider" />

      {/* ── Architecture & Philosophy ────────────────────────────────── */}
      <Section
        id="about"
        alt
        tag="ARCHITECTURE"
        tagColor="#1D9E75"
        title="Why Argus exists"
        subtitle="Deterministic computing meets grounded natural-language intelligence"
      >
        <div className="arg-about">
          <Reveal className="arg-about-lead">
            <p className="lead-highlight">
              Eliminate 45 minutes of manual EDA boilerplate on every new dataset. Argus profiles health, resolves data types, detects mathematical anomalies, and plots 10+ distributions in seconds.
            </p>
            <p className="lead-sub">
              Every metric is deterministically calculated by local Python engines (pandas, SciPy, scikit-learn) inside an AST-sandboxed sandbox. AI intelligence narrates findings &mdash; with absolute mathematical truth.
            </p>
          </Reveal>
          <div className="arg-grid-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <Reveal as="article" className="arg-card" delay={60} style={{ '--accent': '#1D9E75' }}>
              <h3>Grounded Truth</h3>
              <p>Deterministic Python computation in pandas and SciPy, zero model hallucination.</p>
            </Reveal>
            <Reveal as="article" className="arg-card" delay={120} style={{ '--accent': '#7F77DD' }}>
              <h3>AST Sandboxed</h3>
              <p>Secure isolated process execution with rigorous AST syntax gating.</p>
            </Reveal>
            <Reveal as="article" className="arg-card" delay={180} style={{ '--accent': '#EF9F27' }}>
              <h3>Transparent</h3>
              <p>Missingness, skewness, and errors reported honestly with actionable next steps.</p>
            </Reveal>
            <Reveal as="article" className="arg-card" delay={240} style={{ '--accent': '#F97316' }}>
              <h3>Instant Speed</h3>
              <p>Full dataset profiling and 10+ publication-ready charts in under 3 seconds.</p>
            </Reveal>
          </div>
          <GroundedFlow />
        </div>
      </Section>

      <div className="arg-divider" />

      {/* ── FAQ Section ──────────────────────────────────────────────── */}
      <Section id="faq" tag="FAQ" tagColor="#E24B4A" title="Questions, answered">
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

      {/* ── Final Call to Action Stage (Unified with Footer) ──────── */}
      <div className="arg-cta" id="auth-cta">
        <div className="arg-cta-grid">
          <Reveal className="arg-cta-lead">
            <div className="arg-cta-badge">
              <Sparkles size={13} />
              <span>START IN SECONDS</span>
            </div>
            <h2>Point Argus at your next dataset</h2>
            <p>No setup, no schema, no code. Upload a file and start exploring instantly.</p>
            <div className="arg-hero-actions" style={{ marginBottom: user ? 0 : 20 }}>
              <button className="arg-btn-primary" onClick={onEnter}>
                {user ? 'Open Workspace →' : 'Upload your dataset →'}
              </button>
              <button className="arg-btn-secondary" onClick={onDemo}>
                <Zap size={14} />
                <span>Try Live Demo</span>
              </button>
            </div>
          </Reveal>

          {!user && (
            <Reveal delay={120} className="arg-cta-auth-side">
              <div className="arg-cta-auth-box">
                <AuthModal
                  embedded
                  initialTab="signup"
                  onSuccess={(u) => onEnter?.()}
                  onDemo={onDemo}
                />
              </div>
            </Reveal>
          )}
        </div>
      </div>

      {/* ── Polished Product Footer Stage ─────────────────────────── */}
      <ArgusFooter />

      {/* ── Floating Mobile Quick Action Bar (Samvaad style) ──────── */}
      {isMobile && scrolled && (
        <aside className="arg-floating-mobile-bar" aria-label="Mobile quick actions">
          <button className="arg-float-demo-btn" onClick={onDemo}>
            <Zap size={14} />
            <span>⚡ Live Demo</span>
          </button>
          <button className="arg-float-cta-btn" onClick={onEnter}>
            <span>Upload File</span>
            <ArrowRight size={14} />
          </button>
        </aside>
      )}
    </div>
  )
}
