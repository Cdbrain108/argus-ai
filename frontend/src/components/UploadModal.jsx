import { useState, useRef } from 'react'
import {
  UploadCloud,
  FileSpreadsheet,
  ShieldCheck,
  X,
  Database,
  Lock,
  Zap,
  Loader2,
  TrendingUp,
  Activity,
  Users,
} from 'lucide-react'

const ACCEPTED_EXTENSIONS = ['.csv', '.tsv', '.txt', '.tab', '.psv', '.dat', '.json', '.jsonl', '.parquet', '.xlsx', '.xls', '.xlsm']
const ACCEPTED_STRING = ACCEPTED_EXTENSIONS.join(',')

const DEMO_DATASETS = [
  {
    id: 'titanic',
    title: 'Titanic Survival Master',
    badge: 'Classification & Demographics',
    badgeColor: '#f97316',
    badgeBg: 'rgba(249, 115, 22, 0.12)',
    iconColor: '#f97316',
    icon: FileSpreadsheet,
    rows: '891 rows · 12 features',
    desc: 'Passenger survival rates, demographic skew (Age, Sex, Pclass), missing Cabin patterns, and family fare dynamics.',
    btnGradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    btnGlow: 'rgba(249, 115, 22, 0.35)',
    btnText: 'Load Titanic Demo',
  },
  {
    id: 'bikeshare',
    title: 'Capital Bike Share Ridership',
    badge: 'Time-Series & Regression',
    badgeColor: '#38bdf8',
    badgeBg: 'rgba(56, 189, 248, 0.12)',
    iconColor: '#38bdf8',
    icon: Activity,
    rows: '731 days · 13 features',
    desc: 'Daily bicycle rental demand correlated with temperature, humidity, windspeed, weather severity, and seasonal rhythms.',
    btnGradient: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
    btnGlow: 'rgba(56, 189, 248, 0.35)',
    btnText: 'Load Bike Share Demo',
  },
  {
    id: 'churn',
    title: 'Customer Churn & Retention',
    badge: 'SaaS & Revenue Intelligence',
    badgeColor: '#10b981',
    badgeBg: 'rgba(16, 185, 129, 0.12)',
    iconColor: '#10b981',
    icon: Users,
    rows: '1,000 customers · 16 features',
    desc: 'Subscriber churn predictors, month-to-month contracts, fiber optic tier pricing, and customer lifetime value risk.',
    btnGradient: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
    btnGlow: 'rgba(16, 185, 129, 0.35)',
    btnText: 'Load Churn Demo',
  },
]

export default function UploadModal({
  isOpen,
  onClose,
  onFile,
  onDemo,
  user,
  onOpenAuth,
  busy = false,
}) {
  const [activeTab, setActiveTab] = useState('practice')
  const [isDragging, setIsDragging] = useState(false)
  const [loadingDemoId, setLoadingDemoId] = useState(null)
  const fileInputRef = useRef(null)

  if (!isOpen) return null

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      await onFile(files[0])
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      await onFile(file)
    }
    e.target.value = ''
  }

  const triggerBrowse = () => {
    fileInputRef.current?.click()
  }

  const handleLoadDemo = async (demoId) => {
    if (busy || loadingDemoId) return
    setLoadingDemoId(demoId)
    try {
      await onDemo?.(demoId)
    } finally {
      setLoadingDemoId(null)
    }
  }

  return (
    <div className="arg-auth-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="arg-upload-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="arg-auth-close" onClick={onClose} aria-label="Close modal">
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div className="arg-upload-modal-header">
          <div className="arg-upload-icon-badge">
            <Database size={24} color="#f97316" />
          </div>
          <div>
            <div className="arg-upload-badge-row">
              <span className="arg-upload-tag">DATA INGESTION</span>
              <span className="arg-upload-local-pill">
                <span className="arg-pulse-dot" /> 100% In-Memory Python
              </span>
            </div>
            <h3 className="arg-upload-modal-title">Choose or Ingest Dataset</h3>
            <p className="arg-upload-modal-subtitle">
              Select one of our 3 verified practice datasets or upload your own file.
            </p>
          </div>
        </div>

        {/* Segmented Ingestion Tabs */}
        <div className="arg-upload-tabs-nav" role="tablist">
          <button
            type="button"
            className={`arg-upload-tab-nav-btn ${activeTab === 'practice' ? 'active' : ''}`}
            onClick={() => setActiveTab('practice')}
            role="tab"
            aria-selected={activeTab === 'practice'}
          >
            <Zap size={14} />
            <span>Practice Benchmark Datasets ({DEMO_DATASETS.length})</span>
          </button>
          <button
            type="button"
            className={`arg-upload-tab-nav-btn ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
            role="tab"
            aria-selected={activeTab === 'upload'}
          >
            <UploadCloud size={14} />
            <span>Upload Custom File</span>
          </button>
        </div>

        <div className="arg-upload-body">
          {activeTab === 'practice' && (
            <div className="arg-demo-cards-stack">
              {DEMO_DATASETS.map((item) => {
                const IconComponent = item.icon
                const isLoading = loadingDemoId === item.id
                return (
                  <div key={item.id} className="arg-demo-quick-card">
                    <div className="arg-demo-card-left">
                      <div
                        className="arg-demo-card-icon-wrap"
                        style={{ background: item.badgeBg, color: item.iconColor }}
                      >
                        <IconComponent size={18} />
                      </div>
                      <div className="arg-demo-quick-info">
                        <div className="arg-demo-quick-title-row">
                          <strong className="arg-demo-name">{item.title}</strong>
                          <span
                            className="demo-badge"
                            style={{ color: item.badgeColor, background: item.badgeBg }}
                          >
                            {item.badge}
                          </span>
                          <span className="demo-rows-pill">{item.rows}</span>
                        </div>
                        <p className="arg-demo-desc">{item.desc}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="arg-demo-perfect-btn"
                      style={{
                        background: item.btnGradient,
                        boxShadow: `0 3px 12px ${item.btnGlow}, 0 2px 4px rgba(0,0,0,0.3)`,
                      }}
                      onClick={() => handleLoadDemo(item.id)}
                      disabled={busy || Boolean(loadingDemoId)}
                      title={`Load ${item.title}`}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 size={13} className="spin-slow" />
                          <span>Loading...</span>
                        </>
                      ) : (
                        <>
                          <Zap size={13} fill="currentColor" />
                          <span>{item.btnText}</span>
                        </>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {activeTab === 'upload' && (
            !user ? (
              <div className="arg-upload-auth-gate">
                <div className="arg-upload-auth-gate-icon">
                  <Lock size={28} color="#f97316" />
                </div>
                <h4>Authentication Required for Custom Uploads</h4>
                <p>
                  Please sign in or create a free account to ingest private custom files. Or explore our practice datasets immediately as guest!
                </p>
                <div className="arg-upload-auth-actions">
                  <button
                    type="button"
                    className="arg-btn-primary"
                    onClick={() => {
                      onClose?.()
                      onOpenAuth?.('login')
                    }}
                  >
                    <span>Log in to Argus &rarr;</span>
                  </button>
                  <button
                    type="button"
                    className="arg-btn-secondary"
                    onClick={() => setActiveTab('practice')}
                  >
                    <span>⚡ Explore Practice Datasets</span>
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`arg-dropzone-box ${isDragging ? 'dragging' : ''} ${busy ? 'busy' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={triggerBrowse}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_STRING}
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  disabled={busy}
                />
                <div className="arg-dropzone-icon-circle">
                  <UploadCloud size={30} className="arg-dropzone-cloud-icon" />
                </div>
                <h4 className="arg-dropzone-prompt">
                  Drag &amp; drop your dataset file here
                </h4>
                <p className="arg-dropzone-sub">
                  or click anywhere inside to <strong>browse local files</strong>
                </p>

                {/* Supported Formats Pills */}
                <div className="arg-dropzone-formats">
                  <span className="format-pill">CSV</span>
                  <span className="format-pill">Excel (.xlsx)</span>
                  <span className="format-pill">Parquet</span>
                  <span className="format-pill">JSON / JSONL</span>
                  <span className="format-pill">TSV / TXT</span>
                </div>
                <span className="arg-dropzone-size-hint">Max file size: 50 MB &middot; UTF-8, ASCII &amp; Latin-1 autodetected</span>
              </div>
            )
          )}

          {/* Privacy & Assurance Footer */}
          <div className="arg-upload-footer-assurance">
            <ShieldCheck size={16} color="#1d9e75" />
            <span>
              Processed securely in-memory with deterministic Python math. Your data never leaves your local system.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
