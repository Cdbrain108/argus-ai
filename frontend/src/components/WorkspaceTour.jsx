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
  ChevronRight,
  Minimize2,
  Maximize2,
  Check,
} from 'lucide-react'

export const TOUR_STEPS = [
  {
    step: 1,
    id: 'dataset',
    badge: 'Step 1 of 5',
    title: 'Dataset Overview',
    icon: Database,
    color: '#38bdf8',
    targetPage: 'dataset',
    targetTab: null,
    explanation: 'Review rows, columns, and your automated 0–100 data health score.',
    actionLabel: 'Dataset View',
  },
  {
    step: 2,
    id: 'univariate',
    badge: 'Step 2 of 5',
    title: 'Univariate (1 Column)',
    icon: LineChart,
    color: '#f97316',
    targetPage: 'explore',
    targetTab: 'univariate',
    explanation: 'Pick any single column to check its distribution, average, and outliers.',
    actionLabel: 'Univariate',
  },
  {
    step: 3,
    id: 'bivariate',
    badge: 'Step 3 of 5',
    title: 'Bivariate (2 Columns)',
    icon: BrainCircuit,
    color: '#c084fc',
    targetPage: 'explore',
    targetTab: 'bivariate',
    explanation: 'Compare two columns to see how they influence and connect with each other.',
    actionLabel: 'Bivariate',
  },
  {
    step: 4,
    id: 'analyst',
    badge: 'Step 4 of 5',
    title: 'AI Analyst Chat',
    icon: Bot,
    color: '#10b981',
    targetPage: 'analyst',
    targetTab: null,
    explanation: 'Ask questions in plain English — answered with verified Python statistics.',
    actionLabel: 'AI Analyst',
  },
  {
    step: 5,
    id: 'cleaning-features',
    badge: 'Step 5 of 5',
    title: 'Cleaning & ML Drivers',
    icon: Wrench,
    color: '#fbbf24',
    targetPage: 'cleaning',
    targetTab: null,
    explanation: 'Fix missing cells in 1 click, or rank your top predictive drivers.',
    actionLabel: 'Data Cleaning',
  },
]

export default function WorkspaceTour({ page, setPage, exploreTab, setExploreTab, isOpen, onClose }) {
  const [currentStepIdx, setCurrentStepIdx] = useState(0)
  const [isMinimized, setIsMinimized] = useState(false)

  const currentStep = TOUR_STEPS[currentStepIdx] || TOUR_STEPS[0]
  const isLast = currentStepIdx === TOUR_STEPS.length - 1
  const isFirst = currentStepIdx === 0

  // Check if user is currently on the step's page & tab
  const isCurrentlyOnStep =
    page === currentStep.targetPage &&
    (!currentStep.targetTab || exploreTab === currentStep.targetTab)

  // Navigate both workspace page and sub-tab properly
  const navigateToStep = (idx) => {
    const s = TOUR_STEPS[idx]
    if (!s) return
    setCurrentStepIdx(idx)
    if (s.targetPage && setPage) {
      setPage(s.targetPage)
    }
    if (s.targetTab && setExploreTab) {
      setExploreTab(s.targetTab)
    }
  }

  const handleNext = () => {
    if (isLast) {
      handleComplete()
    } else {
      navigateToStep(currentStepIdx + 1)
    }
  }

  const handlePrev = () => {
    if (!isFirst) {
      navigateToStep(currentStepIdx - 1)
    }
  }

  const handleJump = () => {
    navigateToStep(currentStepIdx)
  }

  const handleComplete = () => {
    try {
      localStorage.setItem('argus-tour-seen', 'true')
    } catch {}
    if (onClose) onClose()
  }

  if (!isOpen) return null

  // Floating Minimized Pill at top-right
  if (isMinimized) {
    return (
      <aside
        aria-label="Guided Tour Minimized"
        className="workspace-tour-minimized"
        onClick={() => setIsMinimized(false)}
        title="Click to expand guided walkthrough"
      >
        <Compass size={14} className="tour-spin-icon" color="var(--orange)" />
        <span className="tour-min-text">
          Guide {currentStep.step}/5: {currentStep.title}
        </span>
        <button
          type="button"
          className="tour-min-expand"
          title="Expand guide"
          aria-label="Expand guide"
        >
          <Maximize2 size={12} />
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

        {/* Compact Header */}
        <div className="tour-card-header">
          <div className="tour-badge-cluster">
            <span
              className="tour-step-badge"
              style={{ color: currentStep.color, borderColor: `${currentStep.color}44`, background: `${currentStep.color}15` }}
            >
              <Sparkles size={10} /> {currentStep.badge}
            </span>
            <span className="tour-step-dots">
              {TOUR_STEPS.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  className={`tour-dot ${idx === currentStepIdx ? 'active' : idx < currentStepIdx ? 'completed' : ''}`}
                  onClick={() => navigateToStep(idx)}
                  title={`Step ${s.step}: ${s.title}`}
                  aria-label={`Step ${s.step}: ${s.title}`}
                />
              ))}
            </span>
          </div>

          <div className="tour-header-controls">
            <button
              type="button"
              className="tour-ctrl-btn"
              onClick={() => setIsMinimized(true)}
              title="Minimize guide to top corner"
              aria-label="Minimize guide"
            >
              <Minimize2 size={13} />
            </button>
            <button
              type="button"
              className="tour-ctrl-btn close"
              onClick={handleComplete}
              title="Skip and close guide"
              aria-label="Close guide"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Crisp Body */}
        <div className="tour-card-body">
          <div
            className="tour-icon-wrap"
            style={{ color: currentStep.color, background: `${currentStep.color}15`, borderColor: `${currentStep.color}33` }}
          >
            <StepIcon size={16} />
          </div>
          <div className="tour-text-content">
            <h4 className="tour-step-title">{currentStep.title}</h4>
            <p className="tour-step-desc">{currentStep.explanation}</p>
          </div>
        </div>

        {/* Compact Footer Actions */}
        <div className="tour-card-footer">
          <div className="tour-footer-left">
            <button
              type="button"
              className={`tour-jump-btn ${isCurrentlyOnStep ? 'current' : ''}`}
              onClick={handleJump}
              title={isCurrentlyOnStep ? "You are on this tool" : `Switch to ${currentStep.title}`}
            >
              {isCurrentlyOnStep ? <Check size={11} /> : <ChevronRight size={11} />}
              <span>{isCurrentlyOnStep ? 'Active View' : currentStep.actionLabel}</span>
            </button>
            <button
              type="button"
              className="tour-skip-link"
              onClick={handleComplete}
              title="Dismiss guided tour"
            >
              Skip
            </button>
          </div>

          <div className="tour-footer-nav">
            {!isFirst && (
              <button
                type="button"
                className="tour-nav-btn prev"
                onClick={handlePrev}
                title="Go to previous step"
              >
                <ArrowLeft size={11} /> Back
              </button>
            )}
            <button
              type="button"
              className="tour-nav-btn next primary"
              onClick={handleNext}
              style={{ background: currentStep.color, borderColor: currentStep.color }}
              title={isLast ? "Complete walkthrough" : "Go to next step"}
            >
              <span>{isLast ? 'Finish ✓' : 'Next Step'}</span>
              {!isLast && <ArrowRight size={11} />}
              {isLast && <CheckCircle2 size={11} />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
