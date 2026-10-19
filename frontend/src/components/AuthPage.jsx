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
  ArrowRight,
  ArrowLeft,
  Zap,
  ShieldCheck,
  Database,
  Terminal,
} from 'lucide-react'
import * as api from '../api'
import { signInWithGoogle, loginWithEmail, registerWithEmail } from '../services/firebase'
import { GoogleIcon } from './AuthModal'

export default function AuthPage({
  initialTab = 'login',
  onSuccess,
  onDemo,
  onHome,
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
  }, [initialTab])

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

      if (tab === 'login') {
        const fbRes = await loginWithEmail(cleanEmail, password)
        if (fbRes.error && !fbRes.user) {
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
        }, 500)
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your credentials.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="arg-standalone-auth-page">
      {/* Background ambient glow effect */}
      <div className="auth-ambient-glow auth-glow-one" aria-hidden="true" />
      <div className="auth-ambient-glow auth-glow-two" aria-hidden="true" />

      {/* Top Navigation Bar */}
      <header className="standalone-auth-header">
        <div className="standalone-auth-nav-inner">
          <button
            type="button"
            className="auth-back-btn"
            onClick={onHome}
            aria-label="Return to Landing Page"
          >
            <ArrowLeft size={16} />
            <span>Back to Home</span>
          </button>

          <div className="auth-brand-center" onClick={onHome} style={{ cursor: 'pointer' }}>
            <img className="auth-brand-logo" src="/argus_logo.png" alt="Argus" />
            <div className="auth-brand-text">
              <span className="auth-brand-title">Argus</span>
              <span className="auth-brand-sub">AI DATA ANALYST</span>
            </div>
          </div>

          <div className="auth-header-right">
            <button
              type="button"
              className="auth-demo-shortcut-btn"
              onClick={onDemo}
              title="Launch workspace immediately with Titanic demo data"
            >
              <Zap size={13} color="#EF9F27" />
              <span>Continue as Guest</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Authentication Container */}
      <main className="standalone-auth-main">
        <div className="standalone-auth-shell">
          {/* Left Context Strip */}
          <div className="auth-value-side">
            <div className="auth-pill-badge">
              <Sparkles size={12} />
              <span>DEDICATED ANALYTICAL WORKSPACE</span>
            </div>

            <h1 className="auth-value-h1">
              Automated Exploratory Data Analysis &amp; Grounded AI Intelligence
            </h1>

            <p className="auth-value-desc">
              Sign in with Firebase or Google to access your dataset sessions, export publication-grade reports, and query your data in plain English.
            </p>

            <div className="auth-feature-list">
              <div className="auth-feat-item">
                <div className="auth-feat-icon" style={{ color: '#1D9E75' }}>
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <strong>Deterministic Local Computing</strong>
                  <span>Calculations run strictly in Python with zero hallucination.</span>
                </div>
              </div>

              <div className="auth-feat-item">
                <div className="auth-feat-icon" style={{ color: '#38BDF8' }}>
                  <Database size={18} />
                </div>
                <div>
                  <strong>Zero Cloud Data Persistence</strong>
                  <span>Your raw dataset never leaves ephemeral session memory.</span>
                </div>
              </div>

              <div className="auth-feat-item">
                <div className="auth-feat-icon" style={{ color: '#EF9F27' }}>
                  <Terminal size={18} />
                </div>
                <div>
                  <strong>AST Syntax Gated Execution</strong>
                  <span>Code runs inside isolated, verifiable local Python sandboxes.</span>
                </div>
              </div>
            </div>

            <div className="auth-guest-prompt">
              <span>Just testing things out?</span>
              <button type="button" className="guest-quick-link" onClick={onDemo}>
                ⚡ Launch Instant Guest Demo &rarr;
              </button>
            </div>
          </div>

          {/* Right Auth Card Form */}
          <div className="auth-form-card">
            {/* Tab Switcher */}
            <div className="auth-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'login'}
                className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
                onClick={() => handleTabChange('login')}
              >
                <KeyRound size={14} />
                <span>Sign In</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'signup'}
                className={`auth-tab ${tab === 'signup' ? 'active' : ''}`}
                onClick={() => handleTabChange('signup')}
              >
                <User size={14} />
                <span>Create Account</span>
              </button>
            </div>

            {/* Status alerts */}
            {error && (
              <div className="auth-alert error" role="alert">
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="auth-alert success" role="status">
                <CheckCircle2 size={15} />
                <span>{success}</span>
              </div>
            )}

            {/* Google 1-Click Sign-In Button */}
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

            {/* Divider */}
            <div className="arg-auth-divider">
              <span>or continue with email</span>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="auth-form-element">
              {tab === 'signup' && (
                <div className="auth-field">
                  <label htmlFor="auth-name-input">Full Name</label>
                  <div className="auth-input-wrapper">
                    <User size={15} className="auth-input-icon" />
                    <input
                      id="auth-name-input"
                      type="text"
                      placeholder="e.g. Anuj Kesharwani"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={busy || googleBusy}
                      autoComplete="name"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="auth-field">
                <label htmlFor="auth-email-input">Email Address</label>
                <div className="auth-input-wrapper">
                  <Mail size={15} className="auth-input-icon" />
                  <input
                    id="auth-email-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy || googleBusy}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="auth-field">
                <div className="auth-label-row">
                  <label htmlFor="auth-password-input">Password</label>
                  {tab === 'signup' && <span className="auth-hint">Min 6 characters</span>}
                </div>
                <div className="auth-input-wrapper">
                  <Lock size={15} className="auth-input-icon" />
                  <input
                    id="auth-password-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy || googleBusy}
                    autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                    required
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {tab === 'signup' && (
                <div className="auth-field">
                  <label htmlFor="auth-confirm-password-input">Confirm Password</label>
                  <div className="auth-input-wrapper">
                    <Lock size={15} className="auth-input-icon" />
                    <input
                      id="auth-confirm-password-input"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={busy || googleBusy}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={busy || googleBusy}
              >
                {busy ? (
                  <>
                    <LoaderCircle size={16} className="spin" />
                    <span>{tab === 'login' ? 'Signing In...' : 'Creating Account...'}</span>
                  </>
                ) : (
                  <>
                    <span>{tab === 'login' ? 'Sign In to Workspace' : 'Create Account'}</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>

              <div className="auth-divider">
                <span>OR</span>
              </div>

              <div className="auth-guest-section">
                <span className="auth-guest-heading">OR EXPLORE PRACTICE DATASETS AS GUEST:</span>
                <div className="auth-guest-grid">
                  <button
                    type="button"
                    className="auth-guest-pill-btn"
                    onClick={() => onDemo?.('titanic')}
                    disabled={busy || googleBusy}
                    title="Load Titanic Survival Demo"
                  >
                    <Zap size={13} color="#f97316" />
                    <span>Titanic Demo</span>
                  </button>
                  <button
                    type="button"
                    className="auth-guest-pill-btn"
                    onClick={() => onDemo?.('bikeshare')}
                    disabled={busy || googleBusy}
                    title="Load Capital Bike Share Demo"
                  >
                    <Zap size={13} color="#38bdf8" />
                    <span>Bike Share Demo</span>
                  </button>
                  <button
                    type="button"
                    className="auth-guest-pill-btn"
                    onClick={() => onDemo?.('churn')}
                    disabled={busy || googleBusy}
                    title="Load Customer Churn Demo"
                  >
                    <Zap size={13} color="#10b981" />
                    <span>Churn Demo</span>
                  </button>
                </div>
              </div>
            </form>

            <div className="auth-card-footer">
              <span className="auth-security-note">
                🔒 Secured with Firebase Authentication.
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
