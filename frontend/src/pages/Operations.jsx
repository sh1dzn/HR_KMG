import { useEffect, useState } from 'react'
import {
  exportGoalsToHRSystem, getAlertsSummary, getDocumentIndexStatus,
  getEmployees, getIntegrationSystems, reindexDocuments,
} from '../api/client'
import EmployeePicker from '../components/EmployeePicker'

const severityBadge = {
  high:   { bg: 'var(--bg-error-primary)',   color: 'var(--fg-error-secondary)',  border: 'var(--border-error-secondary)', dot: 'var(--fg-error-secondary)' },
  medium: { bg: 'var(--bg-warning-primary)', color: 'var(--text-warning-primary)',border: 'var(--border-warning)', dot: 'var(--text-warning-primary)' },
  low:    { bg: 'var(--bg-tertiary)',         color: 'var(--text-secondary)',      border: 'var(--border-primary)', dot: 'var(--fg-quaternary)' },
}

const ALERTS_PER_PAGE = 15

const CardShell = ({ children, className = '' }) => (
  <div className={`card ${className}`}>{children}</div>
)

export default function Operations() {
  const [quarter,       setQuarter]       = useState('Q2')
  const [year,          setYear]          = useState(2026)
  const [alertsSummary, setAlertsSummary] = useState(null)
  const [indexStatus,   setIndexStatus]   = useState(null)
  const [employees,     setEmployees]     = useState([])
  const [systems,       setSystems]       = useState([])
  const [employeeId,    setEmployeeId]    = useState('')
  const [targetSystem,  setTargetSystem]  = useState('1c')
  const [exportResult,  setExportResult]  = useState(null)
  const [loadingAlerts, setLoadingAlerts] = useState(false)
  const [loadingIndex,  setLoadingIndex]  = useState(false)
  const [alertPage,     setAlertPage]     = useState(1)
  const [sevFilter,     setSevFilter]     = useState('')
  const [exporting,     setExporting]     = useState(false)
  const [error,         setError]         = useState(null)

  const downloadExportFile = () => {
    if (!exportResult) return
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const fn = `goals-export-${exportResult.target_system}-${exportResult.employee_id}-${ts}.json`
    const content = { batch_id: exportResult.batch_id, target_system: exportResult.target_system, employee_id: exportResult.employee_id, employee_name: exportResult.employee_name, exported_count: exportResult.exported_count, goal_refs: exportResult.goal_refs || [], payload: exportResult.payload || {} }
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = fn; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  useEffect(() => {
    const load = async () => {
      setError(null)
      try {
        const [emp, sys, idx] = await Promise.all([getEmployees(), getIntegrationSystems(), getDocumentIndexStatus()])
        setEmployees(emp.employees || [])
        setSystems(sys.systems || [])
        setIndexStatus(idx)
        if (emp.employees?.length > 0) setEmployeeId(emp.employees[0].id)
        if (sys.systems?.length > 0)   setTargetSystem(sys.systems[0].code)
      } catch (e) { setError(e.response?.data?.detail || 'Ошибка загрузки данных') }
    }
    load()
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoadingAlerts(true); setError(null)
      try {
        setAlertsSummary(await getAlertsSummary({ quarter, year, page: alertPage, per_page: ALERTS_PER_PAGE }))
      }
      catch (e) { setError(e.response?.data?.detail || 'Ошибка загрузки алертов') }
      finally { setLoadingAlerts(false) }
    }
    load()
  }, [quarter, year, alertPage])

  const handleReindex = async () => {
    setLoadingIndex(true); setError(null)
    try { await reindexDocuments(); setIndexStatus(await getDocumentIndexStatus()) }
    catch (e) { setError(e.response?.data?.detail || 'Ошибка переиндексации') }
    finally { setLoadingIndex(false) }
  }

  const handleExport = async () => {
    if (!employeeId || !targetSystem) return
    setExporting(true); setError(null)
    try { setExportResult(await exportGoalsToHRSystem({ employee_id: employeeId, quarter, year, target_system: targetSystem, include_drafts: true })) }
    catch (e) { setError(e.response?.data?.detail || 'Ошибка экспорта') }
    finally { setExporting(false) }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Операционный контур</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Alert Manager, управление индексом ВНД и mock-интеграция с внешними HR-системами.
        </p>
      </div>

      {/* Period selector */}
      <div className="card px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Период:</span>
          <select className="select-field" value={quarter} onChange={(e) => setQuarter(e.target.value)} style={{ width: 'auto', paddingRight: '36px' }}>
            {['Q1','Q2','Q3','Q4'].map(q => <option key={q}>{q}</option>)}
          </select>
          <input type="number" className="input-field w-24" value={year} onChange={(e) => setYear(+e.target.value)} />
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {[
          {
            label: 'Всего алертов',
            value: alertsSummary?.total_alerts ?? '—',
            color: alertsSummary?.total_alerts > 0 ? 'var(--text-warning-primary)' : 'var(--text-primary)',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
          },
          {
            label: 'High',
            value: alertsSummary?.high_severity ?? 0,
            color: 'var(--fg-error-secondary)',
            dot: severityBadge.high.dot,
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
          },
          {
            label: 'Medium',
            value: alertsSummary?.medium_severity ?? 0,
            color: 'var(--text-warning-primary)',
            dot: severityBadge.medium.dot,
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
          },
          {
            label: 'Low',
            value: alertsSummary?.low_severity ?? 0,
            color: 'var(--text-secondary)',
            dot: severityBadge.low.dot,
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
          },
          {
            label: 'Индекс ВНД',
            value: indexStatus?.indexed_chunks ?? '—',
            color: 'var(--fg-brand-primary)',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
          },
        ].map((m) => (
          <CardShell key={m.label}>
            <div className="px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <span className="text-xs sm:text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
                  {m.dot && <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.dot }} />}
                  {m.label}
                </span>
                <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ border: '1px solid var(--border-secondary)', color: 'var(--fg-quaternary)' }}
                >
                  {m.icon}
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: m.color }}>
                {m.value}
              </div>
            </div>
          </CardShell>
        ))}
      </div>

      {error && (
        <div className="status-error flex items-center gap-2 rounded-xl px-4 py-3 text-sm">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {/* Alert Manager Table */}
      <CardShell>
        <div className="px-5 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg icon-box-warning">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Alert Manager</div>
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: 'var(--bg-warning-primary)', color: 'var(--text-warning-primary)', border: '1px solid var(--border-warning)' }}
            >
              {alertsSummary?.total_alerts ?? 0}
            </span>
          </div>
          {/* Severity filter tabs */}
          <div className="flex gap-1.5">
            {[
              { key: '', label: 'Все' },
              { key: 'high', label: 'High', count: alertsSummary?.high_severity },
              { key: 'medium', label: 'Medium', count: alertsSummary?.medium_severity },
              { key: 'low', label: 'Low', count: alertsSummary?.low_severity },
            ].map((tab) => {
              const active = sevFilter === tab.key
              const sev = severityBadge[tab.key]
              return (
                <button key={tab.key}
                  onClick={() => { setSevFilter(tab.key); setAlertPage(1) }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: active ? (sev?.bg || 'var(--bg-tertiary)') : '',
                    color: active ? (sev?.color || 'var(--text-secondary)') : 'var(--text-quaternary)',
                    border: active ? `1px solid ${sev?.border || 'var(--border-secondary)'}` : '1px solid transparent',
                  }}
                >
                  {sev?.dot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: sev.dot }} />}
                  {tab.label}
                  {tab.count != null && <span style={{ opacity: 0.7 }}>{tab.count}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Alert list */}
        {(() => {
          const allAlerts = alertsSummary?.alerts || []
          const pagedAlerts = sevFilter ? allAlerts.filter(a => a.severity === sevFilter) : allAlerts
          const alertTotalPages = alertsSummary?.total_pages || 1
          const safeAlertPage = Math.min(alertPage, alertTotalPages)

          return (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      {['', 'Проблема', 'Сотрудник', 'Подразделение', 'Рекомендация'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap"
                          style={{ color: 'var(--text-quaternary)', borderBottom: '1px solid var(--border-secondary)' }}
                        >{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedAlerts.map((alert) => {
                      const s = severityBadge[alert.severity] || severityBadge.low
                      return (
                        <tr key={alert.id} className="transition-colors"
                          style={{ borderBottom: '1px solid var(--border-secondary)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                        >
                          <td className="px-4 py-3 w-8">
                            <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: s.dot }} title={alert.severity} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{alert.title}</div>
                            <div className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>{alert.message}</div>
                            {alert.goal_title && (
                              <div className="mt-0.5 text-xs truncate max-w-xs" style={{ color: 'var(--text-quaternary)' }}>{alert.goal_title}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{alert.employee_name}</td>
                          <td className="px-4 py-3 whitespace-nowrap hidden lg:table-cell" style={{ color: 'var(--text-tertiary)' }}>{alert.department_name}</td>
                          <td className="px-4 py-3 hidden xl:table-cell">
                            <div className="text-xs max-w-xs" style={{ color: 'var(--text-tertiary)' }}>{alert.recommended_action}</div>
                          </td>
                        </tr>
                      )
                    })}
                    {pagedAlerts.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                          {loadingAlerts ? 'Загрузка алертов...' : 'Алертов не найдено'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden">
                {pagedAlerts.map((alert) => {
                  const s = severityBadge[alert.severity] || severityBadge.low
                  return (
                    <div key={alert.id} className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                      <div className="flex items-start gap-3">
                        <span className="h-2 w-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: s.dot }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{alert.title}</div>
                          <div className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>{alert.message}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-quaternary)' }}>
                            <span>{alert.employee_name}</span>
                            {alert.department_name && <span>· {alert.department_name}</span>}
                          </div>
                          {alert.recommended_action && (
                            <div className="mt-2 text-xs rounded-lg px-3 py-2"
                              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}
                            >
                              {alert.recommended_action}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {pagedAlerts.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    {loadingAlerts ? 'Загрузка алертов...' : 'Алертов не найдено'}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {alertTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border-secondary)' }}>
                  <button
                    onClick={() => setAlertPage(p => Math.max(1, p - 1))}
                    disabled={safeAlertPage <= 1}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
                    style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                    Назад
                  </button>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{safeAlertPage} из {alertTotalPages}</span>
                  <button
                    onClick={() => setAlertPage(p => Math.min(alertTotalPages, p + 1))}
                    disabled={safeAlertPage >= alertTotalPages}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
                    style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}
                  >
                    Вперёд
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 6 15 12 9 18"/></svg>
                  </button>
                </div>
              )}
            </>
          )
        })()}
      </CardShell>

      {/* Bottom row: VND Index + HRIS */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          {/* VND Index */}
          <CardShell>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg icon-box-brand"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                  </svg>
                </div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Индекс ВНД</div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-xl px-4 py-3 space-y-2"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
              >
                {[
                  { label: 'Активных документов', value: indexStatus?.active_documents ?? '—' },
                  { label: 'Чанков',              value: indexStatus?.indexed_chunks   ?? '—' },
                  { label: 'Режим поиска',        value: indexStatus?.search_mode      ?? '—' },
                  { label: 'OpenAI configured',   value: indexStatus?.openai_configured ? 'yes' : 'no' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</span>
                  </div>
                ))}
              </div>
              <button onClick={handleReindex} disabled={loadingIndex} className="btn-primary w-full">
                {loadingIndex ? (
                  <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Переиндексация...</>
                ) : (
                  <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Переиндексировать ВНД</>
                )}
              </button>
            </div>
          </CardShell>
        </div>
        <div>
          {/* HRIS Integration */}
          <CardShell>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg icon-box-gray"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                  </svg>
                </div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Mock-интеграция HRIS</div>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <EmployeePicker
                employees={employees}
                value={employeeId}
                onChange={setEmployeeId}
                label="Сотрудник"
                emptyText={employees.length === 0 ? 'Загрузка...' : 'Не найдено'}
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>HR-система</label>
                <select className="select-field w-full" value={targetSystem} onChange={(e) => setTargetSystem(e.target.value)}>
                  {systems.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                </select>
              </div>
              <button onClick={handleExport} disabled={exporting} className="btn-secondary w-full">
                {exporting ? (
                  <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Экспорт...</>
                ) : (
                  <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg> Экспортировать цели</>
                )}
              </button>

              {exportResult && (
                <div className="space-y-3 rounded-xl px-4 py-4"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
                >
                  <div>
                    <div className="text-sm font-semibold break-words" style={{ color: 'var(--text-primary)' }}>{exportResult.message}</div>
                    <div className="mt-0.5 text-xs break-all" style={{ color: 'var(--text-quaternary)' }}>Batch ID: {exportResult.batch_id}</div>
                  </div>
                  <button onClick={downloadExportFile} className="btn-primary w-full">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>
                    </svg>
                    Скачать файл экспорта
                  </button>
                  {exportResult.goal_refs?.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {exportResult.goal_refs.map(r => (
                        <div key={r.goal_id} className="rounded-lg px-3 py-2 text-xs"
                          style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', color: 'var(--text-tertiary)' }}
                        >
                          <div className="font-medium" style={{ color: 'var(--text-secondary)' }}>Goal ID</div>
                          <div className="mt-0.5 break-all">{r.goal_id}</div>
                          <div className="mt-2 font-medium" style={{ color: 'var(--text-secondary)' }}>External Ref</div>
                          <div className="mt-0.5 break-all">{r.external_ref}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <details className="overflow-hidden rounded-lg" style={{ border: '1px solid var(--border-secondary)' }}>
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium" style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)' }}>
                      Payload экспорта
                    </summary>
                    <pre className="max-h-64 overflow-auto p-3 text-[11px] leading-5 whitespace-pre-wrap break-words"
                      style={{ backgroundColor: 'var(--code-bg)', color: 'var(--code-text)', borderTop: '1px solid var(--border-secondary)' }}
                    >
                      {JSON.stringify(exportResult.payload, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          </CardShell>
        </div>
      </div>
    </div>
  )
}
