import { useState, useEffect } from 'react'
import {
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  Sparkles,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  X,
  ShieldCheck,
  ArrowRight,
  Zap,
} from 'lucide-react'
import * as api from '../api'
import { signInWithGoogle, loginWithEmail, registerWithEmail } from '../services/firebase'

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  )
}

export default function AuthModal({
  isOpen = true,
  onClose,
  initialTab = 'login',
  onSuccess,
  onDemo,
  embedded = false,
}) {
  const [tab, setTab] = useState(initialTab)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    setTab(initialTab)
    setError('')
    setSuccess('')
  }, [initialTab, isOpen])

  if (!isOpen && !embedded) return null

  function resetForm() {
    setError('')
    setSuccess('')
    setPassword('')
    setConfirmPassword('')
  }

  function handleTabChange(nextTab) {
    setTab(nextTab)
    resetForm()
  }

  async function handleGoogleLogin() {
    setError('')
    setSuccess('')
    setGoogleBusy(true)

    try {
      const result = await signInWithGoogle()
      if (result.error) {
        setError(result.error)
      } else if (result.user) {
        setSuccess(`Signed in with Google! Welcome, ${result.user.name || 'Analyst'}!`)
        api.setStoredUser(result.user)
        api.setAuthToken(`firebase_${result.user.id}`)
        setTimeout(() => {
          onSuccess?.(result.user)
          if (!embedded) onClose?.()
        }, 500)
      }
    } catch (err) {
      setError(err.message || 'Google sign-in encountered an error.')
    } finally {
      setGoogleBusy(false)
    }
  }

  async function handleSubmit(e) {
    e?.preventDefault()
    setError('')
    setSuccess('')

    const cleanEmail = email.trim()
    const cleanName = name.trim()

    if (!cleanEmail) {
      setError('Please enter your email address')
      return
    }
    if (!password) {
      setError('Please enter your password')
      return
    }

    if (tab === 'signup') {
      if (!cleanName) {
        setError('Please enter your full name')
        return
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters')
        return
      }
      if (confirmPassword && password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }
    }

    setBusy(true)
    try {
      let authedUser = null

      // Try Firebase authentication first
      if (tab === 'login') {
        const fbRes = await loginWithEmail(cleanEmail, password)
        if (fbRes.error && !fbRes.user) {
          // Fallback to backend API
          const res = await api.login({ email: cleanEmail, password })
          authedUser = res.user
          if (res?.token) api.setAuthToken(res.token)
        } else {
          authedUser = fbRes.user
          api.setAuthToken(`firebase_${fbRes.user.id}`)
        }
      } else {
        const fbRes = await registerWithEmail(cleanEmail, password, cleanName)
        if (fbRes.error && !fbRes.user) {
          // Fallback to backend API
          const res = await api.signup({ name: cleanName, email: cleanEmail, password })
          authedUser = res.user
          if (res?.token) api.setAuthToken(res.token)
        } else {
          authedUser = fbRes.user
          api.setAuthToken(`firebase_${fbRes.user.id}`)
        }
      }

      if (authedUser) {
        api.setStoredUser(authedUser)
        setSuccess(`Welcome, ${authedUser.name || 'Analyst'}! 🎉`)
        setTimeout(() => {
          onSuccess?.(authedUser)
          if (!embedded) onClose?.()
        }, 500)
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify your credentials.')
    } finally {
      setBusy(false)
    }
  }

  const content = (
    <div className={`arg-auth-card ${embedded ? 'embedded' : ''}`}>
      {!embedded && onClose && (
        <button className="arg-auth-close" onClick={onClose} aria-label="Close modal">
          <X size={18} />
        </button>
      )}

      <div className="arg-auth-header">
        <div className="arg-auth-badge">
          <ShieldCheck size={13} color="#38BDF8" />
          <span>Firebase Identity & Security</span>
        </div>
        <h2>{tab === 'login' ? 'Welcome Back' : 'Create Your Account'}</h2>
        <p>
          {tab === 'login'
            ? 'Sign in to access your saved datasets, analysis history, and AI insights.'
            : 'Get instant, automated exploratory data analysis with AI.'}
        </p>
      </div>

      <div className="arg-auth-tabs">
        <button
          type="button"
          className={`arg-auth-tab ${tab === 'login' ? 'active' : ''}`}
          onClick={() => handleTabChange('login')}
        >
          <KeyRound size={15} /> Sign In
        </button>
        <button
          type="button"
          className={`arg-auth-tab ${tab === 'signup' ? 'active' : ''}`}
          onClick={() => handleTabChange('signup')}
        >
          <Sparkles size={15} /> Sign Up
        </button>
      </div>

      {error && (
        <div className="arg-auth-alert error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="arg-auth-alert success">
          <CheckCircle2 size={16} />
          <span>{success}</span>
        </div>
      )}

      {/* Prominent Samvaad-style Google 1-Click Sign In */}
      <button
        type="button"
        className="arg-google-btn"
        onClick={handleGoogleLogin}
        disabled={googleBusy || busy}
      >
        {googleBusy ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <GoogleIcon />
        )}
        <span>{googleBusy ? 'Connecting to Google...' : 'Continue with Google'}</span>
      </button>

      {/* Clean Samvaad Divider */}
      <div className="arg-auth-divider">
        <span>or continue with email</span>
      </div>

      <form className="arg-auth-form" onSubmit={handleSubmit}>
        {tab === 'signup' && (
          <div className="arg-input-group">
            <label htmlFor="auth-name">Full Name</label>
            <div className="arg-input-wrap">
              <User size={16} className="arg-input-icon" />
              <input
                id="auth-name"
                type="text"
                placeholder="Anuj Kesharwani"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                disabled={busy || googleBusy}
              />
            </div>
          </div>
        )}

        <div className="arg-input-group">
          <label htmlFor="auth-email">Email Address</label>
          <div className="arg-input-wrap">
            <Mail size={16} className="arg-input-icon" />
            <input
              id="auth-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={busy || googleBusy}
            />
          </div>
        </div>

        <div className="arg-input-group">
          <div className="arg-input-label-row">
            <label htmlFor="auth-password">Password</label>
            {tab === 'signup' && (
              <span className="arg-input-hint">Min 6 characters</span>
            )}
          </div>
          <div className="arg-input-wrap">
            <Lock size={16} className="arg-input-icon" />
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              required
              disabled={busy || googleBusy}
            />
            <button
              type="button"
              className="arg-input-action"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {tab === 'signup' && (
          <div className="arg-input-group">
            <label htmlFor="auth-confirm-password">Confirm Password</label>
            <div className="arg-input-wrap">
              <Lock size={16} className="arg-input-icon" />
              <input
                id="auth-confirm-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={busy || googleBusy}
              />
            </div>
          </div>
        )}

        <button type="submit" className="arg-auth-submit" disabled={busy || googleBusy}>
          {busy ? (
            <>
              <LoaderCircle size={16} className="spin" />
              <span>Authenticating...</span>
            </>
          ) : (
            <>
              <span>{tab === 'login' ? 'Sign In →' : 'Create Account →'}</span>
            </>
          )}
        </button>
      </form>

      <div className="arg-auth-footer">
        {onDemo && (
          <div className="arg-auth-guest-section">
            <span className="arg-auth-guest-heading">OR EXPLORE AS GUEST:</span>
            <div className="arg-auth-guest-grid">
              <button
                type="button"
                className="arg-auth-guest-btn"
                onClick={() => {
                  if (!embedded) onClose?.()
                  onDemo?.('titanic')
                }}
                title="Explore Titanic Survival benchmark dataset"
              >
                <Zap size={13} color="#f97316" />
                <span>Titanic Demo</span>
              </button>
              <button
                type="button"
                className="arg-auth-guest-btn"
                onClick={() => {
                  if (!embedded) onClose?.()
                  onDemo?.('bikeshare')
                }}
                title="Explore Capital Bike Share benchmark dataset"
              >
                <Zap size={13} color="#38bdf8" />
                <span>Bike Share Demo</span>
              </button>
              <button
                type="button"
                className="arg-auth-guest-btn"
                onClick={() => {
                  if (!embedded) onClose?.()
                  onDemo?.('churn')
                }}
                title="Explore Customer Churn benchmark dataset"
              >
                <Zap size={13} color="#10b981" />
                <span>Churn Demo</span>
              </button>
            </div>
          </div>
        )}
        <p className="arg-auth-disclaimer">
          Secured with Firebase Authentication. Your datasets remain 100% private.
        </p>
      </div>
    </div>
  )

  if (embedded) {
    return <div className="arg-auth-embedded-wrap">{content}</div>
  }

  return (
    <div className="arg-auth-overlay" onClick={onClose}>
      <div className="arg-auth-modal" onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  )
}
