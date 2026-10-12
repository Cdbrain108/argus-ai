import { useState } from 'react'
import { Star, X, CheckCircle2, LoaderCircle } from 'lucide-react'
import * as api from '../api'

const LABELS = ['', 'Needs Improvement', 'Fair', 'Good', 'Great', 'Exceptional!']

export default function RatingModal({ isOpen, onClose, onRated, user }) {
  const [stars, setStars] = useState(5)
  const [hovered, setHovered] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.submitRating({ stars, feedback })
      setDone(true)
      onRated?.()
      setTimeout(() => {
        setDone(false)
        onClose?.()
      }, 1200)
    } catch (err) {
      setError(err.message || 'Could not save rating to MongoDB')
    } finally {
      setBusy(false)
    }
  }

  const activeStars = hovered || stars

  return (
    <div className="arg-auth-overlay" onClick={onClose}>
      <div className="arg-rating-modal" onClick={(e) => e.stopPropagation()}>
        <button className="arg-auth-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <div className="arg-rating-header">
          <div className="arg-rating-icon-wrap">
            <Star size={26} fill="#F97316" color="#F97316" />
          </div>
          <h3>Rate your ARGUS Experience</h3>
          <p>Your feedback is saved directly to our MongoDB Atlas cloud database.</p>
        </div>

        {done ? (
          <div className="arg-rating-success">
            <CheckCircle2 size={32} color="#1D9E75" />
            <h4>Thank you for your rating!</h4>
            <p>Your feedback helps us continuously improve Argus.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="arg-rating-form">
            {error && <div className="arg-auth-alert error">{error}</div>}

            <div className="arg-star-selector">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  type="button"
                  key={num}
                  className={`arg-star-btn ${num <= activeStars ? 'filled' : ''}`}
                  onMouseEnter={() => setHovered(num)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setStars(num)}
                  aria-label={`${num} stars`}
                >
                  <Star
                    size={32}
                    fill={num <= activeStars ? '#F97316' : 'transparent'}
                    color={num <= activeStars ? '#F97316' : '#6b7280'}
                  />
                </button>
              ))}
            </div>

            <div className="arg-star-label">{LABELS[activeStars] || ''}</div>

            <div className="arg-input-group" style={{ marginTop: 14 }}>
              <label htmlFor="rating-feedback">Feedback or Feature Request (Optional)</label>
              <textarea
                id="rating-feedback"
                className="arg-textarea"
                rows={3}
                placeholder="What did you like? What analyses would you like added?"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                disabled={busy}
              />
            </div>

            <button type="submit" className="arg-auth-submit" disabled={busy}>
              {busy ? (
                <>
                  <LoaderCircle size={16} className="spin" />
                  <span>Saving to MongoDB...</span>
                </>
              ) : (
                <span>Submit Rating →</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
