import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  approveGoal, commentGoal, evaluateBatch,
  getEmployees, getEmployeeGoalsSummary,
  getGoalWorkflow, rejectGoal, submitGoal,
} from '../api/client'

/* ── Status config ─────────────────────────────────────── */
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
  if (!s && s !== 0) return { color: 'var(--text-quaternary)' }
  if (s >= 0.85) return { color: 'var(--text-success-primary)' }
  if (s >= 0.7)  return { color: 'var(--text-warning-primary)' }
  return { color: 'var(--fg-error-secondary)' }
}
const fmt = (v, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(d) : '0'
}

const ROWS_PER_PAGE = 20

/* ── Chevron icon ──────────────────────────────────────── */
function ChevronIcon({ open }) {
  return (
    <svg className="h-4 w-4 transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', color: 'var(--fg-quaternary)' }}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

export default function EmployeeGoals() {
  const [employees,        setEmployees]       = useState([])
  const [totalEmployees,   setTotalEmployees]  = useState(0)
  const [loading,          setLoading]         = useState(false)
  const [error,            setError]           = useState(null)
  const [page,             setPage]            = useState(1)
  const [searchQuery,      setSearchQuery]     = useState('')

  // Expanded employee state
  const [expandedId,       setExpandedId]      = useState(null)
  const [empGoals,         setEmpGoals]        = useState({}) // { employeeId: goalsSummary }
  const [goalsLoading,     setGoalsLoading]    = useState(null)

  // Batch evaluation
  const [evaluating,       setEvaluating]      = useState(null)
  const [batchResult,      setBatchResult]     = useState(null)

  // Workflow
  const [expandedGoalId,   setExpandedGoalId]  = useState(null)
  const [workflowByGoal,   setWorkflowByGoal]  = useState({})
  const [workflowLoadingId,setWorkflowLoadingId] = useState(null)
  const [workflowActionId, setWorkflowActionId]= useState(null)
  const [commentsByGoal,   setCommentsByGoal]  = useState({})

  /* ── Load employees ────────────────────────────────────── */
  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(null)
      try {
        const r = await getEmployees({ page, per_page: ROWS_PER_PAGE })
        setEmployees(r.employees || [])
        setTotalEmployees(r.total || 0)
      } catch (e) { setError(e.response?.data?.detail || 'Ошибка загрузки сотрудников') }
      finally { setLoading(false) }
    }
    load()
  }, [page])

  const totalPages = Math.max(1, Math.ceil(totalEmployees / ROWS_PER_PAGE))

  /* ── Expand employee → load goals ──────────────────────── */
  const toggleEmployee = async (empId) => {
    if (expandedId === empId) { setExpandedId(null); return }
    setExpandedId(empId)
    setExpandedGoalId(null)
    if (!empGoals[empId]) {
      setGoalsLoading(empId)
      try {
        const data = await getEmployeeGoalsSummary(empId)
        setEmpGoals(prev => ({ ...prev, [empId]: data }))
      } catch (e) { setError(e.response?.data?.detail || 'Ошибка загрузки целей') }
      finally { setGoalsLoading(null) }
    }
  }

  /* ── Batch evaluate ────────────────────────────────────── */
  const handleBatchEvaluate = async (empId) => {
    setEvaluating(empId); setBatchResult(null); setError(null)
    try {
      const result = await evaluateBatch(empId)
      setBatchResult({ ...result, employee_id: empId })
      // Refresh goals
      const data = await getEmployeeGoalsSummary(empId)
      setEmpGoals(prev => ({ ...prev, [empId]: data }))
    } catch (e) { setError(e.response?.data?.detail || 'Ошибка пакетной оценки') }
    finally { setEvaluating(null) }
  }

  /* ── Workflow ───────────────────────────────────────────── */
  const toggleWorkflow = async (goalId) => {
    if (expandedGoalId === goalId) { setExpandedGoalId(null); return }
    setExpandedGoalId(goalId)
    if (!workflowByGoal[goalId]) {
      setWorkflowLoadingId(goalId)
      try {
        const wf = await getGoalWorkflow(goalId)
        setWorkflowByGoal(p => ({ ...p, [goalId]: wf }))
      } catch (e) { setError(e.response?.data?.detail || 'Ошибка загрузки workflow') }
      finally { setWorkflowLoadingId(null) }
    }
  }

  const handleWorkflowAction = async (goal, action, empId) => {
    const key = `${goal.id}:${action}`
    const comment = commentsByGoal[goal.id]?.trim() || null
    if (action === 'comment' && !comment) { setError('Для комментария заполните текст'); return }
    setWorkflowActionId(key); setError(null)
    try {
      const payload = { comment }
      if (action === 'submit')  await submitGoal(goal.id, payload)
      if (action === 'approve') await approveGoal(goal.id, payload)
      if (action === 'reject')  await rejectGoal(goal.id, payload)
      if (action === 'comment') { const commentGoalFn = (await import('../api/client')).commentGoal; await commentGoalFn(goal.id, payload) }
      setCommentsByGoal(p => ({ ...p, [goal.id]: '' }))
      // Refresh goals + workflow
      const [data] = await Promise.all([
        getEmployeeGoalsSummary(empId),
        getGoalWorkflow(goal.id).then(wf => setWorkflowByGoal(p => ({ ...p, [goal.id]: wf }))),
      ])
      setEmpGoals(prev => ({ ...prev, [empId]: data }))
    } catch (e) { setError(e.response?.data?.detail || 'Ошибка workflow-действия') }
    finally { setWorkflowActionId(null) }
  }

  /* ── Client-side search within loaded page ─────────────── */
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return employees
    return employees.filter(e =>
      [e.full_name, e.department_name, e.position_name].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [employees, searchQuery])

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Search */}
      <div className="card p-4">
        <div className="relative max-w-md">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--fg-quaternary)' }}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" className="input-field pl-9"
            placeholder="Поиск по ФИО, должности, подразделению..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="status-error flex items-center gap-2 rounded-xl px-4 py-3 text-sm">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {typeof error === 'string' ? error : JSON.stringify(error)}
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
            <span className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Загрузка сотрудников...</span>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Table header */}
          <div className="flex items-center justify-between px-5 py-4 sm:px-6" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Сотрудники</h2>
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ backgroundColor: 'var(--bg-brand-primary)', color: 'var(--fg-brand-primary)', border: '1px solid var(--border-brand-secondary)' }}
              >
                {totalEmployees}
              </span>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <th className="w-8 px-4 py-3" style={{ borderBottom: '1px solid var(--border-secondary)' }} />
                  {['Сотрудник', 'Должность', 'Подразделение'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                      style={{ color: 'var(--text-quaternary)', borderBottom: '1px solid var(--border-secondary)' }}
                    >{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => {
                  const isOpen = expandedId === emp.id
                  const summary = empGoals[emp.id]
                  const initials = (emp.full_name || '??').split(' ').map(w => w[0]).slice(0, 2).join('')

                  return (
                    <Fragment key={emp.id}>
                      {/* Employee row */}
                      <tr
                        className="transition-colors cursor-pointer"
                        style={{ borderBottom: '1px solid var(--border-secondary)', backgroundColor: isOpen ? 'var(--bg-secondary)' : '' }}
                        onClick={() => toggleEmployee(emp.id)}
                        onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
                        onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.backgroundColor = '' }}
                      >
                        <td className="w-8 px-4 py-3 text-center">
                          <ChevronIcon open={isOpen} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white gradient-brand">
                              {initials}
                            </div>
                            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{emp.full_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>{emp.position_name}</td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>{emp.department_name}</td>
                      </tr>

                      {/* Expanded goals panel */}
                      {isOpen && (
                        <tr>
                          <td colSpan={4} style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-secondary)' }}>
                            <div className="px-6 py-4">
                              {goalsLoading === emp.id ? (
                                <div className="flex items-center gap-2 py-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                                  <svg className="h-4 w-4 animate-spin spinner-brand" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                  </svg>
                                  Загрузка целей...
                                </div>
                              ) : summary ? (
                                <>
                                  {/* Summary bar */}
                                  <div className="flex flex-wrap items-center gap-3 mb-4">
                                    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-secondary)' }}
                                    >
                                      {summary.total_goals} {summary.total_goals === 1 ? 'цель' : 'целей'}
                                    </span>
                                    <span className="text-sm font-semibold" style={getScoreStyle(summary.average_score)}>
                                      SMART: {fmt((summary.average_score || 0) * 100)}%
                                    </span>
                                    <span className={summary.weight_valid ? 'badge-success' : 'badge-error'} style={{ fontSize: 11 }}>
                                      Вес: {fmt(summary.total_weight)}%
                                    </span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleBatchEvaluate(emp.id) }}
                                      disabled={evaluating === emp.id}
                                      className="btn-primary ml-auto" style={{ padding: '5px 14px', fontSize: '12px' }}
                                    >
                                      {evaluating === emp.id ? 'Оценка...' : 'Оценить все'}
                                    </button>
                                  </div>

                                  {/* Batch result */}
                                  {batchResult && batchResult.employee_id === emp.id && (
                                    <div className="mb-4 rounded-lg px-4 py-3" style={{ backgroundColor: 'var(--bg-brand-primary)', border: '1px solid var(--border-brand-secondary)' }}>
                                      <div className="flex flex-wrap items-center gap-3">
                                        <span className="text-sm font-semibold" style={{ color: 'var(--fg-brand-primary)' }}>Пакетная оценка</span>
                                        <span className="text-sm font-semibold" style={getScoreStyle(+batchResult.average_score)}>
                                          {fmt((+batchResult.average_score || 0) * 100)}% средний SMART
                                        </span>
                                      </div>
                                      {batchResult.top_issues?.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {batchResult.top_issues.map(issue => <span key={issue} className="badge-brand">{issue}</span>)}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Goals list */}
                                  <div className="space-y-2">
                                    {(summary.goals || []).map((goal) => {
                                      const sc = statusConfig[goal.status] || statusConfig.draft
                                      const wfOpen = expandedGoalId === goal.id
                                      const wf = workflowByGoal[goal.id]

                                      return (
                                        <div key={goal.id} className="rounded-lg overflow-hidden"
                                          style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
                                        >
                                          {/* Goal row */}
                                          <div className="flex items-center gap-4 px-4 py-3">
                                            {/* Status dot */}
                                            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: sc.dot }} title={sc.label} />

                                            {/* Title */}
                                            <div className="min-w-0 flex-1">
                                              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }} title={goal.title}>
                                                {goal.title}
                                              </p>
                                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                                <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>
                                                  {sc.label}
                                                </span>
                                                {goal.goal_type && (
                                                  <span className="text-xs rounded-full px-2 py-0.5"
                                                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-quaternary)' }}
                                                  >{goal.goal_type}</span>
                                                )}
                                                {goal.strategic_link && (
                                                  <span className="text-xs rounded-full px-2 py-0.5 badge-brand">{goal.strategic_link}</span>
                                                )}
                                              </div>
                                            </div>

                                            {/* Weight */}
                                            <div className="text-right flex-shrink-0">
                                              <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>Вес {fmt(goal.weight)}%</div>
                                            </div>

                                            {/* SMART score */}
                                            <div className="text-right flex-shrink-0 w-14">
                                              {goal.smart_score != null ? (
                                                <span className="text-sm font-semibold" style={getScoreStyle(goal.smart_score)}>
                                                  {fmt(goal.smart_score * 100)}%
                                                </span>
                                              ) : (
                                                <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>—</span>
                                              )}
                                            </div>

                                            {/* Workflow toggle */}
                                            <button
                                              onClick={(e) => { e.stopPropagation(); toggleWorkflow(goal.id) }}
                                              className="flex-shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors"
                                              style={{ color: 'var(--fg-quaternary)' }}
                                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                                              title="Workflow"
                                            >
                                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M12 5v14M5 12h14"/>
                                              </svg>
                                            </button>
                                          </div>

                                          {/* Workflow panel */}
                                          {wfOpen && (
                                            <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
                                              {workflowLoadingId === goal.id ? (
                                                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                                                  <svg className="h-4 w-4 animate-spin spinner-brand" viewBox="0 0 24 24" fill="none">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                                  </svg>
                                                  Загрузка...
                                                </div>
                                              ) : wf ? (
                                                <>
                                                  <div className="flex flex-wrap gap-2 mb-3">
                                                    {(wf.available_actions || []).map((action) => {
                                                      const s = actionStyles[action] || actionStyles.comment
                                                      return (
                                                        <button key={action}
                                                          onClick={() => handleWorkflowAction(goal, action, emp.id)}
                                                          disabled={workflowActionId === `${goal.id}:${action}` || (action === 'comment' && !commentsByGoal[goal.id]?.trim())}
                                                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
                                                          style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }}
                                                        >
                                                          {actionLabels[action] || action}
                                                        </button>
                                                      )
                                                    })}
                                                  </div>
                                                  <textarea rows={2} className="input-field mb-3 text-sm"
                                                    placeholder="Комментарий..."
                                                    value={commentsByGoal[goal.id] || ''}
                                                    onChange={(e) => setCommentsByGoal(p => ({ ...p, [goal.id]: e.target.value }))}
                                                  />
                                                  <div className="grid gap-3 lg:grid-cols-2">
                                                    <div>
                                                      <div className="mb-1.5 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-quaternary)' }}>События</div>
                                                      <div className="space-y-1.5">
                                                        {(wf.events || []).map((ev) => (
                                                          <div key={ev.id} className="rounded-lg px-3 py-2"
                                                            style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
                                                          >
                                                            <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                                                              {eventLabels[ev.event_type] || ev.event_type}
                                                            </div>
                                                            <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>
                                                              {ev.actor_name || 'Система'} · {new Date(ev.created_at).toLocaleString()}
                                                            </div>
                                                            {ev.comment && <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>{ev.comment}</div>}
                                                          </div>
                                                        ))}
                                                        {!wf.events?.length && <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Нет событий</p>}
                                                      </div>
                                                    </div>
                                                    <div>
                                                      <div className="mb-1.5 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-quaternary)' }}>Отзывы</div>
                                                      <div className="space-y-1.5">
                                                        {(wf.reviews || []).map((rv) => (
                                                          <div key={rv.id} className="rounded-lg px-3 py-2"
                                                            style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
                                                          >
                                                            <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                                                              {verdictLabels[rv.verdict] || rv.verdict}
                                                            </div>
                                                            <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>
                                                              {rv.reviewer_name || '—'} · {new Date(rv.created_at).toLocaleString()}
                                                            </div>
                                                            <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>{rv.comment_text}</div>
                                                          </div>
                                                        ))}
                                                        {!wf.reviews?.length && <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Нет отзывов</p>}
                                                      </div>
                                                    </div>
                                                  </div>
                                                </>
                                              ) : null}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Сотрудники не найдены</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden">
            {filtered.map((emp) => {
              const isOpen = expandedId === emp.id
              const summary = empGoals[emp.id]
              const initials = (emp.full_name || '??').split(' ').map(w => w[0]).slice(0, 2).join('')

              return (
                <div key={emp.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    onClick={() => toggleEmployee(emp.id)}
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white gradient-brand">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{emp.full_name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                        {[emp.position_name, emp.department_name].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <ChevronIcon open={isOpen} />
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4">
                      {goalsLoading === emp.id ? (
                        <p className="text-sm py-2" style={{ color: 'var(--text-tertiary)' }}>Загрузка целей...</p>
                      ) : summary ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium" style={{ color: 'var(--text-quaternary)' }}>{summary.total_goals} целей</span>
                            <span className="text-xs font-semibold" style={getScoreStyle(summary.average_score)}>
                              SMART {fmt((summary.average_score || 0) * 100)}%
                            </span>
                          </div>
                          {(summary.goals || []).map((goal) => {
                            const sc = statusConfig[goal.status] || statusConfig.draft
                            return (
                              <div key={goal.id} className="rounded-lg px-3 py-2.5"
                                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: sc.dot }} />
                                  <p className="text-sm truncate flex-1" style={{ color: 'var(--text-primary)' }}>{goal.title}</p>
                                  {goal.smart_score != null && (
                                    <span className="text-xs font-semibold flex-shrink-0" style={getScoreStyle(goal.smart_score)}>
                                      {fmt(goal.smart_score * 100)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 sm:px-6" style={{ borderTop: '1px solid var(--border-secondary)' }}>
              <button
                onClick={() => { setPage(p => Math.max(1, p - 1)); setExpandedId(null) }}
                disabled={page <= 1}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40"
                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                Назад
              </button>
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Стр. {page} из {totalPages}
              </span>
              <button
                onClick={() => { setPage(p => Math.min(totalPages, p + 1)); setExpandedId(null) }}
                disabled={page >= totalPages}
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
