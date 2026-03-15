import { useDeferredValue, useEffect, useState } from 'react'
import {
  approveGoal,
  commentGoal,
  evaluateBatch,
  getGoalWorkflow,
  getGoals,
  rejectGoal,
  submitGoal,
} from '../api/client'
import {
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  DocumentCheckIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'

const statusBadges = {
  draft: { label: 'Черновик', class: 'bg-gray-100 text-gray-700', icon: DocumentCheckIcon },
  active: { label: 'Активна', class: 'bg-blue-50 text-blue-700', icon: DocumentCheckIcon },
  submitted: { label: 'На согласовании', class: 'bg-amber-50 text-amber-700', icon: ClockIcon },
  approved: { label: 'Утверждена', class: 'bg-green-50 text-green-700', icon: CheckCircleIcon },
  in_progress: { label: 'В работе', class: 'bg-sky-50 text-sky-700', icon: ClockIcon },
  done: { label: 'Выполнена', class: 'bg-green-50 text-green-700', icon: CheckCircleIcon },
  cancelled: { label: 'Отменена', class: 'bg-red-50 text-red-700', icon: XCircleIcon },
  overdue: { label: 'Просрочена', class: 'bg-rose-50 text-rose-700', icon: XCircleIcon },
  archived: { label: 'Архив', class: 'bg-gray-200 text-gray-700', icon: DocumentCheckIcon },
}

const actionLabels = {
  submit: 'Отправить',
  approve: 'Утвердить',
  reject: 'На доработку',
  comment: 'Комментарий',
}

const actionStyles = {
  submit: 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800',
  approve: 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100',
  reject: 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100',
  comment: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
}

const alertStyles = {
  high: 'bg-rose-50 text-rose-700 border-rose-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
}

const eventLabels = {
  created: 'Создание',
  edited: 'Редактирование',
  submitted: 'Отправка',
  approved: 'Утверждение',
  rejected: 'Возврат',
  commented: 'Комментарий',
  status_changed: 'Смена статуса',
  archived: 'Архивация',
}

const verdictLabels = {
  approve: 'Утверждено',
  reject: 'Отклонено',
  needs_changes: 'На доработку',
  comment_only: 'Комментарий',
}

export default function EmployeeGoals() {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [batchResult, setBatchResult] = useState(null)
  const [evaluating, setEvaluating] = useState(false)
  const [quarter, setQuarter] = useState('')
  const [year, setYear] = useState('')
  const [status, setStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [expandedGoalId, setExpandedGoalId] = useState(null)
  const [workflowByGoal, setWorkflowByGoal] = useState({})
  const [workflowLoadingId, setWorkflowLoadingId] = useState(null)
  const [workflowActionId, setWorkflowActionId] = useState(null)
  const [commentsByGoal, setCommentsByGoal] = useState({})
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const normalizeGoal = (goal) => ({
    ...goal,
    weight: Number.isFinite(Number(goal?.weight)) ? Number(goal.weight) : 0,
    smart_score: Number.isFinite(Number(goal?.smart_score)) ? Number(goal.smart_score) : null,
    alerts: Array.isArray(goal?.alerts) ? goal.alerts : [],
  })

  useEffect(() => {
    const loadGoals = async () => {
      setLoading(true)
      setError(null)
      try {
        const params = {}
        if (quarter) params.quarter = quarter
        if (year) params.year = parseInt(year)
        if (status) params.status = status

        const perPage = 100
        const result = await getGoals({ ...params, page: 1, per_page: perPage })
        setGoals((result.goals || []).map(normalizeGoal))
      } catch (err) {
        setError(err.response?.data?.detail || 'Ошибка загрузки целей')
      } finally {
        setLoading(false)
      }
    }

    loadGoals()
  }, [quarter, year, status, reloadKey])

  const handleBatchEvaluate = async (employeeId) => {
    setEvaluating(true)
    setSelectedEmployee(employeeId)
    setBatchResult(null)
    setError(null)
    try {
      const result = await evaluateBatch(employeeId, quarter || null, year ? parseInt(year) : null)
      setBatchResult(result)
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка пакетной оценки')
    } finally {
      setEvaluating(false)
    }
  }

  const loadWorkflow = async (goalId) => {
    setWorkflowLoadingId(goalId)
    setError(null)
    try {
      const workflow = await getGoalWorkflow(goalId)
      setWorkflowByGoal((prev) => ({ ...prev, [goalId]: workflow }))
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка загрузки workflow')
    } finally {
      setWorkflowLoadingId(null)
    }
  }

  const toggleWorkflow = async (goalId) => {
    if (expandedGoalId === goalId) {
      setExpandedGoalId(null)
      return
    }
    setExpandedGoalId(goalId)
    if (!workflowByGoal[goalId]) {
      await loadWorkflow(goalId)
    }
  }

  const handleWorkflowAction = async (goal, action) => {
    const actionKey = `${goal.id}:${action}`
    const comment = commentsByGoal[goal.id]?.trim() || null

    if (action === 'comment' && !comment) {
      setError('Для комментария заполните текст')
      return
    }

    setWorkflowActionId(actionKey)
    setError(null)

    try {
      const payload = {
        actor_id: action === 'submit' ? goal.employee_id : goal.manager_id || undefined,
        comment,
      }

      if (action === 'submit') await submitGoal(goal.id, payload)
      if (action === 'approve') await approveGoal(goal.id, payload)
      if (action === 'reject') await rejectGoal(goal.id, payload)
      if (action === 'comment') await commentGoal(goal.id, payload)

      setCommentsByGoal((prev) => ({ ...prev, [goal.id]: '' }))
      setReloadKey((prev) => prev + 1)
      await loadWorkflow(goal.id)
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка workflow-действия')
    } finally {
      setWorkflowActionId(null)
    }
  }

  const goalsByEmployee = goals.reduce((acc, goal) => {
    const key = goal.employee_id
    if (!acc[key]) {
      acc[key] = {
        employee_id: goal.employee_id,
        employee_name: goal.employee_name,
        department_name: goal.department_name,
        position_name: goal.position_name,
        manager_name: goal.manager_name,
        goals: [],
      }
    }
    acc[key].goals.push(goal)
    return acc
  }, {})

  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase()
  const employeeEntries = Object.values(goalsByEmployee)
  const filteredEmployeeEntries = employeeEntries.filter((employeeData) => {
    if (!normalizedSearchQuery) return true

    const searchableText = [
      employeeData.employee_name,
      employeeData.department_name,
      employeeData.position_name,
      employeeData.manager_name,
      ...employeeData.goals.map((goal) => [goal.title, goal.metric, goal.goal_type, goal.strategic_link].filter(Boolean).join(' ')),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return searchableText.includes(normalizedSearchQuery)
  })

  const getScoreColor = (score) => {
    if (!score) return 'text-gray-400'
    if (score >= 0.85) return 'text-green-600'
    if (score >= 0.7) return 'text-amber-600'
    return 'text-red-600'
  }

  const formatPercent = (value, fractionDigits = 0) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return '0'
    return numeric.toFixed(fractionDigits)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Цели сотрудников</h1>
        <p className="text-sm text-gray-500 mt-1">
          Просмотр целей, пакетная оценка, alert-сигналы и workflow согласования.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-xs px-4 py-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_repeat(3,minmax(0,180px))]">
          <div className="min-w-0">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Поиск сотрудника</label>
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                className="input-field pl-9"
                placeholder="ФИО, должность, подразделение, руководитель, текст цели"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Квартал</label>
            <select className="select-field w-full text-sm" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
              <option value="">Все кварталы</option>
              <option value="Q1">Q1</option>
              <option value="Q2">Q2</option>
              <option value="Q3">Q3</option>
              <option value="Q4">Q4</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Год</label>
            <select className="select-field w-full text-sm" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">Все годы</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Статус</label>
            <select className="select-field w-full text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
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
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
            Сотрудников: {filteredEmployeeEntries.length} из {employeeEntries.length}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
            Целей: {goals.length}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-lg shadow-xs flex items-center justify-center h-64">
          <div className="flex items-center gap-3 text-gray-500">
            <ArrowPathIcon className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Загрузка целей...</span>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEmployeeEntries.map((employeeData) => (
            <div key={employeeData.employee_id} className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
              <div className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{employeeData.employee_name}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {employeeData.position_name}
                    {employeeData.department_name && (
                      <>
                        <span className="mx-1.5 text-gray-300">|</span>
                        {employeeData.department_name}
                      </>
                    )}
                    {employeeData.manager_name && (
                      <>
                        <span className="mx-1.5 text-gray-300">|</span>
                        Руководитель: {employeeData.manager_name}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center text-xs font-medium text-gray-600 bg-gray-100 rounded-lg px-2.5 py-1">
                    {employeeData.goals.length}{' '}
                    {employeeData.goals.length === 1 ? 'цель' : employeeData.goals.length >= 2 && employeeData.goals.length <= 4 ? 'цели' : 'целей'}
                  </span>
                  <button
                    onClick={() => handleBatchEvaluate(employeeData.employee_id)}
                    disabled={evaluating && selectedEmployee === employeeData.employee_id}
                    className="btn-primary text-sm py-1.5 px-4"
                  >
                    {evaluating && selectedEmployee === employeeData.employee_id ? (
                      <span className="flex items-center gap-2">
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        Оценка...
                      </span>
                    ) : (
                      'Оценить все'
                    )}
                  </button>
                </div>
              </div>

              {batchResult && batchResult.employee_id === employeeData.employee_id && (
                <div className="px-5 py-4 bg-blue-50 border-b border-blue-100">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                    <span className="text-sm font-semibold text-blue-900">Результат пакетной оценки</span>
                    <span className={`text-lg font-semibold ${getScoreColor(batchResult.average_score)}`}>
                      {formatPercent((Number(batchResult.average_score) || 0) * 100)}% средний SMART
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium ${batchResult.weight_valid ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      Сумма весов: {formatPercent(batchResult.total_weight)}%
                    </span>
                    <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium ${batchResult.goals_count_valid ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      Целей: {batchResult.total_goals}
                    </span>
                  </div>
                  {(batchResult.top_issues || []).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-blue-100">
                      <span className="text-sm font-medium text-blue-800">Проблемы:</span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {(batchResult.top_issues || []).map((issue) => (
                          <span key={issue} className="inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-700">
                            {issue}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                {employeeData.goals.map((goal, index) => {
                  const statusBadge = statusBadges[goal.status] || statusBadges.draft
                  const StatusIcon = statusBadge.icon
                  const workflow = workflowByGoal[goal.id]
                  const isExpanded = expandedGoalId === goal.id

                  return (
                    <div key={goal.id} className={`px-5 py-4 ${index > 0 ? 'border-t border-gray-200' : ''}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium ${statusBadge.class}`}>
                              <StatusIcon className="h-3.5 w-3.5 mr-1" />
                              {statusBadge.label}
                            </span>
                            {goal.quarter && (
                              <span className="inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600">
                                {goal.quarter} {goal.year}
                              </span>
                            )}
                            {goal.goal_type && (
                              <span className="inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600">
                                {goal.goal_type}
                              </span>
                            )}
                            {goal.strategic_link && (
                              <span className="inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700">
                                {goal.strategic_link}
                              </span>
                            )}
                            {goal.external_ref && (
                              <span className="inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700">
                                exported
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-medium text-gray-900 leading-snug">{goal.title}</h4>
                          {goal.metric && <p className="text-sm text-gray-500 mt-1">Показатель: {goal.metric}</p>}
                          {goal.alerts?.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {goal.alerts.map((alert) => (
                                <span
                                  key={`${goal.id}-${alert.alert_type}`}
                                  className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium ${alertStyles[alert.severity] || alertStyles.low}`}
                                  title={alert.message}
                                >
                                  {alert.title}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-right pl-4">
                          <div className="text-sm text-gray-500 font-medium">Вес: {formatPercent(goal.weight)}%</div>
                          {goal.smart_score !== null && goal.smart_score !== undefined && (
                            <div className={`text-xl font-semibold mt-0.5 ${getScoreColor(goal.smart_score)}`}>
                              {formatPercent(goal.smart_score * 100)}%
                            </div>
                          )}
                          <button
                            onClick={() => toggleWorkflow(goal.id)}
                            className="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Workflow
                            {isExpanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                          {workflowLoadingId === goal.id && (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                              <ArrowPathIcon className="h-4 w-4 animate-spin" />
                              Загрузка workflow...
                            </div>
                          )}

                          {workflow && (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                {(workflow.available_actions || []).map((action) => (
                                  <button
                                    key={action}
                                    onClick={() => handleWorkflowAction(goal, action)}
                                    disabled={workflowActionId === `${goal.id}:${action}` || (action === 'comment' && !commentsByGoal[goal.id]?.trim())}
                                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${actionStyles[action] || actionStyles.comment}`}
                                  >
                                    {action === 'submit' && <PaperAirplaneIcon className="h-4 w-4" />}
                                    {action === 'comment' && <ChatBubbleLeftRightIcon className="h-4 w-4" />}
                                    {actionLabels[action] || action}
                                  </button>
                                ))}
                              </div>

                              <textarea
                                rows={3}
                                className="input-field mt-3"
                                placeholder="Комментарий руководителя / сотрудника для workflow-действий"
                                value={commentsByGoal[goal.id] || ''}
                                onChange={(e) => setCommentsByGoal((prev) => ({ ...prev, [goal.id]: e.target.value }))}
                              />

                              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-2">История событий</div>
                                  <div className="space-y-2">
                                    {(workflow.events || []).map((event) => (
                                      <div key={event.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                        <div className="text-sm font-medium text-slate-900">
                                          {eventLabels[event.event_type] || event.event_type}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">
                                          {event.actor_name || 'Система'} · {new Date(event.created_at).toLocaleString()}
                                        </div>
                                        {event.comment && (
                                          <div className="mt-1 text-sm text-slate-600">{event.comment}</div>
                                        )}
                                      </div>
                                    ))}
                                    {(workflow.events || []).length === 0 && (
                                      <div className="text-sm text-slate-500">События пока отсутствуют.</div>
                                    )}
                                  </div>
                                </div>

                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-2">Отзывы руководителя</div>
                                  <div className="space-y-2">
                                    {(workflow.reviews || []).map((review) => (
                                      <div key={review.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                        <div className="text-sm font-medium text-slate-900">
                                          {verdictLabels[review.verdict] || review.verdict}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">
                                          {review.reviewer_name || 'Неизвестный reviewer'} · {new Date(review.created_at).toLocaleString()}
                                        </div>
                                        <div className="mt-1 text-sm text-slate-600">{review.comment_text}</div>
                                      </div>
                                    ))}
                                    {(workflow.reviews || []).length === 0 && (
                                      <div className="text-sm text-slate-500">Отзывов пока нет.</div>
                                    )}
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
            </div>
          ))}

          {filteredEmployeeEntries.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-xs p-12 text-center">
              <p className="text-sm font-medium text-gray-600">Сотрудники или цели не найдены</p>
              <p className="text-sm text-gray-400 mt-1">Попробуйте изменить поисковый запрос или фильтры</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
