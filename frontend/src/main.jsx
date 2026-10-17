import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './theme.css'
import './styles.css'
/* Last, deliberately: it carries the landing explainer styles and the fit
   corrections that have to win against the `!important` layer in theme.css. */
import './explainers.css'
/* Absolute last: Samvaad-reference perfect-fit overrides (snap rhythm,
   mobile chrome, workspace alignment). Wins over everything above. */
import './perfect-fit.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Argus App Crash Caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#090e1a',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: 24,
          textAlign: 'center'
        }}>
          <h2 style={{ fontSize: 24, marginBottom: 8, color: '#f97316' }}>Argus encountered an unexpected error</h2>
          <p style={{ color: '#94a3b8', maxWidth: 480, fontSize: 14, marginBottom: 20 }}>
            {this.state.error?.message || 'An error occurred while rendering the page.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              borderRadius: 999,
              background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
