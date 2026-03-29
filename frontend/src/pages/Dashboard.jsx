import { useMemo, useState, useEffect } from 'react'
import { getDashboardSummary, getDashboardTrends, getRiskOverview } from '../api/client'
import Heatmap from '../components/Heatmap'
import Benchmark from '../components/Benchmark'
import RiskBadge from '../components/RiskBadge'
import { getCurrentPeriod, getYearRange, QUARTERS } from '../utils/period'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Legend,
  AreaChart, Area, Label,
} from 'recharts'

const PIE_COLORS = ['#1570EF', '#2E90FA', '#53B1FD', '#84CAFF', '#D1E9FF']

const CardShell = ({ children, className = '' }) => (
  <div className={`card ${className}`}>{children}</div>
)

/* ── Chart Tooltip ─────────────────────────────────────────── */
const ChartTooltip = ({ active, payload, label, isPie = false }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2.5 text-sm" style={{
      backgroundColor: 'var(--bg-primary)',
      border: '1px solid var(--border-secondary)',
      boxShadow: '0px 4px 8px -2px rgba(10,13,18,0.10), 0px 2px 4px -2px rgba(10,13,18,0.06)',
    }}>
      {label && <p className="font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>{label}</p>}
      {payload.map((e, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: e.color || e.payload?.fill }} />
          <span style={{ color: 'var(--text-tertiary)' }}>{e.name}:</span>
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {isPie ? `${e.value.toFixed(1)}%` : `${e.value}%`}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ── Chart Legend ─────────────────────────────────────────── */
const ChartLegend = ({ payload }) => {
  if (!payload?.length) return null
  return (
    <div className="flex flex-col gap-2 pl-4">
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Metric Card ─────────────────────────────────────────── */
function TrendUpIcon(props) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  )
}
function TrendDownIcon(props) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" />
    </svg>
  )
}

const MetricCard = ({ label, value, change, changeLabel, icon: MetricIcon, accent = false }) => {
  const isPositive = change >= 0
  return (
    <CardShell>
      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <span className="text-xs sm:text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
          {MetricIcon && (
            <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ border: '1px solid var(--border-secondary)', color: 'var(--fg-quaternary)' }}
            >
              <MetricIcon />
            </div>
          )}
        </div>
        <div className="flex items-end gap-2 sm:gap-4 flex-wrap">
          <span className="text-2xl sm:text-3xl font-semibold" style={{ color: accent ? 'var(--fg-brand-primary)' : 'var(--text-primary)' }}>
            {value}
          </span>
          {change != null && (
            <div className="flex items-center gap-1 mb-0.5 sm:mb-1">
              <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium"
                style={{
                  backgroundColor: isPositive ? 'var(--bg-success-primary, #ECFDF3)' : 'var(--bg-error-primary, #FEF3F2)',
                  color: isPositive ? 'var(--text-success-primary, #039855)' : 'var(--fg-error-secondary, #D92D20)',
                }}
              >
                {isPositive ? <TrendUpIcon style={{ width: 12, height: 12 }} /> : <TrendDownIcon style={{ width: 12, height: 12 }} />}
                {Math.abs(change)}%
              </span>
              {changeLabel && (
                <span className="text-[10px] sm:text-xs hidden sm:inline" style={{ color: 'var(--text-quaternary)' }}>{changeLabel}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </CardShell>
  )
}

const getScoreBadge = (score) => {
  if (score >= 0.85) return { bg: 'var(--bg-success-primary)', color: 'var(--text-success-primary)', border: 'var(--border-success)' }
  if (score >= 0.7)  return { bg: 'var(--bg-warning-primary)', color: 'var(--text-warning-primary)', border: 'var(--border-warning)' }
  return { bg: 'var(--bg-error-primary)', color: 'var(--fg-error-secondary)', border: 'var(--border-error-secondary)' }
}

export default function Dashboard() {
  const currentPeriod = getCurrentPeriod()
  const yearOptions = getYearRange(currentPeriod.year, 1, 2)
  const [quarter, setQuarter] = useState(currentPeriod.quarter)
  const [year,    setYear]    = useState(currentPeriod.year)
  const [loading, setLoading] = useState(false)
  const [data,    setData]    = useState(null)
  const [trends,  setTrends]  = useState(null)
  const [riskOverview, setRiskOverview] = useState(null)
  const [error,   setError]   = useState(null)
  const [isMobile, setIsMobile] = useState(false)
  const [briefCopied, setBriefCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    const loadSummary = async () => {
      setLoading(true)
      setError(null)
      try {
        const summary = await getDashboardSummary(quarter, year)
        if (!cancelled) {
          setData(summary)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.response?.data?.detail || 'Ошибка загрузки данных')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    loadSummary()
    return () => {
      cancelled = true
    }
  }, [quarter, year])

  useEffect(() => {
    let cancelled = false
    setTrends(null)
    getDashboardTrends(year)
      .then((trendData) => {
        if (!cancelled) {
          setTrends(trendData)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTrends(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [year])

  useEffect(() => {
    let cancelled = false
    const loadRisk = async () => {
      try {
        const risk = await getRiskOverview(quarter, year)
        if (!cancelled) {
          setRiskOverview(risk)
        }
      } catch {
        if (!cancelled) {
          setRiskOverview(null)
        }
      }
    }
    loadRisk()
    return () => {
      cancelled = true
    }
  }, [quarter, year])

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const pieData = data ? [
    { name: 'Стратегические',  value: data.strategic_goals_percent, fill: PIE_COLORS[0] },
    { name: 'Функциональные',  value: data.functional_goals_percent, fill: PIE_COLORS[1] },
    { name: 'Операционные',    value: data.operational_goals_percent, fill: PIE_COLORS[2] },
  ] : []

  const barData = data?.departments_stats?.map(d => ({
    name:     d.department_name.substring(0, 14),
    score:    +(d.average_smart_score * 100).toFixed(0),
    maturity: +(d.maturity_index * 100).toFixed(0),
  })) || []

  const trendData = trends?.trends?.map(t => ({
    label: t.label,
    smart: +(t.average_smart_score * 100).toFixed(0),
    strategic: +t.strategic_percent.toFixed(0),
  })) || []

  const executiveBrief = useMemo(() => {
    if (!data) return null

    const departments = [...(data.departments_stats || [])]
      .sort((a, b) => (b.maturity_index || 0) - (a.maturity_index || 0))

    const top = departments.slice(0, 2).map((d) => d.department_name)
    const risk = departments.slice(-2).map((d) => d.department_name)

    const smart = Math.round((data.average_smart_score || 0) * 100)
    const strategic = Math.round(data.strategic_goals_percent || 0)
    const functional = Math.round(data.functional_goals_percent || 0)
    const operational = Math.round(data.operational_goals_percent || 0)

    const actions = []
    if (smart < 70) actions.push('Запустить обязательный SMART-review перед отправкой целей на согласование')
    if (strategic < 30) actions.push('Увеличить долю стратегических целей в подразделениях с низкой зрелостью')
    if (operational > 45) actions.push('Снизить перекос в операционные задачи и усилить impact/output цели')
    if ((data.top_issues || []).length) actions.push(`Сфокусировать обучение на критериях: ${(data.top_issues || []).slice(0, 3).join(', ')}`)
    if (!actions.length) actions.push('Закрепить текущий стандарт: ежемесячный мониторинг зрелости и ранних рисков')

    return {
      headline: `Период ${quarter} ${year}: SMART ${smart}%, стратегическая связка ${strategic}%`,
      bullets: [
        `Лучшие подразделения по зрелости: ${top.length ? top.join(', ') : 'н/д'}.`,
        `Зоны риска: ${risk.length ? risk.join(', ') : 'н/д'}.`,
        `Баланс целей: стратегические ${strategic}%, функциональные ${functional}%, операционные ${operational}%.`,
      ],
      actions: actions.slice(0, 3),
    }
  }, [data, quarter, year])

  const exportCSV = () => {
    if (!data) return
    const BOM = '\uFEFF'
    const rows = [['Подразделение', 'Сотрудников', 'Целей', 'SMART %', 'Зрелость %', 'Стратег. %', 'Функц. %', 'Операц. %', 'Слабые критерии']]
    for (const d of data.departments_stats || []) {
      rows.push([
        d.department_name,
        d.total_employees,
        d.total_goals,
        Math.round((d.average_smart_score || 0) * 100),
        Math.round((d.maturity_index || 0) * 100),
        Math.round(d.strategic_percent || 0),
        Math.round(d.functional_percent || 0),
        Math.round(d.operational_percent || 0),
        (d.weak_criteria || []).join('; '),
      ])
    }
    rows.push([])
    rows.push(['Итого', data.total_employees, data.total_goals, Math.round((data.average_smart_score || 0) * 100), '', Math.round(data.strategic_goals_percent || 0), Math.round(data.functional_goals_percent || 0), Math.round(data.operational_goals_percent || 0), (data.top_issues || []).join('; ')])

    const csv = BOM + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dashboard_${quarter}_${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyExecutiveBrief = () => {
    if (!executiveBrief) return
    const text = [
      `## Executive Brief (${quarter} ${year})`,
      '',
      `- ${executiveBrief.headline}`,
      ...executiveBrief.bullets.map((item) => `- ${item}`),
      '',
      '### Рекомендуемые действия',
      ...executiveBrief.actions.map((item, idx) => `${idx + 1}. ${item}`),
    ].join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setBriefCopied(true)
      setTimeout(() => setBriefCopied(false), 1500)
    }).catch(() => {})
  }

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="h-8 w-8 animate-spin spinner-brand" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Загрузка данных...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="status-error rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Дашборд качества целеполагания</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Квартальная аналитика по качеству формулировок, зрелости подразделений и стратегической связке.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="select-field" value={quarter} onChange={(e) => setQuarter(e.target.value)} style={{ width: 'auto', paddingRight: '36px' }}>
            {QUARTERS.map(q => <option key={q}>{q}</option>)}
          </select>
          <select className="select-field" value={year} onChange={(e) => setYear(+e.target.value)} style={{ width: 'auto', paddingRight: '36px' }}>
            {yearOptions.map(y => <option key={y}>{y}</option>)}
          </select>
          {data && (
            <button type="button" onClick={exportCSV} className="btn-secondary flex items-center gap-1.5 text-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              CSV
            </button>
          )}
        </div>
      </div>

      {data && <Heatmap quarter={quarter} year={year} />}
      {data && <Benchmark quarter={quarter} year={year} />}

      {riskOverview && riskOverview.top_risks.length > 0 && (
        <CardShell>
          <div className="px-4 py-3 sm:px-5 sm:py-4" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--fg-error-secondary)' }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Цели под угрозой
                </div>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Топ-5 целей с наибольшим риском невыполнения
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#dc2626' }} />
                  <span className="hidden sm:inline">Высокий:</span> {riskOverview.risk_distribution.high}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#ca8a04' }} />
                  <span className="hidden sm:inline">Средний:</span> {riskOverview.risk_distribution.medium}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#16a34a' }} />
                  <span className="hidden sm:inline">Низкий:</span> {riskOverview.risk_distribution.low}
                </span>
              </div>
            </div>
          </div>
          <div className="divide-y" style={{ '--tw-divide-opacity': 1, borderColor: 'var(--border-secondary)' }}>
            {riskOverview.top_risks.slice(0, 5).map((item) => (
              <div key={item.goal_id} className="flex items-start gap-2.5 px-4 py-3 sm:items-center sm:gap-3 sm:px-5">
                <RiskBadge riskLevel={item.risk_score > 0.7 ? 'high' : item.risk_score >= 0.4 ? 'medium' : 'low'} riskScore={item.risk_score} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium line-clamp-2 sm:truncate" style={{ color: 'var(--text-primary)' }}>{item.goal_text}</div>
                  {(item.employee_name || item.department) && (
                    <div className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {[item.employee_name, item.department].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardShell>
      )}

      {executiveBrief && (
        <CardShell>
          <div className="px-4 py-3 sm:px-5 sm:py-4" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3h18v18H3z"/><path d="M7 8h10M7 12h10M7 16h6"/>
                </svg>
                Executive Brief
              </div>
              <button
                type="button"
                onClick={copyExecutiveBrief}
                className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                style={{ border: '1px solid var(--border-secondary)', color: 'var(--text-secondary)' }}
              >
                {briefCopied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
          </div>
          <div className="px-4 py-3 sm:px-5 sm:py-4 space-y-3">
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{executiveBrief.headline}</div>
            <ul className="space-y-1">
              {executiveBrief.bullets.map((item) => (
                <li key={item} className="text-sm" style={{ color: 'var(--text-tertiary)' }}>• {item}</li>
              ))}
            </ul>
            <div>
              <div className="text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Рекомендуемые действия
              </div>
              <ol className="space-y-1">
                {executiveBrief.actions.map((item, idx) => (
                  <li key={item} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {idx + 1}. {item}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </CardShell>
      )}

      {data && (
        <>
          {/* Metrics row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              label="Подразделений"
              value={data.total_departments}
              icon={(props) => (
                <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              )}
            />
            <MetricCard
              label="Сотрудников"
              value={data.total_employees}
              change={12}
              changeLabel="vs прош. кв."
              icon={(props) => (
                <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              )}
            />
            <MetricCard
              label="Целей"
              value={data.total_goals}
              change={8}
              changeLabel="vs прош. кв."
              icon={(props) => (
                <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
                </svg>
              )}
            />
            <MetricCard
              label="Средний SMART"
              value={`${(data.average_smart_score * 100).toFixed(0)}%`}
              change={data.average_smart_score >= 0.7 ? 5 : -3}
              changeLabel="vs прош. кв."
              accent
              icon={(props) => (
                <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              )}
            />
          </div>

          {/* Executive summary + Issues */}
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <CardShell>
              <div className="px-5 py-4">
                <div className="mb-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Executive summary</div>
                <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  В {data.quarter} {data.year} средний индекс качества целей составляет{' '}
                  <span style={{ color: 'var(--fg-brand-primary)' }}>{(data.average_smart_score * 100).toFixed(0)}%</span>.
                </p>
                <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-tertiary)' }}>
                  Доля стратегически связанных целей: {data.strategic_goals_percent.toFixed(1)}%.
                  Метрика показывает, насколько контур целей связан с общими приоритетами бизнеса.
                </p>
              </div>
            </CardShell>
            <CardShell>
              <div className="px-5 py-4">
                <div className="mb-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Top issues</div>
                {data.top_issues.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {data.top_issues.map((issue) => (
                      <span key={issue} className="badge-error">
                        {issue}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Критичных провалов не выявлено.</p>
                )}
              </div>
            </CardShell>
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <CardShell>
              <div className="px-5 py-4 pb-2">
                <div className="mb-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Стратегическая связка целей</div>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Распределение по типам целей</p>
              </div>
              <div className="px-4 pb-4" style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                    <Legend
                      verticalAlign="top"
                      align="right"
                      layout="vertical"
                      content={<ChartLegend />}
                    />
                    <Tooltip content={<ChartTooltip isPie />} />
                    <Pie
                      isAnimationActive={false}
                      startAngle={-270}
                      endAngle={-630}
                      stroke="none"
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      fill="currentColor"
                      innerRadius={isMobile ? 30 : 45}
                      outerRadius={isMobile ? 60 : 90}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardShell>

            <CardShell>
              <div className="px-5 py-4 pb-2">
                <div className="mb-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>SMART-индекс по подразделениям</div>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Среднее значение за квартал</p>
              </div>
              <div className="h-72 px-4 pb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-quaternary)' }} tickLine={false} axisLine={{ stroke: 'var(--border-secondary)' }} />
                    <YAxis dataKey="name" type="category" width={88} tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="score" fill="#1570EF" name="SMART %" radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardShell>
          </div>

          {/* Trend Area Chart */}
          {trendData.length > 1 && (
            <CardShell>
              <div className="px-5 py-4 pb-2">
                <div className="mb-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Динамика качества целеполагания</div>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Тренд SMART-индекса и доли стратегических целей по кварталам</p>
              </div>
              <div className="h-72 px-4 pb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: isMobile ? 6 : 12, bottom: isMobile ? 0 : 16 }}>
                    <CartesianGrid vertical={false} stroke="var(--border-secondary)" />
                    <Legend
                      align="right"
                      verticalAlign="top"
                      iconType="circle"
                      iconSize={8}
                      formatter={(v) => <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{v}</span>}
                    />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                      interval="preserveStartEnd"
                      padding={{ left: 10, right: 10 }}
                    >
                      {!isMobile && (
                        <Label fill="var(--text-quaternary)" style={{ fontSize: 11, fontWeight: 500 }} position="bottom">
                          Квартал
                        </Label>
                      )}
                    </XAxis>
                    <YAxis
                      domain={[0, 100]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'var(--text-quaternary)' }}
                      interval="preserveStartEnd"
                      tickFormatter={(v) => `${v}%`}
                    >
                      <Label
                        value="Индекс"
                        fill="var(--text-quaternary)"
                        style={{ textAnchor: 'middle', fontSize: 11, fontWeight: 500 }}
                        angle={-90}
                        position="insideLeft"
                      />
                    </YAxis>
                    <Tooltip
                      content={<ChartTooltip />}
                      formatter={(value) => `${value}%`}
                      cursor={{ stroke: '#1570EF', strokeWidth: 2 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="smart"
                      name="SMART %"
                      stroke="#1570EF"
                      strokeWidth={2}
                      fill="#1570EF"
                      fillOpacity={0.12}
                      activeDot={{ fill: 'var(--bg-primary)', stroke: '#1570EF', strokeWidth: 2, r: 5 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="strategic"
                      name="Стратегические %"
                      stroke="#17B26A"
                      strokeWidth={2}
                      fill="#17B26A"
                      fillOpacity={0.12}
                      activeDot={{ fill: 'var(--bg-primary)', stroke: '#17B26A', strokeWidth: 2, r: 5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardShell>
          )}

          {/* Department table — desktop */}
          <div className="card hidden overflow-hidden md:block"
          >
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Детализация по подразделениям</div>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Зрелость целеполагания и основные слабые критерии по каждому подразделению.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    {['Подразделение','Сотруд.','Целей','SMART','Зрелость','Слабые критерии'].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-medium"
                        style={{ color: 'var(--text-quaternary)', borderBottom: '1px solid var(--border-secondary)' }}
                      >{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.departments_stats.map((dept) => {
                    const smart   = (dept.average_smart_score * 100).toFixed(0)
                    const matPct  = (dept.maturity_index * 100).toFixed(0)
                    const badge   = getScoreBadge(dept.average_smart_score)
                    return (
                      <tr key={dept.department_id} className="transition-colors"
                        style={{ borderBottom: '1px solid var(--border-secondary)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                      >
                        <td className="px-6 py-4 font-medium" style={{ color: 'var(--text-primary)' }}>{dept.department_name}</td>
                        <td className="px-6 py-4 text-center" style={{ color: 'var(--text-secondary)' }}>{dept.total_employees}</td>
                        <td className="px-6 py-4 text-center" style={{ color: 'var(--text-secondary)' }}>{dept.total_goals}</td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold"
                            style={{ backgroundColor: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                          >
                            {smart}%
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col items-center gap-1">
                            <div className="h-2 w-28 overflow-hidden rounded-md" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' }}>
                              <div className="h-full progress-fill-brand" style={{ width: `${matPct}%` }} />
                            </div>
                            <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>{matPct}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {dept.weak_criteria.length > 0
                              ? dept.weak_criteria.map((c, i) => (
                                <span key={i} className="badge-error">{c}</span>
                              ))
                              : <span className="text-xs font-medium" style={{ color: 'var(--text-success-primary)' }}>Нет проблем</span>
                            }
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Department cards — mobile */}
          <div className="grid gap-3 md:hidden">
            {data.departments_stats.map((dept) => {
              const smart  = (dept.average_smart_score * 100).toFixed(0)
              const matPct = (dept.maturity_index * 100).toFixed(0)
              const badge  = getScoreBadge(dept.average_smart_score)
              return (
                <CardShell key={dept.department_id}>
                  <div className="px-5 py-4">
                    <div className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{dept.department_name}</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {[
                        { label: 'Сотрудников', value: dept.total_employees },
                        { label: 'Целей',       value: dept.total_goals },
                      ].map(({ label, value }) => (
                        <div key={label} className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                          <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>{label}</div>
                          <div className="mt-1 font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</div>
                        </div>
                      ))}
                      <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                        <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>SMART</div>
                        <div className="mt-1 font-semibold" style={{ color: badge.color }}>{smart}%</div>
                      </div>
                      <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                        <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>Зрелость</div>
                        <div className="mt-2 h-2 overflow-hidden rounded-md" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' }}>
                          <div className="h-full progress-fill-brand" style={{ width: `${matPct}%` }} />
                        </div>
                        <div className="mt-1 text-xs font-medium" style={{ color: 'var(--text-quaternary)' }}>{matPct}%</div>
                      </div>
                    </div>
                    {dept.weak_criteria.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {dept.weak_criteria.map((c, i) => (
                          <span key={i} className="badge-error">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </CardShell>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
