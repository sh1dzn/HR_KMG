import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import {
  approveGoal, commentGoal, evaluateBatch,
  getDashboardSummary, getEmployees, getEmployeeGoalsSummary, getGoals,
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

const statusLabels = {
  draft: 'Черновики', submitted: 'На согласовании', approved: 'Утверждённые',
  in_progress: 'В работе', done: 'Выполненные', cancelled: 'Отменённые',
  overdue: 'Просроченные', archived: 'Архив', active: 'Активные',
}

export default function EmployeeGoals() {
  const [searchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') || ''

  const [employees,        setEmployees]       = useState([])
  const [totalEmployees,   setTotalEmployees]  = useState(0)
  const [filteredGoals,    setFilteredGoals]   = useState([])
  const [totalFilteredGoals, setTotalFilteredGoals] = useState(0)
  const [loading,          setLoading]         = useState(false)
  const [error,            setError]           = useState(null)
  const [page,             setPage]            = useState(1)
  const [searchQuery,      setSearchQuery]     = useState('')
  const [deptFilter,       setDeptFilter]      = useState('')
  const [allDepartments,   setAllDepartments]  = useState([]) // { id, name }

  // Expanded employee
  const [expandedId,       setExpandedId]      = useState(null)
  const [empGoals,         setEmpGoals]        = useState({})
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

  /* ── Load departments once ───────────────────────────────── */
  useEffect(() => {
    getDashboardSummary('Q2', 2026).then(d => {
      setAllDepartments((d.departments_stats || []).map(ds => ({ id: ds.department_id, name: ds.department_name })))
    }).catch(() => {})
  }, [])

  /* ── Reset page on filter change ───────────────────────── */
  useEffect(() => { setPage(1); setExpandedId(null); setDeptFilter('') }, [statusFilter])

  /* ── Load data ─────────────────────────────────────────── */
  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(null)
      try {
        if (statusFilter) {
          // Load goals by status + optional department
          const params = { status: statusFilter, page, per_page: ROWS_PER_PAGE }
          if (deptFilter) params.department_id = deptFilter
          const r = await getGoals(params)
          setFilteredGoals(r.goals || [])
          setTotalFilteredGoals(r.total || 0)
        } else {
          // Load employees + optional department
          const params = { page, per_page: ROWS_PER_PAGE }
          if (deptFilter) params.department_id = deptFilter
          const r = await getEmployees(params)
          setEmployees(r.employees || [])
          setTotalEmployees(r.total || 0)
        }
      } catch (e) { setError(e.response?.data?.detail || 'Ошибка загрузки данных') }
      finally { setLoading(false) }
    }
    load()
  }, [page, statusFilter, deptFilter])

  const totalItems = statusFilter ? totalFilteredGoals : totalEmployees
  const totalPages = Math.max(1, Math.ceil(totalItems / ROWS_PER_PAGE))

  /* ── Departments list for filter ───────────────────────── */
  const departments = useMemo(() => {
    const set = new Set(employees.map(e => e.department_name).filter(Boolean))
    return [...set].sort()
  }, [employees])

  /* ── Client-side search (dept is server-side now) ────── */
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return employees
    return employees.filter(e =>
      [e.full_name, e.department_name, e.position_name].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [employees, searchQuery])

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
      if (action === 'comment') await commentGoal(goal.id, payload)
      setCommentsByGoal(p => ({ ...p, [goal.id]: '' }))
      const [data] = await Promise.all([
        getEmployeeGoalsSummary(empId),
        getGoalWorkflow(goal.id).then(wf => setWorkflowByGoal(p => ({ ...p, [goal.id]: wf }))),
      ])
      setEmpGoals(prev => ({ ...prev, [empId]: data }))
    } catch (e) { setError(e.response?.data?.detail || 'Ошибка workflow-действия') }
    finally { setWorkflowActionId(null) }
  }

  /* ── Filtered view workflow action ────────────────────── */
  const handleFilteredAction = async (goalId, action) => {
    const key = `${goalId}:${action}`
    const comment = commentsByGoal[goalId]?.trim() || null
    if (action === 'comment' && !comment) return
    setWorkflowActionId(key); setError(null)
    try {
      const payload = { comment }
      if (action === 'submit')  await submitGoal(goalId, payload)
      if (action === 'approve') await approveGoal(goalId, payload)
      if (action === 'reject')  await rejectGoal(goalId, payload)
      if (action === 'comment') await commentGoal(goalId, payload)
      setCommentsByGoal(p => ({ ...p, [goalId]: '' }))
      // Refresh workflow + goals list
      getGoalWorkflow(goalId).then(wf => setWorkflowByGoal(p => ({ ...p, [goalId]: wf }))).catch(() => {})
      const r = await getGoals({ status: statusFilter, page, per_page: ROWS_PER_PAGE })
      setFilteredGoals(r.goals || [])
      setTotalFilteredGoals(r.total || 0)
    } catch (e) { setError(e.response?.data?.detail || 'Ошибка действия') }
    finally { setWorkflowActionId(null) }
  }

  /* ── Render goal card (shared between desktop & mobile) ── */
  const renderGoalCard = (goal, empId) => {
    const sc = statusConfig[goal.status] || statusConfig.draft
    const wfOpen = expandedGoalId === goal.id
    const wf = workflowByGoal[goal.id]

    return (
      <div key={goal.id} className="rounded-lg overflow-hidden"
        style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <span className="h-2 w-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: sc.dot }} title={sc.label} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>{goal.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs rounded-full px-2 py-0.5"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-quaternary)' }}
              >{sc.label}</span>
              {goal.goal_type && (
                <span className="text-xs rounded-full px-2 py-0.5"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-quaternary)' }}
                >{goal.goal_type}</span>
              )}
              {goal.strategic_link && (
                <span className="text-xs rounded-full px-2 py-0.5 badge-brand">{goal.strategic_link}</span>
              )}
              <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>Вес {fmt(goal.weight)}%</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {goal.smart_score != null ? (
              <span className="text-sm font-semibold" style={getScoreStyle(goal.smart_score)}>
                {fmt(goal.smart_score * 100)}%
              </span>
            ) : (
              <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>—</span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); toggleWorkflow(goal.id) }}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors"
              style={{ color: 'var(--fg-quaternary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
              title="Workflow"
            >
              <svg className="h-3.5 w-3.5 transition-transform" style={{ transform: wfOpen ? 'rotate(45deg)' : '' }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          </div>
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
                        onClick={() => handleWorkflowAction(goal, action, empId)}
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
                          <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{eventLabels[ev.event_type] || ev.event_type}</div>
                          <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>{ev.actor_name || 'Система'} · {new Date(ev.created_at).toLocaleString()}</div>
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
                          <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{verdictLabels[rv.verdict] || rv.verdict}</div>
                          <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>{rv.reviewer_name || '—'} · {new Date(rv.created_at).toLocaleString()}</div>
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
  }

  /* ── Render expanded goals panel ────────────────────────── */
  const renderGoalsPanel = (emp) => {
    const summary = empGoals[emp.id]

    if (goalsLoading === emp.id) {
      return (
        <div className="flex items-center gap-2 py-6 justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
          <svg className="h-4 w-4 animate-spin spinner-brand" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Загрузка целей...
        </div>
      )
    }

    if (!summary) return null

    return (
      <>
        {/* Summary stats */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-secondary)' }}
          >
            {summary.total_goals} целей
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

        {/* Goals */}
        <div className="space-y-2">
          {(summary.goals || []).map(goal => renderGoalCard(goal, emp.id))}
        </div>
      </>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--fg-quaternary)' }}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" className="input-field pl-9"
              placeholder="Поиск по ФИО, должности..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {allDepartments.length > 0 && (
            <select className="select-field sm:w-64"
              value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1) }}
            >
              <option value="">Все подразделения</option>
              {allDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
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
        <div className="space-y-0">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {statusFilter ? (statusLabels[statusFilter] || statusFilter) : 'Сотрудники'}
            </h2>
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: 'var(--bg-brand-primary)', color: 'var(--fg-brand-primary)', border: '1px solid var(--border-brand-secondary)' }}
            >
              {totalItems}
            </span>
          </div>

          {/* Filtered goals view (when status filter is active) */}
          {statusFilter ? (
            <div className="space-y-2">
              {filteredGoals.map((goal) => {
                const sc = statusConfig[goal.status] || statusConfig.draft
                const initials = (goal.employee_name || '??').split(' ').map(w => w[0]).slice(0, 2).join('')
                const wfOpen = expandedGoalId === goal.id
                const wf = workflowByGoal[goal.id]
                const isSubmitted = goal.status === 'submitted'
                const isDraft = goal.status === 'draft' || goal.status === 'active'

                return (
                  <div key={goal.id} className="card overflow-hidden">
                    {/* Goal header */}
                    <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white gradient-brand mt-0.5">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>{goal.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{goal.employee_name}</span>
                          {goal.department_name && (
                            <span className="text-xs hidden sm:inline" style={{ color: 'var(--text-quaternary)' }}>· {goal.department_name}</span>
                          )}
                          {goal.goal_type && (
                            <span className="text-xs rounded-full px-2 py-0.5"
                              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-quaternary)' }}
                            >{goal.goal_type}</span>
                          )}
                          {goal.strategic_link && (
                            <span className="text-xs rounded-full px-2 py-0.5 badge-brand">{goal.strategic_link}</span>
                          )}
                        </div>
                        {goal.metric && (
                          <p className="mt-1 text-xs" style={{ color: 'var(--text-quaternary)' }}>{goal.metric}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>Вес {fmt(goal.weight)}%</div>
                          {goal.smart_score != null && (
                            <div className="text-sm font-semibold mt-0.5" style={getScoreStyle(goal.smart_score)}>
                              {fmt(goal.smart_score * 100)}%
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions bar */}
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 sm:px-5" style={{ borderTop: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
                      {/* Quick actions based on status */}
                      {isDraft && (
                        <button onClick={() => handleFilteredAction(goal.id, 'submit')}
                          disabled={workflowActionId === `${goal.id}:submit`}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                          style={{ backgroundColor: 'var(--bg-brand-solid)', color: '#fff', border: '1px solid var(--bg-brand-solid)' }}
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                          Отправить
                        </button>
                      )}
                      {isSubmitted && (
                        <>
                          <button onClick={() => handleFilteredAction(goal.id, 'approve')}
                            disabled={workflowActionId === `${goal.id}:approve`}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                            style={{ backgroundColor: 'var(--bg-success-primary)', color: 'var(--text-success-primary)', border: '1px solid var(--border-success)' }}
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                            Утвердить
                          </button>
                          <button onClick={() => handleFilteredAction(goal.id, 'reject')}
                            disabled={workflowActionId === `${goal.id}:reject`}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                            style={{ backgroundColor: 'var(--bg-warning-primary)', color: 'var(--text-warning-primary)', border: '1px solid var(--border-warning)' }}
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            На доработку
                          </button>
                        </>
                      )}

                      {/* Workflow expand */}
                      <button onClick={() => toggleWorkflow(goal.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ml-auto"
                        style={{ color: 'var(--text-quaternary)', border: '1px solid var(--border-secondary)' }}
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                        </svg>
                        {wfOpen ? 'Скрыть' : 'Подробнее'}
                      </button>
                    </div>

                    {/* Workflow panel */}
                    {wfOpen && (
                      <div className="px-4 py-3 sm:px-5" style={{ borderTop: '1px solid var(--border-secondary)' }}>
                        {workflowLoadingId === goal.id ? (
                          <div className="flex items-center gap-2 py-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                            <svg className="h-4 w-4 animate-spin spinner-brand" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                            Загрузка...
                          </div>
                        ) : wf ? (
                          <>
                            {/* Comment input */}
                            <div className="flex gap-2 mb-3">
                              <input type="text" className="input-field flex-1 text-sm"
                                placeholder="Комментарий..."
                                value={commentsByGoal[goal.id] || ''}
                                onChange={(e) => setCommentsByGoal(p => ({ ...p, [goal.id]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === 'Enter' && commentsByGoal[goal.id]?.trim()) handleFilteredAction(goal.id, 'comment') }}
                              />
                              <button onClick={() => handleFilteredAction(goal.id, 'comment')}
                                disabled={!commentsByGoal[goal.id]?.trim()}
                                className="inline-flex items-center justify-center h-10 w-10 rounded-lg transition-colors disabled:opacity-40"
                                style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', color: 'var(--fg-quaternary)' }}
                              >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                                </svg>
                              </button>
                            </div>
                            {/* History */}
                            <div className="space-y-1.5 max-h-40 overflow-y-auto">
                              {[
                                ...(wf.events || []).map(e => ({ ...e, _type: 'event', _time: e.created_at })),
                                ...(wf.reviews || []).map(r => ({ ...r, _type: 'review', _time: r.created_at })),
                              ].sort((a, b) => new Date(b._time) - new Date(a._time)).slice(0, 10).map((item, i) => (
                                <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2"
                                  style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
                                  <span className="h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1.5" style={{
                                    backgroundColor: item._type === 'review' ? 'var(--fg-success-primary)' : 'var(--fg-brand-primary)',
                                  }} />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                                      {item.event_type || item.verdict || ''}
                                    </div>
                                    <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>
                                      {item.actor_name || item.reviewer_name || 'Система'} · {new Date(item._time).toLocaleString()}
                                    </div>
                                    {(item.comment || item.comment_text) && (
                                      <div className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.comment || item.comment_text}</div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
              {filteredGoals.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-xl p-12 text-center"
                  style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
                >
                  <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Целей со статусом «{statusLabels[statusFilter] || statusFilter}» не найдено
                  </p>
                </div>
              )}
            </div>
          ) : (
          /* Employee list */
          <div className="space-y-2">
            {filtered.map((emp) => {
              const isOpen = expandedId === emp.id
              const summary = empGoals[emp.id]
              const initials = (emp.full_name || '??').split(' ').map(w => w[0]).slice(0, 2).join('')

              return (
                <div key={emp.id} className="card overflow-hidden">
                  {/* Employee row */}
                  <button
                    type="button"
                    className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors"
                    onClick={() => toggleEmployee(emp.id)}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                  >
                    {/* Avatar */}
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white gradient-brand">
                      {initials}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{emp.full_name}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        {emp.position_name}
                        <span className="hidden sm:inline"> · {emp.department_name}</span>
                      </div>
                    </div>

                    {/* Stats (if loaded) */}
                    {summary && (
                      <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
                        <div className="text-center">
                          <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>Целей</div>
                          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{summary.total_goals}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>SMART</div>
                          <div className="text-sm font-semibold" style={getScoreStyle(summary.average_score)}>
                            {fmt((summary.average_score || 0) * 100)}%
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Chevron */}
                    <svg className="h-5 w-5 flex-shrink-0 transition-transform duration-200"
                      style={{ color: 'var(--fg-quaternary)', transform: isOpen ? 'rotate(180deg)' : '' }}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>

                  {/* Expanded goals */}
                  {isOpen && (
                    <div className="px-5 py-4" style={{ borderTop: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
                      {/* Department on mobile */}
                      <div className="sm:hidden mb-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>{emp.department_name}</div>
                      {renderGoalsPanel(emp)}
                    </div>
                  )}
                </div>
              )
            })}

            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-xl p-12 text-center"
                style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
              >
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Сотрудники не найдены</p>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-quaternary)' }}>Попробуйте изменить фильтры</p>
              </div>
            )}
          </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => { setPage(p => Math.max(1, p - 1)); setExpandedId(null) }}
                disabled={page <= 1}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40"
                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)' }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                Назад
              </button>
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                {page} из {totalPages}
              </span>
              <button
                onClick={() => { setPage(p => Math.min(totalPages, p + 1)); setExpandedId(null) }}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40"
                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)' }}
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
