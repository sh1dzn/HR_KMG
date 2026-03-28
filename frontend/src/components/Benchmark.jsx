import { useState, useEffect } from 'react'
import { getBenchmark } from '../api/client'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts'

/* Untitled UI style medal icons */
function MedalIcon({ rank }) {
  const colors = { 1: '#F59E0B', 2: '#94A3B8', 3: '#CD7F32' }
  const color = colors[rank] || 'var(--text-quaternary)'
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="15" r="6" fill={color} fillOpacity="0.15" />
      <path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12" />
      <path d="M15 3h4l-2.5 4" /><path d="M9 3H5l2.5 4" /><path d="M12 3l2.5 4h-5L12 3z" />
    </svg>
  )
}
const RADAR_COLORS = ['#1570EF', '#E11D48', '#16A34A', '#CA8A04']
const CRITERIA_LABELS = { S: 'Конкретность', M: 'Измеримость', A: 'Достижимость', R: 'Релевантность', T: 'Срочность' }

export default function Benchmark({ quarter, year }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState([])
  const [sortKey, setSortKey] = useState('rank')
  const [sortAsc, setSortAsc] = useState(true)

  useEffect(() => {
    setLoading(true)
    getBenchmark(quarter, year)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [quarter, year])

  if (loading) return <div className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Загрузка бенчмарка...</div>
  if (!data) return null

  const toggleSelect = (deptId) => {
    setSelected(prev =>
      prev.includes(deptId) ? prev.filter(id => id !== deptId) : prev.length >= 4 ? prev : [...prev, deptId]
    )
  }

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(key === 'rank') }
  }

  const sorted = [...data.ranking].sort((a, b) => {
    const dir = sortAsc ? 1 : -1
    return (a[sortKey] - b[sortKey]) * dir
  })

  // Radar data
  const radarData = Object.entries(CRITERIA_LABELS).map(([key, label]) => {
    const entry = { criterion: label }
    entry['Среднее'] = data.org_average.smart_criteria[key] || 0
    for (const deptId of selected) {
      const dept = data.ranking.find(d => d.department_id === deptId)
      if (dept) entry[dept.department_name] = dept.smart_criteria[key] || 0
    }
    return entry
  })

  const cols = [
    { key: 'rank', label: '#', w: 'w-10' },
    { key: 'department_name', label: 'Отдел', w: 'flex-1' },
    { key: 'maturity', label: 'Зрелость', w: 'w-20' },
    { key: 'avg_smart', label: 'SMART', w: 'w-20' },
    { key: 'delta_from_avg', label: 'Дельта', w: 'w-20' },
    { key: 'goal_count', label: 'Целей', w: 'w-16' },
    { key: 'employee_count', label: 'Сотр.', w: 'w-16' },
  ]

  return (
    <div className="card p-4 sm:p-5 mb-6">
      <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Бенчмаркинг отделов</h3>

      {/* Table — desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-secondary)' }}>
              <th className="w-8 px-2 py-2"></th>
              {cols.map(c => (
                <th key={c.key} onClick={() => c.key !== 'department_name' && handleSort(c.key)}
                  className={`px-2 py-2 text-left font-medium ${c.w} ${c.key !== 'department_name' ? 'cursor-pointer' : ''}`}
                  style={{ color: 'var(--text-tertiary)' }}>
                  {c.label} {sortKey === c.key ? (sortAsc ? (
                    <svg className="inline h-3 w-3 ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5m0 0l-7 7m7-7l7 7"/></svg>
                  ) : (
                    <svg className="inline h-3 w-3 ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14m0 0l7-7m-7 7l-7-7"/></svg>
                  )) : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(dept => (
              <tr key={dept.department_id}
                style={{ borderBottom: '1px solid var(--border-secondary)' }}
                className="transition-colors"
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ''}>
                <td className="px-2 py-2.5">
                  <input type="checkbox" checked={selected.includes(dept.department_id)}
                    onChange={() => toggleSelect(dept.department_id)}
                    disabled={!selected.includes(dept.department_id) && selected.length >= 4} />
                </td>
                <td className="px-2 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                  {dept.rank <= 3 ? <MedalIcon rank={dept.rank} /> : dept.rank}
                </td>
                <td className="px-2 py-2.5" style={{ color: 'var(--text-primary)' }}>{dept.department_name}</td>
                <td className="px-2 py-2.5 font-semibold" style={{ color: 'var(--text-primary)' }}>{dept.maturity}</td>
                <td className="px-2 py-2.5" style={{ color: 'var(--text-secondary)' }}>{dept.avg_smart}</td>
                <td className="px-2 py-2.5">
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{
                    backgroundColor: dept.delta_from_avg >= 0 ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
                    color: dept.delta_from_avg >= 0 ? '#16a34a' : '#dc2626',
                  }}>
                    {dept.delta_from_avg >= 0 ? '+' : ''}{dept.delta_from_avg}
                  </span>
                </td>
                <td className="px-2 py-2.5" style={{ color: 'var(--text-tertiary)' }}>{dept.goal_count}</td>
                <td className="px-2 py-2.5" style={{ color: 'var(--text-tertiary)' }}>{dept.employee_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards — mobile */}
      <div className="grid gap-3 md:hidden">
        {sorted.map(dept => (
          <div key={dept.department_id} className="rounded-xl p-3.5"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
            <div className="flex items-center gap-2 mb-2.5">
              <input type="checkbox" checked={selected.includes(dept.department_id)}
                onChange={() => toggleSelect(dept.department_id)}
                disabled={!selected.includes(dept.department_id) && selected.length >= 4} />
              <span className="flex-shrink-0">
                {dept.rank <= 3 ? <MedalIcon rank={dept.rank} /> : (
                  <span className="text-sm font-medium" style={{ color: 'var(--text-quaternary)' }}>#{dept.rank}</span>
                )}
              </span>
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{dept.department_name}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
                <div style={{ color: 'var(--text-quaternary)' }}>Зрелость</div>
                <div className="mt-0.5 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{dept.maturity}</div>
              </div>
              <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
                <div style={{ color: 'var(--text-quaternary)' }}>SMART</div>
                <div className="mt-0.5 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{dept.avg_smart}</div>
              </div>
              <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
                <div style={{ color: 'var(--text-quaternary)' }}>Дельта</div>
                <div className="mt-0.5 text-sm font-semibold" style={{
                  color: dept.delta_from_avg >= 0 ? '#16a34a' : '#dc2626',
                }}>{dept.delta_from_avg >= 0 ? '+' : ''}{dept.delta_from_avg}</div>
              </div>
              <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
                <div style={{ color: 'var(--text-quaternary)' }}>Целей / Сотр.</div>
                <div className="mt-0.5 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{dept.goal_count} / {dept.employee_count}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Radar Chart */}
      {selected.length >= 2 && (
        <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--border-secondary)' }}>
          <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Сравнение по SMART-критериям</h4>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="var(--border-secondary)" />
              <PolarAngleAxis dataKey="criterion" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
              <PolarRadiusAxis angle={90} domain={[0, 1]} tick={{ fill: 'var(--text-quaternary)', fontSize: 10 }} />
              <Radar name="Среднее" dataKey="Среднее" stroke="var(--text-quaternary)" fill="none" strokeDasharray="5 5" />
              {selected.map((deptId, i) => {
                const dept = data.ranking.find(d => d.department_id === deptId)
                return dept ? (
                  <Radar key={deptId} name={dept.department_name} dataKey={dept.department_name}
                    stroke={RADAR_COLORS[i]} fill={RADAR_COLORS[i]} fillOpacity={0.15} />
                ) : null
              })}
              <Legend />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
