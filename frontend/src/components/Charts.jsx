import React, { useId, useState } from 'react'
import { BarChart3, Radar, Sparkles } from 'lucide-react'
import AiNarrative from './AiNarrative'

// ── Scatter Plot with OLS Trendline, Categorical Hue & Tooltip ──────────────
export function ScatterPlot({ data }) {
  const [hovered, setHovered] = useState(null)
  const xVals = data?.x || []
  const yVals = data?.y || []
  const categories = data?.categories || data?.hue || []
  const hueLabel = data?.hueLabel || 'Category'
  const xLabel = data?.xLabel || 'X'
  const yLabel = data?.yLabel || 'Y'
  const trend = data?.trend

  if (!xVals.length || !yVals.length) {
    return <div className="chart-empty">No numerical coordinates available for scatter plot.</div>
  }

  const validPairs = []
  for (let i = 0; i < Math.min(xVals.length, yVals.length); i++) {
    const xv = Number(xVals[i])
    const yv = Number(yVals[i])
    const cat = categories[i] !== undefined ? String(categories[i]) : null
    if (!isNaN(xv) && !isNaN(yv)) {
      validPairs.push([xv, yv, cat])
    }
  }

  if (validPairs.length === 0) {
    return <div className="chart-empty">Insufficient numerical pairs for scatter plot.</div>
  }

  // Color mapping if categories exist
  const distinctCats = Array.from(new Set(validPairs.map((p) => p[2]).filter(Boolean)))
  const palette = ['#10b981', '#f43f5e', '#38bdf8', '#f59e0b', '#a855f7', '#ec4899']
  const catColorMap = {}
  distinctCats.forEach((c, idx) => {
    const cLow = c.toLowerCase()
    if (cLow.includes('surviv') && !cLow.includes('not') && !cLow.includes('perish')) catColorMap[c] = '#10b981'
    else if (cLow.includes('perish') || cLow.includes('died') || cLow.includes('not') || c === '0') catColorMap[c] = '#f43f5e'
    else catColorMap[c] = palette[idx % palette.length]
  })

  const xNums = validPairs.map((p) => p[0])
  const yNums = validPairs.map((p) => p[1])

  let minX = Math.min(...xNums)
  let maxX = Math.max(...xNums)
  let minY = Math.min(...yNums)
  let maxY = Math.max(...yNums)

  const padX = (maxX - minX) * 0.08 || 1
  const padY = (maxY - minY) * 0.08 || 1
  minX -= padX
  maxX += padX
  minY -= padY
  maxY += padY

  const width = 560
  const height = 260
  const mLeft = 52
  const mRight = 20
  const mTop = 24
  const mBottom = 42

  const plotW = width - mLeft - mRight
  const plotH = height - mTop - mBottom

  const getX = (v) => mLeft + ((v - minX) / (maxX - minX || 1)) * plotW
  const getY = (v) => mTop + plotH - ((v - minY) / (maxY - minY || 1)) * plotH

  // Generate 4 nice ticks
  const xTicks = [0, 0.33, 0.66, 1].map((pct) => minX + pct * (maxX - minX))
  const yTicks = [0, 0.33, 0.66, 1].map((pct) => minY + pct * (maxY - minY))

  // Trendline endpoints
  let trendP1 = null
  let trendP2 = null
  if (trend && typeof trend.slope === 'number' && typeof trend.intercept === 'number') {
    const y1 = trend.slope * minX + trend.intercept
    const y2 = trend.slope * maxX + trend.intercept
    trendP1 = { x: getX(minX), y: getY(y1) }
    trendP2 = { x: getX(maxX), y: getY(y2) }
  }

  return (
    <div className="argus-chart-card">
      <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="chart-title">{xLabel} vs. {yLabel}</span>
          {trend && <span className="chart-meta">Slope: {trend.slope.toFixed(3)} · Intercept: {trend.intercept.toFixed(2)}</span>}
        </div>
        {distinctCats.length > 0 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
            <span style={{ fontWeight: 600 }}>{hueLabel}:</span>
            {distinctCats.map((cat, idx) => (
              <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: catColorMap[cat] }} />
                <span>{cat}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="svg-container">
        <svg viewBox={`0 0 ${width} ${height}`} className="argus-svg">
          {/* Background grid */}
          <rect x={mLeft} y={mTop} width={plotW} height={plotH} fill="#141926" rx="6" />

          {/* Grid lines */}
          {yTicks.map((val, idx) => (
            <line
              key={`yg-${idx}`}
              x1={mLeft}
              y1={getY(val)}
              x2={mLeft + plotW}
              y2={getY(val)}
              stroke="#262f45"
              strokeDasharray="3 3"
            />
          ))}
          {xTicks.map((val, idx) => (
            <line
              key={`xg-${idx}`}
              x1={getX(val)}
              y1={mTop}
              x2={getX(val)}
              y2={mTop + plotH}
              stroke="#262f45"
              strokeDasharray="3 3"
            />
          ))}

          {/* OLS Trendline */}
          {trendP1 && trendP2 && (
            <line
              x1={trendP1.x}
              y1={trendP1.y}
              x2={trendP2.x}
              y2={trendP2.y}
              stroke="#f97316"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.9"
            />
          )}

          {/* Scatter points */}
          {validPairs.slice(0, 800).map(([xv, yv, cat], idx) => {
            const cx = getX(xv)
            const cy = getY(yv)
            const color = cat && catColorMap[cat] ? catColorMap[cat] : '#38bdf8'
            return (
              <circle
                key={idx}
                cx={cx}
                cy={cy}
                r="3.5"
                fill={color}
                fillOpacity="0.8"
                stroke={color}
                strokeWidth="0.8"
                className="scatter-dot"
                onMouseEnter={() => setHovered({ x: xv, y: yv, cat, px: cx, py: cy })}
                onMouseLeave={() => setHovered(null)}
              />
            )
          })}

          {/* Y-axis Ticks & Labels */}
          {yTicks.map((val, idx) => (
            <text
              key={`yt-${idx}`}
              x={mLeft - 8}
              y={getY(val) + 4}
              fill="#94a3b8"
              fontSize="10"
              textAnchor="end"
            >
              {val > 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(1)}
            </text>
          ))}

          {/* X-axis Ticks & Labels */}
          {xTicks.map((val, idx) => (
            <text
              key={`xt-${idx}`}
              x={getX(val)}
              y={mTop + plotH + 16}
              fill="#94a3b8"
              fontSize="10"
              textAnchor="middle"
            >
              {val > 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(1)}
            </text>
          ))}

          {/* Axis Titles */}
          <text x={mLeft + plotW / 2} y={height - 6} fill="#cbd5e1" fontSize="11" fontWeight="600" textAnchor="middle">
            {xLabel}
          </text>
          <text
            x={14}
            y={mTop + plotH / 2}
            fill="#cbd5e1"
            fontSize="11"
            fontWeight="600"
            textAnchor="middle"
            transform={`rotate(-90, 14, ${mTop + plotH / 2})`}
          >
            {yLabel}
          </text>
        </svg>

        {/* Floating tooltip */}
        {hovered && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(hovered.px / width) * 100}%`,
              top: `${(hovered.py / height) * 100}%`,
            }}
          >
            <strong>{xLabel}: {typeof hovered.x === 'number' ? hovered.x.toFixed(2) : hovered.x}</strong>
            <span>{yLabel}: {typeof hovered.y === 'number' ? hovered.y.toFixed(2) : hovered.y}</span>
            {hovered.cat && <span style={{ color: '#38bdf8' }}>{hueLabel}: {hovered.cat}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Histogram / Frequency Distribution Chart ──────────────────────────────
export function HistogramChart({ data }) {
  const [hovered, setHovered] = useState(null)
  const gradientId = useId()
  const values = data?.values || []
  const labels = data?.labels || []
  const xLabel = data?.xLabel || 'Value Bin'
  const yLabel = data?.yLabel || 'Frequency'

  if (!values.length) {
    return <div className="chart-empty">No distribution data available.</div>
  }

  const width = 560
  const height = 240
  const mLeft = 48
  const mRight = 20
  const mTop = 24
  const mBottom = 42

  const plotW = width - mLeft - mRight
  const plotH = height - mTop - mBottom
  const maxVal = Math.max(...values) || 1

  const barWidth = Math.max(4, plotW / values.length - 3)

  return (
    <div className="argus-chart-card">
      <div className="chart-header">
        <span className="chart-title">Distribution: {xLabel}</span>
        <span className="chart-meta">Total Counts: {values.reduce((a, b) => a + b, 0).toLocaleString()}</span>
      </div>
      <div className="svg-container">
        <svg viewBox={`0 0 ${width} ${height}`} className="argus-svg">
          <rect x={mLeft} y={mTop} width={plotW} height={plotH} fill="#141926" rx="6" />

          {/* Horizontal grid */}
          {[0, 0.5, 1].map((pct, idx) => {
            const y = mTop + plotH - pct * plotH
            return (
              <g key={idx}>
                <line x1={mLeft} y1={y} x2={mLeft + plotW} y2={y} stroke="#262f45" strokeDasharray="3 3" />
                <text x={mLeft - 6} y={y + 3} fill="#94a3b8" fontSize="10" textAnchor="end">
                  {Math.round(pct * maxVal)}
                </text>
              </g>
            )
          })}

          {/* Histogram Bars */}
          {values.map((val, idx) => {
            const barH = (val / maxVal) * (plotH - 10)
            const x = mLeft + idx * (plotW / values.length) + (plotW / values.length - barWidth) / 2
            const y = mTop + plotH - barH

            return (
              <g
                key={idx}
                onMouseEnter={() => setHovered({ bin: labels[idx] ?? idx, val, px: x + barWidth / 2, py: y })}
                onMouseLeave={() => setHovered(null)}
              >
                <defs>
                  <linearGradient id={`${gradientId}-${idx}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#ea580c" stopOpacity="0.4" />
                  </linearGradient>
                </defs>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  fill={`url(#${gradientId}-${idx})`}
                  rx="3"
                  className="bar-rect"
                />
              </g>
            )
          })}

          {/* X axis labels (sparse) */}
          {labels.map((lbl, idx) => {
            const step = Math.ceil(labels.length / 6)
            if (idx % step !== 0 && idx !== labels.length - 1) return null
            const x = mLeft + idx * (plotW / values.length) + barWidth / 2
            return (
              <text key={idx} x={x} y={mTop + plotH + 16} fill="#94a3b8" fontSize="9.5" textAnchor="middle">
                {typeof lbl === 'number' ? (lbl > 1000 ? `${(lbl / 1000).toFixed(1)}k` : lbl.toFixed(1)) : String(lbl).slice(0, 8)}
              </text>
            )
          })}

          <text x={mLeft + plotW / 2} y={height - 6} fill="#cbd5e1" fontSize="11" fontWeight="600" textAnchor="middle">
            {xLabel}
          </text>
        </svg>

        {hovered && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(hovered.px / width) * 100}%`,
              top: `${(hovered.py / height) * 100}%`,
            }}
          >
            <strong>Bin: {hovered.bin}</strong>
            <span>Count: {hovered.val.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helper: Detect and Parse Grouped / Multivariate Data ─────────────────
function tryParseGroupedData(vizData, analysisName) {
  if (!vizData) return null
  if (vizData.groups && Array.isArray(vizData.groups) && vizData.groups.length > 0) {
    return vizData
  }

  const rawLabels = vizData.labels || []
  const rawValues = vizData.values || vizData.data || []
  if (!rawLabels.length || rawLabels.length < 2 || rawLabels.length > 16) return null

  const parsedItems = []
  for (let i = 0; i < rawLabels.length; i++) {
    const rawLbl = String(rawLabels[i]).trim()
    const val = Number(rawValues[i])
    if (isNaN(val)) continue

    // Filter out redundant grand averages/totals from side-by-side cohort comparisons
    if (/^(mean_fare_overall|overall|total_average|grand_mean|overall_mean)$/i.test(rawLbl)) {
      continue
    }

    let parts = []
    if (rawLbl.includes(' - ')) parts = rawLbl.split(' - ')
    else if (rawLbl.includes(' · ')) parts = rawLbl.split(' · ')
    else if (rawLbl.includes(' / ')) parts = rawLbl.split(' / ')
    else if (rawLbl.includes(' | ')) parts = rawLbl.split(' | ')
    else if (rawLbl.includes('_')) {
      const stripped = rawLbl.replace(/^(mean|avg|median|sum|count|fare)_+/i, '')
      const tokens = stripped.split('_').filter(Boolean)
      if (tokens.length >= 2) {
        parts = [tokens[0], tokens.slice(1).join(' ')]
      }
    }

    if (parts.length >= 2) {
      const groupName = parts[0].trim().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      let subLabel = parts.slice(1).join(' - ').trim().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      if (subLabel === '1' || subLabel === '1.0' || subLabel.toLowerCase() === 'true') subLabel = 'Survived'
      if (subLabel === '0' || subLabel === '0.0' || subLabel.toLowerCase() === 'false') subLabel = 'Perished'
      parsedItems.push({ group: groupName, sub: subLabel, value: val, original: rawLbl })
    }
  }

  if (parsedItems.length < 2) return null

  const groupMap = new Map()
  const seriesSet = new Set()

  for (const item of parsedItems) {
    if (!groupMap.has(item.group)) {
      groupMap.set(item.group, [])
    }
    groupMap.get(item.group).push({
      label: item.sub,
      value: item.value,
    })
    seriesSet.add(item.sub)
  }

  if (groupMap.size === 0) return null
  const groups = Array.from(groupMap.entries()).map(([name, bars]) => ({
    name,
    bars,
  }))

  const colors = ['#10b981', '#f43f5e', '#38bdf8', '#fbbf24', '#a855f7']
  const series = Array.from(seriesSet).map((name, idx) => {
    let color = colors[idx % colors.length]
    const nLow = name.toLowerCase()
    if (nLow.includes('surviv') && !nLow.includes('not') && !nLow.includes('perish')) color = '#10b981'
    if (nLow.includes('perish') || nLow.includes('died') || nLow.includes('not') || nLow.includes('0')) color = '#f43f5e'
    return { name, color }
  })

  return {
    title: analysisName || vizData.yLabel || 'Multivariate Group Comparison',
    xLabel: vizData.xLabel || 'Group',
    yLabel: vizData.yLabel || 'Average Value',
    groups,
    series,
  }
}

// ── Grouped Bar / Multivariate Comparison Chart ───────────────────────────
export function GroupedBarChart({ data }) {
  const [hovered, setHovered] = useState(null)
  const groups = data?.groups || []
  const series = data?.series || []
  const title = data?.title || 'Grouped Comparison'
  const xLabel = data?.xLabel || 'Group'
  const yLabel = data?.yLabel || 'Value'

  if (!groups.length) {
    return <div className="chart-empty">No grouped comparison data available.</div>
  }

  const allValues = groups.flatMap(g => g.bars.map(b => Number(b.value) || 0))
  const maxVal = Math.max(...allValues, 1)

  const width = 640
  const height = 300
  const mLeft = 60
  const mRight = 24
  const mTop = 38
  const mBottom = 52

  const plotW = width - mLeft - mRight
  const plotH = height - mTop - mBottom

  const groupWidth = plotW / groups.length
  const nBars = Math.max(...groups.map(g => g.bars.length), 1)
  const barW = Math.min(52, Math.max(18, (groupWidth * 0.62) / nBars))
  const barGap = 8
  const groupBarsWidth = nBars * barW + (nBars - 1) * barGap

  const defaultColors = ['#10b981', '#f43f5e', '#38bdf8', '#f59e0b', '#8b5cf6']
  const getColor = (bar, idx) => {
    if (bar.color) return bar.color
    const lbl = String(bar.label).toLowerCase()
    if (lbl.includes('surviv') && !lbl.includes('not') && !lbl.includes('perish')) return '#10b981'
    if (lbl.includes('perish') || lbl.includes('died') || lbl.includes('not')) return '#f43f5e'
    return defaultColors[idx % defaultColors.length]
  }

  return (
    <div className="argus-chart-card multivariate-card">
      <div className="chart-header">
        <div>
          <span className="chart-title">{title}</span>
          <span style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginTop: 2 }}>
            Side-by-side comparison across {xLabel} segmented by outcome
          </span>
        </div>
        <div className="grouped-legend">
          {(series.length ? series : groups[0]?.bars || []).map((s, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#cbd5e1' }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: s.color || getColor(s, idx) }} />
              <span style={{ fontWeight: 500 }}>{s.name || s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="svg-container" style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="argus-svg" style={{ width: '100%', height: 'auto' }}>
          <rect x={mLeft} y={mTop} width={plotW} height={plotH} fill="#111827" rx="8" />

          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const y = mTop + plotH - pct * plotH
            const val = pct * maxVal
            const formatted = val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)
            return (
              <g key={idx}>
                <line x1={mLeft} y1={y} x2={mLeft + plotW} y2={y} stroke="#1e293b" strokeDasharray="3 3" />
                <text x={mLeft - 8} y={y + 3.5} fill="#64748b" fontSize="10" textAnchor="end" fontFamily="monospace">
                  ${formatted}
                </text>
              </g>
            )
          })}

          {groups.map((group, gIdx) => {
            const groupCenterX = mLeft + gIdx * groupWidth + groupWidth / 2
            const startX = groupCenterX - groupBarsWidth / 2

            return (
              <g key={gIdx} className="bar-group">
                <rect
                  x={mLeft + gIdx * groupWidth + 6}
                  y={mTop + 4}
                  width={groupWidth - 12}
                  height={plotH - 8}
                  fill="rgba(255,255,255,0.015)"
                  rx="6"
                />

                {group.bars.map((bar, bIdx) => {
                  const bVal = Number(bar.value) || 0
                  const bH = (bVal / maxVal) * (plotH - 24)
                  const x = startX + bIdx * (barW + barGap)
                  const y = mTop + plotH - bH
                  const color = getColor(bar, bIdx)
                  const gradientId = `grp-bar-${gIdx}-${bIdx}`

                  return (
                    <g
                      key={bIdx}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHovered({ group: group.name, ...bar, px: x + barW / 2, py: y })}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} />
                          <stop offset="100%" stopColor={color} stopOpacity="0.45" />
                        </linearGradient>
                      </defs>

                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={Math.max(2, bH)}
                        fill={`url(#${gradientId})`}
                        stroke={color}
                        strokeWidth="1.2"
                        rx="4"
                      />

                      {bH > 14 && (
                        <text
                          x={x + barW / 2}
                          y={y - 6}
                          fill="#f8fafc"
                          fontSize="10"
                          fontWeight="600"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          ${bVal >= 1000 ? `${(bVal / 1000).toFixed(1)}k` : bVal.toFixed(1)}
                        </text>
                      )}
                    </g>
                  )
                })}

                <text
                  x={groupCenterX}
                  y={mTop + plotH + 22}
                  fill="#f1f5f9"
                  fontSize="13"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  {group.name}
                </text>
              </g>
            )
          })}

          <text x={mLeft + plotW / 2} y={height - 8} fill="#94a3b8" fontSize="11" fontWeight="600" textAnchor="middle">
            {xLabel}
          </text>
          <text
            x={16}
            y={mTop + plotH / 2}
            fill="#94a3b8"
            fontSize="10.5"
            fontWeight="500"
            textAnchor="middle"
            transform={`rotate(-90, 16, ${mTop + plotH / 2})`}
          >
            {yLabel}
          </text>
        </svg>

        {hovered && (
          <div
            className="chart-tooltip"
            style={{
              position: 'absolute',
              left: `${(hovered.px / width) * 100}%`,
              top: `${Math.max(10, (hovered.py / height) * 100 - 15)}%`,
              transform: 'translate(-50%, -100%)',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: '0.8rem',
              color: '#f8fafc',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              pointerEvents: 'none',
              zIndex: 30,
              minWidth: 140,
            }}
          >
            <div style={{ fontWeight: 600, color: '#38bdf8', marginBottom: 3 }}>
              {hovered.group} · {hovered.label}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: '#94a3b8' }}>{yLabel}:</span>
              <span style={{ fontWeight: 600, color: '#22c55e' }}>
                ${Number(hovered.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {hovered.count && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 2 }}>
                <span style={{ color: '#94a3b8' }}>Passengers:</span>
                <span style={{ fontWeight: 500 }}>{hovered.count.toLocaleString()}</span>
              </div>
            )}
            {hovered.median && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 2 }}>
                <span style={{ color: '#94a3b8' }}>Median:</span>
                <span style={{ fontWeight: 500 }}>${Number(hovered.median).toFixed(2)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="grouped-cohort-cards"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(4, groups.flatMap(g => g.bars).length)}, 1fr)`,
          gap: 10,
          marginTop: 14,
        }}
      >
        {groups.flatMap(g => g.bars.map(b => ({ ...b, group: g.name }))).map((card, cIdx) => (
          <div
            key={cIdx}
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(51, 65, 85, 0.45)',
              borderRadius: 8,
              padding: '10px 12px',
              borderLeft: `3px solid ${getColor(card, cIdx)}`,
            }}
          >
            <div style={{ fontSize: '0.73rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8' }}>
              {card.group} · {card.label}
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', marginTop: 4, fontFamily: 'monospace' }}>
              ${Number(card.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
              {card.count ? `${card.count.toLocaleString()} passengers` : 'Average cohort metric'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Categorical / Ranking Bar Chart ───────────────────────────────────────
export function BarChart({ data }) {
  const [hovered, setHovered] = useState(null)
  const labels = data?.labels || []
  const values = data?.values || data?.data || []
  const xLabel = data?.xLabel || 'Category'
  const yLabel = data?.yLabel || 'Value'

  if (!labels.length || !values.length) {
    return <div className="chart-empty">No categorical data available.</div>
  }

  const formatCleanLabel = (lbl) => {
    const s = String(lbl).trim()
    if (/^[a-z]+_[a-z]+/i.test(s)) {
      return s
        .replace(/^(mean|avg|median|sum|count|fare)_+/i, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
    }
    return s
  }

  const items = labels.map((lbl, i) => ({
    label: formatCleanLabel(lbl),
    rawLabel: String(lbl),
    value: values[i] == null || !Number.isFinite(Number(values[i])) ? null : Number(values[i]),
  }))

  const valid = items.map((i) => i.value).filter((v) => v !== null)
  const minVal = Math.min(0, ...valid)
  const maxVal = Math.max(0, ...valid)
  const range = maxVal - minVal || 1
  const zero = -minVal / range * 100

  return (
    <div className="argus-chart-card">
      <div className="chart-header">
        <span className="chart-title">{yLabel} by {xLabel}</span>
        <span className="chart-meta">{items.length} displayed groups · baseline 0</span>
      </div>
      <div className="horizontal-bars">
        {items.map((item, idx) => {
          const pct = item.value === null ? 0 : Math.abs(item.value) / range * 100
          return (
            <div
              key={idx}
              className="hbar-row"
              onMouseEnter={() => setHovered(item)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="hbar-label" title={item.label}>{item.label}</span>
              <div className="hbar-track signed-bar-track">
                <i className="bar-zero" style={{ left: `${zero}%` }} />
                <div
                  className="hbar-fill"
                  style={{
                    width: `${pct}%`,
                    left: `${item.value < 0 ? zero - pct : zero}%`,
                    position: 'absolute',
                    background: item.value < 0 ? '#38bdf8' : 'linear-gradient(90deg, #f97316, #fb923c)',
                  }}
                />
              </div>
              <span className="hbar-val">{item.value === null ? '—' : item.value.toLocaleString()}</span>
            </div>
          )
        })}
      </div>
      {data?.note && <p className="chart-footnote">{data.note}</p>}
    </div>
  )
}

// ── Time Series Line Chart ────────────────────────────────────────────────
/* Renders the `type: "line"` payload produced by datetime univariate analysis
   (`_describe_datetime`) and by the time-series branch of bivariate analysis.

   Two details matter for honesty:
   - `values` may contain nulls (a bucket with no rows). The line breaks at a
     missing bucket instead of drawing straight through it, so an outage or a
     skipped reporting month stays visible.
   - the optional `trend` is the OLS fit the backend already computed over
     bucket positions, so slope is per period and intercept is at bucket 0. */
export function TimeSeriesChart({ data }) {
  const [hovered, setHovered] = useState(null)
  const labels = data?.labels || []
  const rawValues = data?.values || data?.data || []
  const xLabel = data?.xLabel || 'Period'
  const yLabel = data?.yLabel || 'Value'
  const trend = data?.trend

  const points = []
  rawValues.forEach((raw, idx) => {
    const num = Number(raw)
    if (raw === null || raw === undefined || raw === '' || isNaN(num)) return
    points.push({ i: idx, v: num, label: String(labels[idx] ?? idx) })
  })

  if (!points.length) {
    return <div className="chart-empty">No time-series data available.</div>
  }

  const count = Math.max(rawValues.length, 1)
  const width = 560
  const height = 260
  const mLeft = 52
  const mRight = 20
  const mTop = 22
  const mBottom = 44
  const plotW = width - mLeft - mRight
  const plotH = height - mTop - mBottom

  const observed = points.map((p) => p.v)
  const hasTrend = trend && typeof trend.slope === 'number' && typeof trend.intercept === 'number'
  const trendAt = (i) => trend.slope * i + trend.intercept
  const spanned = hasTrend ? [...observed, trendAt(0), trendAt(count - 1)] : observed

  let minY = Math.min(...spanned)
  let maxY = Math.max(...spanned)
  // A flat series has zero range; pad off its own magnitude so it renders as a
  // line through the middle rather than collapsing onto the axis.
  const pad = (maxY - minY) * 0.1 || Math.abs(maxY) * 0.1 || 1
  minY -= pad
  maxY += pad

  const getX = (i) => (count === 1 ? mLeft + plotW / 2 : mLeft + (i / (count - 1)) * plotW)
  const getY = (v) => mTop + plotH - ((v - minY) / (maxY - minY || 1)) * plotH

  // Split at missing buckets so the line is drawn only where data exists.
  const segments = []
  points.forEach((p, idx) => {
    if (idx === 0 || p.i !== points[idx - 1].i + 1) segments.push([p])
    else segments[segments.length - 1].push(p)
  })

  const fmt = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : Number(v.toFixed(2)).toString())
  const yTicks = [0, 0.5, 1].map((pct) => minY + pct * (maxY - minY))
  const labelStep = Math.ceil(points.length / 6)

  return (
    <div className="argus-chart-card">
      <div className="chart-header">
        <span className="chart-title">{xLabel}</span>
        <span className="chart-meta">
          {points.length} points
          {hasTrend ? ` · slope ${trend.slope.toFixed(3)}/period` : ''}
        </span>
      </div>
      <div className="svg-container">
        <svg viewBox={`0 0 ${width} ${height}`} className="argus-svg">
          <rect x={mLeft} y={mTop} width={plotW} height={plotH} fill="#141926" rx="6" />

          <defs>
            <linearGradient id="argLineArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((val, idx) => (
            <g key={`yt-${idx}`}>
              <line x1={mLeft} y1={getY(val)} x2={mLeft + plotW} y2={getY(val)} stroke="#262f45" strokeDasharray="3 3" />
              <text x={mLeft - 8} y={getY(val) + 3.5} fill="#94a3b8" fontSize="10" textAnchor="end">
                {fmt(val)}
              </text>
            </g>
          ))}

          {/* Area fill, then the line, per contiguous segment */}
          {segments.map((seg, idx) => {
            if (seg.length < 2) return null
            const line = seg.map((p) => `${getX(p.i)},${getY(p.v)}`).join(' ')
            const area = `M ${getX(seg[0].i)},${mTop + plotH} L ${seg
              .map((p) => `${getX(p.i)},${getY(p.v)}`)
              .join(' L ')} L ${getX(seg[seg.length - 1].i)},${mTop + plotH} Z`
            return (
              <g key={`seg-${idx}`}>
                <path d={area} fill="url(#argLineArea)" />
                <polyline points={line} fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )
          })}

          {hasTrend && (
            <line
              x1={getX(0)}
              y1={getY(trendAt(0))}
              x2={getX(count - 1)}
              y2={getY(trendAt(count - 1))}
              stroke="#f97316"
              strokeWidth="2"
              strokeDasharray="6 4"
              opacity="0.9"
            />
          )}

          {/* Markers. Above ~80 buckets they merge into a smear, so the line
              carries the shape on its own and only hover targets remain. */}
          {points.length <= 80 && points.map((p) => (
            <circle key={`pt-${p.i}`} cx={getX(p.i)} cy={getY(p.v)} r="3" fill="#0a0e1a" stroke="#38bdf8" strokeWidth="1.8" />
          ))}

          {/* Invisible hover columns, so a thin line is still easy to inspect */}
          {points.map((p) => {
            const w = count === 1 ? plotW : plotW / count
            return (
              <rect
                key={`hit-${p.i}`}
                x={getX(p.i) - w / 2}
                y={mTop}
                width={Math.max(w, 4)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHovered({ ...p, px: getX(p.i), py: getY(p.v) })}
                onMouseLeave={() => setHovered(null)}
              />
            )
          })}

          {points.map((p, idx) => {
            if (idx % labelStep !== 0 && idx !== points.length - 1) return null
            return (
              <text key={`xl-${p.i}`} x={getX(p.i)} y={mTop + plotH + 16} fill="#94a3b8" fontSize="9.5" textAnchor="middle">
                {p.label.length > 10 ? `${p.label.slice(0, 10)}…` : p.label}
              </text>
            )
          })}

          <text x={mLeft + plotW / 2} y={height - 6} fill="#cbd5e1" fontSize="11" fontWeight="600" textAnchor="middle">
            {xLabel}
          </text>
          <text
            x={14}
            y={mTop + plotH / 2}
            fill="#cbd5e1"
            fontSize="11"
            fontWeight="600"
            textAnchor="middle"
            transform={`rotate(-90, 14, ${mTop + plotH / 2})`}
          >
            {yLabel}
          </text>
        </svg>

        {hovered && (
          <div
            className="chart-tooltip"
            style={{ left: `${(hovered.px / width) * 100}%`, top: `${(hovered.py / height) * 100}%` }}
          >
            <strong>{hovered.label}</strong>
            <span>{yLabel}: {hovered.v.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Correlation & Association Heatmap ─────────────────────────────────────
export function CorrelationHeatmap({ data }) {
  const [cell, setCell] = useState(null)
  const matrix = data?.matrix || {}
  const pearsonCols = data?.matrix_columns || Object.keys(matrix)
  const hasPearson = pearsonCols.length >= 2
  const methodLabel = data?.method === 'spearman' ? 'Spearman' : 'Pearson'

  const association = data?.association || {}
  const assocCols = association.columns || []
  const hasAssoc = assocCols.length >= 2

  // Default to pearson if available, otherwise fallback to association
  const [mode, setMode] = useState(hasPearson ? 'pearson' : hasAssoc ? 'association' : 'pearson')

  if (!hasPearson && !hasAssoc) {
    return (
      <div className="chart-empty" style={{ padding: '24px', textAlign: 'center' }}>
        <strong>Insufficient variables for correlation matrix.</strong>
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
          Correlation needs at least two columns with varying numeric, categorical or datetime values.
        </p>
      </div>
    )
  }

  const isAssocMode = hasAssoc && (mode === 'association' || !hasPearson)
  const activeCols = isAssocMode ? assocCols : pearsonCols

  const getPearsonColor = (r) => {
    if (r == null || !Number.isFinite(r)) return '#1a1f2e'
    if (r > 0) {
      const alpha = Math.min(1, Math.max(0.12, r))
      return `rgba(56, 189, 248, ${alpha})`
    } else {
      const alpha = Math.min(1, Math.max(0.12, Math.abs(r)))
      return `rgba(249, 115, 22, ${alpha})`
    }
  }

  const getAssocColor = (strength) => {
    if (strength === undefined || isNaN(strength) || strength === null) return '#1a1f2e'
    const alpha = Math.min(1, Math.max(0.12, strength))
    return `rgba(167, 139, 250, ${alpha})`
  }

  return (
    <div className="argus-chart-card">
      <div className="chart-header">
        <div>
          <span className="chart-title">
            {isAssocMode ? 'Categorical & Mixed Association Matrix' : `${methodLabel} Correlation Heatmap`}
          </span>
          <span className="chart-meta">
            {isAssocMode
              ? "Cramér's V, eta, or |Pearson r| — 0 to 1"
              : `${methodLabel} coefficients (−1 to +1) · — means insufficient paired data`}
          </span>
        </div>

        {/* View Toggle if both Pearson & Association are available */}
        {hasPearson && hasAssoc && (
          <div className="cluster-view-toggle">
            <button
              type="button"
              className={`cluster-toggle-btn ${mode === 'pearson' ? 'active' : ''}`}
              onClick={() => { setMode('pearson'); setCell(null) }}
            >
              Numeric ({methodLabel})
            </button>
            <button
              type="button"
              className={`cluster-toggle-btn ${mode === 'association' ? 'active' : ''}`}
              onClick={() => { setMode('association'); setCell(null) }}
            >
              Categorical (Cramér's V)
            </button>
          </div>
        )}
      </div>

      <div className="heatmap-wrap">
        <table className="heatmap-table">
          <thead>
            <tr>
              <th></th>
              {activeCols.map((c) => (
                <th key={c} title={c}>{c.length > 10 ? `${c.slice(0, 9)}…` : c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeCols.map((row, rowIdx) => (
              <tr key={row}>
                <th title={row}>{row.length > 10 ? `${row.slice(0, 9)}…` : row}</th>
                {activeCols.map((col, colIdx) => {
                  let num = null
                  let method = data?.method || 'pearson'
                  if (isAssocMode) {
                    const origRowIdx = assocCols.indexOf(row)
                    const origColIdx = assocCols.indexOf(col)
                    num = association.values?.[origRowIdx]?.[origColIdx] ?? null
                    method = association.methods?.[origRowIdx]?.[origColIdx] || 'association'
                  } else {
                    const val = matrix[row]?.[col]
                    num = Number.isFinite(val) ? val : null
                  }

                  const bg = isAssocMode ? getAssocColor(num) : getPearsonColor(num)

                  return (
                    <td
                      key={col}
                      style={{ background: bg }}
                      className="heatmap-cell"
                      onMouseEnter={() => setCell({ row, col, val: num, method })}
                      onMouseLeave={() => setCell(null)}
                    >
                      <span>{num === null ? '—' : num.toFixed(2)}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cell && (
        <div className="heatmap-caption">
          <strong>{cell.row}</strong> ↔ <strong>{cell.col}</strong>:{' '}
          <span>
            {cell.val === null ? 'Insufficient paired data' : `${cell.method} = ${cell.val.toFixed(3)}`}
          </span>
        </div>
      )}
      {data?.pairs?.length > 0 && (
        <div className="table-wrap correlation-pairs">
          <table>
            <caption>Top {data.pairs.length} of {data.all_pairs_count} pairs ranked by |{methodLabel}|</caption>
            <thead><tr><th>Variables</th><th>Pearson r</th><th>Spearman ρ</th><th>Paired rows</th></tr></thead>
            <tbody>{data.pairs.map((pair) => (
              <tr key={JSON.stringify([pair.col_a, pair.col_b])}>
                <td>{pair.col_a} ↔ {pair.col_b}</td>
                <td>{(pair.pearson_r ?? pair.correlation)?.toFixed(3) ?? '—'}</td>
                <td>{pair.spearman_rho?.toFixed(3) ?? '—'}</td>
                <td>{pair.sample_size ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}


// ── Feature Importance Horizontal Ranking ─────────────────────────────────
export function FeatureImportanceChart({ data, target }) {
  /* The ranking arrives under a different key depending on which tool produced
     it: `feature_importance` from the importance and discovery tools,
     `top_influencers` from multivariate, `features` when the caller has already
     normalised it. Reading only `features` meant the real payloads all rendered
     as "no metrics available". */
  const features = data?.features || data?.feature_importance || data?.top_influencers || []
  const ranked = [...features]
  if (!ranked.length && data?.importance && typeof data.importance === 'object') {
    for (const [k, v] of Object.entries(data.importance)) {
      ranked.push({ feature: k, score: Number(v) || 0 })
    }
  }

  if (!ranked.length) {
    return <div className="chart-empty">No feature importance metrics available.</div>
  }

  const score = (f) => Number(f.score ?? f.importance ?? 0)
  const sorted = [...ranked].sort((a, b) => score(b) - score(a)).slice(0, 10)
  const maxScore = Math.max(...sorted.map(score)) || 1

  return (
    <div className="argus-chart-card">
      <div className="chart-header">
        <span className="chart-title">Feature Importance {target ? `for ${target}` : ''}</span>
        <span className="chart-meta">Top {sorted.length} Predictive Drivers</span>
      </div>
      <div className="horizontal-bars">
        {sorted.map((item, idx) => {
          const name = item.feature || item.name || `Feature ${idx + 1}`
          const value = score(item)
          const pct = Math.max(4, (value / maxScore) * 100)

          return (
            <div key={idx} className="hbar-row">
              <span className="rank-badge">#{idx + 1}</span>
              <span className="hbar-label" title={name}>{name}</span>
              <div className="hbar-track">
                <div
                  className="hbar-fill"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, #7f77dd, #38bdf8)`,
                  }}
                />
              </div>
              <span className="hbar-val">{(value * 100).toFixed(1)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── PCA Cluster Scatter ───────────────────────────────────────────────────
/* The two components multivariate analysis already computes, drawn with one
   colour per K-Means group. Axis labels name the columns that load most heavily
   on each component — without them the two axes are unreadable. */
const CLUSTER_COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#34d399', '#f472b6', '#facc15', '#fb7185', '#2dd4bf']

export function ClusterScatter({ data }) {
  const [viewMode, setViewMode] = useState('profiles') // 'profiles' | 'scatter'
  const [selectedFeature, setSelectedFeature] = useState('')
  const [hovered, setHovered] = useState(null)
  const [summary, setSummary] = useState('mean')

  const points = (data?.points || []).filter(
    (p) => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))
  )
  const labels = data?.cluster_labels || []
  const sizes = data?.cluster_sizes || {}
  const totalRows = Object.values(sizes).reduce((a, b) => a + b, 0) || points.length || 1

  // Compare summaries computed from each group's encoded features.
  const rawProfiles = data?.cluster_profiles || []
  const features = data?.comparison_features || (rawProfiles[0] ? Object.keys(rawProfiles[0].feature_means || {}) : [])
  const activeFeature = features.includes(selectedFeature) ? selectedFeature : features[0] || ''

  // Build cluster profile list
  const clusterProfiles = Object.entries(sizes).map(([gid, count]) => {
    const idNum = Number(gid)
    const backendProf = rawProfiles.find((p) => p.cluster_id === idNum)
    return {
      id: idNum,
      name: `Cluster Group ${gid}`,
      count: Number(count),
      pct: Number(((Number(count) / totalRows) * 100).toFixed(1)),
      color: CLUSTER_COLORS[idNum % CLUSTER_COLORS.length],
      feature_means: backendProf?.feature_means || {},
      feature_medians: backendProf?.feature_medians || {},
    }
  })

  // 2D Scatter bounds
  const xs = points.map((p) => Number(p[0]))
  const ys = points.map((p) => Number(p[1]))
  const pad = (lo, hi) => (hi - lo) * 0.08 || 1
  const minX = Math.min(...xs) - pad(Math.min(...xs), Math.max(...xs))
  const maxX = Math.max(...xs) + pad(Math.min(...xs), Math.max(...xs))
  const minY = Math.min(...ys) - pad(Math.min(...ys), Math.max(...ys))
  const maxY = Math.max(...ys) + pad(Math.min(...ys), Math.max(...ys))

  const width = 560
  const height = 260
  const mLeft = 52
  const mRight = 20
  const mTop = 20
  const mBottom = 42
  const plotW = width - mLeft - mRight
  const plotH = height - mTop - mBottom
  const getX = (v) => mLeft + ((v - minX) / (maxX - minX || 1)) * plotW
  const getY = (v) => mTop + plotH - ((v - minY) / (maxY - minY || 1)) * plotH

  const axisName = (drivers, fallback) => {
    const top = (drivers || []).slice(0, 2).map((d) => d.feature).filter(Boolean)
    return top.length ? `${fallback} — mostly ${top.join(' & ')}` : fallback
  }
  const variance = data?.explained_variance || []
  const pctOf = (i) => (Number.isFinite(Number(variance[i])) ? ` (${(variance[i] * 100).toFixed(1)}%)` : '')

  return (
    <div className="argus-chart-card cluster-explorer-card">
      <div className="chart-header">
        <div>
          <span className="chart-title">Natural Groups & Cluster Archetypes</span>
          <span className="chart-meta">
            {data?.n_clusters || Object.keys(sizes).length} distinct groups · {totalRows.toLocaleString()} rows segmented
          </span>
        </div>

        {/* Computed profiles and their 2D projection */}
        <div className="cluster-view-toggle">
          <button
            type="button"
            className={`cluster-toggle-btn ${viewMode === 'profiles' ? 'active' : ''}`}
            onClick={() => setViewMode('profiles')}
            title="Understandable real-world feature comparison"
          >
            <BarChart3 size={13} />
            <span>Group Profiles</span>
          </button>
          <button
            type="button"
            className={`cluster-toggle-btn ${viewMode === 'scatter' ? 'active' : ''}`}
            onClick={() => setViewMode('scatter')}
            title="2D Principal Component Projection"
          >
            <Radar size={13} />
            <span>2D Map</span>
          </button>
        </div>
      </div>

      {viewMode === 'profiles' ? (
        <div className="cluster-profiles-view">
          <div className="cluster-ai-explainer">
            <Sparkles size={15} color="var(--orange)" />
            <span>
              <strong>Computed cluster profiles:</strong> Compare summaries of the encoded features within each group. {data?.selection_reason}
            </span>
          </div>

          {/* Feature selector pills */}
          {features.length > 0 && (
            <div className="cluster-feature-selector">
              <span className="selector-label">COMPARE FEATURE:</span>
              <label className="cluster-summary-control">Summary
                <select value={summary} onChange={(event) => setSummary(event.target.value)}>
                  <option value="mean">Mean</option>
                  <option value="median" disabled={!rawProfiles.some((p) => p.feature_medians)}>Median</option>
                </select>
              </label>
              <div className="feature-pills">
                {features.map((feat) => (
                  <button
                    key={feat}
                    type="button"
                    className={`feat-pill ${activeFeature === feat ? 'active' : ''}`}
                    onClick={() => setSelectedFeature(feat)}
                  >
                    {feat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Group Comparison Bars for Active Feature */}
          {activeFeature && (
            <div className="active-feat-comparison-box">
              <div className="comparison-box-title">
                {summary === 'median' ? 'Median' : 'Mean'} <strong>{activeFeature}</strong> across groups:
              </div>
              <BarChart data={{
                xLabel: 'cluster', yLabel: `${summary === 'median' ? 'Median' : 'Mean'} ${activeFeature}`,
                labels: clusterProfiles.map((grp) => `Group ${grp.id} (${grp.count} rows)`),
                values: clusterProfiles.map((grp) => (summary === 'median' ? grp.feature_medians : grp.feature_means)[activeFeature] ?? null),
              }} />
            </div>
          )}

          {/* Group Archetype Cards Grid */}
          <div className="cluster-groups-cards-grid">
            {clusterProfiles.map((grp) => (
              <div key={grp.id} className="cluster-group-card" style={{ borderTopColor: grp.color }}>
                <div className="grp-card-header">
                  <span className="grp-card-badge" style={{ color: grp.color, background: `${grp.color}18` }}>
                    Group {grp.id}
                  </span>
                  <span className="grp-card-size">
                    <strong>{grp.count.toLocaleString()}</strong> rows ({grp.pct}%)
                  </span>
                </div>

                <div className="grp-traits-list">
                  {Object.entries(summary === 'median' ? grp.feature_medians : grp.feature_means).slice(0, 4).map(([fName, fVal]) => (
                    <div key={fName} className="grp-trait-item">
                      <span className="trait-name">{fName}</span>
                      <span className="trait-val">{Number(fVal).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* 2D Scatter View (available when toggled) */
        <>
          <div className="svg-container">
            <svg viewBox={`0 0 ${width} ${height}`} className="argus-svg" role="img">
              <rect x={mLeft} y={mTop} width={plotW} height={plotH} fill="#141926" rx="6" />
              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={`g-${f}`}
                  x1={mLeft}
                  y1={mTop + plotH * f}
                  x2={mLeft + plotW}
                  y2={mTop + plotH * f}
                  stroke="#262f45"
                  strokeDasharray="3 3"
                />
              ))}
              {points.map((p, i) => {
                const group = Number(labels[i] ?? 0)
                return (
                  <circle
                    key={i}
                    cx={getX(Number(p[0]))}
                    cy={getY(Number(p[1]))}
                    r={hovered === i ? 6 : 3.5}
                    fill={CLUSTER_COLORS[group % CLUSTER_COLORS.length]}
                    fillOpacity={0.8}
                    className="scatter-dot"
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                  />
                )
              })}
              <text x={mLeft + plotW / 2} y={height - 8} textAnchor="middle" fontSize="10" fill="#8b949e">
                {axisName(data?.pc1_drivers, 'Component 1')}{pctOf(0)}
              </text>
              <text
                x={14}
                y={mTop + plotH / 2}
                textAnchor="middle"
                fontSize="10"
                fill="#8b949e"
                transform={`rotate(-90 14 ${mTop + plotH / 2})`}
              >
                {axisName(data?.pc2_drivers, 'Component 2')}{pctOf(1)}
              </text>
            </svg>
          </div>
          <div className="cluster-legend">
            {Object.entries(sizes).map(([group, count]) => (
              <span key={group} className="cluster-chip">
                <i style={{ background: CLUSTER_COLORS[Number(group) % CLUSTER_COLORS.length] }} />
                Group {group}: {count} rows
              </span>
            ))}
          </div>

          {clusterProfiles.length > 0 && (
            <div className="scatter-archetype-tray">
              <div className="scatter-tray-header">
                <Sparkles size={12} color="#f97316" />
                <span>Archetype Fingerprint (Average Traits per Cohort):</span>
              </div>
              <div className="scatter-tray-grid">
                {clusterProfiles.map((grp) => {
                  const traits = Object.entries(grp.feature_means || {})
                    .filter(([k]) => !k.startsWith('is_') && !k.endsWith('_id'))
                    .slice(0, 3)
                  return (
                    <div key={grp.id} className="scatter-archetype-mini-card" style={{ borderLeftColor: grp.color }}>
                      <div className="mini-card-head">
                        <span className="mini-grp-pill" style={{ color: grp.color, background: `${grp.color}22` }}>
                          Group {grp.id}
                        </span>
                        <span className="mini-grp-pct">{grp.pct}% ({grp.count} rows)</span>
                      </div>
                      <div className="mini-card-traits">
                        {traits.map(([tName, tVal]) => (
                          <span key={tName} className="mini-trait-chip">
                            <strong>{tName}</strong>: {typeof tVal === 'number' ? (Number.isInteger(tVal) ? tVal : tVal.toFixed(1)) : tVal}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── One entry of a multi-chart result ─────────────────────────────────────
/* Each graph carries its own AI reading, written on the backend from the exact
   values plotted here. A card with five histograms therefore explains five
   distributions rather than one. */
function SubChart({ chart }) {
  const values = chart.values ?? chart.data
  const common = { ...chart, values, labels: chart.labels, xLabel: chart.xLabel || chart.column }

  let body
  if (chart.type === 'clusters') {
    body = <ClusterScatter data={chart} />
  } else if (chart.type === 'hbar' || chart.type === 'ranking') {
    body = <FeatureImportanceChart data={chart} target={chart.target} />
  } else if (chart.type === 'scatter') {
    body = <ScatterPlot data={chart} />
  } else if (chart.type === 'line') {
    body = <TimeSeriesChart data={{ ...common, yLabel: chart.yLabel || 'Records' }} />
  } else if (chart.type === 'histogram') {
    body = <HistogramChart data={common} />
  } else {
    body = <BarChart data={common} />
  }

  return (
    <div className="sub-chart">
      <span className="sub-title">{chart.title || chart.column}</span>
      {body}
      <AiNarrative payload={chart.narrative} label="WHAT THIS GRAPH SHOWS" compact tight />
    </div>
  )
}

// ── Master Chart Renderer ─────────────────────────────────────────────────
export default function MasterChart({ result }) {
  if (!result) return null

  const viz = result.visualization || result.chart
  const aType = result.analysis_type

  // Grouped Bar / Multivariate Side-by-Side Comparison
  if ((viz?.type === 'grouped_bar' || viz?.type === 'multivariate_grouped') && viz.data) {
    return <GroupedBarChart data={viz.data} />
  }

  // Bivariate Scatter
  if (viz?.type === 'scatter' && viz.data) {
    return <ScatterPlot data={viz.data} />
  }

  // Histogram
  if (viz?.type === 'histogram' && viz.data) {
    return <HistogramChart data={viz.data} />
  }

  // Time series — datetime univariate and the time-series bivariate branch
  if (viz?.type === 'line' && viz.data) {
    return <TimeSeriesChart data={viz.data} />
  }

  // Bar — Check if it represents a grouped cross-tabulation before falling back to horizontal bar
  if (viz?.type === 'bar' && viz.data) {
    const grouped = tryParseGroupedData(viz.data, result.title || result.analysis_name)
    if (grouped) {
      return <GroupedBarChart data={grouped} />
    }
    return <BarChart data={viz.data} />
  }

  // Several charts in one result: univariate over many columns, or multivariate,
  // which draws an influencer ranking beside its cluster scatter.
  if (viz?.type === 'multi' && viz.charts?.length > 0) {
    return (
      <div className={viz.charts.length === 1 ? 'multi-charts-grid single' : 'multi-charts-grid'}>
        {viz.charts.map((c, idx) => (
          <SubChart key={`${c.column || 'chart'}-${idx}`} chart={c} />
        ))}
      </div>
    )
  }

  // Correlation Matrix
  if (aType === 'correlation' || result.statistics?.matrix) {
    return <CorrelationHeatmap data={result.statistics} />
  }

  // Feature Discovery
  if (
    aType === 'feature_discovery'
    || aType === 'feature_importance'
    || result.statistics?.features
    || result.statistics?.feature_importance
  ) {
    return <FeatureImportanceChart data={result.statistics} target={result.statistics?.target} />
  }

  return null
}
