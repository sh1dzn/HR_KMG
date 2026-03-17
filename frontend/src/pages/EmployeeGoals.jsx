import { useDeferredValue, useEffect, useState } from 'react'
import {
  approveGoal, commentGoal, evaluateBatch,
  getGoalWorkflow, getGoals, rejectGoal, submitGoal,
} from '../api/client'

/* ── Status badges ─────────────────────────────────────────── */
const statusBadges = {
  draft:       { label: 'Черновик',       bg: 'var(--bg-tertiary)',        color: 'var(--text-secondary)',       border: 'var(--border-primary)' },
  active:      { label: 'Активна',        bg: 'var(--bg-brand-primary)',   color: 'var(--fg-brand-primary)',     border: 'var(--border-brand-secondary)' },
  submitted:   { label: 'На согласовании',bg: 'var(--bg-warning-primary)', color: 'var(--text-warning-primary)', border: 'var(--border-warning)' },
  approved:    { label: 'Утверждена',     bg: 'var(--bg-success-primary)', color: 'var(--text-success-primary)', border: 'var(--border-success)' },
  in_progress: { label: 'В работе',       bg: 'var(--bg-brand-primary)',   color: 'var(--fg-brand-primary)',     border: 'var(--border-brand-secondary)' },
  done:        { label: 'Выполнена',      bg: 'var(--bg-success-primary)', color: 'var(--text-success-primary)', border: 'var(--border-success)' },
  cancelled:   { label: 'Отменена',       bg: 'var(--bg-error-primary)',   color: 'var(--fg-error-secondary)',   border: 'var(--border-error-secondary)' },
  overdue:     { label: 'Просрочена',     bg: 'var(--bg-error-primary)',   color: 'var(--fg-error-secondary)',   border: 'var(--border-error-secondary)' },
  archived:    { label: 'Архив',          bg: 'var(--bg-tertiary)',        color: 'var(--fg-tertiary)',          border: 'var(--border-primary)' },
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
        const r = await getGoals({ ...params, page: 1, per_page: 100 })
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

  const byEmployee = goals.reduce((acc, g) => {
    if (!acc[g.employee_id]) acc[g.employee_id] = {
      employee_id: g.employee_id, employee_name: g.employee_name,
      department_name: g.department_name, position_name: g.position_name,
      manager_name: g.manager_name, goals: [],
    }
    acc[g.employee_id].goals.push(g)
    return acc
  }, {})

  const q = deferredQuery.trim().toLowerCase()
  const entries = Object.values(byEmployee)
  const filtered = entries.filter((e) => {
    if (!q) return true
    return [e.employee_name, e.department_name, e.position_name, e.manager_name,
      ...e.goals.map(g => [g.title, g.metric, g.goal_type, g.strategic_link].filter(Boolean).join(' '))]
      .filter(Boolean).join(' ').toLowerCase().includes(q)
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Цели сотрудников</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Просмотр целей, пакетная оценка, alert-сигналы и workflow согласования.
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl p-4"
        style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', boxShadow: '0px 1px 2px rgba(10,13,18,0.05)' }}
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,180px))]">
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Поиск сотрудника</label>
            <div className="relative">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--fg-quaternary)' }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" className="input-field pl-9"
                placeholder="ФИО, должность, подразделение, руководитель..."
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
              <option value="draft">Черновик</option>
              <option value="active">Активна</option>
              <option value="submitted">На согласовании</option>
              <option value="approved">Утверждена</option>
              <option value="in_progress">В работе</option>
              <option value="done">Выполнена</option>
              <option value="cancelled">Отменена</option>
              <option value="overdue">Просрочена</option>
              <option value="archived">Архив</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[
            { label: `Сотрудников: ${filtered.length} из ${entries.length}` },
            { label: `Целей: ${goals.length}` },
          ].map(({ label }) => (
            <span key={label} className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-secondary)' }}
            >{label}</span>
          ))}
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
        <div className="space-y-4">
          {filtered.map((emp) => (
            <div key={emp.employee_id} className="overflow-hidden rounded-xl"
              style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', boxShadow: '0px 1px 2px rgba(10,13,18,0.05)' }}
            >
              {/* Employee header */}
              <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                style={{ borderBottom: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white gradient-brand"
                    >
                      {(emp.employee_name || 'EM').split(' ').map(w => w[0]).slice(0, 2).join('')}
                    </div>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{emp.employee_name}</div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {[emp.position_name, emp.department_name].filter(Boolean).join(' · ')}
                        {emp.manager_name && <span> · Рук.: {emp.manager_name}</span>}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-secondary)' }}
                  >
                    {emp.goals.length} {emp.goals.length === 1 ? 'цель' : emp.goals.length < 5 ? 'цели' : 'целей'}
                  </span>
                  <button onClick={() => handleBatchEvaluate(emp.employee_id)}
                    disabled={evaluating && selectedEmployee === emp.employee_id}
                    className="btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }}
                  >
                    {evaluating && selectedEmployee === emp.employee_id ? (
                      <><svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Оценка...</>
                    ) : 'Оценить все'}
                  </button>
                </div>
              </div>

              {/* Batch result */}
              {batchResult && batchResult.employee_id === emp.employee_id && (
                <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-brand-primary)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <span className="text-sm font-semibold" style={{ color: 'var(--fg-brand-primary)' }}>Результат пакетной оценки</span>
                    <span className="text-lg font-semibold" style={getScoreStyle(+batchResult.average_score)}>
                      {fmt((+batchResult.average_score || 0) * 100)}% средний SMART
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={batchResult.weight_valid ? 'badge-success' : 'badge-error'}>
                      Сумма весов: {fmt(batchResult.total_weight)}%
                    </span>
                    <span className={batchResult.goals_count_valid ? 'badge-success' : 'badge-warning'}>
                      Целей: {batchResult.total_goals}
                    </span>
                  </div>
                  {batchResult.top_issues?.length > 0 && (
                    <div className="mt-3 pt-3 flex flex-wrap gap-1.5" style={{ borderTop: '1px solid var(--border-brand-secondary)' }}>
                      {batchResult.top_issues.map(issue => (
                        <span key={issue} className="badge-brand">{issue}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Goals list */}
              {emp.goals.map((goal, idx) => {
                const badge   = statusBadges[goal.status] || statusBadges.draft
                const wf      = workflowByGoal[goal.id]
                const isOpen  = expandedGoalId === goal.id

                return (
                  <div key={goal.id} className="px-5 py-4" style={{ borderTop: idx > 0 ? '1px solid var(--border-secondary)' : undefined }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                          >{badge.label}</span>
                          {goal.quarter && (
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-secondary)' }}
                            >{goal.quarter} {goal.year}</span>
                          )}
                          {goal.goal_type && (
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-secondary)' }}
                            >{goal.goal_type}</span>
                          )}
                          {goal.strategic_link && (
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium badge-brand"
                            >{goal.strategic_link}</span>
                          )}
                          {goal.external_ref && (
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium badge-success"
                            >exported</span>
                          )}
                        </div>
                        <h4 className="text-sm font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>{goal.title}</h4>
                        {goal.metric && (
                          <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>Показатель: {goal.metric}</p>
                        )}
                        {goal.alerts?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {goal.alerts.map((a) => (
                              <span key={`${goal.id}-${a.alert_type}`} title={a.message}
                                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                                style={{ backgroundColor: (alertStyles[a.severity] || alertStyles.low).bg, color: (alertStyles[a.severity] || alertStyles.low).color, border: `1px solid ${(alertStyles[a.severity] || alertStyles.low).border}` }}
                              >{a.title}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-right pl-4">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-quaternary)' }}>Вес: {fmt(goal.weight)}%</div>
                        {goal.smart_score != null && (
                          <div className="text-xl font-semibold mt-0.5" style={getScoreStyle(goal.smart_score)}>
                            {fmt(goal.smart_score * 100)}%
                          </div>
                        )}
                        <button onClick={() => toggleWorkflow(goal.id)}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-100"
                          style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-primary)' }}
                        >
                          Workflow
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {isOpen ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                          </svg>
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="mt-4 rounded-xl p-4"
                        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
                      >
                        {workflowLoadingId === goal.id && (
                          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                            <svg className="h-4 w-4 animate-spin spinner-brand" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                            Загрузка workflow...
                          </div>
                        )}

                        {wf && (
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
                                    {action === 'submit' && <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
                                    {action === 'approve' && <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>}
                                    {action === 'reject' && <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                                    {action === 'comment' && <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
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
                              {/* Events */}
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

                              {/* Reviews */}
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
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl p-12 text-center"
              style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full"
                style={{ backgroundColor: 'var(--bg-tertiary)' }}
              >
                <svg className="h-6 w-6" style={{ color: 'var(--fg-quaternary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Сотрудники или цели не найдены</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-quaternary)' }}>Попробуйте изменить поисковый запрос или фильтры</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
