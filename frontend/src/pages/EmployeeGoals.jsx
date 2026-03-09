import { useState, useEffect } from 'react'
import { getGoals, evaluateBatch } from '../api/client'
import { CheckCircleIcon, ClockIcon, XCircleIcon, DocumentCheckIcon } from '@heroicons/react/24/outline'

const statusBadges = {
  draft: { label: 'Черновик', class: 'bg-gray-100 text-gray-800', icon: DocumentCheckIcon },
  pending: { label: 'На согласовании', class: 'bg-yellow-100 text-yellow-800', icon: ClockIcon },
  approved: { label: 'Утверждена', class: 'bg-green-100 text-green-800', icon: CheckCircleIcon },
  rejected: { label: 'Отклонена', class: 'bg-red-100 text-red-800', icon: XCircleIcon },
  completed: { label: 'Выполнена', class: 'bg-blue-100 text-blue-800', icon: CheckCircleIcon },
}

export default function EmployeeGoals() {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [batchResult, setBatchResult] = useState(null)
  const [evaluating, setEvaluating] = useState(false)

  // Filters
  const [quarter, setQuarter] = useState('')
  const [year, setYear] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    loadGoals()
  }, [quarter, year, status])

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
      const result = await evaluateBatch(
        employeeId,
        quarter || null,
        year ? parseInt(year) : null
      )
      setBatchResult(result)
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка пакетной оценки')
    } finally {
      setEvaluating(false)
    }
  }

  // Group goals by employee
  const goalsByEmployee = goals.reduce((acc, goal) => {
    const key = goal.employee_id
    if (!acc[key]) {
      acc[key] = {
        employee_id: goal.employee_id,
        employee_name: goal.employee_name,
        department_name: goal.department_name,
        position_name: goal.position_name,
        goals: []
      }
    }
    acc[key].goals.push(goal)
    return acc
  }, {})

  const getScoreColor = (score) => {
    if (!score) return 'text-gray-400'
    if (score >= 0.85) return 'text-green-600'
    if (score >= 0.7) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Цели сотрудников
            </h1>
            <p className="text-gray-600">
              Просмотр и оценка целей по сотрудникам
            </p>
          </div>
          <div className="flex gap-3">
            <select
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
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
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              <option value="">Все годы</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
            <select
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Все статусы</option>
              <option value="draft">Черновик</option>
              <option value="pending">На согласовании</option>
              <option value="approved">Утверждена</option>
              <option value="rejected">Отклонена</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Загрузка...</div>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.values(goalsByEmployee).map((employeeData) => (
            <div key={employeeData.employee_id} className="bg-white rounded-xl shadow-sm overflow-hidden">
              {/* Employee header */}
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {employeeData.employee_name}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {employeeData.position_name} • {employeeData.department_name}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500">
                    {employeeData.goals.length} целей
                  </span>
                  <button
                    onClick={() => handleBatchEvaluate(employeeData.employee_id)}
                    disabled={evaluating && selectedEmployee === employeeData.employee_id}
                    className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    {evaluating && selectedEmployee === employeeData.employee_id
                      ? 'Оценка...'
                      : 'Оценить все'}
                  </button>
                </div>
              </div>

              {/* Batch evaluation result */}
              {batchResult && batchResult.employee_id === employeeData.employee_id && (
                <div className="px-6 py-4 bg-blue-50 border-b border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-blue-900">Результат пакетной оценки</span>
                    <span className={`text-lg font-bold ${getScoreColor(batchResult.average_score)}`}>
                      {(batchResult.average_score * 100).toFixed(0)}% средний SMART
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className={`px-2 py-1 rounded ${batchResult.weight_valid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      Сумма весов: {batchResult.total_weight.toFixed(0)}%
                      {!batchResult.weight_valid && ' (должно быть 100%)'}
                    </span>
                    <span className={`px-2 py-1 rounded ${batchResult.goals_count_valid ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      Целей: {batchResult.total_goals}
                      {!batchResult.goals_count_valid && ' (рекомендуется 3-5)'}
                    </span>
                  </div>
                  {batchResult.top_issues.length > 0 && (
                    <div className="mt-2">
                      <span className="text-sm text-blue-800">Проблемы: </span>
                      {batchResult.top_issues.map((issue, i) => (
                        <span key={i} className="text-sm text-blue-600 mr-2">{issue}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Goals list */}
              <div className="divide-y divide-gray-100">
                {employeeData.goals.map((goal) => {
                  const statusBadge = statusBadges[goal.status] || statusBadges.draft
                  const StatusIcon = statusBadge.icon

                  return (
                    <div key={goal.id} className="px-6 py-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs ${statusBadge.class}`}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusBadge.label}
                            </span>
                            {goal.quarter && (
                              <span className="text-xs text-gray-500">
                                {goal.quarter} {goal.year}
                              </span>
                            )}
                            {goal.goal_type && (
                              <span className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded">
                                {goal.goal_type}
                              </span>
                            )}
                            {goal.strategic_link && (
                              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                                {goal.strategic_link}
                              </span>
                            )}
                          </div>
                          <h4 className="font-medium text-gray-900">{goal.title}</h4>
                          {goal.metric && (
                            <p className="text-sm text-gray-600 mt-1">
                              Показатель: {goal.metric}
                            </p>
                          )}
                        </div>
                        <div className="ml-4 text-right">
                          <div className="text-sm text-gray-500 mb-1">
                            Вес: {goal.weight?.toFixed(0) || 0}%
                          </div>
                          {goal.smart_score !== null && (
                            <div className={`text-xl font-bold ${getScoreColor(goal.smart_score)}`}>
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

          {Object.keys(goalsByEmployee).length === 0 && (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <div className="text-gray-500">Цели не найдены</div>
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
