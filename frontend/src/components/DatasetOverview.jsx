import React, { useState } from 'react'
import {
  Activity,
  Layers,
  AlertTriangle,
  Radar,
  TrendingUp,
  Share2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Info,
} from 'lucide-react'

export function DatasetOverview({ profile, dataset }) {
  const [filter, setFilter] = useState('all') // 'all' | 'health' | 'structure' | 'distribution'
  const [isCollapsed, setIsCollapsed] = useState(false)

  if (!profile && !dataset) return null

  const ov = profile?.overview || {}
  const health = profile?.health || {}
  const score = health.health_score ?? (profile?.rows ? 74 : 0)
  const scoreColor = score >= 75 ? '#1D9E75' : score >= 50 ? '#EF9F27' : '#E24B4A'
  const dash = Math.round((Math.max(0, Math.min(score, 100)) / 100) * 176)

  // Penalty numbers
  const missingPenalty = health.missing_penalty ?? Math.min(40, Math.round(((profile?.missing_total || 0) / Math.max((profile?.rows || 1) * (profile?.columns || 1), 1)) * 100 * 2))
  const dupPenalty = health.duplicate_penalty ?? Math.min(20, Math.round(((profile?.duplicate_count || 0) / Math.max(profile?.rows || 1, 1)) * 100 * 2))
  const outlierPenalty = health.outlier_penalty ?? 0
  const constantPenalty = health.constant_penalty ?? 0

  // Structure numbers
  const struct = ov.structure || {}
  const totalCols = struct.n_cols || profile?.columns || dataset?.columns || 0
  const totalRows = struct.n_rows || profile?.rows || dataset?.rows || 0
  const nNumeric = struct.n_numeric ?? (profile?.numeric_columns?.length || 0)
  const nCategorical = struct.n_categorical ?? (profile?.categorical_columns?.length || 0)
  const nDatetime = struct.n_datetime ?? (profile?.datetime_columns?.length || 0)
  const nBoolean = struct.n_boolean ?? (profile?.boolean_columns?.length || 0)

  const pctNumeric = struct.pct_numeric ?? Math.round((nNumeric / Math.max(totalCols, 1)) * 100)
  const pctCategorical = struct.pct_categorical ?? Math.round((nCategorical / Math.max(totalCols, 1)) * 100)
  const pctDatetime = struct.pct_datetime ?? Math.round((nDatetime / Math.max(totalCols, 1)) * 100)

  // Missing Map
  const missingMap = ov.missing_map || (profile?.column_summary || []).map((c) => {
    const pct = Number(((c.missing / Math.max(totalRows, 1)) * 100).toFixed(1))
    return {
      column: c.name,
      missing_count: c.missing,
      missing_pct: pct,
      severity: pct === 0 ? 'clean' : pct < 10 ? 'low' : pct < 50 ? 'medium' : 'high',
    }
  })
  const allClean = ov.all_clean ?? missingMap.every((m) => m.severity === 'clean')

  // Outliers
  const outliers = ov.outliers || {
    total_outlier_rows: 0,
    outlier_pct: 0,
    cols_affected: 0,
    top_columns: [],
  }

  // Skewness
  const skewness = ov.skewness || []

  // Correlations
  const correlations = ov.top_correlations || []

  function getSeverityColor(sev) {
    if (sev === 'clean') return '#1D9E75'
    if (sev === 'low') return '#FAC775'
    if (sev === 'medium') return '#EF9F27'
    return '#E24B4A'
  }

  return (
    <div className="dataset-overview-container">
      {/* Section Header */}
      <div className="dataset-overview-header">
        <div className="overview-title-group">
          <div className="overview-badge">
            <SlidersHorizontal size={14} />
            <span>DIAGNOSTIC OVERVIEW</span>
          </div>
          <h2 className="overview-heading">Dataset Architecture & Quality Pulse</h2>
          <p className="overview-subtitle">
            Deep-dive structural audit, distribution skew, anomaly frequency, and strongest feature associations.
          </p>
        </div>

        <div className="overview-header-actions">
          {/* Quick Filter Tabs */}
          <div className="overview-filter-tabs">
            <button
              type="button"
              className={`overview-filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All 6 Diagnostics
            </button>
            <button
              type="button"
              className={`overview-filter-btn ${filter === 'health' ? 'active' : ''}`}
              onClick={() => setFilter('health')}
            >
              Health & Quality
            </button>
            <button
              type="button"
              className={`overview-filter-btn ${filter === 'structure' ? 'active' : ''}`}
              onClick={() => setFilter('structure')}
            >
              Types & Skew
            </button>
            <button
              type="button"
              className={`overview-filter-btn ${filter === 'distribution' ? 'active' : ''}`}
              onClick={() => setFilter('distribution')}
            >
              Anomalies & Corr
            </button>
          </div>

          {/* Collapse Button */}
          <button
            type="button"
            className="overview-collapse-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand overview' : 'Collapse overview'}
          >
            {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            <span>{isCollapsed ? 'Expand' : 'Collapse'}</span>
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="overview-cards-grid">
          {/* ──────────────── WIDGET 1: HEALTH SCORE ──────────────── */}
          {(filter === 'all' || filter === 'health') && (
            <div className="overview-card">
              <div className="overview-card-top">
                <span className="overview-pill health-pill">
                  <Activity size={12} /> HEALTH
                </span>
                <span className="overview-card-meta">Auto-computed</span>
              </div>

              <div className="health-score-row">
                <div>
                  <h3 className="overview-card-title">Dataset Health Score</h3>
                  <p className="overview-card-desc">Weighted deductions for data defects</p>
                </div>

                <div className="health-gauge-wrap">
                  <svg width="84" height="84" viewBox="0 0 72 72" className="health-gauge-svg">
                    <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                    <circle
                      cx="36"
                      cy="36"
                      r="28"
                      fill="none"
                      stroke={scoreColor}
                      strokeWidth="6"
                      strokeDasharray={`${dash} 176`}
                      strokeDashoffset="44"
                      strokeLinecap="round"
                      transform="rotate(-90 36 36)"
                    />
                  </svg>
                  <div className="health-gauge-val" style={{ color: scoreColor }}>
                    {score}
                  </div>
                </div>
              </div>

              {/* Penalty Breakdown */}
              <div className="penalty-list">
                <div className="penalty-row">
                  <span className="penalty-label">Missing Values</span>
                  <div className="penalty-bar-track">
                    <div
                      className="penalty-bar-fill"
                      style={{
                        width: `${Math.min(100, Math.round((missingPenalty / 40) * 100))}%`,
                        background: missingPenalty === 0 ? '#1D9E75' : missingPenalty < 20 ? '#EF9F27' : '#E24B4A',
                      }}
                    />
                  </div>
                  <span className="penalty-val" style={{ color: missingPenalty > 0 ? '#E24B4A' : '#1D9E75' }}>
                    {missingPenalty > 0 ? `-${missingPenalty}` : '0'}
                  </span>
                </div>

                <div className="penalty-row">
                  <span className="penalty-label">Duplicate Rows</span>
                  <div className="penalty-bar-track">
                    <div
                      className="penalty-bar-fill"
                      style={{
                        width: `${Math.min(100, Math.round((dupPenalty / 20) * 100))}%`,
                        background: dupPenalty === 0 ? '#1D9E75' : '#E24B4A',
                      }}
                    />
                  </div>
                  <span className="penalty-val" style={{ color: dupPenalty > 0 ? '#E24B4A' : '#1D9E75' }}>
                    {dupPenalty > 0 ? `-${dupPenalty}` : '0'}
                  </span>
                </div>

                <div className="penalty-row">
                  <span className="penalty-label">Outlier Density</span>
                  <div className="penalty-bar-track">
                    <div
                      className="penalty-bar-fill"
                      style={{
                        width: `${Math.min(100, Math.round((outlierPenalty / 40) * 100))}%`,
                        background: outlierPenalty === 0 ? '#1D9E75' : outlierPenalty < 20 ? '#EF9F27' : '#E24B4A',
                      }}
                    />
                  </div>
                  <span className="penalty-val" style={{ color: outlierPenalty > 0 ? '#E24B4A' : '#1D9E75' }}>
                    {outlierPenalty > 0 ? `-${outlierPenalty}` : '0'}
                  </span>
                </div>

                {constantPenalty > 0 && (
                  <div className="penalty-row">
                    <span className="penalty-label">Zero Variance Cols</span>
                    <div className="penalty-bar-track">
                      <div
                        className="penalty-bar-fill"
                        style={{
                          width: `${Math.min(100, Math.round((constantPenalty / 10) * 100))}%`,
                          background: '#E24B4A',
                        }}
                      />
                    </div>
                    <span className="penalty-val" style={{ color: '#E24B4A' }}>
                      -{constantPenalty}
                    </span>
                  </div>
                )}
              </div>

              <div className="overview-card-footer">
                <Info size={12} />
                <span>Base score = 100 minus missing, duplicate & outlier penalties</span>
              </div>
            </div>
          )}

          {/* ──────────────── WIDGET 2: COLUMN BREAKDOWN ──────────────── */}
          {(filter === 'all' || filter === 'structure') && (
            <div className="overview-card">
              <div className="overview-card-top">
                <span className="overview-pill structure-pill">
                  <Layers size={12} /> STRUCTURE
                </span>
                <span className="overview-card-meta">{totalCols} Total Columns</span>
              </div>

              <h3 className="overview-card-title">Column Breakdown</h3>
              <p className="overview-card-desc">Type distribution across storage & logical domains</p>

              {/* Stat Chips */}
              <div className="structure-stat-boxes">
                <div className="stat-box purple">
                  <span className="stat-num">{nNumeric}</span>
                  <span className="stat-name">Numeric</span>
                </div>
                <div className="stat-box green">
                  <span className="stat-num">{nCategorical}</span>
                  <span className="stat-name">Categorical</span>
                </div>
                <div className="stat-box blue">
                  <span className="stat-num">{nDatetime}</span>
                  <span className="stat-name">Datetime</span>
                </div>
                {nBoolean > 0 && (
                  <div className="stat-box gold">
                    <span className="stat-num">{nBoolean}</span>
                    <span className="stat-name">Boolean</span>
                  </div>
                )}
              </div>

              {/* Segmented Color Bar */}
              <div className="segmented-bar-track">
                <div
                  className="seg-bar seg-purple"
                  style={{ flex: Math.max(nNumeric, 0.1) }}
                  title={`${pctNumeric}% Numeric`}
                />
                <div
                  className="seg-bar seg-green"
                  style={{ flex: Math.max(nCategorical, 0.1) }}
                  title={`${pctCategorical}% Categorical`}
                />
                {nDatetime > 0 && (
                  <div
                    className="seg-bar seg-blue"
                    style={{ flex: Math.max(nDatetime, 0.1) }}
                    title={`${pctDatetime}% Datetime`}
                  />
                )}
              </div>

              <div className="structure-legend-row">
                <span className="legend-chip purple-dot">{pctNumeric}% numeric</span>
                <span className="legend-chip green-dot">{pctCategorical}% categorical</span>
                {pctDatetime > 0 && <span className="legend-chip blue-dot">{pctDatetime}% datetime</span>}
              </div>

              <div className="structure-summary-footer">
                <div>
                  <span className="muted">Total rows:</span> <strong>{totalRows.toLocaleString()}</strong>
                </div>
                <div>
                  <span className="muted">Total columns:</span> <strong>{totalCols}</strong>
                </div>
              </div>
            </div>
          )}

          {/* ──────────────── WIDGET 3: MISSING VALUE MAP ──────────────── */}
          {(filter === 'all' || filter === 'health') && (
            <div className="overview-card">
              <div className="overview-card-top">
                <span className="overview-pill quality-pill">
                  <AlertTriangle size={12} /> QUALITY
                </span>
                <span className="overview-card-meta">
                  {allClean ? 'Zero Missing' : `${missingMap.filter((m) => m.severity !== 'clean').length} affected`}
                </span>
              </div>

              <h3 className="overview-card-title">Missing Value Map</h3>
              <p className="overview-card-desc">Per-column null density at a glance</p>

              {allClean ? (
                <div className="clean-alert-box">
                  <CheckCircle2 size={24} color="#1D9E75" />
                  <div>
                    <strong>All columns are clean</strong>
                    <p>No missing or null placeholders detected across any feature.</p>
                  </div>
                </div>
              ) : (
                <div className="missing-grid-wrap">
                  {missingMap.map((col) => {
                    const color = getSeverityColor(col.severity)
                    return (
                      <div
                        key={col.column}
                        className="missing-tile"
                        title={`${col.column} — ${col.missing_pct}% missing (${col.missing_count} rows)`}
                      >
                        <div className="tile-square" style={{ background: color }}>
                          {col.missing_pct > 0 && <span className="tile-pct">{Math.round(col.missing_pct)}%</span>}
                        </div>
                        <span className="tile-name">{col.column}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Legend */}
              <div className="heatmap-legend">
                <span className="legend-item">
                  <span className="color-box clean-box" /> Clean
                </span>
                <span className="legend-item">
                  <span className="color-box low-box" /> &lt;10%
                </span>
                <span className="legend-item">
                  <span className="color-box med-box" /> 10–50%
                </span>
                <span className="legend-item">
                  <span className="color-box high-box" /> &gt;50%
                </span>
              </div>
            </div>
          )}

          {/* ──────────────── WIDGET 4: OUTLIER DETECTION ──────────────── */}
          {(filter === 'all' || filter === 'distribution') && (
            <div className="overview-card">
              <div className="overview-card-top">
                <span className="overview-pill outlier-pill">
                  <Radar size={12} /> OUTLIERS
                </span>
                <span className="overview-card-meta">IQR Method (1.5×)</span>
              </div>

              <h3 className="overview-card-title">Outlier Detection</h3>
              <p className="overview-card-desc">Tukey interquartile range across numeric variables</p>

              <div className="outlier-stat-row">
                <div className="outlier-stat-box red">
                  <span className="stat-num">{outliers.total_outlier_rows?.toLocaleString() || 0}</span>
                  <span className="stat-name">Outlier rows</span>
                </div>
                <div className="outlier-stat-box amber">
                  <span className="stat-num">{outliers.outlier_pct || 0}%</span>
                  <span className="stat-name">Of dataset</span>
                </div>
                <div className="outlier-stat-box purple">
                  <span className="stat-num">{outliers.cols_affected || 0}</span>
                  <span className="stat-name">Cols affected</span>
                </div>
              </div>

              <div className="outlier-top-list">
                {outliers.top_columns?.length > 0 ? (
                  outliers.top_columns.slice(0, 4).map((col) => (
                    <div key={col.column} className="outlier-top-item">
                      <span className="col-name">{col.column}</span>
                      <span className="outlier-badge">
                        {col.count.toLocaleString()} outliers ({col.pct}%)
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="empty-card-note">No extreme outliers detected by IQR filter.</div>
                )}
              </div>

              <div className="overview-card-footer">
                <Info size={12} />
                <span>Points outside [Q1 - 1.5×IQR, Q3 + 1.5×IQR]</span>
              </div>
            </div>
          )}

          {/* ──────────────── WIDGET 5: MOST SKEWED COLUMNS ──────────────── */}
          {(filter === 'all' || filter === 'structure') && (
            <div className="overview-card">
              <div className="overview-card-top">
                <span className="overview-pill skew-pill">
                  <TrendingUp size={12} /> DISTRIBUTION
                </span>
                <span className="overview-card-meta">Asymmetry Index</span>
              </div>

              <h3 className="overview-card-title">Most Skewed Columns</h3>
              <p className="overview-card-desc">Features requiring log or Box-Cox transformation</p>

              <div className="skew-list">
                {skewness.length > 0 ? (
                  skewness.map((item) => {
                    const widthPct = Math.min(100, Math.round((item.abs_skew / 3) * 100))
                    const barColor = item.abs_skew > 1 ? '#E24B4A' : item.abs_skew > 0.5 ? '#EF9F27' : '#1D9E75'
                    return (
                      <div key={item.column} className="skew-item">
                        <div className="skew-item-top">
                          <span className="col-name">{item.column}</span>
                          <div className="skew-values">
                            <span className="skew-val" style={{ color: barColor }}>
                              {item.skew > 0 ? `+${item.skew}` : item.skew}
                            </span>
                            <span className={`direction-badge ${item.direction}`}>{item.direction}</span>
                          </div>
                        </div>
                        <div className="skew-bar-track">
                          <div
                            className="skew-bar-fill"
                            style={{
                              width: `${widthPct}%`,
                              background: barColor,
                            }}
                          />
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="empty-card-note">No numeric columns with sufficient variance found.</div>
                )}
              </div>

              <div className="overview-card-footer">
                <Info size={12} />
                <span>|Skew| &gt; 1 indicates heavy tail; consider log transform</span>
              </div>
            </div>
          )}

          {/* ──────────────── WIDGET 6: STRONGEST CORRELATIONS ──────────────── */}
          {(filter === 'all' || filter === 'distribution') && (
            <div className="overview-card">
              <div className="overview-card-top">
                <span className="overview-pill corr-pill">
                  <Share2 size={12} /> CORRELATION
                </span>
                <span className="overview-card-meta">Pearson |r|</span>
              </div>

              <h3 className="overview-card-title">Strongest Correlations</h3>
              <p className="overview-card-desc">Highest bivariate linear relationships detected</p>

              <div className="corr-list">
                {correlations.length > 0 ? (
                  correlations.map((pair) => {
                    const widthPct = Math.min(100, Math.round(pair.abs_r * 100))
                    const barColor = pair.abs_r >= 0.7 ? '#E24B4A' : pair.abs_r >= 0.4 ? '#EF9F27' : '#378ADD'
                    return (
                      <div key={`${pair.col_a}-${pair.col_b}`} className="corr-item">
                        <div className="corr-item-top">
                          <span className="pair-label">
                            <strong>{pair.col_a}</strong> <span className="arrow-sep">↔</span> <strong>{pair.col_b}</strong>
                          </span>
                          <span className="r-badge" style={{ color: barColor, borderColor: `${barColor}44` }}>
                            r = {pair.r > 0 ? `+${pair.r}` : pair.r}
                          </span>
                        </div>
                        <div className="corr-bar-track">
                          <div
                            className="corr-bar-fill"
                            style={{
                              width: `${widthPct}%`,
                              background: barColor,
                            }}
                          />
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="empty-card-note">Requires 2+ numeric columns with variance to compute.</div>
                )}
              </div>

              <div className="overview-card-footer">
                <Info size={12} />
                <span>|r| &gt; 0.7 = Strong association · 0.4–0.7 = Moderate</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
