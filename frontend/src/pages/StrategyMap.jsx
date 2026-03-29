import { useState, useEffect } from 'react'
import { analyzeStrategy } from '../api/client'
import { getCurrentPeriod, getYearRange, QUARTERS } from '../utils/period'

function scoreColor(score) {
  if (score >= 0.5) return 'var(--fg-success-primary)'
  if (score >= 0.2) return 'var(--text-warning-primary)'
  return 'var(--fg-error-primary)'
}

function CoverageBar({ score }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.round(score * 100)}%`, backgroundColor: scoreColor(score) }} />
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color: scoreColor(score) }}>
        {Math.round(score * 100)}%
      </span>
    </div>
  )
}

export default function StrategyMap() {
  const currentPeriod = getCurrentPeriod()
  const [quarter, setQuarter] = useState(currentPeriod.quarter)
  const [year, setYear] = useState(currentPeriod.year)
  const yearOptions = getYearRange(currentPeriod.year, 1, 2)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expandedObj, setExpandedObj] = useState(null)
  const [animatedItems, setAnimatedItems] = useState(0)

  const loadMap = async () => {
    setLoading(true)
    setError(null)
    setData(null)
    setAnimatedItems(0)
    try {
      const result = await analyzeStrategy(quarter, year)
      setData(result)
      // Animate items appearing one by one
      const total = (result.objectives || []).length
      for (let i = 0; i <= total; i++) {
        setTimeout(() => setAnimatedItems(i), i * 200)
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'Ошибка анализа стратегии')
    }
    setLoading(false)
  }

  useEffect(() => { loadMap() }, [quarter, year]) // eslint-disable-line

  const objectives = data?.objectives || []
  const summary = data?.summary || {}

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Карта стратегии</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            AI-анализ связи целей сотрудников со стратегическими направлениями компании
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
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>AI анализирует стратегию...</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Извлечение целей из документов и сопоставление</div>
          </div>
        </div>
      )}

      {error && (
        <div className="status-error rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="card px-4 py-4">
            <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Направления</div>
            <div className="text-2xl font-semibold" style={{ color: 'var(--fg-brand-primary)' }}>{summary.total_objectives}</div>
          </div>
          <div className="card px-4 py-4">
            <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Целей</div>
            <div className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{summary.total_goals}</div>
          </div>
          <div className="card px-4 py-4">
            <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Подразделений</div>
            <div className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{summary.total_departments}</div>
          </div>
          <div className="card px-4 py-4">
            <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Пробелов</div>
            <div className="text-2xl font-semibold" style={{ color: summary.total_gaps > 0 ? 'var(--fg-error-primary)' : 'var(--fg-success-primary)' }}>
              {summary.total_gaps}
            </div>
          </div>
        </div>
      )}

      {/* Strategy tree */}
      {data && (
        <div className="space-y-4">
          {/* Root node */}
          <div className="card p-4 flex items-center gap-3" style={{ borderLeft: '3px solid var(--fg-brand-primary)' }}>
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl icon-box-brand">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Стратегия компании</div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Источники: {(summary.source_documents || []).map(d => d.title).join(', ')}
              </div>
            </div>
          </div>

          {/* Objective nodes */}
          {objectives.map((obj, idx) => {
            if (idx >= animatedItems) return null
            const isExpanded = expandedObj === obj.id
            const gapDepts = (obj.departments || []).filter(d => d.has_gap)
            const coveredDepts = (obj.departments || []).filter(d => !d.has_gap)

            return (
              <div key={obj.id} className="ml-6 animate-fade-in" style={{ animationDelay: `${idx * 100}ms` }}>
                {/* Connector line */}
                <div className="flex items-stretch">
                  <div className="w-6 flex-shrink-0 flex items-center justify-center">
                    <div className="w-px h-full" style={{ backgroundColor: 'var(--border-secondary)' }} />
                  </div>

                  <div className="flex-1">
                    {/* Objective card */}
                    <div
                      className="card p-4 cursor-pointer transition-all duration-150"
                      style={{ borderLeft: `3px solid ${scoreColor(obj.coverage_score)}` }}
                      onClick={() => setExpandedObj(isExpanded ? null : obj.id)}
                      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0px 4px 8px rgba(10,13,18,0.08)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '' }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{obj.title}</div>
                          <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{obj.description}</div>
                          <div className="mt-2 max-w-xs">
                            <CoverageBar score={obj.coverage_score} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-quaternary)' }}>
                            {obj.total_goals_matched} целей
                          </span>
                          {gapDepts.length > 0 && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: 'var(--bg-error-secondary)', color: 'var(--fg-error-primary)' }}>
                              {gapDepts.length} пробел{gapDepts.length > 1 ? (gapDepts.length < 5 ? 'а' : 'ов') : ''}
                            </span>
                          )}
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            style={{ color: 'var(--fg-quaternary)', transform: isExpanded ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }}>
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Expanded: department list */}
                    {isExpanded && (
                      <div className="ml-6 mt-2 space-y-2 animate-fade-in">
                        {(obj.departments || []).filter(d => d.goal_count > 0 || d.has_gap).map((dept) => (
                          <div
                            key={dept.id}
                            className="rounded-xl px-4 py-3"
                            style={{
                              backgroundColor: dept.has_gap ? 'var(--bg-error-secondary)' : 'var(--bg-secondary)',
                              border: `1px solid ${dept.has_gap ? 'var(--border-error)' : 'var(--border-secondary)'}`,
                            }}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium" style={{ color: dept.has_gap ? 'var(--fg-error-primary)' : 'var(--text-primary)' }}>
                                {dept.name}
                              </span>
                              {dept.has_gap ? (
                                <span className="text-xs font-medium" style={{ color: 'var(--fg-error-primary)' }}>
                                  Нет целей
                                </span>
                              ) : (
                                <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>
                                  {dept.goal_count} целей
                                </span>
                              )}
                            </div>
                            {dept.goals?.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {dept.goals.map((g) => (
                                  <div key={g.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                    <span className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: g.status === 'done' || g.status === 'approved' ? 'var(--fg-success-primary)' : 'var(--fg-brand-primary)' }} />
                                    <span className="truncate">{g.text}</span>
                                    {g.employee_name && (
                                      <span className="flex-shrink-0" style={{ color: 'var(--text-quaternary)' }}>— {g.employee_name.split(' ').slice(0, 2).join(' ')}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
