import { useState, useEffect } from 'react'
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  X,
  Compass,
  CheckCircle2,
  Database,
  LineChart,
  BrainCircuit,
  Bot,
  Wrench,
  HelpCircle,
  ChevronRight,
  Minimize2,
  Maximize2,
} from 'lucide-react'

export const TOUR_STEPS = [
  {
    step: 1,
    id: 'dataset',
    badge: 'STEP 1 OF 5 · DATASET OVERVIEW',
    title: 'Check Your Data Health & Structure',
    icon: Database,
    color: '#38bdf8',
    targetPage: 'dataset',
    explanation:
      'Start here on the Dataset page! You can see total rows, columns, data types, and an automated Health Score (0–100). Argus highlights missing values and data hygiene issues before you even begin.',
    actionLabel: 'Go to Dataset (02)',
  },
  {
    step: 2,
    id: 'univariate',
    badge: 'STEP 2 OF 5 · ONE COLUMN AT A TIME',
    title: 'Univariate: See How a Single Column Behaves',
    icon: LineChart,
    color: '#f97316',
    targetPage: 'explore',
    explanation:
      'Univariate means analyzing ONE column at a time. Go to Explore > Univariate and select any column (like Age, Revenue, or Fare) to see where numbers bunch up, typical averages, and unusual extreme values (outliers).',
    actionLabel: 'Go to Explore (03)',
  },
  {
    step: 3,
    id: 'bivariate',
    badge: 'STEP 3 OF 5 · COMPARE TWO COLUMNS',
    title: 'Bivariate: Discover How Variables Connect',
    icon: BrainCircuit,
    color: '#c084fc',
    targetPage: 'explore',
    explanation:
      'Bivariate means comparing TWO columns together. Discover how one variable influences another — for example: "Does higher age mean higher spending?" or "How do sales vary across customer tiers?"',
    actionLabel: 'Go to Bivariate (03)',
  },
  {
    step: 4,
    id: 'analyst',
    badge: 'STEP 4 OF 5 · TALK IN PLAIN ENGLISH',
    title: 'AI Analyst: Ask Questions in Everyday Words',
    icon: Bot,
    color: '#10b981',
    targetPage: 'analyst',
    explanation:
      'Ask anything in plain English! Try "What is this dataset about?" or "Which factors affect outcomes?". The AI runs real Python statistical code and gives you verified, grounded explanations with zero jargon.',
    actionLabel: 'Go to AI Analyst (01)',
  },
  {
    step: 5,
    id: 'cleaning-features',
    badge: 'STEP 5 OF 5 · CLEAN & DISCOVER DRIVERS',
    title: 'Clean Messy Data & Rank Top ML Drivers',
    icon: Wrench,
    color: '#fbbf24',
    targetPage: 'cleaning',
    explanation:
      'Use Data Cleaning (04) to repair missing numbers or drop duplicates with 1 click. Then visit Feature Discovery (05) to let machine learning rank the most influential columns predicting your goal!',
    actionLabel: 'Go to Cleaning (04)',
  },
]

export default function WorkspaceTour({ page, setPage, isOpen, onClose }) {
  const [currentStepIdx, setCurrentStepIdx] = useState(0)
  const [isMinimized, setIsMinimized] = useState(false)

  const currentStep = TOUR_STEPS[currentStepIdx] || TOUR_STEPS[0]
  const isLast = currentStepIdx === TOUR_STEPS.length - 1
  const isFirst = currentStepIdx === 0

  const handleNext = () => {
    if (isLast) {
      handleComplete()
    } else {
      const nextIdx = currentStepIdx + 1
      setCurrentStepIdx(nextIdx)
      const nextTarget = TOUR_STEPS[nextIdx].targetPage
      if (nextTarget && setPage) {
        setPage(nextTarget)
      }
    }
  }

  const handlePrev = () => {
    if (!isFirst) {
      const prevIdx = currentStepIdx - 1
      setCurrentStepIdx(prevIdx)
      const prevTarget = TOUR_STEPS[prevIdx].targetPage
      if (prevTarget && setPage) {
        setPage(prevTarget)
      }
    }
  }

  const handleJump = () => {
    if (currentStep.targetPage && setPage) {
      setPage(currentStep.targetPage)
    }
  }

  const handleComplete = () => {
    try {
      localStorage.setItem('argus-tour-seen', 'true')
    } catch {}
    if (onClose) onClose()
  }

  if (!isOpen) return null

  // Floating Minimized Pill
  if (isMinimized) {
    return (
      <aside aria-label="Guided Tour Minimized" className="workspace-tour-minimized" onClick={() => setIsMinimized(false)}>
        <Compass size={16} className="tour-spin-icon" color="var(--orange)" />
        <span className="tour-min-text">
          Guided Tour: Step {currentStep.step} of 5
        </span>
        <button
          type="button"
          className="tour-min-expand"
          title="Expand guided walkthrough"
          aria-label="Expand guided walkthrough"
        >
          <Maximize2 size={13} />
        </button>
      </aside>
    )
  }

  const StepIcon = currentStep.icon

  return (
    <aside aria-label="Interactive Workspace Guided Walkthrough" className="workspace-tour-card-wrap">
      <div className="workspace-tour-card">
        {/* Progress Hairline */}
        <div className="tour-progress-bar">
          <div
            className="tour-progress-fill"
            style={{ width: `${((currentStepIdx + 1) / TOUR_STEPS.length) * 100}%`, background: currentStep.color }}
          />
        </div>

        {/* Header */}
        <div className="tour-card-header">
          <div className="tour-badge-cluster">
            <span className="tour-step-badge" style={{ color: currentStep.color, borderColor: `${currentStep.color}44`, background: `${currentStep.color}15` }}>
              <Sparkles size={11} /> {currentStep.badge}
            </span>
            <span className="tour-step-dots">
              {TOUR_STEPS.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  className={`tour-dot ${idx === currentStepIdx ? 'active' : idx < currentStepIdx ? 'completed' : ''}`}
                  onClick={() => {
                    setCurrentStepIdx(idx)
                    if (s.targetPage && setPage) setPage(s.targetPage)
                  }}
                  title={`Go to step ${s.step}: ${s.title}`}
                  aria-label={`Go to step ${s.step}: ${s.title}`}
                />
              ))}
            </span>
          </div>

          <div className="tour-header-controls">
            <button
              type="button"
              className="tour-ctrl-btn"
              onClick={() => setIsMinimized(true)}
              title="Minimize guide to corner pill"
              aria-label="Minimize guide to corner pill"
            >
              <Minimize2 size={14} />
            </button>
            <button
              type="button"
              className="tour-ctrl-btn close"
              onClick={handleComplete}
              title="Skip and close guide"
              aria-label="Skip and close guide"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="tour-card-body">
          <div className="tour-icon-wrap" style={{ color: currentStep.color, background: `${currentStep.color}15`, borderColor: `${currentStep.color}33` }}>
            <StepIcon size={20} />
          </div>
          <div className="tour-text-content">
            <h4 className="tour-step-title">{currentStep.title}</h4>
            <p className="tour-step-desc">{currentStep.explanation}</p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="tour-card-footer">
          <div className="tour-footer-left">
            <button
              type="button"
              className="tour-jump-btn"
              onClick={handleJump}
              title="Navigate directly to this workspace view"
            >
              <span>{currentStep.actionLabel}</span>
              <ChevronRight size={13} />
            </button>
            <button
              type="button"
              className="tour-skip-link"
              onClick={handleComplete}
            >
              Skip guide
            </button>
          </div>

          <div className="tour-footer-nav">
            {!isFirst && (
              <button
                type="button"
                className="tour-nav-btn prev"
                onClick={handlePrev}
                title="Previous step"
              >
                <ArrowLeft size={13} /> Back
              </button>
            )}
            <button
              type="button"
              className="tour-nav-btn next primary"
              onClick={handleNext}
              style={{ background: currentStep.color, borderColor: currentStep.color }}
            >
              <span>{isLast ? 'Got it! Explore' : 'Next Step'}</span>
              {!isLast && <ArrowRight size={13} />}
              {isLast && <CheckCircle2 size={13} />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
