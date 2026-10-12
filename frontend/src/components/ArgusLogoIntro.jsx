import { useEffect, useState, useCallback } from 'react'

/**
 * ArgusLogoIntro — Cinematic AI-Powered Intro Animation
 * 
 * Concept: The All-Seeing Eye of ARGUS awakening.
 * - Circular multi-axis cybernetic telemetry & gyroscopic HUD rings
 * - High-res Argus medallion with specular light sweep & laser scanning beam
 * - Central ocular iris bloom pulsing over the golden triangle
 * - Live computational telemetry, progress matrix, and audio/data equalizer
 * - Letter-spaced chrome-gold brand typography
 * - Instant skip via button, click, or Escape key
 * - Smooth cinematic warp dissolve into the main workspace
 */
export default function ArgusLogoIntro({ onComplete }) {
  const [phase, setPhase] = useState('boot') // 'boot' | 'scan' | 'ready' | 'exiting'
  const [progress, setProgress] = useState(14)
  const [statusText, setStatusText] = useState('INITIALIZING MULTI-AGENT SYNAPSE...')

  const handleSkip = useCallback(() => {
    setPhase('exiting')
    setTimeout(() => {
      if (onComplete) onComplete()
    }, 380)
  }, [onComplete])

  useEffect(() => {
    // Keydown handler: Escape or Space to skip immediately
    const onKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        handleSkip()
      }
    }
    window.addEventListener('keydown', onKeyDown)

    // Progression timeline
    const t1 = setTimeout(() => {
      setPhase('scan')
      setProgress(68)
      setStatusText('CALIBRATING ALL-SEEING DATA SENSORS...')
    }, 850)

    const t2 = setTimeout(() => {
      setPhase('ready')
      setProgress(100)
      setStatusText('ARGUS AUTOMATED EDA ENGINE: ONLINE')
    }, 1850)

    const t3 = setTimeout(() => {
      setPhase('exiting')
    }, 2800)

    const t4 = setTimeout(() => {
      if (onComplete) onComplete()
    }, 3250)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
    }
  }, [handleSkip, onComplete])

  return (
    <div
      className={`argus-cinematic-intro phase-${phase} ${phase === 'exiting' ? 'is-exiting' : ''}`}
      onClick={handleSkip}
      role="banner"
      aria-label="ARGUS Intro Sequence"
    >
      {/* Deep cosmic backdrop with cyber space grid */}
      <div className="arg-intro-stars-canvas" />
      <div className="arg-intro-grid-floor" />
      <div className="arg-intro-ambient-glow gold" />
      <div className="arg-intro-ambient-glow cyan" />

      {/* Top HUD Telemetry Bar */}
      <header className="arg-intro-top-hud" onClick={(e) => e.stopPropagation()}>
        <div className="arg-intro-hud-left">
          <span className="arg-intro-hud-dot" />
          <span className="arg-intro-hud-title">ARGUS_OS // NEURAL_EDA v2.4</span>
        </div>
        <button
          type="button"
          className="arg-intro-skip-btn"
          onClick={handleSkip}
          aria-label="Skip Intro Animation"
        >
          <span>SKIP INTRO</span>
          <kbd className="arg-intro-kbd">ESC</kbd>
        </button>
      </header>

      {/* Center Stage: The Medallion and Telemetry Rings */}
      <main className="arg-intro-center-stage">
        {/* Gyroscopic Telemetry Rings */}
        <div className="arg-intro-gyro-system">
          {/* Outer Segmented HUD Ring (SVG) */}
          <svg className="arg-intro-svg-ring outer-ring" viewBox="0 0 400 400">
            <circle
              cx="200"
              cy="200"
              r="192"
              fill="none"
              stroke="rgba(245, 158, 11, 0.28)"
              strokeWidth="1.2"
              strokeDasharray="4 8"
            />
            <circle
              cx="200"
              cy="200"
              r="178"
              fill="none"
              stroke="rgba(56, 189, 248, 0.35)"
              strokeWidth="1.5"
              strokeDasharray="42 18 12 18"
            />
            {/* Cardinal Tick Marks */}
            <line x1="200" y1="4" x2="200" y2="16" stroke="#f59e0b" strokeWidth="2" />
            <line x1="200" y1="384" x2="200" y2="396" stroke="#f59e0b" strokeWidth="2" />
            <line x1="4" y1="200" x2="16" y2="200" stroke="#38bdf8" strokeWidth="2" />
            <line x1="384" y1="200" x2="396" y2="200" stroke="#38bdf8" strokeWidth="2" />
          </svg>

          {/* Inner Counter-Rotating Reticle Ring */}
          <svg className="arg-intro-svg-ring inner-ring" viewBox="0 0 320 320">
            <circle
              cx="160"
              cy="160"
              r="152"
              fill="none"
              stroke="rgba(245, 158, 11, 0.4)"
              strokeWidth="1"
              strokeDasharray="80 30 10 30"
            />
            <circle
              cx="160"
              cy="160"
              r="142"
              fill="none"
              stroke="rgba(56, 189, 248, 0.25)"
              strokeWidth="1"
              strokeDasharray="6 6"
            />
          </svg>

          {/* Pulsing Energy Shockwave Rings */}
          <div className="arg-intro-shockwave wave-1" />
          <div className="arg-intro-shockwave wave-2" />

          {/* Rotating Radar / Optical Scan Beam */}
          <div className="arg-intro-radar-sweep" />

          {/* Circular Argus Medallion Core */}
          <div className="arg-intro-medallion-wrap">
            <div className="arg-intro-coin-frame">
              {/* High-Res Circular Argus Medallion */}
              <img
                src="/argus_emblem_hq.png"
                alt="ARGUS - The Watchful Eye for Data"
                className="arg-intro-coin-img"
              />

              {/* Specular Light Reflection Sweep */}
              <div className="arg-intro-coin-sheen" />

              {/* Vertical Laser Scanner Beam */}
              <div className="arg-intro-laser-scanner" />

              {/* Ocular Iris Awakening Bloom (over the golden eye triangle) */}
              <div className="arg-intro-eye-bloom" />
            </div>
          </div>
        </div>

        {/* Brand Reveal & Mission Telemetry */}
        <div className="arg-intro-brand-block">
          <div className="arg-intro-brand-eyebrow">
            <span className="arg-intro-badge-pill">AGENTIC AI PLATFORM</span>
          </div>

          <h1 className="arg-intro-title">
            <span className="char">A</span>
            <span className="char">R</span>
            <span className="char">G</span>
            <span className="char">U</span>
            <span className="char">S</span>
          </h1>

          <p className="arg-intro-tagline">
            THE WATCHFUL EYE FOR DATA
          </p>

          <p className="arg-intro-subtitle">
            AI-POWERED EXPLORATORY DATA ANALYSIS
          </p>

          {/* Diagnostics Progress Meter */}
          <div className="arg-intro-meter-container">
            <div className="arg-intro-meter-track">
              <div
                className="arg-intro-meter-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="arg-intro-meter-labels">
              <span className="arg-intro-status-text">{statusText}</span>
              <span className="arg-intro-percent-text">{progress}%</span>
            </div>
          </div>

          {/* Micro Equalizer Frequency Bars */}
          <div className="arg-intro-equalizer" aria-hidden="true">
            {Array.from({ length: 16 }).map((_, i) => (
              <span
                key={i}
                className="arg-intro-eq-bar"
                style={{
                  animationDelay: `${(i * 0.08).toFixed(2)}s`,
                  animationDuration: `${0.7 + (i % 5) * 0.15}s`,
                }}
              />
            ))}
          </div>
        </div>
      </main>

      {/* Bottom Sub-HUD Notice */}
      <footer className="arg-intro-bottom-hud">
        <span className="arg-intro-hud-sec">CLICK ANYWHERE OR PRESS ESC TO ENTER</span>
      </footer>
    </div>
  )
}
