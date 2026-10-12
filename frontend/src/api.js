const API_BASE = import.meta.env.VITE_API_URL || ''

export function getAuthToken() {
  try {
    return localStorage.getItem('argus_token') || ''
  } catch {
    return ''
  }
}

export function setAuthToken(token) {
  try {
    if (token) localStorage.setItem('argus_token', token)
    else localStorage.removeItem('argus_token')
  } catch {}
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('argus_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setStoredUser(user) {
  try {
    if (user) localStorage.setItem('argus_user', JSON.stringify(user))
    else localStorage.removeItem('argus_user')
  } catch {}
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  const token = getAuthToken()
  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.detail || body.message || `Request failed (${response.status})`)
  return body
}

// ── Auth Endpoints (MongoDB Atlas) ───────────────────────────────────────────
export const login = ({ email, password }) =>
  request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

export const signup = ({ name, email, password }) =>
  request('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  })

export const getMe = () => request('/api/auth/me')

export const logout = () => {
  setAuthToken(null)
  setStoredUser(null)
  return request('/api/auth/logout', { method: 'POST' }).catch(() => ({}))
}

export const getRatingStats = () => request('/api/auth/rating')

export const submitRating = ({ stars, feedback }) =>
  request('/api/auth/rating', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stars, feedback }),
  })

// ── Dataset Endpoints ────────────────────────────────────────────────────────
export function uploadDataset(file) {
  const data = new FormData()
  data.append('file', file)
  return request('/api/datasets/upload', { method: 'POST', body: data })
}

export const loadDemoDataset = () => request('/api/datasets/demo', { method: 'POST' })
export const getDataset = (id) => request(`/api/datasets/${id}`)
export const getPreview = (id, n_rows = 100) => request(`/api/datasets/${id}/preview?n_rows=${n_rows}`)
export const getHealth = (id) => request(`/api/datasets/${id}/health`)
export const getNarrative = (id, refresh = false) => request(`/api/datasets/${id}/narrative${refresh ? '?refresh=true' : ''}`)
export const runAnalysis = (payload) => request('/api/analysis/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const runCleaning = (dataset_id) => request('/api/cleaning/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataset_id }) })
export const applyCleaning = (dataset_id) => request('/api/cleaning/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataset_id }) })
export const cleanedDownloadUrl = (dataset_id) => `${API_BASE}/api/cleaning/${dataset_id}/download`
export const runFeatures = (dataset_id, target) => request('/api/feature-discovery/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataset_id, target: target || null }) })
export const sendChat = (payload) => request('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const generateReport = (dataset_id, session_id) => request('/api/reports/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataset_id, session_id }) })
export const getReports = () => request('/api/reports')
export const reportDownloadUrl = (id) => `${API_BASE}/api/reports/${id}/download`
