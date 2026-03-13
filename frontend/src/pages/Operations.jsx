import { useEffect, useState } from 'react'
import {
  ArrowPathIcon,
  BellAlertIcon,
  CircleStackIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline'
import {
  exportGoalsToHRSystem,
  getAlertsSummary,
  getDocumentIndexStatus,
  getEmployees,
  getIntegrationSystems,
  reindexDocuments,
} from '../api/client'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

const severityBadge = {
  high: 'bg-rose-50 text-rose-700 border-rose-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
}

export default function Operations() {
  const [quarter, setQuarter] = useState('Q2')
  const [year, setYear] = useState(2026)
  const [alertsSummary, setAlertsSummary] = useState(null)
  const [indexStatus, setIndexStatus] = useState(null)
  const [employees, setEmployees] = useState([])
  const [systems, setSystems] = useState([])
  const [employeeId, setEmployeeId] = useState('')
  const [targetSystem, setTargetSystem] = useState('1c')
  const [exportResult, setExportResult] = useState(null)
  const [loadingAlerts, setLoadingAlerts] = useState(false)
  const [loadingIndex, setLoadingIndex] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadBaseData = async () => {
      setError(null)
      try {
        const [employeesData, systemsData, indexData] = await Promise.all([
          getEmployees(),
          getIntegrationSystems(),
          getDocumentIndexStatus(),
        ])
        setEmployees(employeesData.employees || [])
        setSystems(systemsData.systems || [])
        setIndexStatus(indexData)
        if (employeesData.employees?.length > 0) {
          setEmployeeId(employeesData.employees[0].id)
        }
        if (systemsData.systems?.length > 0) {
          setTargetSystem(systemsData.systems[0].code)
        }
      } catch (err) {
        setError(err.response?.data?.detail || 'Ошибка загрузки операционных данных')
      }
    }

    loadBaseData()
  }, [])

  useEffect(() => {
    const loadAlerts = async () => {
      setLoadingAlerts(true)
      setError(null)
      try {
        const data = await getAlertsSummary({ quarter, year })
        setAlertsSummary(data)
      } catch (err) {
        setError(err.response?.data?.detail || 'Ошибка загрузки алертов')
      } finally {
        setLoadingAlerts(false)
      }
    }

    loadAlerts()
  }, [quarter, year])

  const handleReindex = async () => {
    setLoadingIndex(true)
    setError(null)
    try {
      await reindexDocuments()
      const updatedStatus = await getDocumentIndexStatus()
      setIndexStatus(updatedStatus)
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка переиндексации документов')
    } finally {
      setLoadingIndex(false)
    }
  }

  const handleExport = async () => {
    if (!employeeId || !targetSystem) return
    setExporting(true)
    setError(null)
    try {
      const data = await exportGoalsToHRSystem({
        employee_id: employeeId,
        quarter,
        year,
        target_system: targetSystem,
        include_drafts: true,
      })
      setExportResult(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка экспорта целей')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Операционный контур</h1>
        <p className="mt-1 text-sm text-gray-500">
          Alert Manager, управление индексом ВНД и mock-интеграция с внешними HR-системами.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5 pt-5">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Период</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <select className="select-field w-full" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
              <input
                type="number"
                className="input-field"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 pt-5">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Алерты</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{alertsSummary?.total_alerts ?? '—'}</div>
            <div className="mt-1 text-sm text-slate-500">Всего уведомлений по качеству и согласованию</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 pt-5">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Индекс ВНД</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{indexStatus?.indexed_chunks ?? '—'}</div>
            <div className="mt-1 text-sm text-slate-500">Чанков в поисковом индексе</div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2">
              <BellAlertIcon className="h-5 w-5 text-amber-600" />
              Alert Manager
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-rose-500">High</div>
                <div className="mt-2 text-xl font-semibold text-rose-700">{alertsSummary?.high_severity ?? 0}</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-amber-500">Medium</div>
                <div className="mt-2 text-xl font-semibold text-amber-700">{alertsSummary?.medium_severity ?? 0}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Low</div>
                <div className="mt-2 text-xl font-semibold text-slate-700">{alertsSummary?.low_severity ?? 0}</div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
              {loadingAlerts
                ? 'Обновление алертов...'
                : 'Алерты формируются по SMART-индексу, стратегической связке, весам, числу целей и статусу согласования.'}
            </div>

            <div className="space-y-3">
              {(alertsSummary?.alerts || []).slice(0, 8).map((alert) => (
                <div key={alert.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${severityBadge[alert.severity] || severityBadge.low}`}>
                      {alert.severity}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{alert.title}</span>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">{alert.message}</div>
                  <div className="mt-2 text-xs text-slate-500">
                    {alert.employee_name}
                    {alert.goal_title ? ` · ${alert.goal_title}` : ''}
                  </div>
                </div>
              ))}
              {!loadingAlerts && (alertsSummary?.alerts || []).length === 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  В выбранном периоде критичных алертов не найдено.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center gap-2">
                <CircleStackIcon className="h-5 w-5 text-cyan-700" />
                Индекс ВНД
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <div>Активных документов: <span className="font-semibold">{indexStatus?.active_documents ?? '—'}</span></div>
                <div>Чанков: <span className="font-semibold">{indexStatus?.indexed_chunks ?? '—'}</span></div>
                <div>Режим поиска: <span className="font-semibold">{indexStatus?.search_mode ?? '—'}</span></div>
                <div>OpenAI configured: <span className="font-semibold">{indexStatus?.openai_configured ? 'yes' : 'no'}</span></div>
              </div>
              <button onClick={handleReindex} disabled={loadingIndex} className="btn-primary gap-2">
                <ArrowPathIcon className={`h-4 w-4 ${loadingIndex ? 'animate-spin' : ''}`} />
                {loadingIndex ? 'Переиндексация...' : 'Переиндексировать ВНД'}
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center gap-2">
                <ArrowUpTrayIcon className="h-5 w-5 text-slate-700" />
                Mock-интеграция HRIS
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select className="select-field w-full" value={employeeId} onChange={(e) => setEmployeeId(parseInt(e.target.value))}>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name} — {employee.position_name}
                  </option>
                ))}
              </select>
              <select className="select-field w-full" value={targetSystem} onChange={(e) => setTargetSystem(e.target.value)}>
                {systems.map((system) => (
                  <option key={system.code} value={system.code}>
                    {system.name}
                  </option>
                ))}
              </select>
              <button onClick={handleExport} disabled={exporting} className="btn-secondary gap-2">
                <ArrowUpTrayIcon className="h-4 w-4" />
                {exporting ? 'Экспорт...' : 'Экспортировать цели'}
              </button>

              {exportResult && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-sm font-semibold text-slate-900">{exportResult.message}</div>
                  <div className="text-xs text-slate-500">Batch ID: {exportResult.batch_id}</div>
                  <pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                    {JSON.stringify(exportResult.payload, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
