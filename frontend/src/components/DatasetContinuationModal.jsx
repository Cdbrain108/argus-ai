import React, { useEffect, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'

const STAGES = [
  {
    id: 1,
    title: 'Sniff & Byte Parsing',
    desc: 'Encoding sniff, delimiter detection & format verification',
    icon: Database,
    color: '#F97316',
  },
  {
    id: 2,
    title: 'Semantic Type Coercion',
    desc: 'Dates, currencies, percentages, and boolean conversion',
    icon: Cpu,
    color: '#7F77DD',
  },
  {
    id: 3,
    title: 'Statistical Audit',
    desc: 'Tukey IQR fences, null gradient & dataset health index',
    icon: Activity,
    color: '#1D9E75',
  },
  {
    id: 4,
    title: 'Agent StateGraph Initialization',
    desc: 'Registering deterministic tools & AST execution sandbox',
    icon: ShieldCheck,
    color: '#38BDF8',
  },
]

export default function DatasetContinuationModal({
  filename = 'dataset.csv',
  step = 1,
  statusText = 'Ingesting raw bytes...',
  fileSize = null,
}) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = performance.now()
    const timer = setInterval(() => {
      setElapsed(((performance.now() - start) / 1000).toFixed(1))
    }, 100)
    return () => clearInterval(timer)
  }, [])

  const progressPercent = Math.min(100, Math.max(15, (step / 4) * 100))

  return (
    <div className="arg-ingest-backdrop" role="dialog" aria-modal="true" aria-label="Dataset Ingestion Active">
      <div className="arg-ingest-card">
        {/* Glow ambient orb */}
        <div className="ingest-ambient-glow" />

        {/* Top Header with Pulse Core */}
        <div className="ingest-header">
          <div className="ingest-core-icon">
            <div className="ingest-radar-ring" />
            <div className="ingest-radar-ring outer" />
            <div className="ingest-icon-box">
              <Database size={22} className="ingest-db-icon" />
            </div>
          </div>
          <div className="ingest-title-wrap">
            <div className="ingest-badge-row">
              <span className="ingest-live-tag">
                <span className="ingest-pulse-dot" />
                <span>IN-MEMORY PYTHON ENGINE</span>
              </span>
              <span className="ingest-timer-pill">{elapsed}s</span>
            </div>
            <h3 className="ingest-main-title">Ingesting Dataset</h3>
            <div className="ingest-file-pill">
              <FileSpreadsheet size={13} color="#F97316" />
              <span className="ingest-filename">{filename}</span>
              {fileSize && <span className="ingest-filesize">· {fileSize}</span>}
            </div>
          </div>
        </div>

        {/* Dynamic Pipeline Progress Bar */}
        <div className="ingest-progress-section">
          <div className="ingest-progress-head">
            <span className="ingest-status-text">
              <Sparkles size={13} className="spin-slow" color="#38BDF8" />
              <span>{statusText}</span>
            </span>
            <span className="ingest-pct">{Math.round(progressPercent)}%</span>
          </div>
          <div className="ingest-progress-track">
            <div
              className="ingest-progress-bar"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* 4 Pipeline Stage Cards */}
        <div className="ingest-stages-list">
          {STAGES.map((s) => {
            const isDone = step > s.id
            const isCurrent = step === s.id
            const isPending = step < s.id
            const StageIcon = s.icon

            return (
              <div
                key={s.id}
                className={`ingest-stage-item ${
                  isDone ? 'is-done' : isCurrent ? 'is-current' : 'is-pending'
                }`}
                style={{ '--stage-accent': s.color }}
              >
                <div className="ingest-stage-indicator">
                  {isDone ? (
                    <CheckCircle2 size={18} className="stage-check-icon" />
                  ) : isCurrent ? (
                    <Loader2 size={18} className="stage-spin-icon spin-slow" />
                  ) : (
                    <span className="stage-dot" />
                  )}
                </div>
                <div className="ingest-stage-info">
                  <div className="ingest-stage-title-row">
                    <span className="ingest-stage-num">0{s.id}</span>
                    <span className="ingest-stage-name">{s.title}</span>
                  </div>
                  <span className="ingest-stage-desc">{s.desc}</span>
                </div>
                <div className="ingest-stage-tag">
                  {isDone ? (
                    <span className="tag-done">VERIFIED</span>
                  ) : isCurrent ? (
                    <span className="tag-running">RUNNING</span>
                  ) : (
                    <span className="tag-queued">QUEUED</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer Guarantee Bar */}
        <div className="ingest-footer-bar">
          <ShieldCheck size={14} color="#1D9E75" />
          <span>Deterministic SciPy &amp; Pandas Execution · Zero Hallucination Guarantee</span>
        </div>
      </div>
    </div>
  )
}
