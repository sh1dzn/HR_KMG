import { useState, useEffect } from 'react'
import { getHeatmap } from '../api/client'

const MODES = [
  { key: 'smart', label: 'SMART' },
  { key: 'maturity', label: 'Зрелость' },
  { key: 'progress', label: 'Прогресс' },
]

function valueColor(v) {
  if (v >= 0.7) return { bg: 'rgba(22,163,74,0.12)', border: 'rgba(22,163,74,0.3)', text: '#16a34a' }
  if (v >= 0.5) return { bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.3)', text: '#ca8a04' }
  return { bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,0.3)', text: '#dc2626' }
}

export default function Heatmap({ quarter, year }) {
  const [mode, setMode] = useState('maturity')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    setLoading(true)
    getHeatmap(mode, quarter, year)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [mode, quarter, year])

  if (loading) return <div className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Загрузка тепловой карты...</div>
  if (!data) return null

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Тепловая карта организации</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Среднее по организации: {data.org_average}</p>
        </div>
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-secondary)' }}>
          {MODES.map(m => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: mode === m.key ? 'var(--bg-brand-primary)' : 'var(--bg-primary)',
                color: mode === m.key ? 'white' : 'var(--text-secondary)',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {data.departments.map(dept => {
          const c = valueColor(dept.value)
          const isExpanded = expanded === dept.id
          return (
            <div key={dept.id}>
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : dept.id)}
                className="w-full rounded-xl p-4 text-left transition-all"
                style={{ backgroundColor: c.bg, border: `1px solid ${c.border}` }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{dept.name}</span>
                  <span className="text-lg font-bold" style={{ color: c.text }}>{dept.value}</span>
                </div>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {dept.employee_count} сотр. &middot; {dept.employees.length} с целями
                </div>
              </button>
              {isExpanded && (
                <div className="mt-1 rounded-lg p-3 space-y-1.5" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                  {dept.employees.slice(0, 10).map(emp => {
                    const ec = valueColor(emp.value)
                    return (
                      <div key={emp.id} className="flex items-center justify-between text-xs">
                        <span className="truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{emp.name}</span>
                        <div className="flex items-center gap-2 ml-2">
                          <span style={{ color: 'var(--text-tertiary)' }}>{emp.goals_count} ц.</span>
                          <span className="font-semibold" style={{ color: ec.text }}>{emp.value}</span>
                        </div>
                      </div>
                    )
                  })}
                  {dept.employees.length > 10 && (
                    <div className="text-xs text-center pt-1" style={{ color: 'var(--text-tertiary)' }}>
                      и ещё {dept.employees.length - 10}...
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
