import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  Columns,
  Compass,
  Copy,
  Crosshair,
  Database,
  Download,
  Filter,
  HelpCircle,
  Info,
  KeyRound,
  Layers,
  LayoutGrid,
  Lightbulb,
  LineChart,
  LoaderCircle,
  LogOut,
  Maximize2,
  Menu,
  MessageSquare,
  Minimize2,
  PanelLeft,
  PanelLeftClose,
  Pin,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Table as TableIcon,
  Terminal,
  Trash2,
  Upload,
  User as UserIcon,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import * as api from './api'
import Landing from './Landing'
import { useScrollLock, useDynamicViewport, useMediaQuery } from './hooks'
import AiNarrative from './components/AiNarrative'
import { DatasetOverview } from './components/DatasetOverview'
import AuthModal from './components/AuthModal'
import AuthPage from './components/AuthPage'
import RatingModal from './components/RatingModal'
import DatasetContinuationModal from './components/DatasetContinuationModal'
import UploadModal from './components/UploadModal'
import WorkspaceTour from './components/WorkspaceTour'
import { MobileWorkspaceEmpty, MobileAnalystSwitcher } from './components/MobilePerfect'
import ArgusLogoIntro from './components/ArgusLogoIntro'
import { subscribeToAuthChanges, logoutFirebase } from './services/firebase'
import MasterChart, {
  BarChart,
  CorrelationHeatmap,
  FeatureImportanceChart,
  HistogramChart,
  ScatterPlot,
} from './components/Charts'

const NAV = [
  { id: 'analyst', label: 'AI Analyst', icon: Bot },
  { id: 'dataset', label: 'Dataset', icon: Database },
  { id: 'explore', label: 'Explore', icon: LineChart },
  { id: 'cleaning', label: 'Data Cleaning', icon: Wrench },
  { id: 'features', label: 'Feature Discovery', icon: BrainCircuit },
]

const PAGE_NUMBERS = {
  analyst: '01',
  dataset: '02',
  explore: '03',
  cleaning: '04',
  features: '05',
}

/* Mirrors `_ALLOWED_SUFFIXES` in backend/api/datasets.py. The loader sniffs the
   delimiter and walks an encoding ladder, so TSV and delimited TXT need no
   separate reader — only permission to arrive. */
const ACCEPTED_UPLOADS = '.csv,.tsv,.txt,.tab,.psv,.dat,.json,.jsonl,.parquet,.xlsx,.xls,.xlsm'

/* How each inferred logical type is presented on the Dataset page. The label is
   what the column *is*; the dtype pill next to it stays as the ground truth. */
const LOGICAL_LABELS = {
  numeric: ['Numeric', 'var(--blue)'],
  integer: ['Integer', 'var(--blue)'],
  boolean: ['Boolean', 'var(--green)'],
  datetime: ['Date / time', 'var(--purple)'],
  categorical: ['Categorical', 'var(--orange)'],
  text: ['Free text', 'var(--text-muted)'],
  identifier: ['Identifier', 'var(--cyan)'],
  constant: ['Constant', 'var(--yellow)'],
  empty: ['Empty', 'var(--red)'],
}

// A raw "\t" in the load summary would render as blank space.
const DELIMITER_LABELS = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' }

const BEGINNER_TERMS = {
  pearson_r: 'Correlation — Strength and direction of linear link (-1 to +1)',
  p_value: 'Statistical Significance — Likelihood this was random chance (<0.05 is significant)',
  r_squared: 'Variance Explained — % of behavior explained by this relationship',
  slope: 'Rate of Change — How much Y changes per 1 unit change in X',
  skew: 'Distribution Tilt — Whether values lean left or right of center',
  kurtosis: 'Outlier Severity — Heaviness of extreme tail values',
  iqr: 'Middle Spread — Value range covering the central 50% of rows',
  eta_squared: 'Group Influence — How strongly category groups differ from each other',
}

function App() {
  // Always reset to the landing page on reload
  const [view, setView] = useState('landing')
  const [page, setPage] = useState('dataset')
  const [dataset, setDataset] = useState(() => {
    try {
      const d = localStorage.getItem('argus-active-dataset')
      return d ? JSON.parse(d) : null
    } catch {
      return null
    }
  })
  const [profile, setProfile] = useState(() => {
    try {
      const p = localStorage.getItem('argus-active-profile')
      return p ? JSON.parse(p) : null
    } catch {
      return null
    }
  })
  const [preview, setPreview] = useState(() => {
    try {
      const p = localStorage.getItem('argus-active-preview')
      return p ? JSON.parse(p) : null
    } catch {
      return null
    }
  })
  const [sessionId, setSessionId] = useState(() => localStorage.getItem('argus-session') || '')
  const [messages, setMessages] = useState(() => {
    try {
      const m = localStorage.getItem('argus-active-messages')
      return m ? JSON.parse(m) : []
    } catch {
      return []
    }
  })
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [beginnerMode, setBeginnerMode] = useState(() => localStorage.getItem('argus-beginner') === 'true')
  const [verboseMode, setVerboseMode] = useState(() => {
    try {
      return localStorage.getItem('argus-verbose-mode') === 'true'
    } catch {
      return false
    }
  })
  const [recentAnalyses, setRecentAnalyses] = useState([])
  const [user, setUser] = useState(() => api.getStoredUser())
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalTab, setAuthModalTab] = useState('login')
  const [ratingModalOpen, setRatingModalOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadModalForNewChat, setUploadModalForNewChat] = useState(false)
  // Intro animation plays only ONCE per browser session so app-switching never replays it
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return !sessionStorage.getItem('argus-intro-seen')
    } catch {
      return false
    }
  })
  const [datasetLoading, setDatasetLoading] = useState(null)
  const datasetPrefetchedIdRef = useRef(null)

  // Ensure browser reload always resets cleanly to the landing page
  useEffect(() => {
    try {
      localStorage.removeItem('argus-active-view')
      localStorage.removeItem('argus-active-page')
    } catch {}
  }, [])

  useEffect(() => {
    try {
      if (dataset) {
        localStorage.setItem('argus-active-dataset', JSON.stringify(dataset))
      } else {
        localStorage.removeItem('argus-active-dataset')
      }
    } catch {}
  }, [dataset])

  useEffect(() => {
    try {
      if (profile) {
        localStorage.setItem('argus-active-profile', JSON.stringify(profile))
      } else {
        localStorage.removeItem('argus-active-profile')
      }
    } catch {}
  }, [profile])

  useEffect(() => {
    try {
      if (preview) {
        localStorage.setItem('argus-active-preview', JSON.stringify(preview))
      } else {
        localStorage.removeItem('argus-active-preview')
      }
    } catch {}
  }, [preview])

  useEffect(() => {
    try {
      if (messages && messages.length > 0) {
        localStorage.setItem('argus-active-messages', JSON.stringify(messages))
      } else {
        localStorage.removeItem('argus-active-messages')
      }
    } catch {}
  }, [messages])

  // Validate session on mount & subscribe to Firebase auth
  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((fbUser) => {
      if (fbUser) {
        setUser(fbUser)
        api.setStoredUser(fbUser)
      }
    })

    const token = api.getAuthToken()
    if (token && !token.startsWith('firebase_')) {
      api.getMe()
        .then((res) => {
          if (res?.user) {
            setUser(res.user)
            api.setStoredUser(res.user)
          }
        })
        .catch(() => {
          api.setAuthToken('')
          api.setStoredUser(null)
          setUser(null)
        })
    }

    return () => unsubscribe?.()
  }, [])

  // Set data attribute for touch device detection at the DOM level
  // so CSS can apply touch-specific styles without re-rendering.
  useEffect(() => {
    const isTouch =
      'ontouchstart' in window || navigator.maxTouchPoints > 0
    const prefersHoverNone = window.matchMedia?.('(hover: none)').matches ?? false
    document.documentElement.setAttribute('data-touch', isTouch && prefersHoverNone ? 'true' : 'false')
  }, [])

  // Automatically dismiss toast notifications after 3.5 seconds
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => {
      setToast('')
    }, 3500)
    return () => clearTimeout(timer)
  }, [toast])

  function openAuth(tab = 'login', asModal = false) {
    setAuthModalTab(tab)
    if (asModal) {
      setAuthModalOpen(true)
    } else {
      setView('auth')
      window.scrollTo(0, 0)
    }
  }

  function handleAuthSuccess(authedUser) {
    setUser(authedUser)
    setAuthModalOpen(false)
    setToast(`Signed in as ${authedUser.name}`)
    if (dataset) {
      enterWorkspace()
    } else {
      setView('landing')
      setUploadModalForNewChat(false)
      setUploadModalOpen(true)
    }
  }

  async function handleLogout() {
    try {
      await logoutFirebase()
      await api.logout()
    } catch {}
    api.setAuthToken('')
    api.setStoredUser(null)
    setUser(null)
    setToast('Logged out of Argus')
  }

  function openRating() {
    setRatingModalOpen(true)
  }

  // The AI description of the upload, typed out on the Dataset page. Held here
  // rather than in DatasetPage so switching pages doesn't refetch it or replay
  // the animation.
  const [narrative, setNarrative] = useState(null)
  const [narrativeBusy, setNarrativeBusy] = useState(false)

  // Persistent chat history list
  const [chatSessions, setChatSessions] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('argus-chat-history') || '[]')
    } catch {
      return []
    }
  })

  const fileInputRef = useRef(null)

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  function enterWorkspace() {
    setView('workspace')
    window.scrollTo(0, 0)
  }

  async function loadDemo(demoKey = 'titanic') {
    setBusy(true)
    setError('')
    const DEMO_METAS = {
      titanic: {
        filename: 'titanic_master.csv',
        fileSize: '60.3 KB',
        name: 'Titanic Survival Master',
      },
      bikeshare: {
        filename: 'daily-bike-share.csv',
        fileSize: '43.6 KB',
        name: 'Capital Bike Share Ridership',
      },
      churn: {
        filename: 'customer_churn.csv',
        fileSize: '92.4 KB',
        name: 'Customer Churn & Retention',
      },
    }
    const meta = DEMO_METAS[demoKey] || DEMO_METAS.titanic

    setDatasetLoading({
      filename: meta.filename,
      step: 1,
      statusText: `Sniffing ${meta.name} schema & encoding...`,
      fileSize: meta.fileSize,
    })
    try {
      const demoPromise = api.loadDemoDataset(demoKey)
      const stepTimer = setTimeout(() => {
        setDatasetLoading((prev) => prev ? {
          ...prev,
          step: 2,
          statusText: 'Parsing semantic dtypes & missing masks...',
        } : null)
      }, 150)

      const data = await demoPromise
      clearTimeout(stepTimer)

      // Step 3: Statistical audit
      setDatasetLoading((prev) => prev ? {
        ...prev,
        step: 3,
        statusText: 'Computing Tukey IQR fences, correlation matrix & health score...',
      } : null)

      // Prefetch profile and preview in parallel so there is zero empty-state lag
      const [prof, prevw] = await Promise.all([
        api.getDataset(data.dataset_id).catch(() => null),
        api.getPreview(data.dataset_id).catch(() => null),
      ])

      const targetPage = uploadModalForNewChat ? 'analyst' : 'dataset'
      applyDataset(data, prof, prevw, targetPage)
      setUploadModalOpen(false)
      setUploadModalForNewChat(false)
      setView('workspace')
      window.scrollTo(0, 0)
      setToast(`${meta.name} loaded successfully!`)
    } catch (e) {
      setError(e.message)
      setToast(`Load error: ${e.message}`)
    } finally {
      setDatasetLoading(null)
      setBusy(false)
    }
  }

  function applyDataset(uploaded, initialProfile = null, initialPreview = null, targetPage = 'dataset') {
    if (initialProfile && initialPreview) {
      datasetPrefetchedIdRef.current = uploaded.dataset_id
    }
    setDataset(uploaded)
    setProfile(initialProfile)
    setPreview(initialPreview)
    setNarrative(null)
    setMessages([])
    setAnalysis(null)
    setRecentAnalyses([])
    setSessionId('')
    localStorage.removeItem('argus-session')
    setPage(targetPage)
  }

  useEffect(() => {
    if (!dataset) return undefined

    // Only fetch profile and preview if not already prefetched during the continuation window
    if (datasetPrefetchedIdRef.current !== dataset.dataset_id) {
      api.getDataset(dataset.dataset_id).then(setProfile).catch((e) => setError(e.message))
      api.getPreview(dataset.dataset_id).then(setPreview).catch((e) => setError(e.message))
    }

    /* The AI description is a model call, so it is fetched on its own: the page
       renders immediately and the description arrives into its own box. A failure
       here is not surfaced as a page error — the profile and preview are the
       page, and a missing paragraph must not look like a broken upload. */
    let cancelled = false
    setNarrative(null)
    setNarrativeBusy(true)
    api.getNarrative(dataset.dataset_id)
      .then((payload) => { if (!cancelled) setNarrative(payload) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setNarrativeBusy(false) })
    return () => { cancelled = true }
  }, [dataset])

  useEffect(() => {
    localStorage.setItem('argus-beginner', String(beginnerMode))
  }, [beginnerMode])

  useEffect(() => {
    localStorage.setItem('argus-verbose-mode', String(verboseMode))
  }, [verboseMode])

  useEffect(() => {
    localStorage.setItem('argus-chat-history', JSON.stringify(chatSessions.slice(0, 15)))
  }, [chatSessions])

  /* Shared by the file picker and the drop target, so a dragged file takes
     exactly the same path as a picked one. */
  async function uploadFile(file) {
    if (!file) return
    if (!user) {
      setToast('Please log in or sign up to upload datasets.')
      openAuth('login', true)
      return
    }
    setBusy(true)
    setError('')
    const sizeStr = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(file.size / 1024)} KB`

    setDatasetLoading({
      filename: file.name,
      step: 1,
      statusText: `Uploading & sniffing ${file.name}...`,
      fileSize: sizeStr,
    })

    try {
      const uploadPromise = api.uploadDataset(file)
      const stepTimer = setTimeout(() => {
        setDatasetLoading((prev) => prev ? {
          ...prev,
          step: 2,
          statusText: 'Inferring logical schemas & currency / date coercion...',
        } : null)
      }, 400)

      const data = await uploadPromise
      clearTimeout(stepTimer)

      // Step 3: Statistical audit
      setDatasetLoading((prev) => prev ? {
        ...prev,
        step: 3,
        statusText: 'Auditing distributions, IQR outliers & health metrics...',
      } : null)

      // Prefetch profile and preview in parallel
      const [prof, prevw] = await Promise.all([
        api.getDataset(data.dataset_id).catch(() => null),
        api.getPreview(data.dataset_id).catch(() => null),
      ])

      const targetPage = uploadModalForNewChat ? 'analyst' : 'dataset'
      applyDataset(data, prof, prevw, targetPage)
      setUploadModalOpen(false)
      setUploadModalForNewChat(false)
      setView('workspace')
      window.scrollTo(0, 0)
      setToast('Dataset uploaded and ready')
    } catch (e) {
      setError(e.message)
      setToast(`Upload error: ${e.message}`)
    } finally {
      setDatasetLoading(null)
      setBusy(false)
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0]
    // Cleared before the await: re-picking the same file must fire `change`
    // again, and the File reference is already captured.
    event.target.value = ''
    await uploadFile(file)
  }

  async function sendMessage(textToSend) {
    const text = (typeof textToSend === 'string' ? textToSend : draft).trim()
    if (!text || busy) return
    setDraft('')
    setBusy(true)
    setError('')

    const userMsg = { role: 'user', content: text, timestamp: new Date().toLocaleTimeString() }
    setMessages((prev) => [...prev, userMsg])

    // Extract recent conversation history (last 10 turns) to feed into the AI analyst
    const chatHistory = messages.slice(-10).map((m) => ({
      role: m.role || 'user',
      content: typeof m.content === 'string' ? m.content : (m.content?.text || ''),
    }))

    try {
      const response = await api.sendChat({
        dataset_id: dataset?.dataset_id || null,
        session_id: sessionId,
        message: text,
        history: chatHistory,
      })

      if (response.session_id) {
        setSessionId(response.session_id)
        localStorage.setItem('argus-session', response.session_id)
      }

      if (!dataset && response.dataset_id) {
        api.getDataset(response.dataset_id)
          .then((loadedProfile) => {
            setDataset({ dataset_id: response.dataset_id, filename: 'titanic_demo.csv' })
            setProfile(loadedProfile)
            api.getPreview(response.dataset_id).then(setPreview).catch(() => {})
          })
          .catch(() => {})
      }

      // If dataset was transformed, mutated, or cleaned, refresh workspace session!
      const dsUpdate = response.dataset_update || response.analysis?.dataset_update
      if (dsUpdate) {
        const activeDsId = response.dataset_id || dataset?.dataset_id
        if (activeDsId) {
          api.getDataset(activeDsId).then(setProfile).catch(() => {})
          api.getPreview(activeDsId).then(setPreview).catch(() => {})
          setToast?.(`Dataset updated: ${dsUpdate.rows} rows × ${dsUpdate.columns?.length || 0} cols`)
        }
      }

      const reply = response.reply || response.analysis?.explanation || 'Analysis completed.'
      const steps = response.status_steps || [
        'Understanding your question',
        'Identifying relevant variables',
        'Executing analytical computation',
        'Validating statistical results',
        'Interpreting findings',
      ]

      const assistantMsg = {
        role: 'assistant',
        content: reply,
        status_steps: steps,
        verbose_trace: response.verbose_trace,
        result: response.analysis,
        failed: response.status === 'error',
        timestamp: new Date().toLocaleTimeString(),
      }

      setMessages((prev) => [...prev, assistantMsg])

      if (response.analysis) {
        setAnalysis(response.analysis)
        setRecentAnalyses((prev) => [response.analysis, ...prev.filter((a) => a.analysis_id !== response.analysis.analysis_id)].slice(0, 8))
      }

      // Record into persistent chat sessions
      setChatSessions((prev) => [
        {
          id: Date.now().toString(),
          title: text.length > 28 ? `${text.slice(0, 28)}...` : text,
          query: text,
          reply,
          result: response.analysis,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        ...prev,
      ])
    } catch (e) {
      setError(e.message)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `The request failed: ${e.message}`, failed: true },
      ])
    } finally {
      setBusy(false)
    }
  }

  function startNewChat() {
    setMessages([])
    setAnalysis(null)
    setDraft('')
    setUploadModalForNewChat(true)
    setUploadModalOpen(true)
  }

  function loadHistoricalChat(item) {
    setMessages([
      { role: 'user', content: item.query, timestamp: item.timestamp },
      {
        role: 'assistant',
        content: item.reply,
        result: item.result,
        status_steps: ['Understanding question', 'Loaded from history', 'Validated results'],
      },
    ])
    if (item.result) setAnalysis(item.result)
    setPage('analyst')
  }

  function deleteHistoricalChat(id, e) {
    e.stopPropagation()
    setChatSessions((prev) => prev.filter((s) => s.id !== id))
  }



  return (
    <>
      {showIntro && (
        <ArgusLogoIntro
          onComplete={() => {
            try {
              sessionStorage.setItem('argus-intro-seen', 'true')
            } catch {}
            setShowIntro(false)
          }}
        />
      )}
      <input ref={fileInputRef} type="file" accept={ACCEPTED_UPLOADS} onChange={handleUpload} hidden />
      {view === 'landing' ? (
        <Landing
          onEnter={() => {
            if (!user) {
              setToast('Please log in or sign up to upload datasets.')
              openAuth('login', true)
              return
            }
            if (dataset) {
              setView('workspace')
              window.scrollTo(0, 0)
              return
            }
            setUploadModalForNewChat(false)
            setUploadModalOpen(true)
          }}
          onDemo={() => {
            if (!user) {
              setToast('Please log in or sign up to run analyses.')
              openAuth('login', true)
              return
            }
            setUploadModalForNewChat(false)
            setUploadModalOpen(true)
          }}
          onOpenAuth={openAuth}
          user={user}
          onOpenRating={openRating}
        />
      ) : view === 'auth' ? (
        <AuthPage
          initialTab={authModalTab}
          onSuccess={handleAuthSuccess}
          onDemo={loadDemo}
          onHome={() => setView('landing')}
        />
      ) : (
        <Workspace
          user={user}
          onOpenAuth={openAuth}
          onLogout={handleLogout}
          onOpenRating={openRating}
          page={page}
          setPage={setPage}
          dataset={dataset}
          profile={profile}
          preview={preview}
          narrative={narrative}
          narrativeBusy={narrativeBusy}
          messages={messages}
          draft={draft}
          setDraft={setDraft}
          sendMessage={sendMessage}
          busy={busy}
          setBusy={setBusy}
          error={error}
          setError={setError}
          toast={toast}
          setToast={setToast}
          analysis={analysis}
          setAnalysis={setAnalysis}
          startNewChat={startNewChat}
          chatSessions={chatSessions}
          loadHistoricalChat={loadHistoricalChat}
          deleteHistoricalChat={deleteHistoricalChat}
          recentAnalyses={recentAnalyses}
          beginnerMode={beginnerMode}
          setBeginnerMode={setBeginnerMode}
          verboseMode={verboseMode}
          setVerboseMode={setVerboseMode}
          showSettings={showSettings}
          setShowSettings={setShowSettings}
          onUpload={() => setUploadModalOpen(true)}
          onFile={uploadFile}
          onHome={() => setView('landing')}
          onDemo={loadDemo}
        />
      )}

      {/* Native Dataset Upload Window Modal */}
      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => {
          setUploadModalOpen(false)
          setUploadModalForNewChat(false)
        }}
        onFile={uploadFile}
        onDemo={loadDemo}
        user={user}
        onOpenAuth={(tab) => openAuth(tab, true)}
        busy={busy}
      />

      {/* Dataset Ingestion Continuation Window */}
      {datasetLoading && (
        <DatasetContinuationModal
          filename={datasetLoading.filename}
          step={datasetLoading.step}
          statusText={datasetLoading.statusText}
          fileSize={datasetLoading.fileSize}
        />
      )}

      {/* MongoDB Atlas Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialTab={authModalTab}
        onSuccess={handleAuthSuccess}
        onDemo={loadDemo}
      />

      {/* MongoDB Atlas Rating & Feedback Modal */}
      <RatingModal
        isOpen={ratingModalOpen}
        onClose={() => setRatingModalOpen(false)}
        user={user}
        onRated={() => setToast('Thank you for rating ARGUS!')}
      />
    </>
  )
}

function Workspace(props) {
  const {
    user,
    onOpenAuth,
    onLogout,
    onOpenRating,
    page,
    setPage,
    dataset,
    profile,
    preview,
    narrative,
    narrativeBusy,
    messages,
    draft,
    setDraft,
    sendMessage,
    busy,
    setBusy,
    error,
    setError,
    toast,
    setToast,
    analysis,
    setAnalysis,
    startNewChat,
    chatSessions,
    loadHistoricalChat,
    deleteHistoricalChat,
    recentAnalyses,
    beginnerMode,
    setBeginnerMode,
    verboseMode,
    setVerboseMode,
    showSettings,
    setShowSettings,
    onUpload,
    onHome,
    onDemo,
  } = props

  const [visitedPages, setVisitedPages] = useState(() => new Set(['analyst', page || 'dataset']))
  const [cleaningScanData, setCleaningScanData] = useState(null)
  const [cleaningResult, setCleaningResult] = useState(null)
  const [showTour, setShowTour] = useState(() => {
    try {
      return !localStorage.getItem('argus-tour-seen')
    } catch {
      return false
    }
  })
  const [exploreTab, setExploreTab] = useState('overview')

  useEffect(() => {
    setCleaningScanData(null)
    setCleaningResult(null)
  }, [dataset?.dataset_id])

  useEffect(() => {
    setVisitedPages((prev) => {
      if (prev.has(page)) return prev
      const next = new Set(prev)
      next.add(page)
      return next
    })
  }, [page])

  // sidebarOpen controls whether the left sidebar is open or closed.
  // When sidebarOpen is true:
  //   - Sidebar is visible statically in the window (no mouse-hover movement).
  //   - Top taskbar is HIDDEN.
  // When sidebarOpen is false:
  //   - Sidebar is closed/hidden.
  const isMobileScreen = useMediaQuery('(max-width: 900px)', typeof window !== 'undefined' ? window.innerWidth <= 900 : false)
  // On desktop, the sidebar is open by default. On mobile, it stays closed by default.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth > 900
    }
    return false
  })

  // Ensure sidebar is closed when viewport becomes mobile
  useEffect(() => {
    if (isMobileScreen) {
      setSidebarOpen(false)
    }
  }, [isMobileScreen])

  // Track if first-time auto-fullscreen has already run for AI Analyst
  const [analystFirstAutoApplied, setAnalystFirstAutoApplied] = useState(() => {
    try {
      return sessionStorage.getItem('argus-analyst-autofullscreen-applied') === 'true'
    } catch {
      return false
    }
  })

  const [isFullscreen, setIsFullscreen] = useState(false)

  // Auto-land into Fullscreen on AI Analyst for desktop ONLY on VERY FIRST TIME
  useEffect(() => {
    if (!isMobileScreen && page === 'analyst' && !analystFirstAutoApplied) {
      setIsFullscreen(true)
      setSidebarOpen(false)
      setAnalystFirstAutoApplied(true)
      try { sessionStorage.setItem('argus-analyst-autofullscreen-applied', 'true') } catch {}
    }
  }, [page, analystFirstAutoApplied, isMobileScreen])

  // When switching pages or on mobile: exit fullscreen instantly without OS display lag
  useEffect(() => {
    if (page !== 'analyst' || isMobileScreen) {
      setIsFullscreen(false)
    }
  }, [page, isMobileScreen])

  // Sidebar visibility:
  // Statically open when sidebarOpen is true.
  const isSidebarVisible = sidebarOpen

  // Topbar visibility:
  // When sidebar is opened: top taskbar will NOT be shown!
  // When sidebar is closed: top taskbar is open (unless in native/immersive fullscreen mode).
  const isTopbarHidden = isFullscreen || sidebarOpen

  // Instant zero-latency CSS immersive fullscreen toggle (0ms delay, no OS-level flickering)
  const toggleFullscreen = () => {
    setIsFullscreen((prev) => {
      const next = !prev
      if (next) {
        setSidebarOpen(false)
      }
      return next
    })
  }

  // Sync state with native browser fullscreen change (e.g. user pressed Esc natively or browser control)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isDocFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement)
      setIsFullscreen(isDocFs)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    }
  }, [])

  // Listen for Escape key: close sidebar or exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) {
              document.exitFullscreen().catch(() => {})
            } else if (document.webkitExitFullscreen) {
              document.webkitExitFullscreen().catch(() => {})
            }
          }
          setIsFullscreen(false)
        }
        if (sidebarOpen) {
          setSidebarOpen(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen, sidebarOpen])

  const [dragging, setDragging] = useState(false)
  // Dynamic viewport height for mobile — accounts for browser chrome collapse
  const viewportHeight = useDynamicViewport()
  // Update --vh CSS var so full-height layouts don't leave a blank gap on mobile
  useEffect(() => {
    if (typeof window !== 'undefined' && viewportHeight > 0) {
      document.documentElement.style.setProperty('--vh', `${viewportHeight * 0.01}px`)
    }
  }, [viewportHeight])
  // dragenter/dragleave fire for every nested element the pointer crosses, so
  // a depth counter is the only reliable way to know when the file has really
  // left the window rather than just moved over a child.
  const dragDepth = useRef(0)
  useScrollLock(isMobileScreen && sidebarOpen)

  const carriesFile = (event) => Array.from(event.dataTransfer?.types || []).includes('Files')

  function onDragEnter(event) {
    if (!carriesFile(event)) return
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  function onDragOver(event) {
    if (!carriesFile(event)) return
    // Without preventDefault the browser navigates to the file instead.
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  function onDrop(event) {
    if (!carriesFile(event)) return
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const file = event.dataTransfer?.files?.[0]
    if (file) props.onFile(file)
  }

  function goTo(id) {
    if (id !== 'analyst') {
      setIsFullscreen(false)
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {})
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen().catch(() => {})
        }
      }
    }
    setPage(id)
    if (isMobileScreen) {
      setSidebarOpen(false)
    }
    // Instantly scroll content container to top on tab switch
    requestAnimationFrame(() => {
      const contentEl = document.querySelector('.content')
      if (contentEl) contentEl.scrollTop = 0
      const mainEl = document.querySelector('.main-area')
      if (mainEl) mainEl.scrollTop = 0
      window.scrollTo(0, 0)
    })
  }

  return (
    <div className={`app-shell workspace-shell ${isSidebarVisible ? 'sidebar-active' : ''} ${isTopbarHidden ? 'topbar-hidden' : ''} ${isFullscreen ? 'immersive-fullscreen' : ''}`}>
      {/* Immersive Fullscreen HUD pill (desktop only) */}
      {!isMobileScreen && isFullscreen && (
        <button
          type="button"
          className="fullscreen-esc-pill"
          onClick={toggleFullscreen}
          title="Click or press Esc to look up and restore standard layout"
        >
          <Minimize2 size={13} />
          <span>Full Screen Active &middot; Press <strong>ESC</strong> to restore</span>
        </button>
      )}

      {/* Left Navigation Sidebar - Statically stays in window when open */}
      <aside className={isSidebarVisible ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-brand-row">
          <button className="brand" onClick={onHome} title="Back to ARGUS home page">
            <BrandLogo />
            <div>
              <strong>ARGUS</strong>
              <span>AI DATA ANALYST</span>
            </div>
          </button>
          <div className="sidebar-header-actions">
            <button
              type="button"
              className="sidebar-header-btn close-sidebar-btn"
              onClick={() => setSidebarOpen(false)}
              title="Close sidebar (Show top taskbar & full screen)"
              aria-label="Close sidebar"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
        </div>

        <div className="sidebar-utility">
          <span className="sidebar-utility-status"><i /> LOCAL ANALYSIS CORE</span>
          <span className="sidebar-utility-version">v2.4</span>
        </div>

        <button className="new-chat" onClick={startNewChat}>
          <Plus size={16} /> New Chat
        </button>

        <nav>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? 'nav-item active' : 'nav-item'}
              onClick={() => goTo(id)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>

        {/* Persistent Chat History */}
        {chatSessions.length > 0 && (
          <div className="chat-history-section">
            <span className="chat-history-title">CHAT HISTORY</span>
            {chatSessions.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="chat-history-item"
                onClick={() => loadHistoricalChat(item)}
                title={item.query}
              >
                <span>{item.title}</span>
                <button
                  className="chat-history-del"
                  onClick={(e) => deleteHistoricalChat(item.id, e)}
                  title="Delete chat turn"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="sidebar-spacer" />

        {/* Dataset Card in Sidebar */}
        <div className="sidebar-dataset">
          {dataset ? (
            <>
              <span className="eyebrow">CURRENT DATASET</span>
              <strong title={dataset.filename}>{dataset.filename}</strong>
              <span>
                {dataset.rows?.toLocaleString()} rows · {dataset.columns} columns
              </span>
              <button
                type="button"
                className="sidebar-switch-dataset-btn"
                onClick={() => {
                  if (isMobileScreen) setSidebarOpen(false)
                  onUpload?.()
                }}
                title="Switch to another practice dataset or upload a new file"
              >
                <RefreshCw size={12} />
                <span>Switch / Upload Dataset</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              className="sidebar-switch-dataset-btn primary"
              onClick={() => {
                if (isMobileScreen) setSidebarOpen(false)
                onUpload?.()
              }}
            >
              <Upload size={12} />
              <span>Choose or Upload Dataset</span>
            </button>
          )}
        </div>

        <button
          type="button"
          className={`nav-item ${showTour ? 'active' : ''}`}
          onClick={() => {
            setShowTour(true)
            if (isMobileScreen) setSidebarOpen(false)
          }}
          title="Guided suggested steps for first time users"
        >
          <Compass size={17} /> Suggested Steps Guide
        </button>

        <button className="nav-item" onClick={() => setShowSettings(true)}>
          <Settings2 size={17} /> Settings & Modes
        </button>
        <button
          type="button"
          className="nav-item close-sidebar-nav-action"
          onClick={() => setSidebarOpen(false)}
          title="Close sidebar & open full screen"
        >
          <PanelLeftClose size={17} /> Close Sidebar
        </button>
      </aside>

      {/* Scrim on mobile only when drawer is open */}
      {isMobileScreen && isSidebarVisible && (
        <div
          className="sidebar-scrim"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Workspace Area */}
      <main
        className={dragging ? 'main-area dragging' : 'main-area'}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="workspace-ambient" aria-hidden="true">
          <span className="ambient-orb ambient-orb-one" />
          <span className="ambient-orb ambient-orb-two" />
          <span className="ambient-grid" />
        </div>
        {dragging && (
          <div className="drop-overlay">
            <div className="drop-card">
              <Upload size={24} />
              <strong>Drop to analyse</strong>
               <span>CSV, JSON, Parquet, delimited TXT or Excel &middot; up to 50 MB</span>
            </div>
          </div>
        )}
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="nav-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open Sidebar Menu"
              title="Open Sidebar Menu"
            >
              <PanelLeft size={16} />
              <span className="nav-toggle-text">Menu</span>
            </button>
            <button className="mobile-brand" onClick={onHome}>
              <ArrowLeft size={17} /> ARGUS
            </button>
            <button
              type="button"
              className="topbar-status clickable-dataset-pill"
              onClick={onUpload}
              title="Click to switch or upload a new dataset"
            >
              <span className="status-dot" />
              <span>{dataset ? `Workspace ready · ${dataset.filename}` : 'No dataset loaded'}</span>
              <ChevronDown size={12} className="pill-dropdown-icon" />
            </button>
          </div>

          {/* Topbar Quick Navigation Buttons */}
          <nav className="topbar-nav" aria-label="Page Navigation">
            <button
              type="button"
              className="topbar-nav-new-chat"
              onClick={startNewChat}
              title="Start a fresh chat turn"
            >
              <Plus size={13} /> <span>New Chat</span>
            </button>
            <div className="topbar-nav-divider" />
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`topbar-nav-btn ${page === id ? 'active' : ''}`}
                onClick={() => goTo(id)}
                title={`Go to ${label}`}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="topbar-actions">
            <button
              type="button"
              className={`topbar-tour-btn ${showTour ? 'active' : ''}`}
              onClick={() => setShowTour((prev) => !prev)}
              title="Interactive suggested steps walkthrough"
            >
              <Compass size={14} />
              <span>Guide</span>
            </button>
            <button
              type="button"
              className={`topbar-fullscreen-btn ${isFullscreen ? 'active' : ''}`}
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Full Screen (Esc to look up)" : "Open Whole Screen View"}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              <span>{isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
            </button>
            <button
              type="button"
              className="topbar-rate-btn"
              onClick={onOpenRating}
              title="Rate your ARGUS experience"
            >
              <Star size={15} fill="#f97316" color="#f97316" />
              <span>Rate</span>
            </button>
            {user ? (
              <UserMenu user={user} onLogout={onLogout} onOpenRating={onOpenRating} />
            ) : (
              <button
                type="button"
                className="topbar-login-btn"
                onClick={() => onOpenAuth?.('login')}
              >
                <KeyRound size={15} /> <span>Login</span>
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="notice error">
            <X size={16} />
            <span>{error}</span>
            <button onClick={() => setError('')}>
              <X size={14} />
            </button>
          </div>
        )}

        {toast && (
          <div className="notice success">
            <CheckCircle2 size={16} />
            <span>{toast}</span>
            <button onClick={() => setToast('')}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className={`content content-${page}`}>
          {page === 'analyst' && (
            <div className="workspace-page workspace-page-analyst active">
              <AnalystPage
                dataset={dataset}
                profile={profile}
                messages={messages}
                draft={draft}
                setDraft={setDraft}
                sendMessage={sendMessage}
                busy={busy}
                analysis={analysis}
                setAnalysis={setAnalysis}
                recentAnalyses={recentAnalyses}
                onUpload={onUpload}
                onDemo={onDemo}
                setPage={setPage}
                beginnerMode={beginnerMode}
                verboseMode={verboseMode}
                setVerboseMode={setVerboseMode}
                isFullscreen={isFullscreen}
                toggleFullscreen={toggleFullscreen}
              />
            </div>
          )}

          {page === 'dataset' && (
            <div className="workspace-page workspace-page-dataset active">
              <DatasetPage
                dataset={dataset}
                profile={profile}
                preview={preview}
                narrative={narrative}
                narrativeBusy={narrativeBusy}
                onUpload={onUpload}
                onDemo={onDemo}
              />
            </div>
          )}

          {page === 'explore' && (
            <div className="workspace-page workspace-page-explore active">
              <ExplorePage
                dataset={dataset}
                profile={profile}
                setAnalysis={setAnalysis}
                busy={busy}
                setBusy={setBusy}
                setError={setError}
                onUpload={onUpload}
                onDemo={onDemo}
                beginnerMode={beginnerMode}
                setPage={setPage}
                sendMessage={sendMessage}
                exploreTab={exploreTab}
                setExploreTab={setExploreTab}
              />
            </div>
          )}

          {page === 'cleaning' && (
            <div className="workspace-page workspace-page-cleaning active">
              <CleaningPage
                dataset={dataset}
                setError={setError}
                setToast={setToast}
                onUpload={onUpload}
                onDemo={onDemo}
                scanData={cleaningScanData}
                setScanData={setCleaningScanData}
                cleaningResult={cleaningResult}
                setCleaningResult={setCleaningResult}
              />
            </div>
          )}

          {page === 'features' && (
            <div className="workspace-page workspace-page-features active">
              <FeaturesPage dataset={dataset} setError={setError} onUpload={onUpload} onDemo={onDemo} />
            </div>
          )}


        </div>

        {/* First-time & on-demand guided walkthrough */}
        {dataset && (
          <WorkspaceTour
            isOpen={showTour}
            onClose={() => setShowTour(false)}
            page={page}
            setPage={setPage}
            exploreTab={exploreTab}
            setExploreTab={setExploreTab}
          />
        )}
      </main>

      {/* ── Dedicated Mobile Bottom Taskbar (Samvaad Ergonomics) ────────────── */}
      <nav className="workspace-mobile-bottom-nav" aria-label="Mobile Navigation Bar">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`mobile-bottom-nav-item ${page === id ? 'active' : ''}`}
            onClick={() => goTo(id)}
            title={label}
          >
            <Icon size={18} />
            <span>{id === 'analyst' ? 'Analyst' : id === 'features' ? 'Features' : id === 'cleaning' ? 'Clean' : label}</span>
          </button>
        ))}
        <button
          type="button"
          className="mobile-bottom-nav-item action-new-chat"
          onClick={startNewChat}
          title="Start fresh analysis turn"
        >
          <Plus size={18} />
          <span>New</span>
        </button>
      </nav>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          beginnerMode={beginnerMode}
          setBeginnerMode={setBeginnerMode}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

function BrandLogo() {
  const [broken, setBroken] = useState(false)
  if (broken) return <div className="brand-mark">A</div>
  return <img className="brand-logo" src="/argus_logo.png" alt="ARGUS" onError={() => setBroken(true)} />
}

function UserMenu({ user, onLogout, onOpenRating }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  const initial = user?.name ? user.name.trim().charAt(0).toUpperCase() : 'U'

  return (
    <div className="topbar-user-wrap" ref={menuRef}>
      <button
        type="button"
        className={`topbar-user-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-label="User profile and menu"
      >
        <div className="user-avatar-badge">{initial}</div>
        <span className="user-name-label">{user?.name?.split(' ')[0] || 'Account'}</span>
        <ChevronDown size={14} className={`user-chevron ${open ? 'open' : ''}`} />
      </button>

      {open && (
        <div className="user-dropdown-menu">
          <div className="user-dropdown-header">
            <strong>{user?.name}</strong>
            <span className="user-email">{user?.email}</span>
            <div className="user-db-badge">
              <span className="status-dot-green" />
              <span>MongoDB Atlas Connected</span>
            </div>
          </div>
          <div className="user-dropdown-divider" />
          <button
            type="button"
            className="user-dropdown-item"
            onClick={() => {
              setOpen(false)
              onOpenRating?.()
            }}
          >
            <Star size={15} color="#f97316" fill="#f97316" />
            <span>Rate ARGUS Experience</span>
          </button>
          <div className="user-dropdown-divider" />
          <button
            type="button"
            className="user-dropdown-item logout"
            onClick={() => {
              setOpen(false)
              onLogout?.()
            }}
          >
            <LogOut size={15} />
            <span>Log Out</span>
          </button>
        </div>
      )}
    </div>
  )
}

function EmptyState({ onUpload, onDemo }) {
  return (
    <>
    <div className="empty-state">
      <div className="empty-icon">
        <Database size={24} />
      </div>
      <h2>Bring a dataset into focus</h2>
      <p>
        Drop a file anywhere in this window, or choose one below. Argus automatically detects schemas,
        flags missingness and Tukey outliers, correlates features, and generates publication-grade charts.
      </p>
      <div className="empty-state-actions">
        <button type="button" className="primary-button" onClick={onUpload}>
          <Upload size={16} /> Choose dataset
        </button>
        {onDemo && (
          <button
            type="button"
            className="demo-quickstart-btn"
            onClick={onDemo}
            title="Instantly explore pre-loaded demo data with real statistical profiles"
          >
            <Zap size={14} /> Load Titanic Demo
          </button>
        )}
      </div>
      <div className="empty-format-pills" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '12px' }}>
        {['CSV', 'Excel', 'Parquet', 'JSON', 'Max 50MB'].map((fmt) => (
          <span key={fmt} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
            {fmt}
          </span>
        ))}
      </div>
    </div>
    {/* Mobile-first empty state (perfect-fit.css shows it below 768px). */}
    <MobileWorkspaceEmpty onUpload={onUpload} onDemo={onDemo} />
    </>
  )
}

function renderInlineMarkdown(text) {
  if (!text) return null
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  const parts = String(text).split(regex)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return <em key={idx}>{part.slice(1, -1)}</em>
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return <code key={idx} className="chat-inline-code">{part.slice(1, -1)}</code>
    }
    return part
  })
}

function renderFormattedMessage(text) {
  if (!text) return null
  const paragraphs = String(text).split(/\n\n+/)
  return (
    <div className="message-body">
      {paragraphs.map((para, pIdx) => {
        const lines = para.split('\n')
        return (
          <p key={pIdx}>
            {lines.map((line, lIdx) => (
              <Fragment key={lIdx}>
                {lIdx > 0 && <br />}
                {renderInlineMarkdown(line)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}

function ReasoningProgressTicker() {
  const [stage, setStage] = useState(0)
  const [elapsed, setElapsed] = useState('0.1')

  const stages = [
    { text: 'Parsing query intent & isolating target data fields...', icon: BrainCircuit, color: '#38BDF8', label: 'Intent Routing' },
    { text: 'AST verification: local sandbox verified safe (0 unsafe calls)...', icon: ShieldCheck, color: '#10B981', label: 'AST Safe Sandbox' },
    { text: 'Executing verified Python calculations (pandas, SciPy, sklearn)...', icon: Terminal, color: '#F97316', label: 'Python Sandbox' },
    { text: 'Grounding insights & formulating mathematical explanation...', icon: Sparkles, color: '#A855F7', label: 'Synthesis' },
  ]

  useEffect(() => {
    const start = Date.now()
    const timer = setInterval(() => {
      setElapsed(((Date.now() - start) / 1000).toFixed(1))
    }, 100)
    const t1 = setTimeout(() => setStage(1), 600)
    const t2 = setTimeout(() => setStage(2), 1500)
    const t3 = setTimeout(() => setStage(3), 2600)
    return () => {
      clearInterval(timer)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [])

  const current = stages[stage]
  const Icon = current.icon

  return (
    <div className="message assistant thinking-samvaad">
      <div className="message-avatar">A</div>
      <div className="thinking-card-samvaad">
        <div className="thinking-stage-head">
          <span className="thinking-pulse-dot" />
          <Icon size={14} style={{ color: current.color }} />
          <span className="thinking-text">{current.text}</span>
          <span className="thinking-elapsed-badge">{elapsed}s</span>
          <LoaderCircle size={14} className="spin" style={{ marginLeft: '4px', color: current.color }} />
        </div>
        <div className="thinking-progress-pills">
          {stages.map((s, idx) => (
            <span
              key={idx}
              className={`stage-pill ${idx === stage ? 'active' : idx < stage ? 'done' : 'pending'}`}
              title={s.label}
            >
              {idx < stage ? '✓' : idx + 1}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function VerboseExecutionDropdown({ steps, trace, defaultExpanded = false }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!steps || steps.length === 0) return null

  const stepCount = steps.length
  const strategy = trace?.strategy || 'Multi-Agent StateGraph Pipeline'
  const intent = trace?.intent
  const confidence = trace?.confidence ? Math.round(trace.confidence * 100) : null
  const code = trace?.code
  const columns = trace?.columns
  const retries = trace?.retries || 0

  const handleCopyCode = (e) => {
    e.stopPropagation()
    if (!code) return
    navigator.clipboard?.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`verbose-dropdown ${open ? 'expanded' : 'collapsed'}`}>
      <button
        type="button"
        className="verbose-dropdown-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="verbose-toggle-left">
          <span className="verbose-pulse-dot" />
          <BrainCircuit size={13} className="verbose-icon" />
          <span className="verbose-title">Working & Agent Reasoning</span>
          <span className="verbose-badge">{stepCount} {stepCount === 1 ? 'step' : 'steps'}</span>
          <span className="verbose-tag">LangGraph</span>
        </div>
        <div className="verbose-toggle-right">
          {!open && code && (
            <span className="verbose-compact-hint">
              <Terminal size={11} /> Python Sandbox
            </span>
          )}
          <span className="verbose-toggle-hint">{open ? 'Hide details' : 'View working'}</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <div className="verbose-dropdown-body">
          {/* Step by step execution progress */}
          <div className="verbose-steps-list">
            {steps.map((s, idx) => (
              <div key={idx} className="verbose-step-row">
                <span className="verbose-check">✓</span>
                <span className="verbose-step-text">{s}</span>
              </div>
            ))}
          </div>

          {/* Routing Decision & Strategy Metadata */}
          {trace && (
            <div className="verbose-meta-grid">
              <div className="verbose-meta-card">
                <span className="meta-label">ROUTING STRATEGY</span>
                <span className="meta-value">{strategy}</span>
              </div>
              {intent && (
                <div className="verbose-meta-card">
                  <span className="meta-label">INTENT & CONFIDENCE</span>
                  <span className="meta-value">
                    <code>{intent}</code> {confidence ? `(${confidence}%)` : ''}
                  </span>
                </div>
              )}
              {columns && columns.length > 0 && (
                <div className="verbose-meta-card">
                  <span className="meta-label">TARGET VARIABLES</span>
                  <span className="meta-value">{columns.join(', ')}</span>
                </div>
              )}
              <div className="verbose-meta-card">
                <span className="meta-label">AGENT ENGINE</span>
                <span className="meta-value">LangGraph Safe Python Sandbox</span>
              </div>
            </div>
          )}

          {/* Code Sandbox Trace (if Python code was generated & executed) */}
          {code && (
            <div className="verbose-code-box">
              <div className="verbose-code-header">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Terminal size={12} /> Executed Python Sandbox Code
                </span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  {retries > 0 && <span className="verbose-retry-badge">Self-corrected ({retries} retry)</span>}
                  <button
                    type="button"
                    className="verbose-copy-code-btn"
                    onClick={handleCopyCode}
                    title="Copy Python code"
                  >
                    {copied ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
              </div>
              <pre className="verbose-code-pre">
                <code>{code.trim()}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 1. AI ANALYST PAGE (3-COLUMN WORKSPACE) ───────────────────────────────
function AnalystPage(props) {
  const {
    dataset,
    profile,
    messages,
    draft,
    setDraft,
    sendMessage,
    busy,
    analysis,
    setAnalysis,
    recentAnalyses,
    onUpload,
    setPage,
    beginnerMode,
    verboseMode = true,
    setVerboseMode,
    isFullscreen = false,
    toggleFullscreen,
  } = props

  const [contextTab, setContextTab] = useState('schema') // 'schema' | 'context'
  const [colSearch, setColSearch] = useState('')
  const [colTypeFilter, setColTypeFilter] = useState('all') // 'all' | 'numeric' | 'categorical' | 'boolean' | 'identifier'
  const [localDraft, setLocalDraft] = useState(draft || '')
  const isMobileScreen = useMediaQuery('(max-width: 860px)')
  const [mobileTab, setMobileTab] = useState('chat') // 'chat' | 'schema'
  const textareaRef = useRef(null)

  useEffect(() => {
    setContextTab('schema')
  }, [dataset?.dataset_id])

  useEffect(() => {
    if (draft && draft !== localDraft) {
      setLocalDraft(draft)
    }
  }, [draft])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    const scrollH = textarea.scrollHeight
    const nextHeight = Math.min(Math.max(scrollH, 38), 120)
    textarea.style.height = `${nextHeight}px`
  }, [localDraft])

  const handleSend = (text) => {
    const query = (typeof text === 'string' ? text : localDraft).trim()
    if (!query || busy) return
    setLocalDraft('')
    setDraft?.('')
    sendMessage(query)
  }

  const suggestions = dataset ? [
    'Give me an executive summary of this dataset',
    'Find the strongest correlations between numeric columns',
    'Are there any significant outliers in the data?',
    'What are the most important predictive features?',
    'Scan dataset health and missing values',
  ] : [
    '⚡ Load Titanic Demo & find correlations',
    '⚡ Load Titanic Demo & scan missing values',
    'What analyses can ARGUS perform?',
    'Who created ARGUS and how does it work?',
  ]

  const columnsList = useMemo(() => {
    if (profile?.column_summary?.length) return profile.column_summary
    if (dataset?.column_names?.length) {
      return dataset.column_names.map((name) => ({
        name,
        dtype: 'unknown',
        logical_type: 'unknown',
        missing: 0,
        unique: '—',
        samples: [],
      }))
    }
    return []
  }, [profile, dataset])

  const filteredColumns = useMemo(() => {
    return columnsList.filter((c) => {
      const matchesSearch = !colSearch || c.name.toLowerCase().includes(colSearch.toLowerCase())
      const lType = (c.logical_type || '').toLowerCase()
      const matchesType =
        colTypeFilter === 'all'
        || (colTypeFilter === 'numeric' && ['numeric', 'integer'].includes(lType))
        || (colTypeFilter === 'categorical' && ['categorical', 'text'].includes(lType))
        || (colTypeFilter === 'boolean' && lType === 'boolean')
        || (colTypeFilter === 'identifier' && lType === 'identifier')
      return matchesSearch && matchesType
    })
  }, [columnsList, colSearch, colTypeFilter])

  const insertColumn = (colName) => {
    setLocalDraft((prev) => {
      const trimmed = prev.trim()
      if (!trimmed) return `${colName} `
      return `${trimmed} ${colName} `
    })
    if (isMobileScreen) {
      setMobileTab('chat')
    }
  }

  return (
    <section className={`workspace analyst-workspace ${isFullscreen ? 'fullscreen-active' : ''}`}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">AI DATA ANALYST</span>
          <h1>Analyze. Understand. Decide.</h1>
          <p>Your AI-powered data analyst. Grounded in Python computations, never fabricated.</p>
        </div>
        <div className="page-heading-side">
          <div className="heading-orbit-art" aria-hidden="true">
            <span className="orbit-ring orbit-ring-one" />
            <span className="orbit-ring orbit-ring-two" />
            <Sparkles size={18} />
          </div>
          <div className="heading-chip">
            <span className="live-indicator" />
            Safe Agentic Execution
          </div>
        </div>
      </div>

      <div className="analyst-command-strip">
        <div className="command-strip-main">
          <span className="command-strip-icon"><Bot size={15} /></span>
          <div>
            <strong>Ask anything about your dataset</strong>
            <span>ARGUS routes your question to the right deterministic analysis.</span>
          </div>
        </div>
        <div className="command-strip-tools">
          <button
            type="button"
            className={`verbose-mode-toggle-btn ${verboseMode ? 'active' : ''}`}
            onClick={() => setVerboseMode?.((v) => !v)}
            title="Toggle Verbose LangGraph Agent Reasoning & Code Execution Traces"
          >
            <BrainCircuit size={13} />
            <span>Verbose: <strong>{verboseMode ? 'ON' : 'OFF'}</strong></span>
          </button>
          <button
            type="button"
            className={`fullscreen-mode-toggle-btn ${isFullscreen ? 'active' : ''}`}
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit Full Screen (Esc to look up)" : "Open Whole Screen View"}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{isFullscreen ? 'Exit Full Screen (Esc)' : 'Full Screen'}</span>
          </button>
          <span className="command-strip-hint">ENTER <b>↵</b> TO RUN</span>
        </div>
      </div>

      <MobileAnalystSwitcher
        activeTab={mobileTab}
        onChange={setMobileTab}
        columnCount={columnsList.length}
        verboseMode={verboseMode}
        onToggleVerbose={() => setVerboseMode?.((v) => !v)}
      />

      <div className={`chat-layout mobile-tab-${mobileTab}`}>
        {/* Center Conversational Workspace */}
        {mobileTab === 'chat' && (
          <div className="chat-panel">
            <div className="chat-messages">
            {messages.length === 0 && (
              <div className="starter">
                <MessageSquare size={24} />
                <strong>What would you like to understand about {dataset?.filename || 'your data or Argus'}?</strong>
                <span>
                  Ask questions in plain English, or click one of the suggested analytical prompts below.
                </span>
                <div className="suggestions">
                  {suggestions.slice(0, 4).map((s) => (
                    <button key={s} onClick={() => handleSend(s)}>
                      {s}
                    </button>
                  ))}
                  {!dataset && props.onDemo && (
                    <button
                      key="load-demo-btn"
                      onClick={props.onDemo}
                      style={{ borderColor: 'rgba(239, 159, 39, 0.4)', color: '#EF9F27' }}
                    >
                      ⚡ Load Titanic Demo
                    </button>
                  )}
                </div>
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                className={`message ${message.role}${message.failed ? ' failed' : ''}`}
              >
                <div className="message-avatar">{message.role === 'user' ? 'You' : 'A'}</div>
                <div>
                  {/* Verbose Working & Reasoning Dropdown */}
                  {message.status_steps && message.status_steps.length > 0 && (
                    <VerboseExecutionDropdown
                      steps={message.status_steps}
                      trace={message.verbose_trace}
                      defaultExpanded={false}
                    />
                  )}

                  {renderFormattedMessage(message.content)}

                  {/* Result Card */}
                  {message.result && (
                    <AnalysisResultCard
                      result={message.result}
                      onExplainFurther={() =>
                        handleSend(`Explain this finding in more detail: ${message.result.title}`)
                      }
                      onExplore={() => setPage('explore')}
                      beginnerMode={beginnerMode}
                    />
                  )}
                </div>
              </div>
            ))}

            {busy && <ReasoningProgressTicker />}
          </div>

          {/* Quick Column Mention Bar */}
          {columnsList.length > 0 && (
            <div className="composer-col-mention-bar">
              <span className="col-mention-label"><Sparkles size={11} color="var(--orange)" /> Mention field:</span>
              <div className="col-mention-scroll">
                {columnsList.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    className="composer-col-pill"
                    onClick={() => insertColumn(c.name)}
                    title={`Click to append '${c.name}' to question`}
                  >
                    + {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Composer */}
          <form className="composer" onSubmit={(e) => { e.preventDefault(); handleSend(localDraft) }}>
            <textarea
              ref={textareaRef}
              value={localDraft}
              onChange={(e) => setLocalDraft(e.target.value)}
              placeholder="Ask anything about your data..."
              rows="1"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend(localDraft)
                }
              }}
            />
            <button
              type="submit"
              className="send-button"
              disabled={!localDraft.trim() || busy}
              aria-label="Send question"
            >
              <Play size={16} />
            </button>
          </form>
        </div>
      )}

      {/* Right Context & Dataset Schema Inspector */}
      {(!isMobileScreen || mobileTab === 'schema') && (
        <aside className="context-panel analyst-dataset-inspector">
          <div className="context-tab-bar">
            <button
              type="button"
              className={`context-tab-btn ${contextTab === 'schema' ? 'active' : ''}`}
              onClick={() => setContextTab('schema')}
            >
              <Database size={13} />
              <span>Data Fields ({columnsList.length})</span>
            </button>
            <button
              type="button"
              className={`context-tab-btn ${contextTab === 'context' ? 'active' : ''}`}
              onClick={() => setContextTab('context')}
            >
              <Lightbulb size={13} />
              <span>Queries & Context</span>
            </button>
          </div>

          {contextTab === 'schema' ? (
            <div className="analyst-schema-hub">
              {/* Sticky Search & Filter Header with Opaque Background */}
              <div className="schema-search-header">
                <div className="schema-search-wrap">
                  <Search size={13} className="search-icon" />
                  <input
                    type="text"
                    className="schema-search-input"
                    placeholder="Search fields or types..."
                    value={colSearch}
                    onChange={(e) => setColSearch(e.target.value)}
                  />
                  {colSearch && (
                    <button type="button" className="clear-search-btn" onClick={() => setColSearch('')}>✕</button>
                  )}
                </div>
                <div className="schema-filter-chips">
                  {['all', 'numeric', 'categorical', 'boolean', 'identifier'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`filter-chip ${colTypeFilter === t ? 'active' : ''}`}
                      onClick={() => setColTypeFilter(t)}
                    >
                      {t === 'identifier' ? 'keys' : t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dedicated Scrollable Column Cards Feed (Single scrollbar, no parent scrolling) */}
              <div className="schema-columns-feed">
                {filteredColumns.length === 0 ? (
                  <div className="no-cols-found">No fields match "{colSearch}"</div>
                ) : (
                  filteredColumns.map((col) => {
                    const lType = col.logical_type || 'unknown'
                    const isNum = ['numeric', 'integer'].includes(lType)
                    const isCat = ['categorical', 'text'].includes(lType)
                    const isBool = lType === 'boolean'
                    const isId = lType === 'identifier'
                    const typeColor = isNum ? '#38bdf8' : isCat ? '#c084fc' : isBool ? '#4ade80' : isId ? '#fb923c' : '#94a3b8'

                    return (
                      <div key={col.name} className="schema-col-card">
                        <div className="col-card-head">
                          <strong className="col-card-name" title={col.name}>{col.name}</strong>
                          <span
                            className="col-type-badge"
                            style={{ color: typeColor, borderColor: `${typeColor}44`, background: `${typeColor}15` }}
                          >
                            {lType}
                          </span>
                        </div>

                        <div className="col-card-metrics">
                          <span>{col.missing ? `${col.missing} null` : '0 null'}</span>
                          <span>•</span>
                          <span>{col.unique} unique</span>
                        </div>

                        {col.samples?.length > 0 && (
                          <div className="col-card-samples">
                            <span className="sample-label">Samples:</span>
                            <div className="sample-pills">
                              {col.samples.slice(0, 3).map((sVal, sIdx) => (
                                <span key={sIdx} className="sample-pill" title={String(sVal)}>
                                  {String(sVal).slice(0, 16)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="col-card-actions">
                          <button
                            type="button"
                            className="col-action-btn"
                            onClick={() => insertColumn(col.name)}
                            title="Add column name to question prompt"
                          >
                            + Mention
                          </button>
                          <button
                            type="button"
                            className="col-action-btn highlight"
                            onClick={() => {
                              if (isMobileScreen) setMobileTab('chat')
                              sendMessage(`Analyze the column '${col.name}' in detail. What are its distribution, patterns, outliers, and key takeaways?`)
                            }}
                            title="Ask AI Analyst about this column"
                          >
                            Ask AI ↗
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="context-overview-scroll">
              {/* Dataset Overview Card */}
              <div className="dataset-summary-card">
                <span className="eyebrow">DATASET OVERVIEW</span>
                <strong title={dataset?.filename || 'Titanic Sample'}>{dataset?.filename || 'Titanic Demo Dataset'}</strong>
                <div className="stat-grid">
                  <div>
                    <span>Rows</span>
                    <strong>{dataset?.rows?.toLocaleString() || (profile?.rows?.toLocaleString() ?? '891')}</strong>
                  </div>
                  <div>
                    <span>Columns</span>
                    <strong>{dataset?.columns ?? (profile?.columns ?? 12)}</strong>
                  </div>
                  <div>
                    <span>Health</span>
                    <strong style={{ color: 'var(--orange-soft)' }}>
                      {profile?.health?.health_score ?? 85}/100
                    </strong>
                  </div>
                </div>
                <button
                  className="action-pill-btn"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
                  onClick={() => setPage('dataset')}
                >
                  View Full Dataset Details →
                </button>
              </div>

              {/* Suggested Queries */}
              <div className="suggested-queries-box">
                <span className="eyebrow">SUGGESTED QUERIES</span>
                <div className="suggested-queries-list">
                  {suggestions.map((q) => (
                    <button key={q} className="query-chip-btn" onClick={() => sendMessage(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent Analyses */}
              {recentAnalyses.length > 0 && (
                <div className="recent-analyses-box">
                  <span className="eyebrow">RECENT ANALYSES</span>
                  <div className="suggested-queries-list">
                    {recentAnalyses.map((item, idx) => (
                      <button
                        key={idx}
                        className="query-chip-btn"
                        onClick={() => setAnalysis(item)}
                      >
                        <strong>{item.title}</strong>
                        <span style={{ fontSize: 10, color: 'var(--text-dim)', display: 'block' }}>
                          {item.analysis_type}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}


        </aside>
      )}
      </div>
    </section>
  )
}

// ── AI NARRATIVE ──────────────────────────────────────────────────────────
/* Lives in ./components/AiNarrative so the chart renderer can put the same box
   under each individual graph it draws, without importing back into App. */

// ── ANALYSIS RESULT CARD ──────────────────────────────────────────────────
function AnalysisResultCard({
  result,
  onExplainFurther,
  onExplore,
  beginnerMode,
  hideHeader = false,
  onSelectColumn,
  alternativeCols = [],
}) {
  if (!result) return null

  const [showExtendedNotes, setShowExtendedNotes] = useState(false)

  const stats = result.statistics || {}
  const insights = result.insights || []
  const ignoredKeys = new Set([
    'column', 'col', 'columns', 'target', 'is_identifier', 'analysis_skipped',
    'name', 'status_steps', 'sample_values', 'matrix', 'matrix_values', 'bins',
    'feature_importance', 'top_influencers', 'clusters', 'pca_components'
  ])

  const statEntries = Object.entries(stats).filter(
    ([k, v]) => !ignoredKeys.has(k) && (typeof v === 'number' || (typeof v === 'string' && v.length < 35))
  )
  const narrative = result.narrative
    || (result.explanation ? { text: result.explanation, source: 'ai' } : null)

  const isIdentifier = stats.is_identifier || stats.analysis_skipped === 'identifier' || stats.type === 'identifier'
    || (result.columns?.length === 1 && String(result.columns[0]).toLowerCase().endsWith('id') && stats.uniqueness_pct >= 90)
  const targetCol = result.columns?.[0] || 'Target Column'

  // Pick primary narrative: prefer grounded visual chart reading if present, else analytical narrative
  const primaryNarrative = (result.chart_narrative?.text && result.chart_narrative.text.trim().length > 0)
    ? result.chart_narrative
    : narrative

  // Check if secondary narrative has distinct, non-duplicate information
  const hasDistinctSecondary = Boolean(
    primaryNarrative === result.chart_narrative &&
    narrative?.text &&
    narrative.text.trim().length > 0 &&
    narrative.text.trim() !== result.chart_narrative?.text?.trim()
  )

  const formatStatVal = (key, val) => {
    if (typeof val === 'number') {
      const lower = key.toLowerCase()
      if (lower.includes('pct') || lower.includes('percent') || lower.includes('rate')) {
        return `${Number(val).toFixed(1)}%`
      }
      if (Number.isInteger(val)) {
        return val.toLocaleString()
      }
      return Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 })
    }
    return String(val)
  }

  return (
    <div className="argus-chart-card">
      {!hideHeader && (
        <div className="chart-header">
          <div>
            <span className="eyebrow">{result.analysis_type?.toUpperCase() || 'ANALYSIS'}</span>
            <h3 style={{ margin: '4px 0 0', fontSize: 16, color: '#ffffff' }}>
              {result.title || result.analysis_name}
            </h3>
          </div>
          <div className="chart-type-tag">
            {result.analysis_type || 'EDA'}
          </div>
        </div>
      )}

      {/* Real Chart or Dedicated Identifier Diagnosis Card */}
      {isIdentifier ? (
        <div className="identifier-card">
          <div className="identifier-header">
            <div className="identifier-icon-box">
              <KeyRound size={22} />
            </div>
            <div className="identifier-title-group">
              <div className="identifier-kicker">DATA STRUCTURE AUDIT · PRIMARY RECORD KEY</div>
              <h4>{targetCol}: Unique Sequential Row Index</h4>
              <p>
                This feature contains unique surrogate IDs or sequential record keys ({stats.uniqueness_pct || 100}% distinct).
                Because row identifiers have uniform density across observations, standard frequency distributions are flat by design.
              </p>
            </div>
          </div>

          <div className="identifier-stats-grid">
            <div className="identifier-stat-box">
              <span>Total Records</span>
              <strong>{stats.count || stats.unique || 0}</strong>
            </div>
            <div className="identifier-stat-box">
              <span>Distinct Keys</span>
              <strong>{stats.unique || stats.count || 0} (100%)</strong>
            </div>
            <div className="identifier-stat-box">
              <span>Key Collisions</span>
              <strong style={{ color: stats.duplicate_keys ? '#ef4444' : '#10b981' }}>
                {stats.duplicate_keys || 0} duplicates
              </strong>
            </div>
            <div className="identifier-stat-box">
              <span>Sample Sequence</span>
              <strong>{Array.isArray(stats.sample_values) ? stats.sample_values.slice(0, 4).join(', ') + '...' : '1, 2, 3...'}</strong>
            </div>
          </div>

          <div className="identifier-advice-box">
            <div className="identifier-advice-text">
              💡 <strong>Recommended Action:</strong> Primary keys carry zero predictive variance. Switch to statistical features to analyze true distributions.
            </div>
            {onSelectColumn && alternativeCols.length > 0 && (
              <div className="identifier-shortcuts">
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Analyze instead:</span>
                {alternativeCols.slice(0, 4).map((alt) => (
                  <button
                    key={alt}
                    type="button"
                    className="identifier-switch-btn"
                    onClick={() => onSelectColumn(alt)}
                  >
                    <span>{alt}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <MasterChart result={result} />
          <VisualizationPlan plan={result.visualization_plan} />
        </>
      )}

      <div className="analysis-feedback" role="status">
        {result.statistics?.aggregation_used && <p><strong>Applied summary: {result.statistics.aggregation_used}</strong> — {result.statistics.aggregation_reason}</p>}
        {result.statistics?.error && <p>{result.statistics.error}</p>}
        {result.warnings?.map((warning, index) => <p key={index}>{warning}</p>)}
        {!isIdentifier && result.visualization?.type === 'multi' && !result.visualization.charts?.length &&
          <p>No meaningful chart is available for this selection. Read the column findings below or choose other variables.</p>}
      </div>

      {/* Primary Grounded AI Narrative (Unified Description) */}
      {primaryNarrative && (
        <AiNarrative
          payload={primaryNarrative}
          label={`WHAT THIS ${(result.analysis_type || 'analysis').replaceAll('_', ' ').toUpperCase()} SHOWS`}
          compact
        />
      )}

      {/* Resultant Transformed Dataset Banner */}
      {result.dataset_update && (
        <div
          className="dataset-update-card"
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(56, 189, 248, 0.08))',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: 10,
            padding: '14px 16px',
            marginTop: 14,
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#10b981', fontWeight: 700 }}>
                  ✨ RESULTANT DATASET READY
                </span>
                <span style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontFamily: 'monospace',
                  fontWeight: 600,
                }}>
                  {result.dataset_update.rows?.toLocaleString()} rows × {result.dataset_update.columns?.length || 0} cols
                </span>
                {result.dataset_update.row_delta !== undefined && result.dataset_update.row_delta !== 0 && (
                  <span style={{
                    background: result.dataset_update.row_delta > 0 ? 'rgba(56, 189, 248, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                    color: result.dataset_update.row_delta > 0 ? '#38bdf8' : '#f43f5e',
                    fontSize: '0.75rem',
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontFamily: 'monospace',
                  }}>
                    {result.dataset_update.row_delta > 0 ? `+${result.dataset_update.row_delta}` : result.dataset_update.row_delta} rows
                  </span>
                )}
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: '#cbd5e1' }}>
                Your dataset was transformed in-session. The workspace has been synchronized and is ready for further analysis.
              </p>
              {result.dataset_update.new_columns?.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>New fields:</span>
                  {result.dataset_update.new_columns.map((nc) => (
                    <span key={nc} style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '1px 6px', borderRadius: 4, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                      +{nc}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <a
              href={result.dataset_update.download_url || `/api/datasets/${result.dataset_id || ''}/export`}
              download
              className="action-pill-btn"
              style={{
                background: '#10b981',
                color: '#042f2e',
                fontWeight: 700,
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                textDecoration: 'none',
              }}
            >
              <Download size={14} /> Download Resultant CSV
            </a>
          </div>
        </div>
      )}

      {/* Numerical Stats Badges Matrix */}
      {statEntries.length > 0 && (
        <div className="stats-badge-grid">
          {statEntries.slice(0, 8).map(([key, val]) => (
            <div className="stat-badge-chip" key={key} title={beginnerMode ? BEGINNER_TERMS[key] : ''}>
              <span className="stat-chip-label">{key.replaceAll('_', ' ')}</span>
              <strong className="stat-chip-val">
                {formatStatVal(key, val)}
              </strong>
              {beginnerMode && BEGINNER_TERMS[key] && (
                <small className="stat-chip-hint">{BEGINNER_TERMS[key].slice(0, 26)}...</small>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Extended Run Notes Accordion (Only if distinct from primary) */}
      {hasDistinctSecondary && (
        <div className="extended-notes-accordion">
          <button
            type="button"
            className="extended-notes-toggle-btn"
            onClick={() => setShowExtendedNotes((v) => !v)}
            aria-expanded={showExtendedNotes}
          >
            <Sparkles size={11} />
            <span>{showExtendedNotes ? 'Hide statistical notes ▴' : 'View extended statistical notes ▾'}</span>
          </button>
          {showExtendedNotes && (
            <div className="extended-notes-content" style={{ marginTop: 8 }}>
              <AiNarrative payload={narrative} label="STATISTICAL RUN NOTES" compact tight />
            </div>
          )}
        </div>
      )}

      {/* Key Insights List */}
      {insights.length > 0 && (
        <div className="explore-insights-block">
          <span className="eyebrow">KEY ANALYTICAL INSIGHTS</span>
          <ul className="explore-insights-list">
            {insights.slice(0, 5).map((ins, i) => (
              <li key={i}>{ins}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Buttons */}
      <div className="result-actions">
        <button type="button" className="action-pill-btn primary" onClick={onExplainFurther}>
          <MessageSquare size={14} /> Explain with AI Analyst
        </button>
        <button type="button" className="action-pill-btn" onClick={onExplore}>
          <LineChart size={14} /> Compare Bivariate
        </button>
      </div>
    </div>
  )
}

function VisualizationPlan({ plan }) {
  if (!plan?.charts?.length) return null
  const primary = plan.charts[0]
  const ai = plan.source === 'ai'
  const label = ai ? 'AI VISUAL GUIDE' : 'ADAPTIVE VISUAL GUIDE'
  const detail = primary.emphasis || primary.reason
  const charts = plan.charts.length > 1 ? `${plan.charts.length} chart views selected` : primary.chart_type

  return (
    <div className={`visualization-plan ${ai ? 'ai' : ''}`}>
      <div className="visualization-plan-icon"><Sparkles size={13} /></div>
      <div className="visualization-plan-copy">
        <span className="eyebrow">{label}<i>{charts}</i></span>
        <strong>{primary.title}</strong>
        <span>{detail}</span>
      </div>
      <CheckCircle2 size={15} className="visualization-plan-check" />
    </div>
  )
}

// ── 2. DATASET PAGE ───────────────────────────────────────────────────────
/* Automated inspection & type inference diagnostics.
   Explains the automatic decisions ARGUS made at upload (delimiters, encodings,
   missing value representations, and logical column typing). */
function LoadSummary({ profile }) {
  const [expanded, setExpanded] = useState(false)
  const load = profile?.load_report || {}
  const converted = profile?.converted_columns || []
  const droppedCols = load.dropped_columns || []
  const sheets = load.sheet_names || []

  const facts = []
  facts.push(['Format / Delimiter', DELIMITER_LABELS[load.delimiter] ? `${DELIMITER_LABELS[load.delimiter]} separated` : (load.delimiter ? `"${load.delimiter}"` : 'Comma separated')])
  facts.push(['Encoding', load.encoding || 'UTF-8'])
  if (load.active_sheet) {
    facts.push(['Active Sheet', sheets.length > 1 ? `${load.active_sheet} (${sheets.length} total)` : load.active_sheet])
  }
  if (load.tokens_nulled) {
    facts.push(['Null Placeholders Handled', `${load.tokens_nulled} representations (e.g. blanks, NA, ?)`])
  }
  if (load.dropped_rows) facts.push(['Blank Rows Dropped', load.dropped_rows])
  if (droppedCols.length) facts.push(['Empty Columns Dropped', droppedCols.join(', ')])

  return (
    <div className="panel load-summary-card">
      <div className="load-summary-header">
        <div className="load-summary-title-wrap">
          <div className="load-summary-badge">
            <Sparkles size={14} /> Auto-Inference Engine
          </div>
          <h4>How ARGUS Read Your File</h4>
          <p className="muted">
            ARGUS automatically detected the file format, encoding, delimiter, and column types — converting text-based values (dates, currency, percentages, yes/no) into proper data types. No manual setup required.
          </p>
        </div>

        <button
          type="button"
          className="load-expand-btn"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              <ChevronUp size={15} /> <span>Hide Ingestion Details</span>
            </>
          ) : (
            <>
              <ChevronDown size={15} /> <span>Show Details ({converted.length} auto-converted columns)</span>
            </>
          )}
        </button>
      </div>

      {/* Quick summary badges row */}
      <div className="load-pills-row">
        {facts.map(([label, val]) => (
          <span className="load-status-pill" key={label}>
            <strong>{label}:</strong> {val}
          </span>
        ))}
        {converted.length > 0 && (
          <span className="load-status-pill highlight">
            <strong>{converted.length} columns</strong> automatically cast from text
          </span>
        )}
      </div>

      {/* Expanded detailed breakdown */}
      {expanded && (
        <div className="load-expanded-details">
          {converted.length > 0 ? (
            <div className="load-conversions-table-wrap">
              <span className="eyebrow">COLUMN CONVERSION AUDIT</span>
              <div className="load-conversion-grid">
                {converted.map((item) => (
                  <div className="conversion-item-card" key={item.column}>
                    <div className="conv-col-header">
                      <strong>{item.column}</strong>
                      <span className="type-pill converted-pill">
                        {(LOGICAL_LABELS[item.to] || [item.to])[0]}{item.unit ? ` · ${item.unit}` : ''}
                      </span>
                    </div>
                    <span className="conv-reason">{item.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>
              All columns matched their storage types cleanly without requiring text re-parsing.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function DatasetPage({ dataset, profile, preview, narrative, narrativeBusy, onUpload, onDemo }) {
  const [dataView, setDataView] = useState('preview') // 'preview' | 'schema' | 'split'
  const [schemaSearch, setSchemaSearch] = useState('')

  if (!dataset) return <EmptyState onUpload={onUpload} onDemo={onDemo} />

  const health = profile?.health || {}
  const score = health.health_score ?? 85
  const scoreColor = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--orange)' : 'var(--red)'

  const columns = profile?.column_summary || []
  const filteredColumns = schemaSearch.trim()
    ? columns.filter((c) => c.name.toLowerCase().includes(schemaSearch.toLowerCase()))
    : columns

  return (
    <section className="workspace">
      <PageTitle
        eyebrow="DATASET"
        title={dataset.filename}
        subtitle="Dataset health scorecard, AI-powered column descriptions, ingestion audit, and interactive data preview."
      />

      {/* Metric Cards */}
      <div className="metric-cards">
        <Metric label="Rows" value={profile?.rows ?? dataset.rows} />
        <Metric label="Columns" value={profile?.columns ?? dataset.columns} />
        <Metric
          label="Missing Values"
          value={profile?.missing_total ?? dataset.missing_total ?? 0}
          color={(profile?.missing_total ?? dataset.missing_total ?? 0) > 0 ? 'var(--orange)' : 'var(--green)'}
        />
        <div className="metric-card">
          <span>Health Score</span>
          <strong style={{ color: scoreColor }}>{score}/100</strong>
        </div>
      </div>

      <CapabilityRail capabilities={profile?.capabilities} />

      {/* Plain-English description of the file that was just uploaded */}
      <AiNarrative payload={narrative} busy={narrativeBusy} label="WHAT THIS DATASET IS" />

      {/* Deep-dive Dataset Overview Grid (Quality, Structure, Skew, Anomalies, Correlations) */}
      <DatasetOverview profile={profile} dataset={dataset} />

      {/* View Switcher Controls */}
      <div className="dataset-view-toolbar">
        <div className="dataset-view-switcher">
          <button
            type="button"
            className={`view-switch-btn ${dataView === 'preview' ? 'active' : ''}`}
            onClick={() => setDataView('preview')}
          >
            <TableIcon size={15} /> <span>Data Preview ({preview?.preview?.length || 0} rows)</span>
          </button>
          <button
            type="button"
            className={`view-switch-btn ${dataView === 'schema' ? 'active' : ''}`}
            onClick={() => setDataView('schema')}
          >
            <Columns size={15} /> <span>Column Schema & Quality ({columns.length} columns)</span>
          </button>
          <button
            type="button"
            className={`view-switch-btn ${dataView === 'split' ? 'active' : ''}`}
            onClick={() => setDataView('split')}
          >
            <Layers size={15} /> <span>Side-by-Side View</span>
          </button>
        </div>
      </div>

      {/* Data Views */}
      {dataView === 'preview' && (
        <div className="panel full-width-panel">
          <div className="panel-title">
            <span>Data Preview</span>
            <span className="muted">Interactive table inspection &middot; search across any column</span>
          </div>
          <DataTable preview={preview} profile={profile} />
        </div>
      )}

      {dataView === 'schema' && (
        <div className="panel full-width-panel">
          <div className="panel-title-with-search">
            <div>
              <span className="panel-title-text">Column Schema & Quality Dictionary</span>
              <span className="muted">
                {profile?.numeric_columns?.length || 0} numeric &middot; {profile?.categorical_columns?.length || 0} categorical
                {profile?.datetime_columns?.length ? ` · ${profile.datetime_columns.length} date` : ''}
                {profile?.boolean_columns?.length ? ` · ${profile.boolean_columns.length} boolean` : ''}
              </span>
            </div>
            <div className="data-search-wrap" style={{ width: 220 }}>
              <Search size={14} className="data-search-icon" />
              <input
                type="text"
                placeholder="Filter columns..."
                value={schemaSearch}
                onChange={(e) => setSchemaSearch(e.target.value)}
                className="data-search-input"
              />
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Column Name</th>
                  <th>Inferred Type</th>
                  <th>Storage Type</th>
                  <th>Missing Count</th>
                  <th>Missing %</th>
                  <th>Unique Values</th>
                </tr>
              </thead>
              <tbody>
                {filteredColumns.map((col) => {
                  const [label, color] = LOGICAL_LABELS[col.logical_type] || [col.logical_type || '—', 'var(--text-muted)']
                  const totalRows = profile?.rows || dataset.rows || 1
                  const missPct = ((col.missing / totalRows) * 100).toFixed(1)
                  return (
                    <tr key={col.name}>
                      <td><strong>{col.name}</strong></td>
                      <td>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span className="type-pill" style={{ color, borderColor: 'var(--border)' }} title={col.reason || ''}>
                            {label}
                            {col.unit ? ` · ${col.unit}` : ''}
                          </span>
                          {col.converted_from && (
                            <span className="type-pill converted-pill" title={col.reason || ''}>
                              parsed from {col.converted_from}
                            </span>
                          )}
                        </div>
                      </td>
                      <td><span className="type-pill mono">{col.dtype}</span></td>
                      <td>
                        <span className={col.missing > 0 ? 'missing-alert-text' : 'missing-clean-text'}>
                          {col.missing.toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <div className="missing-bar-wrap">
                          <div className="missing-bar" style={{ width: `${Math.min(100, Math.max(0, missPct))}%` }} />
                          <span>{missPct}%</span>
                        </div>
                      </td>
                      <td><strong>{col.unique.toLocaleString()}</strong></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dataView === 'split' && (
        <div className="two-column">
          <div className="panel">
            <div className="panel-title">
              <span>Column Schema</span>
              <span className="muted">{columns.length} columns</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Type</th>
                    <th>Missing</th>
                    <th>Unique</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col) => {
                    const [label, color] = LOGICAL_LABELS[col.logical_type] || [col.logical_type || '—', 'var(--text-muted)']
                    return (
                      <tr key={col.name}>
                        <td><strong>{col.name}</strong></td>
                        <td>
                          <span className="type-pill" style={{ color }}>{label}</span>
                        </td>
                        <td>{col.missing}</td>
                        <td>{col.unique}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              <span>Data Preview</span>
              <span className="muted">{preview?.preview?.length || 0} rows</span>
            </div>
            <DataTable preview={preview} profile={profile} />
          </div>
        </div>
      )}

      {/* Smart Ingestion Audit (File format, encoding, auto-casts) */}
      <LoadSummary profile={profile} />
    </section>
  )
}

// ── 3. EXPLORE PAGE ───────────────────────────────────────────────────────
function ExploreSelect({ id, label, value, onChange, options }) {
  return (
    <div className="control-group compact-control-group">
      <label htmlFor={id}>{label}</label>
      <div className="select-wrap">
        <select id={id} className="explore-select" value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
        </select>
        <ChevronDown size={14} className="select-chevron" />
      </div>
    </div>
  )
}

const CONCEPT_GUIDES = {
  overview: {
    eyebrow: 'DIAGNOSTIC OVERVIEW',
    color: '#f97316',
    icon: SlidersHorizontal,
    title: 'High-level structure & health check',
    desc: 'Audit row counts, column data types, and check for missing cells.',
    tip: '💡 Tip: Review missing values before inspecting individual columns.',
  },
  univariate: {
    eyebrow: 'UNIVARIATE (1 VARIABLE)',
    color: '#38bdf8',
    icon: LineChart,
    title: 'Inspect one column at a time',
    desc: 'See averages, spread, and extreme values (outliers) for any column.',
    tip: '💡 Tip: Select a column below to see its distribution histogram or category counts.',
  },
  bivariate: {
    eyebrow: 'BIVARIATE (2 VARIABLES)',
    color: '#10b981',
    icon: BrainCircuit,
    title: 'Compare how two columns interact',
    desc: 'Plot two variables together to discover correlations, patterns, and trends.',
    tip: '💡 Tip: Select Variable A and B below, then click "Run Analysis".',
  },
  correlation: {
    eyebrow: 'CORRELATION MATRIX',
    color: '#a855f7',
    icon: TableIcon,
    title: 'Full dataset relationship heatmap',
    desc: 'Color matrix showing numeric connection strength from -1.0 to +1.0.',
    tip: '💡 Tip: Look for deep green or blue boxes to spot the strongest predictive pairs.',
  },
  multivariate: {
    eyebrow: 'MULTIVARIATE / CLUSTERING',
    color: '#ec4899',
    icon: Layers,
    title: 'Group records into natural clusters',
    desc: 'Find natural groupings across multiple columns without manual rules.',
    tip: '💡 Tip: Select a target column or keep Auto to discover customer/record segments.',
  },
}

function ExploreConceptGuide({ tab }) {
  const [minimized, setMinimized] = useState(false)
  const guide = CONCEPT_GUIDES[tab]
  if (!guide) return null

  const Icon = guide.icon

  return (
    <div className="explore-concept-guide" style={{ '--guide-color': guide.color }}>
      <div className="explore-concept-icon">
        <Icon size={16} />
      </div>
      <div className="explore-concept-text">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span className="explore-concept-eyebrow">{guide.eyebrow}</span>
          <button
            type="button"
            onClick={() => setMinimized((m) => !m)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              fontSize: '11px',
              cursor: 'pointer',
              padding: '0 4px',
              textDecoration: 'underline',
            }}
          >
            {minimized ? 'Explain tool' : 'Hide'}
          </button>
        </div>
        <h4 className="explore-concept-title">{guide.title}</h4>
        {!minimized && (
          <>
            <p className="explore-concept-desc">{guide.desc}</p>
            <div style={{ marginTop: '4px', fontSize: '11px', color: '#f1f5f9', opacity: 0.9 }}>
              {guide.tip}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ExplorePage({
  dataset,
  profile,
  setAnalysis,
  busy,
  setBusy,
  setError,
  onUpload,
  onDemo,
  beginnerMode,
  setPage,
  sendMessage,
  exploreTab,
  setExploreTab,
}) {
  const [localTab, setLocalTab] = useState('overview')
  const tab = exploreTab || localTab
  const setTab = (newTab) => {
    setLocalTab(newTab)
    if (setExploreTab) setExploreTab(newTab)
  }
  const [colA, setColA] = useState('')
  const [colB, setColB] = useState('')
  const [aggregation, setAggregation] = useState('auto')
  const [univariateBins, setUnivariateBins] = useState('auto')
  const [univariateScope, setUnivariateScope] = useState('selected')
  const [categoryLimit, setCategoryLimit] = useState('20')
  const [timeBucket, setTimeBucket] = useState('auto')
  const [textView, setTextView] = useState('length')
  const [correlationLimit, setCorrelationLimit] = useState('10')
  const [correlationMethod, setCorrelationMethod] = useState('pearson')
  const [multivariateTarget, setMultivariateTarget] = useState('')
  const [clusterCount, setClusterCount] = useState('auto')
  const [result, setResult] = useState(null)

  const columns = dataset?.column_names || []
  const supported = profile?.capabilities?.supported || {}
  const canRun = (analysis) => profile?.capabilities ? supported[analysis] !== false : true
  const columnType = (name) => profile?.column_summary?.find((column) => column.name === name)?.logical_type || dataset?.capabilities?.column_roles?.[name] || ''
  const typeA = columnType(colA || columns[0])
  const typeB = columnType(colB || columns[1] || columns[0])
  const numeric = (type) => ['numeric', 'integer'].includes(type)
  const skipped = (type) => ['identifier', 'constant', 'empty'].includes(type)
  const univariateTypes = univariateScope === 'all' ? columns.map(columnType) : [typeA]
  const hasHistogram = univariateTypes.some((type) => numeric(type) || type === 'text')
  const hasCategories = univariateTypes.includes('categorical')
  const hasDates = univariateTypes.includes('datetime')
  const hasText = univariateTypes.includes('text')
  const rawScatter = numeric(typeA) && numeric(typeB)
  const canAggregate = !rawScatter && !skipped(typeA) && !skipped(typeB) &&
    (numeric(typeA) || numeric(typeB) || (typeA === 'datetime' && typeB === 'datetime') ||
      ([typeA, typeB].includes('datetime') && [typeA, typeB].includes('boolean')))
  const groupedMeasureHint = skipped(typeA) || skipped(typeB)
    ? 'This pair includes a key, empty, or constant column; review the result notes.'
    : rawScatter ? 'Raw numeric pairs → scatter plot. No group aggregation is applied.'
      : typeA === 'datetime' && typeB === 'datetime' ? 'Elapsed days between the two dates → timeline summary.'
        : canAggregate ? `Numeric values → ${aggregation === 'auto' ? 'automatic mean or median' : aggregation} per group or time bucket.`
          : [typeA, typeB].includes('datetime') ? 'Date + labels → records per time bucket.'
            : 'Label pairs → joint frequency bars; both variables are retained.'
  const modelTargets = columns.filter((c) => !skipped(columnType(c)) && columnType(c) !== 'text')
  const configurationKey = JSON.stringify([tab, colA, colB, aggregation, univariateBins, univariateScope,
    categoryLimit, timeBucket, textView, correlationLimit, correlationMethod, multivariateTarget, clusterCount])

  const tabMeta = {
    overview: ['Diagnostic overview', 'A fast visual pulse of structure, quality, distributions, and relationships.'],
    univariate: ['Inspect one variable', 'Understand shape, spread, frequency, and unusual values in a single column.'],
    bivariate: ['Compare two variables', 'See whether two columns move together and what the relationship looks like.'],
    correlation: ['Map the relationships', 'Scan the complete matrix for strong numeric and mixed-type associations.'],
    multivariate: ['Find natural groups', 'Segment records into clusters and compare the archetypes they reveal.'],
  }

  const isIdColumn = (colName) => {
    const t = columnType(colName)
    if (skipped(t) || t === 'identifier') return true
    const s = String(colName || '').toLowerCase()
    return s === 'id' || s.endsWith('id') || s.endsWith('_id') || s.startsWith('id_') || s === 'index'
  }

  // Ensure default selection exists, prioritizing analytical features over key/index columns
  useEffect(() => {
    const analytical = columns.filter((c) => !isIdColumn(c))
    const fallback = analytical.length >= 2 ? analytical : columns
    if (columns.length && !colA) {
      setColA(fallback[0] || columns[0])
    }
    const currentA = colA || fallback[0] || columns[0]
    if (columns.length > 1 && (!colB || colB === currentA)) {
      const nextB = fallback.find((c) => c !== currentA) || columns.find((c) => c !== currentA)
      if (nextB) setColB(nextB)
    }
  }, [columns, colA, colB, profile])

  // Top recommended pairs dynamically chosen for the dataset
  const recommendedPairs = useMemo(() => {
    const analytical = columns.filter((c) => !isIdColumn(c))
    if (analytical.length < 2) return []
    const targets = ['survived', 'target', 'churn', 'price', 'sales', 'label', 'outcome', 'default', 'status']
    const primaryTarget = analytical.find((c) => targets.includes(c.toLowerCase())) || analytical[0]
    const others = analytical.filter((c) => c !== primaryTarget)
    const pairs = []
    if (others.length > 0) pairs.push([primaryTarget, others[0], `${primaryTarget} vs ${others[0]}`])
    if (others.length > 1) pairs.push([primaryTarget, others[1], `${primaryTarget} vs ${others[1]}`])
    if (others.length > 2) pairs.push([others[0], others[1], `${others[0]} vs ${others[1]}`])
    return pairs
  }, [columns, profile])

  // A result belongs to one exact selection; don't show an old mean graph below
  // a newly selected median control, or a different pair of variables.
  useEffect(() => { setResult(null) }, [configurationKey])

  useEffect(() => {
    if (tab !== 'overview' && profile?.capabilities && !canRun(tab)) {
      setTab('overview')
      setResult(null)
    }
  }, [profile, tab])

  async function handleSwitchColumn(newCol) {
    setColA(newCol)
    setBusy(true)
    setError('')
    try {
      const resp = await api.runAnalysis({
        dataset_id: dataset.dataset_id,
        analysis_type: 'univariate',
        columns: [newCol],
        parameters: {
          bins: univariateBins === 'auto' ? 'auto' : Number(univariateBins),
          top_n: Number(categoryLimit),
          time_bucket: timeBucket,
          text_view: textView,
        },
      })
      if (resp.error || resp.analysis_type === 'error') throw new Error(resp.error || 'Analysis failed')
      setResult(resp)
      setAnalysis(resp)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!dataset) return <EmptyState onUpload={onUpload} onDemo={onDemo} />

  async function runExplore() {
    setBusy(true)
    setError('')
    try {
      let resp
      if (tab === 'univariate') {
        const targetCol = colA || columns[0]
          resp = await api.runAnalysis({
            dataset_id: dataset.dataset_id,
            analysis_type: 'univariate',
            columns: univariateScope === 'all' ? columns : [targetCol],
            parameters: {
              bins: univariateBins === 'auto' ? 'auto' : Number(univariateBins),
              top_n: Number(categoryLimit), time_bucket: timeBucket, text_view: textView,
            },
        })
      } else if (tab === 'bivariate') {
        const first = colA || columns[0]
        const second = colB || (columns[1] || columns[0])
        resp = await api.runAnalysis({
          dataset_id: dataset.dataset_id,
          analysis_type: 'bivariate',
          columns: [first, second],
          parameters: { aggregation: canAggregate ? aggregation : 'auto' },
        })
      } else if (tab === 'correlation') {
        resp = await api.runAnalysis({
          dataset_id: dataset.dataset_id,
          analysis_type: 'correlation',
          parameters: { top_n: Number(correlationLimit), method: correlationMethod },
        })
      } else {
        resp = await api.runAnalysis({
          dataset_id: dataset.dataset_id,
          analysis_type: 'multivariate',
          columns: multivariateTarget ? [multivariateTarget] : undefined,
          parameters: { n_clusters: clusterCount === 'auto' ? 'auto' : Number(clusterCount) },
        })
      }
      if (resp.error || resp.analysis_type === 'error') throw new Error(resp.error || 'Analysis failed')
      setResult(resp)
      setAnalysis(resp)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="workspace">
      <PageTitle
        eyebrow="EXPLORE"
        title="Interactive Analysis Engine"
        subtitle="Manual control over deterministic ARGUS analytics tools & statistical visualizations."
      />

      {/* Keep the selected tool stable while its request is running. */}
      <fieldset className="explore-tabs-bar analysis-control-fields" disabled={busy}>
        <button
          type="button"
          className={`explore-tab-btn ${tab === 'overview' ? 'active' : ''}`}
          onClick={() => { setTab('overview'); setResult(null) }}
        >
          <SlidersHorizontal size={15} /> <span>Diagnostic Overview</span>
        </button>
        <button
          type="button"
          className={`explore-tab-btn ${tab === 'univariate' ? 'active' : ''}`}
          onClick={() => { setTab('univariate'); setResult(null) }}
          disabled={!canRun('univariate')}
        >
          <LineChart size={15} /> <span>Univariate Distribution</span>
        </button>
        <button
          type="button"
          className={`explore-tab-btn ${tab === 'bivariate' ? 'active' : ''}`}
          onClick={() => { setTab('bivariate'); setResult(null) }}
          disabled={!canRun('bivariate')}
        >
          <BrainCircuit size={15} /> <span>Bivariate Relationship</span>
        </button>
        <button
          type="button"
          className={`explore-tab-btn ${tab === 'correlation' ? 'active' : ''}`}
          onClick={() => { setTab('correlation'); setResult(null) }}
          disabled={!canRun('correlation')}
        >
          <TableIcon size={15} /> <span>Correlation Heatmap</span>
        </button>
        <button
          type="button"
          className={`explore-tab-btn ${tab === 'multivariate' ? 'active' : ''}`}
          onClick={() => { setTab('multivariate'); setResult(null) }}
          disabled={!canRun('multivariate')}
        >
          <Layers size={15} /> <span>Multivariate Groups</span>
        </button>
      </fieldset>

      <div className="explore-mode-banner">
        <div className="explore-mode-copy">
          <span className="explore-mode-icon"><Sparkles size={15} /></span>
          <div>
            <strong>{tabMeta[tab][0]}</strong>
            <span>{tabMeta[tab][1]}</span>
          </div>
        </div>
        <span className="explore-mode-status"><i /> COMPUTED LOCALLY</span>
      </div>

      {/* Beginner Concept Guide for current Explore tool */}
      <ExploreConceptGuide tab={tab} />

      {tab === 'overview' && (
        <DatasetOverview profile={profile} dataset={dataset} />
      )}

      {/* Interactive Controls Bar */}
      {tab !== 'overview' && (
        <div className="panel explore-control-panel">
          {tab === 'univariate' && (
            <div className="master-scope-section">
              <div className="master-scope-info">
                <span className="master-scope-tag">ANALYSIS SCOPE (MASTER MODE)</span>
                <span className="master-scope-desc">
                  {univariateScope === 'selected'
                    ? 'Targeted univariate breakdown for a specific attribute'
                    : `High-throughput distribution audit across all ${columns.length} columns in parallel`}
                </span>
              </div>
              <div className="master-scope-switcher" role="radiogroup" aria-label="Analysis Scope Mode">
                <button
                  type="button"
                  className={`master-scope-btn ${univariateScope === 'selected' ? 'active' : ''}`}
                  onClick={() => setUnivariateScope('selected')}
                >
                  <Crosshair size={14} />
                  <span>Single Column Deep-Dive</span>
                </button>
                <button
                  type="button"
                  className={`master-scope-btn ${univariateScope === 'all' ? 'active' : ''}`}
                  onClick={() => setUnivariateScope('all')}
                >
                  <LayoutGrid size={14} />
                  <span>All Columns (Batch Audit)</span>
                  <span className="master-scope-badge">{columns.length} cols</span>
                </button>
              </div>
            </div>
          )}

          <fieldset className="explore-controls-row analysis-control-fields" disabled={busy}>
            <legend className="sr-only">Configure analysis</legend>
            {tab === 'univariate' && (
              <>
                {univariateScope === 'selected' ? (
                  <>
                    <div className="control-group">
                      <label htmlFor="colA-select">TARGET COLUMN</label>
                      <div className="select-wrap">
                        <select
                          id="colA-select"
                          className="explore-select"
                          value={colA || ''}
                          onChange={(e) => setColA(e.target.value)}
                        >
                          {columns.map((c) => {
                            const t = columnType(c)
                            const isKey = isIdColumn(c)
                            const tag = isKey ? '🔑 key / id' : t ? t : ''
                            return (
                              <option key={c} value={c}>
                                {c} {tag ? `· ${tag}` : ''}
                              </option>
                            )
                          })}
                        </select>
                        <ChevronDown size={14} className="select-chevron" />
                      </div>
                    </div>
                    {hasHistogram && (
                      <div className="control-group compact-control-group">
                        <label htmlFor="univariate-bins">HISTOGRAM DETAIL</label>
                        <div className="select-wrap">
                          <select
                            id="univariate-bins"
                            className="explore-select"
                            value={univariateBins}
                            onChange={(e) => setUnivariateBins(e.target.value)}
                          >
                            <option value="auto">Auto · data-aware</option>
                            <option value="8">8 bins</option>
                            <option value="12">12 bins</option>
                            <option value="20">20 bins</option>
                            <option value="30">30 bins</option>
                            <option value="50">50 bins</option>
                          </select>
                          <ChevronDown size={14} className="select-chevron" />
                        </div>
                        <span className="control-helper">Controls numeric and text-length distributions.</span>
                      </div>
                    )}
                    {hasCategories && <ExploreSelect id="univariate-levels" label="CATEGORY LIMIT" value={categoryLimit} onChange={setCategoryLimit}
                      options={['5', '10', '20', '50'].map((n) => [n, `Top ${n} levels`])} />}
                    {hasDates && <ExploreSelect id="univariate-time" label="TIME BUCKET" value={timeBucket} onChange={setTimeBucket}
                      options={['auto', 'hour', 'day', 'week', 'month', 'year'].map((v) => [v, v === 'auto' ? 'Auto · based on time span' : v])} />}
                    {hasText && <ExploreSelect id="univariate-text" label="TEXT VIEW" value={textView} onChange={setTextView}
                      options={[["length", "Character-length distribution"], ["tokens", "Most frequent tokens"]]} />}
                  </>
                ) : (
                  <div className="all-columns-notice">
                    <span className="all-cols-badge"><Sparkles size={13} /> Full Dataset Mode</span>
                    <p>Auditing all <strong>{columns.length} columns</strong> simultaneously with automatic type-adaptive charts and diagnostics.</p>
                  </div>
                )}
              </>
            )}

          {tab === 'bivariate' && (
            <div className="bivariate-master-container">
              {/* Dynamic Suggested Pairs */}
              {recommendedPairs.length > 0 && (
                <div className="bivariate-suggestions-bar">
                  <span className="biv-suggest-label"><Sparkles size={13} /> TOP RELATIONSHIP PAIRS:</span>
                  <div className="biv-suggest-pills">
                    {recommendedPairs.map(([x, y, label]) => (
                      <button
                        key={`${x}-${y}`}
                        type="button"
                        className={`biv-suggest-btn ${(colA === x && colB === y) || (colA === y && colB === x) ? 'active' : ''}`}
                        onClick={() => {
                          setColA(x)
                          setColB(y)
                        }}
                      >
                        <span>{label || `${x} vs ${y}`}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="bivariate-inputs-row">
                <div className="control-group biv-col-x">
                  <label htmlFor="colA-biv">FIRST VARIABLE (X)</label>
                  <div className="select-wrap">
                    <select
                      id="colA-biv"
                      className="explore-select"
                      value={colA || ''}
                      onChange={(e) => {
                        const newA = e.target.value
                        setColA(newA)
                        if (colB === newA) {
                          const nextB = columns.find((c) => c !== newA && !isIdColumn(c)) || columns.find((c) => c !== newA) || ''
                          setColB(nextB)
                        }
                      }}
                    >
                      {columns.filter((c) => c !== colB).map((c) => {
                        const t = columnType(c)
                        const isKey = isIdColumn(c)
                        const tag = isKey ? '🔑 key / id' : t ? t : ''
                        return (
                          <option key={c} value={c}>
                            {c} {tag ? `· ${tag}` : ''}
                          </option>
                        )
                      })}
                    </select>
                    <ChevronDown size={14} className="select-chevron" />
                  </div>
                </div>

                <div className="bivariate-vs-badge">VS</div>

                <div className="control-group biv-col-y">
                  <label htmlFor="colB-biv">SECOND VARIABLE (Y)</label>
                  <div className="select-wrap">
                    <select
                      id="colB-biv"
                      className="explore-select"
                      value={colB || ''}
                      onChange={(e) => {
                        const newB = e.target.value
                        setColB(newB)
                        if (colA === newB) {
                          const nextA = columns.find((c) => c !== newB && !isIdColumn(c)) || columns.find((c) => c !== newB) || ''
                          setColA(nextA)
                        }
                      }}
                    >
                      {columns.filter((c) => c !== colA).map((c) => {
                        const t = columnType(c)
                        const isKey = isIdColumn(c)
                        const tag = isKey ? '🔑 key / id' : t ? t : ''
                        return (
                          <option key={c} value={c}>
                            {c} {tag ? `· ${tag}` : ''}
                          </option>
                        )
                      })}
                    </select>
                    <ChevronDown size={14} className="select-chevron" />
                  </div>
                </div>

                <div className="control-group biv-col-agg">
                  <label htmlFor="biv-aggregation">GROUP SUMMARY</label>
                  <div className="select-wrap">
                    <select
                      id="biv-aggregation"
                      className="explore-select"
                      value={aggregation}
                      disabled={!canAggregate}
                      onChange={(e) => setAggregation(e.target.value)}
                    >
                      <option value="auto">Auto · best fit</option>
                      <option value="mean">Mean</option>
                      <option value="median">Median</option>
                      <option value="count">Count</option>
                      <option value="sum">Sum</option>
                    </select>
                    <ChevronDown size={14} className="select-chevron" />
                  </div>
                </div>

                <div className="biv-action-col">
                  <button
                    type="button"
                    className="run-analysis-btn"
                    onClick={runExplore}
                    disabled={busy || !colA || !colB || colA === colB}
                  >
                    {busy ? (
                      <>
                        <LoaderCircle size={16} className="spin" /> <span>Computing...</span>
                      </>
                    ) : (
                      <>
                        <Play size={16} fill="#ffffff" /> <span>Run Analysis</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="bivariate-context-banner">
                <Info size={13} />
                <span>{groupedMeasureHint}</span>
              </div>
            </div>
          )}

          {tab === 'correlation' && (
            <div className="analysis-flex-controls">
              <ExploreSelect id="correlation-method" label="CORRELATION METHOD" value={correlationMethod} onChange={setCorrelationMethod}
                options={[["pearson", "Pearson · linear"], ["spearman", "Spearman · rank-based"]]} />
              <div className="explore-info-tip">
                <span>Computes Pearson, Spearman, and mixed-type associations across {columns.length} columns.</span>
              </div>
              <div className="control-group compact-control-group">
                <label htmlFor="correlation-limit">TOP PAIRS</label>
                <div className="select-wrap">
                  <select
                    id="correlation-limit"
                    className="explore-select"
                    value={correlationLimit}
                    onChange={(e) => setCorrelationLimit(e.target.value)}
                  >
                    <option value="5">Top 5</option>
                    <option value="10">Top 10</option>
                    <option value="20">Top 20</option>
                    <option value="50">Top 50</option>
                  </select>
                  <ChevronDown size={14} className="select-chevron" />
                </div>
              </div>
            </div>
          )}

          {tab === 'multivariate' && (
            <div className="multivariate-container">
              <div className="multivariate-inputs-row">
                <div className="control-group compact-control-group">
                  <label htmlFor="multivariate-target">MODEL TARGET</label>
                  <div className="select-wrap">
                    <select
                      id="multivariate-target"
                      className="explore-select"
                      value={multivariateTarget}
                      onChange={(e) => setMultivariateTarget(e.target.value)}
                    >
                      <option value="">Auto-detect target</option>
                      {modelTargets.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown size={14} className="select-chevron" />
                  </div>
                </div>
                <div className="control-group compact-control-group">
                  <label htmlFor="cluster-count">GROUP COUNT</label>
                  <div className="select-wrap">
                    <select
                      id="cluster-count"
                      className="explore-select"
                      value={clusterCount}
                      onChange={(e) => setClusterCount(e.target.value)}
                    >
                      <option value="auto">Auto · silhouette comparison</option>
                      {[2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count} groups</option>)}
                    </select>
                    <ChevronDown size={14} className="select-chevron" />
                  </div>
                </div>
                <div className="biv-action-col">
                  <button
                    type="button"
                    className="run-analysis-btn"
                    onClick={runExplore}
                    disabled={busy}
                  >
                    {busy ? (
                      <>
                        <LoaderCircle size={16} className="spin" /> <span>Computing Stats...</span>
                      </>
                    ) : (
                      <>
                        <Play size={16} fill="#ffffff" /> <span>Run Analysis</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="multivariate-strategy-card">
                <div className="multi-strat-header">
                  <Sparkles size={14} color="#f97316" />
                  <strong>Multivariate Analytical Intelligence (Dynamic per Dataset):</strong>
                </div>
                <div className="multi-strat-grid">
                  <div className="multi-strat-item">
                    <span className="strat-tag">Supervised Drivers</span>
                    <p>Trains Random Forest on <strong>{multivariateTarget || 'auto-detected target'}</strong> to rank predictive feature importances.</p>
                  </div>
                  <div className="multi-strat-item">
                    <span className="strat-tag">Unsupervised Archetypes</span>
                    <p>Encodes categories, scales numericals, and applies PCA + K-Means to discover natural entity segments.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab !== 'bivariate' && tab !== 'multivariate' && (
            <button
              type="button"
              className="run-analysis-btn"
              onClick={runExplore}
              disabled={busy}
            >
              {busy ? (
                <>
                  <LoaderCircle size={16} className="spin" /> <span>Computing Stats...</span>
                </>
              ) : (
                <>
                  <Play size={16} fill="#ffffff" /> <span>{tab === 'univariate' && univariateScope === 'all' ? `Run Batch Analysis (${columns.length} Cols)` : 'Run Analysis'}</span>
                </>
              )}
            </button>
          )}
        </fieldset>
      </div>
      )}

      {result && (
        <div className="panel result-panel" key={result.analysis_id}>
          {/* Result Overview Header */}
          <div className="explore-result-header">
            <div className="explore-result-meta">
              <span className="eyebrow">ANALYSIS RESULT</span>
              <h3>{result.title || result.analysis_name || 'Statistical Analysis'}</h3>
            </div>
            <div className="explore-result-badges">
              <span className="type-pill" style={{ color: 'var(--cyan)', borderColor: 'rgba(56,189,248,0.3)' }}>
                {result.analysis_type?.replaceAll('_', ' ').toUpperCase() || 'EDA'}
              </span>
              {result.insights?.length > 0 && (
                <span className="type-pill" style={{ color: 'var(--green)', borderColor: 'rgba(29,158,117,0.3)' }}>
                  {result.insights.length} key insights
                </span>
              )}
            </div>
          </div>
          <AnalysisResultCard
            result={result}
            beginnerMode={beginnerMode}
            hideHeader={true}
            onSelectColumn={handleSwitchColumn}
            alternativeCols={columns.filter((c) => !isIdColumn(c))}
            onExplainFurther={() => {
              setPage?.('analyst')
              let prompt = ''
              if (result.analysis_type === 'multivariate') {
                const targetName = multivariateTarget || result.statistics?.target || 'target outcome'
                prompt = `Explain the multivariate analysis and natural clusters discovered in this dataset. What are the distinct archetypes for each cluster (like Group 0, Group 1, etc.), which specific features drive the differences, and how does this relate to predicting ${targetName}? What strategic actions or segmentation strategies do you recommend?`
              } else if (result.analysis_type === 'bivariate') {
                prompt = `Explain the bivariate relationship between ${colA} and ${colB} in detail. Does the data show meaningful correlation, variance across groups, or anomalies? What are the key business takeaways?`
              } else if (result.analysis_type === 'correlation') {
                prompt = `Analyze the correlation matrix across these columns. Which variables exhibit strong collinearity, what risks or opportunities does that reveal, and which features should be prioritized or pruned?`
              } else {
                const target = colA || columns[0]
                prompt = `Analyze the univariate distribution of ${target} in detail. What are the key outliers, variance, skewness, and statistical takeaways?`
              }
              sendMessage?.(prompt)
            }}
            onExplore={() => {
              setTab(tab === 'univariate' ? 'bivariate' : 'univariate')
            }}
          />
        </div>
      )}
    </section>
  )
}

// ── 4. DATA CLEANING PAGE ─────────────────────────────────────────────────
function CleaningPage({
  dataset,
  setError,
  setToast,
  onUpload,
  onDemo,
  scanData: propScanData,
  setScanData: propSetScanData,
  cleaningResult: propCleaningResult,
  setCleaningResult: propSetCleaningResult,
}) {
  const [localScanData, setLocalScanData] = useState(null)
  const [localCleaningResult, setLocalCleaningResult] = useState(null)
  const scanData = propScanData !== undefined ? propScanData : localScanData
  const setScanData = propSetScanData || setLocalScanData
  const cleaningResult = propCleaningResult !== undefined ? propCleaningResult : localCleaningResult
  const setCleaningResult = propSetCleaningResult || setLocalCleaningResult
  const [busy, setBusy] = useState(false)

  if (!dataset) return <EmptyState onUpload={onUpload} onDemo={onDemo} />

  async function handleScan() {
    setBusy(true)
    setError('')
    try {
      const resp = await api.runCleaning(dataset.dataset_id)
      setScanData(resp.statistics || resp)
      setToast('Quality scan completed')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleApply() {
    setBusy(true)
    setError('')
    try {
      const resp = await api.applyCleaning(dataset.dataset_id)
      setCleaningResult(resp)
      setToast('Cleaning plan applied! Cleaned session dataset ready.')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const issues = scanData?.issues || {}
  const missingCount = issues.missing_values?.length || 0
  const junkCount = issues.junk_values?.length || 0
  const dupCount = issues.duplicates || 0
  const outlierCount = issues.outliers?.length || 0

  return (
    <section className="workspace">
      <PageTitle
        eyebrow="DATA CLEANING"
        title="Smart Automated Cleaner"
        subtitle="Detect hygiene issues, review remediation plans, and apply non-destructive cleaning."
      />

      <div className="panel action-panel">
        <div>
          <strong>Quality & Hygiene Audit</strong>
          <p className="muted">
            The original dataset upload remains untouched. Cleaning produces an isolated session copy.
          </p>
        </div>
        <button className="primary-button" onClick={handleScan} disabled={busy}>
          <Wrench size={16} /> {busy ? 'Scanning...' : 'Scan Dataset'}
        </button>
      </div>

      <div className="cleaning-workflow-strip" aria-label="Cleaning workflow">
        <div className="cleaning-workflow-step active"><span>01</span><strong>Scan</strong><small>Find issues</small></div>
        <i className="workflow-connector" />
        <div className={`cleaning-workflow-step ${scanData ? 'active' : ''}`}><span>02</span><strong>Review</strong><small>Inspect impact</small></div>
        <i className="workflow-connector" />
        <div className={`cleaning-workflow-step ${cleaningResult ? 'active' : ''}`}><span>03</span><strong>Apply</strong><small>Keep a clean copy</small></div>
      </div>

      {scanData && (
        <>
          {/* Issue Cards */}
          <div className="cleaning-grid">
            <div className="cleaning-card">
              <span className="eyebrow">MISSING VALUES</span>
              <strong>{missingCount} columns affected</strong>
              <span>Columns with null, empty, or unrecorded values.</span>
            </div>
            <div className="cleaning-card">
              <span className="eyebrow">DUPLICATES</span>
              <strong>{dupCount} identical rows</strong>
              <span>Exact duplicate rows that inflate sample size.</span>
            </div>
            <div className="cleaning-card">
              <span className="eyebrow">POTENTIAL OUTLIERS</span>
              <strong>{outlierCount} columns with extreme values</strong>
              <span>Values lying 1.5x IQR outside upper/lower quartiles.</span>
            </div>
            <div className="cleaning-card">
              <span className="eyebrow">JUNK STRINGS</span>
              <strong>{junkCount} placeholder columns</strong>
              <span>Suspicious placeholders like '?', 'N/A', 'none', '-'.</span>
            </div>
          </div>

          {/* Action to Apply Cleaning */}
          <div className="panel action-panel" style={{ border: '1px solid rgba(249, 115, 22, 0.4)' }}>
            <div>
              <strong style={{ color: 'var(--orange-soft)' }}>Apply Recommended Cleaning Plan</strong>
              <p className="muted">
                Removes duplicates, imputes numeric columns with median, fills categoricals with mode, and strips whitespace.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="primary-button" onClick={handleApply} disabled={busy}>
                <RefreshCw size={16} /> {busy ? 'Applying...' : 'Apply Recommended Cleaning'}
              </button>
              {cleaningResult && (
                <a
                  className="primary-button"
                  style={{ background: 'rgba(35, 134, 54, 0.2)', borderColor: 'var(--green)', color: '#86efac' }}
                  href={api.cleanedDownloadUrl(dataset.dataset_id)}
                  download
                >
                  <Download size={16} /> Download Cleaned CSV
                </a>
              )}
            </div>
          </div>

          {/* Before / After comparison */}
          {cleaningResult && (
            <AiNarrative payload={cleaningResult.narrative} label="WHAT THE CLEANER CHANGED" />
          )}
          {cleaningResult && cleaningResult.before_after && (() => {
            const ba = cleaningResult.before_after || {}
            const origRows = ba.original_rows ?? ba.rows_before ?? dataset.rows ?? 0
            const cleanRows = ba.cleaned_rows ?? ba.rows_after ?? dataset.rows ?? 0
            const rowsDiff = origRows - cleanRows
            const origMissing = ba.original_missing ?? ba.missing_before ?? 0
            const cleanMissing = ba.cleaned_missing ?? ba.missing_after ?? 0
            const missingDiff = origMissing - cleanMissing
            const hBefore = ba.health_before?.health_score ?? cleaningResult.statistics?.health_before?.health_score ?? 74
            const hAfter = cleaningResult.cleaned_health?.health_score ?? ba.health_after?.health_score ?? 100
            const hDelta = Math.round(hAfter - hBefore)

            return (
              <div className="panel before-after-table">
                <div className="panel-title">
                  <span>Before & After Comparison</span>
                  <span className="muted">SOTA Cleaning Diagnostics</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Original</th>
                        <th>Cleaned</th>
                        <th>Impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Row Count</td>
                        <td>{origRows.toLocaleString()}</td>
                        <td>{cleanRows.toLocaleString()}</td>
                        <td style={{ color: rowsDiff > 0 ? 'var(--orange)' : 'var(--green)' }}>
                          {rowsDiff > 0 ? `-${rowsDiff} duplicate rows dropped` : '0 rows removed · structure preserved'}
                        </td>
                      </tr>
                      <tr>
                        <td>Missing Values</td>
                        <td>{origMissing.toLocaleString()} cells</td>
                        <td>{cleanMissing.toLocaleString()} cells</td>
                        <td style={{ color: 'var(--green)' }}>
                          {missingDiff > 0 ? `-${missingDiff.toLocaleString()} missing cells resolved (100% complete)` : 'Zero missing data'}
                        </td>
                      </tr>
                      <tr>
                        <td>Outlier Fences</td>
                        <td>Extreme values present</td>
                        <td style={{ color: 'var(--cyan)' }}>Tukey IQR fences applied</td>
                        <td style={{ color: 'var(--green)' }}>Stabilized leverage points (0 penalty)</td>
                      </tr>
                      <tr>
                        <td>Health Score</td>
                        <td>{hBefore}/100</td>
                        <td style={{ color: 'var(--green)', fontWeight: 'bold' }}>
                          {hAfter}/100
                        </td>
                        <td style={{ color: 'var(--green)', fontWeight: 600 }}>
                          {hDelta > 0 ? `+${hDelta} health pts restored (Optimal)` : 'Health optimal'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {cleaningResult.operations?.length > 0 && (
                  <div className="cleaning-operations-tray">
                    <span className="eyebrow" style={{ color: 'var(--orange-soft)', marginBottom: 8, display: 'block' }}>
                      SOTA OPERATIONS APPLIED ({cleaningResult.operations.length})
                    </span>
                    <div className="cleaning-operations-list">
                      {cleaningResult.operations.map((op, idx) => (
                        <div key={idx} className="cleaning-op-item">
                          <CheckCircle2 size={14} color="#22c55e" />
                          <span>{op}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </>
      )}
    </section>
  )
}

// ── 5. FEATURE DISCOVERY PAGE ─────────────────────────────────────────────
function FeaturesPage({ dataset, setError, onUpload, onDemo }) {
  const [result, setResult] = useState(null)
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)

  if (!dataset) return <EmptyState onUpload={onUpload} onDemo={onDemo} />

  const columns = dataset.column_names || []

  async function runDiscovery() {
    setBusy(true)
    setError('')
    try {
      const resp = await api.runFeatures(dataset.dataset_id, target)
      setResult(resp)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="workspace">
      <PageTitle
        eyebrow="FEATURE DISCOVERY"
        title="Predictive Drivers & Target Discovery"
        subtitle="Automatic target variable detection and machine-learning feature ranking."
      />

      <div className="panel form-panel">
        <div className="field">
          <label>Target Column (Leave blank to auto-detect target)</label>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Auto-Detect Likely Target</option>
            {columns.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <button className="primary-button" onClick={runDiscovery} disabled={busy}>
          <BrainCircuit size={16} /> {busy ? 'Discovering...' : 'Discover Important Features'}
        </button>
      </div>

      <div className="feature-discovery-banner">
        <div className="feature-banner-orb"><BrainCircuit size={22} /></div>
        <div>
          <span className="eyebrow">MODEL-READY SIGNALS</span>
          <strong>Turn raw columns into a ranked point of view.</strong>
          <p>ARGUS tests the likely target, scores useful predictors, and explains the signal behind each rank.</p>
        </div>
        <div className="feature-banner-points"><span>01 Detect</span><span>02 Rank</span><span>03 Explain</span></div>
      </div>

      {result && (
        <div className="panel result-panel">
          <FeatureImportanceChart data={result.statistics} target={target || result.statistics?.target} />
          <VisualizationPlan plan={result.visualization_plan} />
          {/* The reading of the ranking itself, then the reading of the run */}
          <AiNarrative payload={result.chart_narrative} label="WHAT THIS GRAPH SHOWS" compact tight />
          {result.narrative && result.narrative.text?.trim() !== result.chart_narrative?.text?.trim() && (
            <AiNarrative payload={result.narrative} label="WHAT DRIVES THIS TARGET" compact />
          )}
          {result.insights && (
            <div style={{ marginTop: 14 }}>
              <span className="eyebrow">MODELING INSIGHTS</span>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--text-body)', lineHeight: 1.6 }}>
                {result.insights.map((ins, i) => (
                  <li key={i}>{ins}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}



// ── SETTINGS MODAL ────────────────────────────────────────────────────────
function SettingsModal({ beginnerMode, setBeginnerMode, onClose }) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h3>ARGUS Settings</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="settings-row">
          <div>
            <span>Beginner-Friendly Mode</span>
            <p>Translates complex statistical concepts (e.g. Kurtosis, Pearson r) into plain-English terminology tooltips.</p>
          </div>
          <div
            className={`toggle-switch ${beginnerMode ? 'on' : ''}`}
            onClick={() => setBeginnerMode(!beginnerMode)}
          >
            <div className="toggle-knob" />
          </div>
        </div>

        <div className="settings-row">
          <div>
            <span>LLM Providers & Redundancy</span>
            <p>NVIDIA NIM (nvapi) prioritized with failover to Groq (Llama 3.3). 14 candidate keys rotated.</p>
          </div>
          <span className="type-pill" style={{ color: 'var(--green)' }}>Active & Resilient</span>
        </div>

        <div className="settings-row">
          <div>
            <span>Python Execution Sandbox</span>
            <p>AST-gated subprocess sandbox for custom analytical queries.</p>
          </div>
          <span className="type-pill" style={{ color: 'var(--cyan)' }}>Secured</span>
        </div>

        <button className="primary-button" style={{ justifySelf: 'end' }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}

// ── SHARED HELPERS ────────────────────────────────────────────────────────
function PageTitle({ eyebrow, title, subtitle }) {
  const pageNumber = PAGE_NUMBERS[eyebrow?.toLowerCase().replaceAll(' ', '-')] || '00'
  return (
    <div className="page-heading">
      <div className="page-heading-main">
        <div className="page-heading-kicker">
          <span className="eyebrow"><i className="eyebrow-dot" />{eyebrow}</span>
          <span className="page-heading-index">{pageNumber} / 06</span>
        </div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="page-heading-side" aria-hidden="true">
        <div className="heading-orbit-art">
          <span className="orbit-ring orbit-ring-one" />
          <span className="orbit-ring orbit-ring-two" />
          <span className="heading-orbit-core" />
        </div>
        <div className="heading-side-caption"><span className="live-indicator" /> Workspace active</div>
      </div>
    </div>
  )
}

function Metric({ label, value, color }) {
  return (
    <div className="metric-card">
      <div className="metric-card-top">
        <span>{label}</span>
        <i className="metric-signal" aria-hidden="true"><b /><b /><b /><b /></i>
      </div>
      <strong style={color ? { color } : undefined}>
        {typeof value === 'number' ? value.toLocaleString() : (value ?? '—')}
      </strong>
    </div>
  )
}

function CapabilityRail({ capabilities }) {
  if (!capabilities) return null
  const counts = capabilities.counts || {}
  const items = [
    ['NUMERIC', counts.numeric, 'var(--blue)'],
    ['CATEGORIES', counts.categorical, 'var(--green)'],
    ['DATES', counts.datetime, 'var(--purple)'],
    ['TEXT', counts.text, 'var(--cyan)'],
  ]
  const warnings = capabilities.warnings || []

  return (
    <div className="capability-rail">
      <div className="capability-rail-heading">
        <span className="eyebrow"><i className="eyebrow-dot" /> ADAPTIVE ANALYSIS MAP</span>
        <span>{Object.values(capabilities.supported || {}).filter(Boolean).length} tools ready</span>
      </div>
      <div className="capability-rail-items">
        {items.map(([label, value, color]) => (
          <div className="capability-rail-item" key={label}>
            <i style={{ background: color }} />
            <strong>{value ?? 0}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {warnings.length > 0 && <span className="capability-rail-note">{warnings[0]}</span>}
    </div>
  )
}

function parseRowSlice(query, totalRows) {
  if (!query || !query.trim()) return null
  const q = query.trim()
  const parts = q.split(',').map((s) => s.trim()).filter(Boolean)
  const selected = new Set()

  for (const part of parts) {
    if (part.includes(':')) {
      const [startStr, endStr] = part.split(':')
      const start = startStr.trim() ? Math.max(1, parseInt(startStr, 10)) : 1
      const end = endStr.trim() ? Math.min(totalRows, parseInt(endStr, 10)) : totalRows
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.min(start, end)
        const max = Math.max(start, end)
        for (let i = min; i <= max; i++) selected.add(i)
      }
    } else if (/^\d+\s*-\s*\d+$/.test(part)) {
      const [startStr, endStr] = part.split('-')
      const start = Math.max(1, parseInt(startStr, 10))
      const end = Math.min(totalRows, parseInt(endStr, 10))
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.min(start, end)
        const max = Math.max(start, end)
        for (let i = min; i <= max; i++) selected.add(i)
      }
    } else if (/^\d+$/.test(part)) {
      const idx = parseInt(part, 10)
      if (idx >= 1 && idx <= totalRows) selected.add(idx)
    }
  }

  return selected.size > 0 ? selected : null
}

function DataTable({ preview, profile }) {
  const [search, setSearch] = useState('')
  const [rowSlice, setRowSlice] = useState('')
  const [pageSize, setPageSize] = useState(25) // 25 | 50 | 100 | 'all'
  const [currentPage, setCurrentPage] = useState(1)
  const [copied, setCopied] = useState(false)

  const columns = preview?.columns || []
  const rows = preview?.preview || []

  // Assign original 1-indexed row number
  const indexedRows = useMemo(() => {
    return rows.map((r, i) => ({ ...r, __row_num: i + 1 }))
  }, [rows])

  // Parse row index / slice input
  const parsedSlice = useMemo(() => {
    return parseRowSlice(rowSlice, rows.length)
  }, [rowSlice, rows.length])

  // Filter rows by row slice and cell element search
  const filteredRows = useMemo(() => {
    let result = indexedRows
    if (parsedSlice) {
      result = result.filter((r) => parsedSlice.has(r.__row_num))
    }
    if (search.trim()) {
      const term = search.toLowerCase()
      result = result.filter((row) =>
        columns.some((col) =>
          String(row[col] ?? '')
            .toLowerCase()
            .includes(term)
        )
      )
    }
    return result
  }, [indexedRows, parsedSlice, search, columns])

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, rowSlice, pageSize])

  // Pagination calculations
  const effectivePageSize = pageSize === 'all' ? (filteredRows.length || 1) : Number(pageSize)
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / effectivePageSize))
  const safePage = Math.min(Math.max(1, currentPage), totalPages)
  const startIndex = (safePage - 1) * effectivePageSize
  const paginatedRows = filteredRows.slice(startIndex, startIndex + effectivePageSize)

  // Create column logical type map from profile if available
  const colTypeMap = useMemo(() => {
    const map = {}
    if (profile?.column_summary) {
      profile.column_summary.forEach((c) => {
        map[c.name] = c.logical_type || c.dtype
      })
    }
    return map
  }, [profile?.column_summary])

  if (!preview) {
    return (
      <div className="loading-block">
        <LoaderCircle size={17} className="spin" /> Loading preview...
      </div>
    )
  }

  function handleCopy() {
    try {
      const tsv = [
        columns.join('\t'),
        ...filteredRows.map((r) => columns.map((c) => r[c] ?? '').join('\t')),
      ].join('\n')
      navigator.clipboard.writeText(tsv)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  function handleClearFilters() {
    setSearch('')
    setRowSlice('')
    setCurrentPage(1)
  }

  const isFiltered = Boolean(search.trim() || rowSlice.trim())

  return (
    <div className="data-table-container">
      {/* Search & Slice Controls Toolbar */}
      <div className="data-table-toolbar">
        <div className="data-table-search-group">
          {/* Element / Cell Value Search */}
          <div className="data-search-wrap" title="Search for any cell value across all columns">
            <Search size={14} className="data-search-icon" />
            <input
              type="text"
              placeholder="Search cell values (e.g. female, 71, Cherbourg)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="data-search-input"
            />
            {search && (
              <button
                type="button"
                className="data-search-clear"
                onClick={() => setSearch('')}
                title="Clear element search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Row Slicing & Indexing Search */}
          <div className="data-search-wrap data-slice-wrap" title="Slice rows by range (e.g. 1-25, 10:30, or specific rows 5,8,12)">
            <SlidersHorizontal size={14} className="data-search-icon" />
            <input
              type="text"
              placeholder="Row slice: e.g. 1-25, 10:30, :20, 42..."
              value={rowSlice}
              onChange={(e) => setRowSlice(e.target.value)}
              className="data-search-input data-slice-input"
            />
            {rowSlice && (
              <button
                type="button"
                className="data-search-clear"
                onClick={() => setRowSlice('')}
                title="Clear row slice"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {isFiltered && (
            <button
              type="button"
              className="data-clear-filters-btn"
              onClick={handleClearFilters}
              title="Reset search and row slice"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="data-table-stats">
          <button
            type="button"
            className="data-tool-btn"
            onClick={handleCopy}
            title="Copy filtered rows to clipboard (TSV format)"
          >
            {copied ? (
              <>
                <Check size={13} color="var(--green)" /> <span>Copied TSV</span>
              </>
            ) : (
              <>
                <Copy size={13} /> <span>Copy TSV</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Pagination & Row Count Bar */}
      <div className="data-table-pagination-bar">
        <div className="data-pagination-left">
          <span className="data-row-count">
            Showing <strong>{filteredRows.length > 0 ? startIndex + 1 : 0}–{Math.min(startIndex + effectivePageSize, filteredRows.length)}</strong> of <strong>{filteredRows.length}</strong> preview rows
            {isFiltered && <span className="data-filtered-badge"> (filtered from {rows.length})</span>}
            &middot; {columns.length} columns
          </span>
          {rowSlice && (
            <span className={`data-slice-status-badge ${parsedSlice ? 'valid' : 'invalid'}`}>
              {parsedSlice ? `Slice active: ${parsedSlice.size} rows matched` : 'Invalid slice syntax (use e.g. 1-20 or 5:15)'}
            </span>
          )}
        </div>

        <div className="data-pagination-controls">
          <div className="data-page-size-selector">
            <span className="page-size-label">Rows per page:</span>
            {[25, 50, 100, 'all'].map((size) => (
              <button
                key={size}
                type="button"
                className={`page-size-btn ${pageSize === size ? 'active' : ''}`}
                onClick={() => setPageSize(size)}
              >
                {size === 'all' ? 'All' : size}
              </button>
            ))}
          </div>

          {pageSize !== 'all' && totalPages > 1 && (
            <div className="data-page-nav">
              <button
                type="button"
                className="page-nav-btn"
                onClick={() => setCurrentPage(1)}
                disabled={safePage <= 1}
                title="First Page"
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                type="button"
                className="page-nav-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                title="Previous Page"
              >
                <ChevronLeft size={14} /> <span>Prev</span>
              </button>
              <span className="page-indicator">
                Page <strong>{safePage}</strong> of <strong>{totalPages}</strong>
              </span>
              <button
                type="button"
                className="page-nav-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                title="Next Page"
              >
                <span>Next</span> <ChevronRight size={14} />
              </button>
              <button
                type="button"
                className="page-nav-btn"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safePage >= totalPages}
                title="Last Page"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Data Table */}
      <div className="table-wrap data-table-scroll">
        <table>
          <thead>
            <tr>
              <th className="row-num-th" title="Original Row Number">#</th>
              {columns.map((col) => {
                const logical = colTypeMap[col]
                const [label, color] = logical
                  ? LOGICAL_LABELS[logical] || [logical, 'var(--text-muted)']
                  : []
                return (
                  <th key={col}>
                    <div className="th-content">
                      <span className="th-col-name">{col}</span>
                      {label && (
                        <span className="th-type-pill" style={{ color: color || 'var(--cyan)' }}>
                          {label}
                        </span>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="data-empty-td">
                  No preview rows match the active search or row slice.
                </td>
              </tr>
            ) : (
              paginatedRows.map((row) => (
                <tr key={row.__row_num}>
                  <td className="row-num-td" title={`Row ${row.__row_num}`}>{row.__row_num}</td>
                  {columns.map((col) => {
                    const val = row[col]
                    const isNull = val === null || val === undefined || val === ''
                    return (
                      <td key={col} className={isNull ? 'null-cell' : ''}>
                        {isNull ? (
                          <span className="null-badge">null</span>
                        ) : typeof val === 'boolean' ? (
                          <span className={`bool-badge ${val ? 'true' : 'false'}`}>
                            {String(val)}
                          </span>
                        ) : typeof val === 'number' ? (
                          <span className="num-cell-val">{val.toLocaleString()}</span>
                        ) : (
                          String(val)
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Pagination Bar for Convenient Access */}
      {pageSize !== 'all' && totalPages > 1 && (
        <div className="data-table-pagination-bar bottom-pagination">
          <span className="data-row-count muted">
            Page {safePage} of {totalPages} &middot; Showing {startIndex + 1}–{Math.min(startIndex + effectivePageSize, filteredRows.length)} of {filteredRows.length} rows
          </span>
          <div className="data-page-nav">
            <button
              type="button"
              className="page-nav-btn"
              onClick={() => setCurrentPage(1)}
              disabled={safePage <= 1}
              title="First Page"
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              type="button"
              className="page-nav-btn"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              title="Previous Page"
            >
              <ChevronLeft size={14} /> <span>Prev</span>
            </button>
            <span className="page-indicator">
              Page <strong>{safePage}</strong> of <strong>{totalPages}</strong>
            </span>
            <button
              type="button"
              className="page-nav-btn"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              title="Next Page"
            >
              <span>Next</span> <ChevronRight size={14} />
            </button>
            <button
              type="button"
              className="page-nav-btn"
              onClick={() => setCurrentPage(totalPages)}
              disabled={safePage >= totalPages}
              title="Last Page"
            >
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
