import { Fragment, useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  approveGoal, commentGoal, evaluateBatch,
  getGoalWorkflow, getGoals, rejectGoal, submitGoal,
} from '../api/client'

/* ── Status badges ─────────────────────────────────────────── */
const statusConfig = {
  draft:       { label: 'Черновик',        dot: 'var(--fg-quaternary)' },
  active:      { label: 'Активна',         dot: 'var(--fg-brand-primary)' },
  submitted:   { label: 'На согласовании', dot: 'var(--text-warning-primary)' },
  approved:    { label: 'Утверждена',      dot: 'var(--fg-success-primary)' },
  in_progress: { label: 'В работе',        dot: 'var(--fg-brand-primary)' },
  done:        { label: 'Выполнена',       dot: 'var(--fg-success-primary)' },
  cancelled:   { label: 'Отменена',        dot: 'var(--fg-error-secondary)' },
  overdue:     { label: 'Просрочена',      dot: 'var(--fg-error-secondary)' },
  archived:    { label: 'Архив',           dot: 'var(--fg-quaternary)' },
}
const alertStyles = {
  high:   { bg: 'var(--bg-error-primary)',   color: 'var(--fg-error-secondary)',  border: 'var(--border-error-secondary)' },
  medium: { bg: 'var(--bg-warning-primary)', color: 'var(--text-warning-primary)',border: 'var(--border-warning)' },
  low:    { bg: 'var(--bg-tertiary)',         color: 'var(--text-secondary)',      border: 'var(--border-primary)' },
}
const actionStyles = {
  submit:  { bg: 'var(--bg-brand-solid)', color: '#fff', border: 'var(--bg-brand-solid)' },
  approve: { bg: 'var(--bg-success-primary)', color: 'var(--text-success-primary)', border: 'var(--border-success)' },
  reject:  { bg: 'var(--bg-warning-primary)', color: 'var(--text-warning-primary)', border: 'var(--border-warning)' },
  comment: { bg: 'var(--bg-primary)', color: 'var(--text-secondary)', border: 'var(--border-secondary)' },
}
const actionLabels  = { submit: 'Отправить', approve: 'Утвердить', reject: 'На доработку', comment: 'Комментарий' }
const eventLabels   = { created: 'Создание', edited: 'Редактирование', submitted: 'Отправка', approved: 'Утверждение', rejected: 'Возврат', commented: 'Комментарий', status_changed: 'Смена статуса', archived: 'Архивация' }
const verdictLabels = { approve: 'Утверждено', reject: 'Отклонено', needs_changes: 'На доработку', comment_only: 'Комментарий' }

const getScoreStyle = (s) => {
  if (!s) return { color: 'var(--text-quaternary)' }
  if (s >= 0.85) return { color: 'var(--text-success-primary)' }
  if (s >= 0.7)  return { color: 'var(--text-warning-primary)' }
  return { color: 'var(--fg-error-secondary)' }
}
const fmt = (v, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(d) : '0'
}

const ROWS_PER_PAGE = 10

/* ── Sort icon ─────────────────────────────────────────── */
function SortIcon({ direction }) {
  return (
    <svg className="ml-1 inline h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: direction ? 'var(--fg-brand-primary)' : 'var(--fg-quaternary)' }}
    >
      {direction === 'asc' ? (
        <polyline points="18 15 12 9 6 15"/>
      ) : direction === 'desc' ? (
        <polyline points="6 9 12 15 18 9"/>
      ) : (
        <><polyline points="11 8 8 5 5 8"/><polyline points="5 16 8 19 11 16"/><line x1="8" y1="5" x2="8" y2="19"/></>
      )}
    </svg>
  )
}

export default function EmployeeGoals() {
  const [goals,            setGoals]           = useState([])
  const [loading,          setLoading]         = useState(false)
  const [error,            setError]           = useState(null)
  const [selectedEmployee, setSelectedEmployee]= useState(null)
  const [batchResult,      setBatchResult]     = useState(null)
  const [evaluating,       setEvaluating]      = useState(false)
  const [quarter,          setQuarter]         = useState('')
  const [year,             setYear]            = useState('')
  const [status,           setStatus]          = useState('')
  const [searchQuery,      setSearchQuery]     = useState('')
  const [reloadKey,        setReloadKey]       = useState(0)
  const [expandedGoalId,   setExpandedGoalId]  = useState(null)
  const [workflowByGoal,   setWorkflowByGoal]  = useState({})
  const [workflowLoadingId,setWorkflowLoadingId]=useState(null)
  const [workflowActionId, setWorkflowActionId]= useState(null)
  const [commentsByGoal,   setCommentsByGoal]  = useState({})
  const [selectedRows,     setSelectedRows]    = useState(new Set())
  const [sortCol,          setSortCol]         = useState('employee_name')
  const [sortDir,          setSortDir]         = useState('asc')
  const [page,             setPage]            = useState(1)
  const deferredQuery = useDeferredValue(searchQuery)

  const normalize = (g) => ({
    ...g,
    weight:     Number.isFinite(+g?.weight) ? +g.weight : 0,
    smart_score:Number.isFinite(+g?.smart_score) ? +g.smart_score : null,
    alerts:     Array.isArray(g?.alerts) ? g.alerts : [],
  })

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(null)
      try {
        const params = {}
        if (quarter) params.quarter = quarter
        if (year)    params.year    = +year
        if (status)  params.status  = status
        const r = await getGoals({ ...params, page: 1, per_page: 200 })
        setGoals((r.goals || []).map(normalize))
      } catch (e) { setError(e.response?.data?.detail || 'Ошибка загрузки целей') }
      finally { setLoading(false) }
    }
    load()
  }, [quarter, year, status, reloadKey])

  const handleBatchEvaluate = async (employeeId) => {
    setEvaluating(true); setSelectedEmployee(employeeId); setBatchResult(null); setError(null)
    try { setBatchResult(await evaluateBatch(employeeId, quarter || null, year ? +year : null)) }
    catch (e) { setError(e.response?.data?.detail || 'Ошибка пакетной оценки') }
    finally { setEvaluating(false) }
  }

  const loadWorkflow = async (goalId) => {
    setWorkflowLoadingId(goalId); setError(null)
    try {
      const wf = await getGoalWorkflow(goalId)
      setWorkflowByGoal(p => ({ ...p, [goalId]: wf }))
    } catch (e) { setError(e.response?.data?.detail || 'Ошибка загрузки workflow') }
    finally { setWorkflowLoadingId(null) }
  }

  const toggleWorkflow = async (goalId) => {
    if (expandedGoalId === goalId) { setExpandedGoalId(null); return }
    setExpandedGoalId(goalId)
    if (!workflowByGoal[goalId]) await loadWorkflow(goalId)
  }

  const handleWorkflowAction = async (goal, action) => {
    const key = `${goal.id}:${action}`
    const comment = commentsByGoal[goal.id]?.trim() || null
    if (action === 'comment' && !comment) { setError('Для комментария заполните текст'); return }
    setWorkflowActionId(key); setError(null)
    try {
      const payload = { actor_id: action === 'submit' ? goal.employee_id : goal.manager_id || undefined, comment }
      if (action === 'submit')  await submitGoal(goal.id, payload)
      if (action === 'approve') await approveGoal(goal.id, payload)
      if (action === 'reject')  await rejectGoal(goal.id, payload)
      if (action === 'comment') await commentGoal(goal.id, payload)
      setCommentsByGoal(p => ({ ...p, [goal.id]: '' }))
      setReloadKey(p => p + 1)
      await loadWorkflow(goal.id)
    } catch (e) { setError(e.response?.data?.detail || 'Ошибка workflow-действия') }
    finally { setWorkflowActionId(null) }
  }

  /* ── Filter + Sort + Paginate ─────────────────────────── */
  const q = deferredQuery.trim().toLowerCase()
  const filtered = useMemo(() => {
    const list = goals.filter((g) => {
      if (!q) return true
      return [g.employee_name, g.department_name, g.position_name, g.manager_name, g.title, g.metric, g.goal_type, g.strategic_link]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    })
    return list
  }, [goals, q])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol]
      if (sortCol === 'smart_score') {
        va = va ?? -1; vb = vb ?? -1
        return sortDir === 'asc' ? va - vb : vb - va
      }
      if (sortCol === 'weight') return sortDir === 'asc' ? va - vb : vb - va
      va = String(va || '').toLowerCase(); vb = String(vb || '').toLowerCase()
      const cmp = va.localeCompare(vb)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [filtered, sortCol, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / ROWS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const paged = sorted.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE)

  useEffect(() => { setPage(1) }, [deferredQuery, quarter, year, status])

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const allSelected = paged.length > 0 && paged.every(g => selectedRows.has(g.id))
  const toggleAll = () => {
    if (allSelected) setSelectedRows(new Set())
    else setSelectedRows(new Set(paged.map(g => g.id)))
  }
  const toggleRow = (id) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  /* ── Unique employees for batch eval ─────────────────── */
  const uniqueEmployees = useMemo(() => {
    const map = {}
    for (const g of paged) {
      if (!map[g.employee_id]) map[g.employee_id] = g
    }
    return Object.values(map)
  }, [paged])

  const columns = [
    { id: 'employee_name', label: 'Сотрудник',   sortable: true, className: 'w-full max-w-[25%]' },
    { id: 'status',        label: 'Статус',       sortable: true },
    { id: 'title',         label: 'Цель',         sortable: true, className: 'hidden xl:table-cell' },
    { id: 'smart_score',   label: 'SMART',        sortable: true },
    { id: 'weight',        label: 'Вес',          sortable: true, className: 'hidden lg:table-cell' },
    { id: 'tags',          label: 'Метки' },
    { id: 'actions',       label: '' },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Filters */}
      <div className="card p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,180px))]">
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Поиск</label>
            <div className="relative">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--fg-quaternary)' }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" className="input-field pl-9"
                placeholder="ФИО, должность, подразделение, цель..."
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Квартал</label>
            <select className="select-field w-full" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
              <option value="">Все кварталы</option>
              {['Q1','Q2','Q3','Q4'].map(q => <option key={q}>{q}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Год</label>
            <select className="select-field w-full" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">Все годы</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Статус</label>
            <select className="select-field w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Все статусы</option>
              {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="status-error flex items-center gap-2 rounded-xl px-4 py-3 text-sm">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
        >
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 animate-spin spinner-brand" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Загрузка целей...</span>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Table header bar */}
          <div className="flex items-center justify-between px-5 py-4 sm:px-6" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Цели сотрудников</h2>
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ backgroundColor: 'var(--bg-brand-primary)', color: 'var(--fg-brand-primary)', border: '1px solid var(--border-brand-secondary)' }}
              >
                {filtered.length} {filtered.length === 1 ? 'цель' : 'целей'}
              </span>
            </div>
            {selectedRows.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  Выбрано: {selectedRows.size}
                </span>
                {uniqueEmployees.map(emp => (
                  <button key={emp.employee_id}
                    onClick={() => handleBatchEvaluate(emp.employee_id)}
                    disabled={evaluating && selectedEmployee === emp.employee_id}
                    className="btn-primary" style={{ padding: '5px 12px', fontSize: '12px' }}
                  >
                    {evaluating && selectedEmployee === emp.employee_id ? 'Оценка...' : `Оценить ${emp.employee_name?.split(' ')[0]}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Batch result banner */}
          {batchResult && (
            <div className="px-5 py-3 sm:px-6" style={{ borderBottom: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-brand-primary)' }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-semibold" style={{ color: 'var(--fg-brand-primary)' }}>Результат пакетной оценки</span>
                <span className="text-lg font-semibold" style={getScoreStyle(+batchResult.average_score)}>
                  {fmt((+batchResult.average_score || 0) * 100)}% средний SMART
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={batchResult.weight_valid ? 'badge-success' : 'badge-error'}>
                  Сумма весов: {fmt(batchResult.total_weight)}%
                </span>
                <span className={batchResult.goals_count_valid ? 'badge-success' : 'badge-warning'}>
                  Целей: {batchResult.total_goals}
                </span>
              </div>
              {batchResult.top_issues?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {batchResult.top_issues.map(issue => (
                    <span key={issue} className="badge-brand">{issue}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <th className="w-10 px-4 py-3" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      className="h-4 w-4 rounded"
                      style={{ accentColor: 'var(--fg-brand-primary)' }}
                    />
                  </th>
                  {columns.map(col => (
                    <th key={col.id}
                      className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${col.className || ''}`}
                      style={{ color: 'var(--text-quaternary)', borderBottom: '1px solid var(--border-secondary)', cursor: col.sortable ? 'pointer' : 'default' }}
                      onClick={() => col.sortable && toggleSort(col.id)}
                    >
                      <span className="inline-flex items-center">
                        {col.label}
                        {col.sortable && <SortIcon direction={sortCol === col.id ? sortDir : null} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((goal) => {
                  const sc = statusConfig[goal.status] || statusConfig.draft
                  const isOpen = expandedGoalId === goal.id
                  const initials = (goal.employee_name || 'EM').split(' ').map(w => w[0]).slice(0, 2).join('')

                  return (
                    <Fragment key={goal.id}>
                      <tr
                        className="transition-colors"
                        style={{ borderBottom: '1px solid var(--border-secondary)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                      >
                        <td className="w-10 px-4 py-3">
                          <input type="checkbox" checked={selectedRows.has(goal.id)} onChange={() => toggleRow(goal.id)}
                            className="h-4 w-4 rounded"
                            style={{ accentColor: 'var(--fg-brand-primary)' }}
                          />
                        </td>
                        {/* Employee */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white gradient-brand">
                              {initials}
                            </div>
                            <div className="whitespace-nowrap min-w-0">
                              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{goal.employee_name}</p>
                              <p className="text-sm truncate" style={{ color: 'var(--text-tertiary)' }}>
                                {[goal.position_name, goal.department_name].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                          </div>
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: sc.dot }} />
                            {sc.label}
                          </span>
                        </td>
                        {/* Goal title */}
                        <td className="px-4 py-3 hidden xl:table-cell">
                          <p className="text-sm font-medium truncate max-w-xs" style={{ color: 'var(--text-primary)' }} title={goal.title}>{goal.title}</p>
                          {goal.metric && <p className="text-xs truncate max-w-xs" style={{ color: 'var(--text-quaternary)' }}>{goal.metric}</p>}
                        </td>
                        {/* SMART */}
                        <td className="px-4 py-3 text-center">
                          {goal.smart_score != null ? (
                            <span className="text-sm font-semibold" style={getScoreStyle(goal.smart_score)}>
                              {fmt(goal.smart_score * 100)}%
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>—</span>
                          )}
                        </td>
                        {/* Weight */}
                        <td className="px-4 py-3 text-center hidden lg:table-cell">
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{fmt(goal.weight)}%</span>
                        </td>
                        {/* Tags */}
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {goal.quarter && (
                              <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-secondary)' }}
                              >{goal.quarter} {goal.year}</span>
                            )}
                            {goal.goal_type && (
                              <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-secondary)' }}
                              >{goal.goal_type}</span>
                            )}
                            {goal.strategic_link && (
                              <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium badge-brand">{goal.strategic_link}</span>
                            )}
                            {goal.alerts?.length > 0 && goal.alerts.map((a) => {
                              const as = alertStyles[a.severity] || alertStyles.low
                              return (
                                <span key={`${goal.id}-${a.alert_type}`} title={a.message}
                                  className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                                  style={{ backgroundColor: as.bg, color: as.color, border: `1px solid ${as.border}` }}
                                >{a.title}</span>
                              )
                            })}
                          </div>
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => toggleWorkflow(goal.id)}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors"
                              style={{ color: 'var(--fg-quaternary)', border: '1px solid transparent' }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'; e.currentTarget.style.borderColor = 'var(--border-secondary)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.borderColor = 'transparent' }}
                              title="Workflow"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleBatchEvaluate(goal.employee_id)}
                              disabled={evaluating && selectedEmployee === goal.employee_id}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors"
                              style={{ color: 'var(--fg-quaternary)', border: '1px solid transparent' }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'; e.currentTarget.style.borderColor = 'var(--border-secondary)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.borderColor = 'transparent' }}
                              title="Оценить все цели сотрудника"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded workflow row */}
                      {isOpen && (
                        <tr>
                          <td colSpan={columns.length + 1} className="px-5 py-4" style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-secondary)' }}>
                            {/* Goal title on smaller screens */}
                            <div className="mb-3 xl:hidden">
                              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{goal.title}</p>
                              {goal.metric && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Показатель: {goal.metric}</p>}
                            </div>

                            {workflowLoadingId === goal.id && (
                              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                                <svg className="h-4 w-4 animate-spin spinner-brand" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                </svg>
                                Загрузка workflow...
                              </div>
                            )}

                            {workflowByGoal[goal.id] && (() => {
                              const wf = workflowByGoal[goal.id]
                              return (
                                <>
                                  <div className="flex flex-wrap gap-2 mb-3">
                                    {(wf.available_actions || []).map((action) => {
                                      const s = actionStyles[action] || actionStyles.comment
                                      return (
                                        <button key={action}
                                          onClick={() => handleWorkflowAction(goal, action)}
                                          disabled={workflowActionId === `${goal.id}:${action}` || (action === 'comment' && !commentsByGoal[goal.id]?.trim())}
                                          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all duration-100 disabled:opacity-50"
                                          style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }}
                                        >
                                          {actionLabels[action] || action}
                                        </button>
                                      )
                                    })}
                                  </div>

                                  <textarea rows={2} className="input-field mb-4"
                                    placeholder="Комментарий для workflow-действий"
                                    value={commentsByGoal[goal.id] || ''}
                                    onChange={(e) => setCommentsByGoal(p => ({ ...p, [goal.id]: e.target.value }))}
                                  />

                                  <div className="grid gap-4 lg:grid-cols-2">
                                    <div>
                                      <div className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-quaternary)' }}>История событий</div>
                                      <div className="space-y-2">
                                        {(wf.events || []).map((ev) => (
                                          <div key={ev.id} className="rounded-lg px-3 py-2.5"
                                            style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
                                          >
                                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                              {eventLabels[ev.event_type] || ev.event_type}
                                            </div>
                                            <div className="mt-0.5 text-xs" style={{ color: 'var(--text-quaternary)' }}>
                                              {ev.actor_name || 'Система'} · {new Date(ev.created_at).toLocaleString()}
                                            </div>
                                            {ev.comment && <div className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>{ev.comment}</div>}
                                          </div>
                                        ))}
                                        {!wf.events?.length && <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Событий пока нет.</p>}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-quaternary)' }}>Отзывы руководителя</div>
                                      <div className="space-y-2">
                                        {(wf.reviews || []).map((rv) => (
                                          <div key={rv.id} className="rounded-lg px-3 py-2.5"
                                            style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
                                          >
                                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                              {verdictLabels[rv.verdict] || rv.verdict}
                                            </div>
                                            <div className="mt-0.5 text-xs" style={{ color: 'var(--text-quaternary)' }}>
                                              {rv.reviewer_name || 'Неизвестный'} · {new Date(rv.created_at).toLocaleString()}
                                            </div>
                                            <div className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>{rv.comment_text}</div>
                                          </div>
                                        ))}
                                        {!wf.reviews?.length && <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Отзывов пока нет.</p>}
                                      </div>
                                    </div>
                                  </div>
                                </>
                              )
                            })()}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}

                {paged.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                          <svg className="h-6 w-6" style={{ color: 'var(--fg-quaternary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                          </svg>
                        </div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Цели не найдены</p>
                        <p className="mt-1 text-sm" style={{ color: 'var(--text-quaternary)' }}>Попробуйте изменить фильтры</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
            {paged.map((goal) => {
              const sc = statusConfig[goal.status] || statusConfig.draft
              const initials = (goal.employee_name || 'EM').split(' ').map(w => w[0]).slice(0, 2).join('')
              return (
                <div key={goal.id} className="px-4 py-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white gradient-brand">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{goal.employee_name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                        {[goal.position_name, goal.department_name].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: sc.dot }} />
                      {sc.label}
                    </span>
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{goal.title}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5 flex-wrap">
                      {goal.quarter && (
                        <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-secondary)' }}
                        >{goal.quarter}</span>
                      )}
                      {goal.smart_score != null && (
                        <span className="text-sm font-semibold" style={getScoreStyle(goal.smart_score)}>
                          {fmt(goal.smart_score * 100)}%
                        </span>
                      )}
                    </div>
                    <button onClick={() => toggleWorkflow(goal.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}
                    >
                      Workflow
                    </button>
                  </div>
                </div>
              )
            })}
            {paged.length === 0 && (
              <div className="px-4 py-12 text-center">
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Цели не найдены</p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 sm:px-6" style={{ borderTop: '1px solid var(--border-secondary)' }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40"
                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                Назад
              </button>
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Стр. {safePage} из {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40"
                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}
              >
                Вперёд
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 6 15 12 9 18"/></svg>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

