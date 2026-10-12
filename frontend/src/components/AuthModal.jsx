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
  Database,
  ArrowRight,
} from 'lucide-react'
import * as api from '../api'

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
      let res
      if (tab === 'login') {
        res = await api.login({ email: cleanEmail, password })
        setSuccess(`Welcome back, ${res.user?.name || 'Analyst'}!`)
      } else {
        res = await api.signup({ name: cleanName, email: cleanEmail, password })
        setSuccess(`Welcome aboard, ${cleanName}! 🎉`)
      }

      if (res?.token && res?.user) {
        api.setAuthToken(res.token)
        api.setStoredUser(res.user)
        setTimeout(() => {
          onSuccess?.(res.user)
          if (!embedded) onClose?.()
        }, 600)
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your credentials.')
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
          <Database size={13} />
          <span>MongoDB Atlas Auth</span>
        </div>
        <h2>{tab === 'login' ? 'Login to Argus' : 'Create an Account'}</h2>
        <p>
          {tab === 'login'
            ? 'Access your saved datasets, analysis history, and AI insights'
            : 'Get instant, automated exploratory data analysis with AI'}
        </p>
      </div>

      <div className="arg-auth-tabs">
        <button
          type="button"
          className={`arg-auth-tab ${tab === 'login' ? 'active' : ''}`}
          onClick={() => handleTabChange('login')}
        >
          <KeyRound size={15} /> Login
        </button>
        <button
          type="button"
          className={`arg-auth-tab ${tab === 'signup' ? 'active' : ''}`}
          onClick={() => handleTabChange('signup')}
        >
          <Sparkles size={15} /> Create Account
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
                disabled={busy}
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
              disabled={busy}
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
              disabled={busy}
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
                disabled={busy}
              />
            </div>
          </div>
        )}

        <button type="submit" className="arg-auth-submit" disabled={busy}>
          {busy ? (
            <>
              <LoaderCircle size={16} className="spin" />
              <span>Connecting to MongoDB...</span>
            </>
          ) : (
            <>
              <span>{tab === 'login' ? 'Login →' : 'Create Account →'}</span>
            </>
          )}
        </button>
      </form>

      <div className="arg-auth-footer">
        {onDemo && (
          <button
            type="button"
            className="arg-auth-guest-btn"
            onClick={() => {
              if (!embedded) onClose?.()
              onDemo?.()
            }}
          >
            ⚡ Or continue as Guest with Live Demo <ArrowRight size={14} />
          </button>
        )}
        <p className="arg-auth-disclaimer">
          Passwords are SHA-256 hashed and stored securely in MongoDB Atlas.
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
