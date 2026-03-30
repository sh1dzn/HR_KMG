import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ArrowDownTrayIcon,
  ArrowsRightLeftIcon,
  BoltIcon,
  BuildingOffice2Icon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'
import { analyzeStrategy } from '../api/client'
import { getCurrentPeriod, getYearRange, QUARTERS } from '../utils/period'

function coverageTone(score) {
  if (score >= 0.5) {
    return {
      badgeClass: 'badge-success',
      textColor: 'var(--text-success-primary)',
      accent: 'var(--fg-success-primary)',
      softBg: 'var(--bg-success-primary)',
      surfaceBg: 'var(--bg-success-secondary)',
      border: 'var(--border-success)',
      label: 'Сильное покрытие',
    }
  }
  if (score >= 0.2) {
    return {
      badgeClass: 'badge-warning',
      textColor: 'var(--text-warning-primary)',
      accent: 'var(--fg-warning-primary)',
      softBg: 'var(--bg-warning-primary)',
      surfaceBg: 'var(--bg-warning-secondary)',
      border: 'var(--border-warning)',
      label: 'Частичное покрытие',
    }
  }
  return {
    badgeClass: 'badge-error',
    textColor: 'var(--text-error-primary)',
    accent: 'var(--fg-error-primary)',
    softBg: 'var(--bg-error-primary)',
    surfaceBg: 'var(--bg-error-secondary)',
    border: 'var(--border-error-secondary)',
    label: 'Есть разрывы',
  }
}

function objectiveCoveragePercent(objective) {
  const departments = objective?.departments || []
  if (!departments.length) return 0
  const covered = departments.filter((dept) => !dept.has_gap).length
  return Math.round((covered / departments.length) * 100)
}

function makeGapRadar(objectives) {
  return objectives
    .flatMap((objective) => {
      const objectivePercent = objectiveCoveragePercent(objective)
      return (objective.departments || [])
        .filter((dept) => dept.has_gap)
        .map((dept) => ({
          id: `${objective.id}-${dept.id}`,
          objectiveId: objective.id,
          objectiveTitle: objective.title,
          departmentId: dept.id,
          departmentName: dept.name,
          priority: 100 - objectivePercent + Math.min(25, (objective.description || '').length / 8),
          objectivePercent,
        }))
    })
    .sort((a, b) => b.priority - a.priority)
}

function exportGapRadar(items, quarter, year) {
  if (!items.length || typeof window === 'undefined') return
  const rows = [
    ['Приоритет', 'Стратегическое направление', 'Подразделение', 'Покрытие направления %'],
    ...items.map((item, index) => [
      index + 1,
      item.objectiveTitle,
      item.departmentName,
      item.objectivePercent,
    ]),
  ]

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\n')

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `strategy-gap-radar-${quarter}-${year}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function SummaryCard({ icon: Icon, label, value, tone = 'default', helper }) {
  const colorMap = {
    default: 'var(--text-primary)',
    brand: 'var(--fg-brand-primary)',
    success: 'var(--fg-success-primary)',
    warning: 'var(--fg-warning-primary)',
    error: 'var(--fg-error-primary)',
  }

  return (
    <div className="card px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>{label}</div>
          <div className="mt-2 text-2xl font-semibold" style={{ color: colorMap[tone] || colorMap.default }}>{value}</div>
          {helper ? <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>{helper}</div> : null}
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{
            backgroundColor: tone === 'error' ? 'var(--bg-error-primary)' : tone === 'success' ? 'var(--bg-success-primary)' : tone === 'warning' ? 'var(--bg-warning-primary)' : 'var(--bg-brand-primary)',
            color: colorMap[tone] || 'var(--fg-brand-primary)',
          }}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

function ObjectiveList({ objectives, selectedId, onSelect }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Стратегические направления</div>
          <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>Список отсортирован по покрытию и количеству пробелов.</div>
        </div>
        <div className="badge-gray">{objectives.length}</div>
      </div>
      <div className="max-h-[680px] overflow-y-auto">
        {objectives.map((objective) => {
          const tone = coverageTone(objective.coverage_score)
          const percent = objectiveCoveragePercent(objective)
          const gaps = (objective.departments || []).filter((dept) => dept.has_gap).length
          const isActive = selectedId === objective.id
          return (
            <button
              key={objective.id}
              type="button"
              onClick={() => onSelect(objective.id)}
              className="w-full px-5 py-4 text-left transition-colors duration-150"
              style={{
                backgroundColor: isActive ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                borderBottom: '1px solid var(--border-secondary)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold leading-5" style={{ color: 'var(--text-primary)' }}>{objective.title}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>{objective.description}</div>
                </div>
                <div className={`flex-shrink-0 ${tone.badgeClass}`}>{percent}%</div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div style={{ color: 'var(--text-quaternary)' }}>Цели</div>
                  <div className="mt-1 font-semibold" style={{ color: 'var(--text-primary)' }}>{objective.total_goals_matched}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-quaternary)' }}>Без пробела</div>
                  <div className="mt-1 font-semibold" style={{ color: tone.textColor }}>{(objective.departments || []).length - gaps}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-quaternary)' }}>Пробелы</div>
                  <div className="mt-1 font-semibold" style={{ color: gaps > 0 ? 'var(--fg-error-primary)' : 'var(--fg-success-primary)' }}>{gaps}</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DepartmentCascade({ objective, departmentFilter, setDepartmentFilter }) {
  const visibleDepartments = useMemo(() => {
    const departments = objective?.departments || []
    if (departmentFilter === 'gap') return departments.filter((dept) => dept.has_gap)
    if (departmentFilter === 'covered') return departments.filter((dept) => !dept.has_gap)
    return departments
  }, [objective, departmentFilter])

  if (!objective) {
    return (
      <div className="card p-8">
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Выберите направление</div>
        <div className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>Справа появится каскад по подразделениям и список связанных целей.</div>
      </div>
    )
  }

  const tone = coverageTone(objective.coverage_score)
  const totalDepartments = (objective.departments || []).length
  const coveredDepartments = (objective.departments || []).filter((dept) => !dept.has_gap).length
  const gaps = totalDepartments - coveredDepartments
  const percent = objectiveCoveragePercent(objective)

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="px-5 py-5" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className={tone.badgeClass}>{tone.label}</div>
                <div className="badge-gray">{percent}% покрытие</div>
              </div>
              <div className="mt-3 text-lg font-semibold leading-7" style={{ color: 'var(--text-primary)' }}>{objective.title}</div>
              <div className="mt-2 max-w-3xl text-sm leading-6" style={{ color: 'var(--text-tertiary)' }}>{objective.description}</div>
            </div>
            <div className="grid w-full grid-cols-3 gap-2 lg:w-[320px]">
              <div className="rounded-lg px-3 py-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>Подразделений</div>
                <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{totalDepartments}</div>
              </div>
              <div className="rounded-lg px-3 py-3" style={{ backgroundColor: 'var(--bg-success-primary)', border: '1px solid var(--border-success)' }}>
                <div className="text-xs" style={{ color: 'var(--text-success-primary)' }}>Покрыто</div>
                <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--text-success-primary)' }}>{coveredDepartments}</div>
              </div>
              <div className="rounded-lg px-3 py-3" style={{ backgroundColor: 'var(--bg-error-primary)', border: '1px solid var(--border-error-secondary)' }}>
                <div className="text-xs" style={{ color: 'var(--text-error-primary)' }}>Пробелы</div>
                <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--text-error-primary)' }}>{gaps}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 px-5 py-3" style={{ borderBottom: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
          {[
            { id: 'all', label: 'Все подразделения' },
            { id: 'gap', label: 'Только с пробелом' },
            { id: 'covered', label: 'Только покрытые' },
          ].map((item) => {
            const active = departmentFilter === item.id
            return (
              <button
                key={item.id}
                type="button"
                className="rounded-lg px-3 py-2 text-xs font-medium transition-colors duration-150"
                onClick={() => setDepartmentFilter(item.id)}
                style={{
                  backgroundColor: active ? 'var(--bg-primary)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  border: `1px solid ${active ? 'var(--border-primary)' : 'var(--border-secondary)'}`,
                }}
              >
                {item.label}
              </button>
            )
          })}
        </div>

        <div className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
          {visibleDepartments.length === 0 ? (
            <div className="px-5 py-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>Нет подразделений для выбранного фильтра.</div>
          ) : visibleDepartments.map((dept) => (
            <div key={dept.id} className="px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold" style={{ color: dept.has_gap ? 'var(--text-error-primary)' : 'var(--text-primary)' }}>{dept.name}</div>
                    <div className={dept.has_gap ? 'badge-error' : 'badge-success'}>{dept.has_gap ? 'Нет связки' : `${dept.goal_count} целей`}</div>
                  </div>
                  {dept.has_gap ? (
                    <div className="mt-2 text-sm leading-6" style={{ color: 'var(--text-tertiary)' }}>
                      Для этого направления у подразделения нет найденных целей. Это прямой кандидат на постановку или каскадирование.
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      {(dept.goals || []).map((goal) => (
                        <div
                          key={goal.id}
                          className="rounded-lg px-3 py-3"
                          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
                        >
                          <div className="text-sm leading-6" style={{ color: 'var(--text-primary)' }}>{goal.text}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {goal.employee_name ? <span>{goal.employee_name}</span> : null}
                            {goal.status ? <span>• {goal.status}</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="w-full lg:w-[180px]">
                  <div className="rounded-lg px-3 py-3" style={{ backgroundColor: dept.has_gap ? 'var(--bg-error-primary)' : tone.softBg, border: `1px solid ${dept.has_gap ? 'var(--border-error-secondary)' : tone.border}` }}>
                    <div className="text-xs" style={{ color: dept.has_gap ? 'var(--text-error-primary)' : tone.textColor }}>Статус подразделения</div>
                    <div className="mt-1 text-sm font-semibold" style={{ color: dept.has_gap ? 'var(--text-error-primary)' : tone.textColor }}>
                      {dept.has_gap ? 'Требуется новая цель' : 'Есть операционное покрытие'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function GapRadar({ items, onJump, quarter, year }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            <BoltIcon className="h-4 w-4" style={{ color: 'var(--fg-error-primary)' }} />
            Gap Radar
          </div>
          <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Killer feature: автоматический список самых критичных разрывов, чтобы не искать их вручную по всей карте.
          </div>
        </div>
        <button type="button" className="btn-secondary" onClick={() => exportGapRadar(items, quarter, year)} disabled={!items.length}>
          <ArrowDownTrayIcon className="h-4 w-4" />
          Экспорт CSV
        </button>
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>Критичных разрывов не найдено.</div>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
          {items.slice(0, 8).map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onJump(item.objectiveId)}
              className="flex w-full flex-col gap-3 px-5 py-4 text-left transition-colors duration-150 sm:flex-row sm:items-center sm:justify-between"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
                  style={{ backgroundColor: 'var(--bg-error-primary)', color: 'var(--text-error-primary)' }}
                >
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{item.objectiveTitle}</div>
                  <div className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>{item.departmentName} не имеет целей по этому направлению.</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="badge-error">Приоритет {Math.round(item.priority)}</div>
                <div className="badge-gray">Покрытие {item.objectivePercent}%</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CoverageMatrix({ objectives, selectedId, onSelect }) {
  const departments = useMemo(() => {
    const names = new Map()
    objectives.forEach((objective) => {
      (objective.departments || []).forEach((dept) => {
        if (!names.has(dept.id)) names.set(dept.id, dept.name)
      })
    })
    return Array.from(names.entries()).map(([id, name]) => ({ id, name }))
  }, [objectives])

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          <Squares2X2Icon className="h-4 w-4" />
          Матрица покрытия
        </div>
        <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Быстрый обзор по всем направлениям и подразделениям без наложений и лишней графики.
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <tr>
              <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-quaternary)' }}>Направление</th>
              {departments.map((dept) => (
                <th key={dept.id} className="px-3 py-3 text-center font-medium" style={{ color: 'var(--text-quaternary)' }}>{dept.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {objectives.map((objective) => (
              <tr
                key={objective.id}
                onClick={() => onSelect(objective.id)}
                className="cursor-pointer transition-colors duration-150"
                style={{ backgroundColor: selectedId === objective.id ? 'var(--bg-secondary)' : 'var(--bg-primary)' }}
              >
                <td className="px-4 py-3 align-top" style={{ borderTop: '1px solid var(--border-secondary)' }}>
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{objective.title}</div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>{objectiveCoveragePercent(objective)}% покрытия</div>
                </td>
                {departments.map((dept) => {
                  const match = (objective.departments || []).find((entry) => entry.id === dept.id)
                  const cellBg = !match
                    ? 'var(--bg-secondary)'
                    : match.has_gap
                      ? 'var(--bg-error-primary)'
                      : 'var(--bg-success-primary)'
                  const cellColor = !match
                    ? 'var(--text-quaternary)'
                    : match.has_gap
                      ? 'var(--text-error-primary)'
                      : 'var(--text-success-primary)'
                  return (
                    <td key={dept.id} className="px-3 py-3 text-center align-middle" style={{ borderTop: '1px solid var(--border-secondary)' }}>
                      <div className="inline-flex min-w-[40px] items-center justify-center rounded-md px-2 py-1 text-xs font-semibold" style={{ backgroundColor: cellBg, color: cellColor }}>
                        {!match ? '—' : match.has_gap ? '0' : match.goal_count}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [showOnlyGaps, setShowOnlyGaps] = useState(false)
  const [departmentFilter, setDepartmentFilter] = useState('all')

  const loadMap = useCallback(async () => {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const result = await analyzeStrategy(quarter, year)
      setData(result)
    } catch (e) {
      setError(e.response?.data?.detail || 'Ошибка анализа стратегии')
    } finally {
      setLoading(false)
    }
  }, [quarter, year])

  useEffect(() => {
    loadMap()
  }, [loadMap])

  const objectives = useMemo(() => {
    const source = data?.objectives || []
    return source
      .map((objective) => ({
        ...objective,
        gapCount: (objective.departments || []).filter((dept) => dept.has_gap).length,
        coveragePercent: objectiveCoveragePercent(objective),
      }))
      .filter((objective) => {
        const query = search.trim().toLowerCase()
        const matchesQuery = !query || `${objective.title} ${objective.description}`.toLowerCase().includes(query)
        const matchesGap = !showOnlyGaps || objective.gapCount > 0
        return matchesQuery && matchesGap
      })
      .sort((a, b) => {
        if (a.coveragePercent !== b.coveragePercent) return a.coveragePercent - b.coveragePercent
        if (a.gapCount !== b.gapCount) return b.gapCount - a.gapCount
        return b.total_goals_matched - a.total_goals_matched
      })
  }, [data, search, showOnlyGaps])

  useEffect(() => {
    if (!objectives.length) {
      setSelectedId(null)
      return
    }
    const hasSelected = objectives.some((objective) => objective.id === selectedId)
    if (!hasSelected) setSelectedId(objectives[0].id)
  }, [objectives, selectedId])

  useEffect(() => {
    setDepartmentFilter('all')
  }, [selectedId])

  const selectedObjective = objectives.find((objective) => objective.id === selectedId) || null
  const summary = data?.summary || {}
  const gapRadar = useMemo(() => makeGapRadar(data?.objectives || []), [data])
  const strongestObjective = useMemo(() => {
    if (!data?.objectives?.length) return null
    return [...data.objectives].sort((a, b) => objectiveCoveragePercent(b) - objectiveCoveragePercent(a))[0]
  }, [data])
  const weakestObjective = objectives[0] || null

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Карта стратегии</h1>
          <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-tertiary)' }}>
            Каскад стратегических направлений по подразделениям и целям. Новый layout убирает наложения, делает проблемные зоны явными и позволяет быстро перейти к слабому месту.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="select-field" value={quarter} onChange={(e) => setQuarter(e.target.value)} style={{ width: 'auto', paddingRight: '36px' }}>
            {QUARTERS.map((q) => <option key={q}>{q}</option>)}
          </select>
          <select className="select-field" value={year} onChange={(e) => setYear(+e.target.value)} style={{ width: 'auto', paddingRight: '36px' }}>
            {yearOptions.map((y) => <option key={y}>{y}</option>)}
          </select>
          <button type="button" className="btn-secondary" onClick={loadMap}>
            <ArrowsRightLeftIcon className="h-4 w-4" />
            Обновить
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card p-12">
          <div className="flex items-center gap-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
            AI анализирует стратегию и пересчитывает покрытие.
          </div>
        </div>
      ) : null}

      {error ? <div className="status-error rounded-lg px-4 py-3 text-sm">{error}</div> : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={BuildingOffice2Icon} label="Стратегических направлений" value={summary.total_objectives || 0} tone="brand" />
            <SummaryCard icon={Squares2X2Icon} label="Связанных целей" value={summary.total_goals || 0} helper="По выбранному периоду" />
            <SummaryCard icon={ExclamationTriangleIcon} label="Разрывов" value={summary.total_gaps || 0} tone={(summary.total_gaps || 0) > 0 ? 'error' : 'success'} helper={(summary.total_gaps || 0) > 0 ? 'Нужны действия' : 'Критичных разрывов нет'} />
            <SummaryCard icon={BoltIcon} label="Самое слабое направление" value={weakestObjective ? `${weakestObjective.coveragePercent}%` : '—'} tone={weakestObjective?.gapCount ? 'warning' : 'success'} helper={weakestObjective?.title || 'Нет данных'} />
          </div>

          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.45fr)]">
            <div className="space-y-4">
              <div className="card p-4">
                <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                  <MagnifyingGlassIcon className="h-4 w-4" style={{ color: 'var(--text-quaternary)' }} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск по направлению"
                    className="w-full bg-transparent text-sm outline-none"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  <input type="checkbox" checked={showOnlyGaps} onChange={(e) => setShowOnlyGaps(e.target.checked)} />
                  Только направления с пробелами
                </label>
                {strongestObjective ? (
                  <div className="mt-4 rounded-lg px-3 py-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                    <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>Лучшее покрытие</div>
                    <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{strongestObjective.title}</div>
                    <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>{objectiveCoveragePercent(strongestObjective)}% подразделений уже закрыты.</div>
                  </div>
                ) : null}
              </div>

              <ObjectiveList objectives={objectives} selectedId={selectedId} onSelect={setSelectedId} />
            </div>

            <DepartmentCascade objective={selectedObjective} departmentFilter={departmentFilter} setDepartmentFilter={setDepartmentFilter} />
          </div>

          <GapRadar items={gapRadar} onJump={setSelectedId} quarter={quarter} year={year} />

          <CoverageMatrix objectives={objectives} selectedId={selectedId} onSelect={setSelectedId} />
        </>
      ) : null}
    </div>
  )
}
