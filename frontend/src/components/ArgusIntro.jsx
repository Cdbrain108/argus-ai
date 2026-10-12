import { useEffect, useState } from 'react'

/**
 * ArgusIntro - Cybernetic Coin Toss Intro Animation
 * 
 * Uses the user's robotic hand to flick & toss the Argus logo coin into the air:
 * 1. Cyber hand primed with neon cyan & magenta rim light holding the coin.
 * 2. Rapid flick & snap action launching the coin in 3D tumble.
 * 3. Apex lock: Logo coin lands at center, unleashing radiant Samvaad Om aura rings.
 * 4. Automatic cinematic dissolve into the frontpage (no skip button needed).
 */
export default function ArgusIntro({ onComplete }) {
  const [phase, setPhase] = useState('prime') // 'prime' | 'tossed' | 'apex' | 'exiting'

  useEffect(() => {
    // 0.35s: Hand flicks and coin launches
    const tossTimer = setTimeout(() => {
      setPhase('tossed')
    }, 380)

    // 1.35s: Coin reaches apex, concentric ripples radiate
    const apexTimer = setTimeout(() => {
      setPhase('apex')
    }, 1350)

    // 2.3s: Begin smooth dissolve into the frontpage
    const exitTimer = setTimeout(() => {
      setPhase('exiting')
    }, 2350)

    // 2.85s: Animation complete, unmount overlay
    const doneTimer = setTimeout(() => {
      if (onComplete) onComplete()
    }, 2850)

    return () => {
      clearTimeout(tossTimer)
      clearTimeout(apexTimer)
      clearTimeout(exitTimer)
      clearTimeout(doneTimer)
    }
  }, [onComplete])

  return (
    <div
      className={`argus-toss-overlay phase-${phase} ${phase === 'exiting' ? 'is-exiting' : ''}`}
      aria-hidden="true"
    >
      {/* Ambient Cyber / Cosmic Glow */}
      <div className="argus-toss-backdrop" />

      {/* Arena Stage */}
      <div className="argus-toss-stage">
        {/* Concentric Aura Rings (Triggers at apex, Samvaad Om reference) */}
        <div className="argus-toss-ripples">
          <div className="argus-toss-ring ring-1" />
          <div className="argus-toss-ring ring-2" />
          <div className="argus-toss-ring ring-3" />
          <div className="argus-toss-halo" />
        </div>

        {/* The Argus Coin */}
        <div className={`argus-coin-actor ${phase}`}>
          <div className="argus-coin-inner">
            <img
              src="/argus_logo.png"
              alt="ARGUS Coin"
              className="argus-coin-face front"
            />
            <div className="argus-coin-face back">
              <img src="/argus_logo.png" alt="ARGUS Coin Back" />
            </div>
            <div className="argus-coin-edge" />
            <div className="argus-coin-glint" />
          </div>
        </div>

        {/* Cyber Robotic Hand (From User Image) */}
        <div className={`argus-cyber-hand-wrap ${phase}`}>
          <div className="argus-hand-neon-aura" />
          <img
            src="/toss_hand_cutout.png"
            alt="Cyber Hand"
            className="argus-cyber-hand-img"
          />
          {/* Flick Spark Flare */}
          <div className="argus-flick-flash" />
        </div>

        {/* Brand Reveal at Apex */}
        <div className={`argus-toss-brand ${phase === 'apex' || phase === 'exiting' ? 'visible' : ''}`}>
          <div className="argus-toss-title">ARGUS</div>
          <div className="argus-toss-subtitle">AI-POWERED EXPLORATORY DATA ANALYSIS</div>
          <div className="argus-toss-beam">
            <span className="argus-toss-beam-dot" />
          </div>
        </div>
      </div>
    </div>
  )
}
