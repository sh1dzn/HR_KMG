import { useState, useEffect } from 'react'
import { getGoals, evaluateBatch } from '../api/client'
import {
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  DocumentCheckIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'

const statusBadges = {
  draft: {
    label: 'Черновик',
    class: 'bg-gray-100 text-gray-700',
    icon: DocumentCheckIcon,
  },
  active: {
    label: 'Активна',
    class: 'bg-blue-50 text-blue-700',
    icon: DocumentCheckIcon,
  },
  submitted: {
    label: 'На согласовании',
    class: 'bg-amber-50 text-amber-700',
    icon: ClockIcon,
  },
  approved: {
    label: 'Утверждена',
    class: 'bg-green-50 text-green-700',
    icon: CheckCircleIcon,
  },
  in_progress: {
    label: 'В работе',
    class: 'bg-sky-50 text-sky-700',
    icon: ClockIcon,
  },
  done: {
    label: 'Выполнена',
    class: 'bg-green-50 text-green-700',
    icon: CheckCircleIcon,
  },
  cancelled: {
    label: 'Отменена',
    class: 'bg-red-50 text-red-700',
    icon: XCircleIcon,
  },
  overdue: {
    label: 'Просрочена',
    class: 'bg-rose-50 text-rose-700',
    icon: XCircleIcon,
  },
  archived: {
    label: 'Архив',
    class: 'bg-gray-200 text-gray-700',
    icon: DocumentCheckIcon,
  },
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

  useEffect(() => { loadGoals() }, [quarter, year, status])

  const loadGoals = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = {}
      if (quarter) params.quarter = quarter
      if (year) params.year = parseInt(year)
      if (status) params.status = status
      const result = await getGoals(params)
      setGoals(result.goals || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка загрузки целей')
    } finally {
      setLoading(false)
    }
  }

  const handleBatchEvaluate = async (employeeId) => {
    setEvaluating(true)
    setSelectedEmployee(employeeId)
    setBatchResult(null)
    try {
      const result = await evaluateBatch(employeeId, quarter || null, year ? parseInt(year) : null)
      setBatchResult(result)
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка пакетной оценки')
    } finally {
      setEvaluating(false)
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
        goals: [],
      }
    }
    acc[key].goals.push(goal)
    return acc
  }, {})

  const getScoreColor = (score) => {
    if (!score) return 'text-gray-400'
    if (score >= 0.85) return 'text-green-600'
    if (score >= 0.7) return 'text-amber-600'
    return 'text-red-600'
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Цели сотрудников</h1>
        <p className="text-sm text-gray-500 mt-1">Просмотр и оценка целей по сотрудникам</p>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-xs px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Фильтры:</span>
          <select
            className="select-field text-sm"
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
          >
            <option value="">Все кварталы</option>
            <option value="Q1">Q1</option>
            <option value="Q2">Q2</option>
            <option value="Q3">Q3</option>
            <option value="Q4">Q4</option>
          </select>
          <select
            className="select-field text-sm"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="">Все годы</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
          </select>
          <select
            className="select-field text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
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

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-lg shadow-xs flex items-center justify-center h-64">
          <div className="flex items-center gap-3 text-gray-500">
            <ArrowPathIcon className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Загрузка целей...</span>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.values(goalsByEmployee).map((employeeData) => (
            <div
              key={employeeData.employee_id}
              className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden"
            >
              {/* Employee header */}
              <div className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    {employeeData.employee_name}
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {employeeData.position_name}
                    {employeeData.department_name && (
                      <>
                        <span className="mx-1.5 text-gray-300">|</span>
                        {employeeData.department_name}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center text-xs font-medium text-gray-600 bg-gray-100 rounded-lg px-2.5 py-1">
                    {employeeData.goals.length}{' '}
                    {employeeData.goals.length === 1
                      ? 'цель'
                      : employeeData.goals.length >= 2 && employeeData.goals.length <= 4
                        ? 'цели'
                        : 'целей'}
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

              {/* Batch evaluation result */}
              {batchResult && batchResult.employee_id === employeeData.employee_id && (
                <div className="px-5 py-4 bg-blue-50 border-b border-blue-100">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                    <span className="text-sm font-semibold text-blue-900">
                      Результат пакетной оценки
                    </span>
                    <span className={`text-lg font-semibold ${getScoreColor(batchResult.average_score)}`}>
                      {(batchResult.average_score * 100).toFixed(0)}% средний SMART
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span
                      className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium ${
                        batchResult.weight_valid
                          ? 'bg-green-50 text-green-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      Сумма весов: {batchResult.total_weight.toFixed(0)}%
                      {!batchResult.weight_valid && ' (должно быть 100%)'}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium ${
                        batchResult.goals_count_valid
                          ? 'bg-green-50 text-green-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      Целей: {batchResult.total_goals}
                      {!batchResult.goals_count_valid && ' (рекомендуется 3-5)'}
                    </span>
                  </div>
                  {batchResult.top_issues.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-blue-100">
                      <span className="text-sm font-medium text-blue-800">Проблемы:</span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {batchResult.top_issues.map((issue, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-700"
                          >
                            {issue}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Goals list */}
              <div>
                {employeeData.goals.map((goal, index) => {
                  const statusBadge = statusBadges[goal.status] || statusBadges.draft
                  const StatusIcon = statusBadge.icon
                  return (
                    <div
                      key={goal.id}
                      className={`px-5 py-4 ${index > 0 ? 'border-t border-gray-200' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span
                              className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium ${statusBadge.class}`}
                            >
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
                          </div>
                          <h4 className="text-sm font-medium text-gray-900 leading-snug">
                            {goal.title}
                          </h4>
                          {goal.metric && (
                            <p className="text-sm text-gray-500 mt-1">
                              Показатель: {goal.metric}
                            </p>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-right pl-4">
                          <div className="text-sm text-gray-500 font-medium">
                            Вес: {goal.weight?.toFixed(0) || 0}%
                          </div>
                          {goal.smart_score !== null && goal.smart_score !== undefined && (
                            <div className={`text-xl font-semibold mt-0.5 ${getScoreColor(goal.smart_score)}`}>
                              {(goal.smart_score * 100).toFixed(0)}%
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Empty state */}
          {Object.keys(goalsByEmployee).length === 0 && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-xs p-12 text-center">
              <p className="text-sm font-medium text-gray-600">Цели не найдены</p>
              <p className="text-sm text-gray-400 mt-1">
                Попробуйте изменить фильтры или запустите генерацию демо-данных
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
