import { useState, useEffect, useRef, useCallback } from 'react'
import { analyzeStrategy } from '../api/client'
import { getCurrentPeriod, getYearRange, QUARTERS } from '../utils/period'

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function coverageColor(s) {
  if (s >= 0.5) return 'var(--fg-success-primary)'
  if (s >= 0.2) return 'var(--text-warning-primary)'
  return 'var(--fg-error-primary)'
}

function coverageBg(s) {
  if (s >= 0.5) return 'var(--bg-success-secondary)'
  if (s >= 0.2) return 'var(--bg-warning-secondary)'
  return 'var(--bg-error-secondary)'
}

/* ── Mind Map SVG ─────────────────────────────────────────────────────────── */

function MindMapGraph({ objectives, onSelectObjective, selectedId, animated }) {
  const svgRef = useRef(null)
  const [dims, setDims] = useState({ w: 900, h: 600 })

  useEffect(() => {
    const el = svgRef.current?.parentElement
    if (!el) return
    const update = () => setDims({ w: el.clientWidth, h: Math.max(500, el.clientWidth * 0.55) })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const cx = dims.w / 2
  const cy = dims.h / 2
  const radius = Math.min(cx, cy) * 0.65

  // Position objectives in a circle around center
  const nodes = objectives.map((obj, i) => {
    const angle = (i / objectives.length) * 2 * Math.PI - Math.PI / 2
    return {
      ...obj,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      angle,
      idx: i,
    }
  })

  return (
    <svg ref={svgRef} width={dims.w} height={dims.h} className="block">
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Connecting lines from center to objectives */}
      {nodes.map((n, i) => {
        if (i >= animated) return null
        const isSelected = selectedId === n.id
        return (
          <line key={`line-${n.id}`}
            x1={cx} y1={cy} x2={n.x} y2={n.y}
            stroke={isSelected ? 'var(--fg-brand-primary)' : 'var(--border-secondary)'}
            strokeWidth={isSelected ? 2.5 : 1.5}
            strokeDasharray={isSelected ? 'none' : '6 4'}
            style={{
              opacity: i < animated ? 1 : 0,
              transition: 'opacity 0.5s ease, stroke 0.3s ease',
            }}
          />
        )
      })}

      {/* Department sub-nodes when objective is selected */}
      {nodes.map((n) => {
        if (selectedId !== n.id) return null
        const depts = (n.departments || []).filter(d => d.goal_count > 0 || d.has_gap).slice(0, 6)
        const subRadius = radius * 0.35
        return depts.map((dept, di) => {
          const subAngle = n.angle + ((di - (depts.length - 1) / 2) * 0.35)
          const dx = n.x + subRadius * Math.cos(subAngle)
          const dy = n.y + subRadius * Math.sin(subAngle)
          return (
            <g key={`dept-${dept.id}`} className="animate-fade-in">
              <line x1={n.x} y1={n.y} x2={dx} y2={dy}
                stroke={dept.has_gap ? 'var(--fg-error-primary)' : 'var(--fg-success-primary)'}
                strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
              <circle cx={dx} cy={dy} r={18}
                fill={dept.has_gap ? 'var(--bg-error-secondary)' : 'var(--bg-success-secondary)'}
                stroke={dept.has_gap ? 'var(--fg-error-primary)' : 'var(--fg-success-primary)'}
                strokeWidth={1.5} />
              <text x={dx} y={dy} textAnchor="middle" dominantBaseline="central"
                className="text-[8px] font-bold" fill={dept.has_gap ? 'var(--fg-error-primary)' : 'var(--fg-success-primary)'}>
                {dept.goal_count}
              </text>
              <text x={dx} y={dy + 26} textAnchor="middle"
                className="text-[9px]" fill="var(--text-tertiary)">
                {dept.name.length > 12 ? dept.name.slice(0, 11) + '…' : dept.name}
              </text>
            </g>
          )
        })
      })}

      {/* Center node */}
      <circle cx={cx} cy={cy} r={40}
        fill="var(--fg-brand-primary)" filter="url(#glow)" />
      <text x={cx} y={cy - 6} textAnchor="middle" className="text-[10px] font-bold" fill="white">
        Стратегия
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" className="text-[9px]" fill="rgba(255,255,255,0.8)">
        компании
      </text>

      {/* Objective nodes */}
      {nodes.map((n, i) => {
        if (i >= animated) return null
        const isSelected = selectedId === n.id
        const gapCount = (n.departments || []).filter(d => d.has_gap).length
        const nodeRadius = isSelected ? 32 : 28

        return (
          <g key={`node-${n.id}`}
            onClick={() => onSelectObjective(n.id)}
            className="cursor-pointer"
            style={{ transition: 'transform 0.3s ease' }}
          >
            {/* Node circle */}
            <circle cx={n.x} cy={n.y} r={nodeRadius}
              fill={isSelected ? coverageBg(n.coverage_score) : 'var(--bg-primary)'}
              stroke={isSelected ? coverageColor(n.coverage_score) : 'var(--border-secondary)'}
              strokeWidth={isSelected ? 2.5 : 1.5}
              filter={isSelected ? 'url(#glow)' : 'none'}
              style={{ transition: 'all 0.3s ease' }}
            />

            {/* Goals count */}
            <text x={n.x} y={n.y - 3} textAnchor="middle" dominantBaseline="central"
              className="text-sm font-bold" fill={coverageColor(n.coverage_score)}
              style={{ transition: 'fill 0.3s ease' }}>
              {n.total_goals_matched}
            </text>
            <text x={n.x} y={n.y + 11} textAnchor="middle"
              className="text-[8px]" fill="var(--text-quaternary)">
              целей
            </text>

            {/* Gap badge */}
            {gapCount > 0 && (
              <>
                <circle cx={n.x + nodeRadius * 0.7} cy={n.y - nodeRadius * 0.7} r={9}
                  fill="var(--fg-error-primary)" />
                <text x={n.x + nodeRadius * 0.7} y={n.y - nodeRadius * 0.7} textAnchor="middle" dominantBaseline="central"
                  className="text-[8px] font-bold" fill="white">
                  {gapCount}
                </text>
              </>
            )}

            {/* Label below */}
            <foreignObject
              x={n.x - 70} y={n.y + nodeRadius + 4}
              width={140} height={36}
            >
              <div xmlns="http://www.w3.org/1999/xhtml"
                className="text-center text-[10px] leading-tight font-medium px-1"
                style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                {n.title.length > 40 ? n.title.slice(0, 38) + '…' : n.title}
              </div>
            </foreignObject>
          </g>
        )
      })}
    </svg>
  )
}

/* ── Detail Panel ─────────────────────────────────────────────────────────── */

function ObjectiveDetail({ objective }) {
  if (!objective) return null
  const depts = (objective.departments || []).filter(d => d.goal_count > 0 || d.has_gap)
  const gaps = depts.filter(d => d.has_gap)
  const covered = depts.filter(d => !d.has_gap)

  return (
    <div className="card p-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{objective.title}</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{objective.description}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-medium px-2.5 py-1 rounded-full"
            style={{ backgroundColor: coverageBg(objective.coverage_score), color: coverageColor(objective.coverage_score) }}>
            {objective.total_goals_matched} целей
          </span>
          {gaps.length > 0 && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ backgroundColor: 'var(--bg-error-secondary)', color: 'var(--fg-error-primary)' }}>
              {gaps.length} пробел{gaps.length > 1 ? (gaps.length < 5 ? 'а' : 'ов') : ''}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {depts.map((dept) => (
          <div key={dept.id} className="rounded-xl px-4 py-3"
            style={{
              backgroundColor: dept.has_gap ? 'var(--bg-error-secondary)' : 'var(--bg-secondary)',
              border: `1px solid ${dept.has_gap ? 'var(--border-error)' : 'var(--border-secondary)'}`,
            }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium" style={{ color: dept.has_gap ? 'var(--fg-error-primary)' : 'var(--text-primary)' }}>
                {dept.name}
              </span>
              <span className="text-xs font-medium" style={{ color: dept.has_gap ? 'var(--fg-error-primary)' : 'var(--text-quaternary)' }}>
                {dept.has_gap ? 'Нет целей' : `${dept.goal_count}`}
              </span>
            </div>
            {dept.goals?.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {dept.goals.slice(0, 3).map((g) => (
                  <div key={g.id} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    <span className="h-1 w-1 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--fg-brand-primary)' }} />
                    <span className="truncate">{g.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function StrategyMap() {
  const currentPeriod = getCurrentPeriod()
  const [quarter, setQuarter] = useState(currentPeriod.quarter)
  const [year, setYear] = useState(currentPeriod.year)
  const yearOptions = getYearRange(currentPeriod.year, 1, 2)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [animated, setAnimated] = useState(0)

  const loadMap = useCallback(async () => {
    setLoading(true)
    setError(null)
    setData(null)
    setSelectedId(null)
    setAnimated(0)
    try {
      const result = await analyzeStrategy(quarter, year)
      setData(result)
      const total = (result.objectives || []).length
      for (let i = 0; i <= total; i++) {
        setTimeout(() => setAnimated(i), 300 + i * 250)
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'Ошибка анализа стратегии')
    }
    setLoading(false)
  }, [quarter, year])

  useEffect(() => { loadMap() }, [loadMap])

  const objectives = data?.objectives || []
  const summary = data?.summary || {}
  const selectedObj = objectives.find(o => o.id === selectedId)

  const handleSelect = (id) => setSelectedId(prev => prev === id ? null : id)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Карта стратегии</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            AI-анализ связи целей со стратегическими направлениями компании
          </p>
        </div>
        <div className="flex gap-2">
          <select className="select-field" value={quarter} onChange={(e) => setQuarter(e.target.value)}
            style={{ width: 'auto', paddingRight: '36px' }}>
            {QUARTERS.map(q => <option key={q}>{q}</option>)}
          </select>
          <select className="select-field" value={year} onChange={(e) => setYear(+e.target.value)}
            style={{ width: 'auto', paddingRight: '36px' }}>
            {yearOptions.map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="card p-12 flex flex-col items-center gap-4">
          <svg className="h-10 w-10 animate-spin" style={{ color: 'var(--fg-brand-primary)' }} viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <div className="text-center">
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>AI анализирует стратегию...</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Извлечение направлений и сопоставление целей</div>
          </div>
        </div>
      )}

      {error && <div className="status-error rounded-xl px-4 py-3 text-sm">{error}</div>}

      {/* Summary strip */}
      {data && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Направления', value: summary.total_objectives, color: 'var(--fg-brand-primary)' },
            { label: 'Целей', value: summary.total_goals, color: 'var(--text-primary)' },
            { label: 'Подразделений', value: summary.total_departments, color: 'var(--text-primary)' },
            { label: 'Пробелов', value: summary.total_gaps, color: summary.total_gaps > 0 ? 'var(--fg-error-primary)' : 'var(--fg-success-primary)' },
          ].map(m => (
            <div key={m.label} className="card px-4 py-3 text-center">
              <div className="text-2xl font-semibold" style={{ color: m.color }}>{m.value}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-quaternary)' }}>{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Mind Map */}
      {data && (
        <div className="card overflow-hidden" style={{ minHeight: '400px' }}>
          <MindMapGraph
            objectives={objectives}
            onSelectObjective={handleSelect}
            selectedId={selectedId}
            animated={animated}
          />
        </div>
      )}

      {/* Detail panel */}
      {selectedObj && <ObjectiveDetail objective={selectedObj} />}
    </div>
  )
}
