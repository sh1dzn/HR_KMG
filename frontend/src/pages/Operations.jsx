import { useEffect, useState } from 'react'
import {
  exportGoalsToHRSystem, getAlertsSummary, getDocumentIndexStatus,
  getEmployees, getIntegrationSystems, reindexDocuments,
} from '../api/client'
import EmployeePicker from '../components/EmployeePicker'

const severityBadge = {
  high:   { bg: 'var(--bg-error-primary)',   color: 'var(--fg-error-secondary)',  border: 'var(--border-error-secondary)' },
  medium: { bg: 'var(--bg-warning-primary)', color: 'var(--text-warning-primary)',border: 'var(--border-warning)' },
  low:    { bg: 'var(--bg-tertiary)',         color: 'var(--text-secondary)',      border: 'var(--border-primary)' },
}

const CardShell = ({ children, className = '' }) => (
  <div className={`rounded-xl ${className}`}
    style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', boxShadow: '0px 1px 2px rgba(10,13,18,0.05)' }}
  >
    {children}
  </div>
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
      try { setAlertsSummary(await getAlertsSummary({ quarter, year })) }
      catch (e) { setError(e.response?.data?.detail || 'Ошибка загрузки алертов') }
      finally { setLoadingAlerts(false) }
    }
    load()
  }, [quarter, year])

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

      {/* KPI row */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Period picker */}
        <CardShell>
          <div className="px-5 py-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-quaternary)' }}>Период</div>
            <div className="grid grid-cols-2 gap-3">
              <select className="select-field w-full" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
                {['Q1','Q2','Q3','Q4'].map(q => <option key={q}>{q}</option>)}
              </select>
              <input type="number" className="input-field" value={year} onChange={(e) => setYear(+e.target.value)} />
            </div>
          </div>
        </CardShell>

        {/* Alerts count */}
        <CardShell>
          <div className="px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-quaternary)' }}>Всего алертов</div>
            <div className="mt-2 text-3xl font-semibold" style={{ color: alertsSummary?.total_alerts > 0 ? 'var(--text-warning-primary)' : 'var(--text-primary)' }}>
              {alertsSummary?.total_alerts ?? '—'}
            </div>
            <div className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>Уведомлений по качеству и согласованию</div>
          </div>
        </CardShell>

        {/* Index count */}
        <CardShell>
          <div className="px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-quaternary)' }}>Индекс ВНД</div>
            <div className="mt-2 text-3xl font-semibold" style={{ color: 'var(--fg-brand-primary)' }}>
              {indexStatus?.indexed_chunks ?? '—'}
            </div>
            <div className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>Чанков в поисковом индексе</div>
          </div>
        </CardShell>
      </div>

      {error && (
        <div className="status-error flex items-center gap-2 rounded-xl px-4 py-3 text-sm">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {/* Main grid */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">

        {/* Alert Manager */}
        <CardShell>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg"
                className="icon-box-warning"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
              </div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Alert Manager</div>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {/* Severity breakdown */}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'High',   value: alertsSummary?.high_severity   ?? 0, style: severityBadge.high },
                { label: 'Medium', value: alertsSummary?.medium_severity ?? 0, style: severityBadge.medium },
                { label: 'Low',    value: alertsSummary?.low_severity    ?? 0, style: severityBadge.low },
              ].map(({ label, value, style }) => (
                <div key={label} className="rounded-xl px-4 py-3"
                  style={{ backgroundColor: style.bg, border: `1px solid ${style.border}` }}
                >
                  <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: style.color, opacity: 0.7 }}>{label}</div>
                  <div className="mt-2 text-2xl font-semibold" style={{ color: style.color }}>{value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl px-4 py-3 text-sm"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--text-tertiary)' }}
            >
              {loadingAlerts ? 'Обновление алертов...' : 'Алерты формируются по SMART-индексу, стратегической связке, весам, числу целей и статусу согласования.'}
            </div>

            <div className="space-y-2">
              {(alertsSummary?.alerts || []).slice(0, 8).map((alert) => {
                const s = severityBadge[alert.severity] || severityBadge.low
                return (
                  <div key={alert.id} className="rounded-xl px-4 py-3"
                    style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }}
                      >{alert.severity}</span>
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{alert.title}</span>
                    </div>
                    <div className="mt-1.5 text-sm" style={{ color: 'var(--text-tertiary)' }}>{alert.message}</div>
                    <div className="mt-1 text-xs" style={{ color: 'var(--text-quaternary)' }}>
                      {alert.employee_name}{alert.goal_title ? ` · ${alert.goal_title}` : ''}
                    </div>
                  </div>
                )
              })}

              {!loadingAlerts && !(alertsSummary?.alerts || []).length && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
                  className="status-success"
                >
                  <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  В выбранном периоде критичных алертов не найдено.
                </div>
              )}
            </div>
          </div>
        </CardShell>

        {/* Right column */}
        <div className="space-y-6">
          {/* VND Index */}
          <CardShell>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg"
                  className="icon-box-brand"
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

          {/* HRIS Integration */}
          <CardShell>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg"
                  className="icon-box-gray"
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
