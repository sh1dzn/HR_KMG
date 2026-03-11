import { useState, useEffect } from 'react'
import { generateGoals, getFocusAreas, getEmployees, createGoal } from '../api/client'
import { SparklesIcon, DocumentTextIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'

const generationFlow = [
  '1. Профиль сотрудника и квартальный фокус',
  '2. Подбор релевантных ВНД и стратегий',
  '3. Генерация 3-5 целей в SMART-формате',
  '4. Каскадирование от руководителя и проверка истории',
]

export default function GoalGeneration() {
  const [employeeId, setEmployeeId] = useState('')
  const [quarter, setQuarter] = useState('Q2')
  const [year, setYear] = useState(2026)
  const [selectedFocusAreas, setSelectedFocusAreas] = useState([])
  const [count, setCount] = useState(3)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [focusAreas, setFocusAreas] = useState([])
  const [employees, setEmployees] = useState([])
  const [goalStates, setGoalStates] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadFocusAreas()
    loadEmployees()
  }, [])

  const loadEmployees = async () => {
    try {
      const data = await getEmployees()
      setEmployees(data.employees || [])
      if (data.employees?.length > 0) {
        setEmployeeId(data.employees[0].id)
      }
    } catch (err) {
      console.error('Failed to load employees:', err)
    }
  }

  const loadFocusAreas = async () => {
    try {
      const data = await getFocusAreas()
      setFocusAreas(data.focus_areas || [])
    } catch (err) {
      console.error('Failed to load focus areas:', err)
    }
  }

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await generateGoals(
        employeeId,
        quarter,
        year,
        selectedFocusAreas.length > 0 ? selectedFocusAreas : null,
        count
      )
      setResult(data)
      setGoalStates({})
      setSaving(false)
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка при генерации целей')
    } finally {
      setLoading(false)
    }
  }

  const toggleFocusArea = (areaId) => {
    setSelectedFocusAreas(prev =>
      prev.includes(areaId)
        ? prev.filter(id => id !== areaId)
        : [...prev, areaId]
    )
  }

  const getScoreColor = (score) => {
    if (score >= 0.85) return 'text-emerald-600'
    if (score >= 0.7) return 'text-amber-600'
    return 'text-rose-600'
  }

  const getScoreBg = (score) => {
    if (score >= 0.85) return 'bg-emerald-50 border-emerald-200'
    if (score >= 0.7) return 'bg-amber-50 border-amber-200'
    return 'bg-rose-50 border-rose-200'
  }

  const strategicLinkColor = (link) => {
    const colors = {
      strategic: 'bg-purple-50 text-purple-700 border-purple-200',
      functional: 'bg-primary-50 text-primary-700 border-primary-200',
      operational: 'bg-gray-100 text-gray-700 border-gray-200'
    }
    return colors[link] || colors.operational
  }

  const toggleGoalState = (index, state) => {
    setGoalStates(prev => ({
      ...prev,
      [index]: prev[index] === state ? null : state
    }))
  }

  const acceptedCount = Object.values(goalStates).filter(s => s === 'accepted').length

  const handleSaveAccepted = async () => {
    if (acceptedCount === 0) return
    setSaving(true)
    setError(null)

    try {
      const promises = result.generated_goals
        .map((goal, index) => ({ goal, index }))
        .filter(({ index }) => goalStates[index] === 'accepted')
        .map(({ goal }) =>
          createGoal({
            employee_id: employeeId,
            title: goal.goal_text,
            description: goal.rationale,
            metric: goal.metric,
            weight: goal.suggested_weight,
            quarter: quarter,
            year: year,
          })
        )

      await Promise.all(promises)
      setGoalStates(prev => {
        const updated = { ...prev }
        for (const key in updated) {
          if (updated[key] === 'accepted') updated[key] = 'saved'
        }
        return updated
      })
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка при сохранении целей')
    } finally {
      setSaving(false)
    }
  }

  const savedCount = Object.values(goalStates).filter(s => s === 'saved').length

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Генерация целей</h1>
          <p className="mt-1 text-sm text-gray-500">
            Экран демонстрирует главный сценарий хакатона: Goal Generator
            формирует набор целей из ВНД, стратегии, роли сотрудника и
            квартальных приоритетов с источником и SMART-предоценкой.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pipeline</div>
          <div className="mt-3 space-y-2">
            {generationFlow.map((step) => (
              <div key={step} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                {step}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-xs p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">Параметры генерации</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Сотрудник</label>
            <select
              className="select-field w-full"
              value={employeeId}
              onChange={(e) => setEmployeeId(parseInt(e.target.value))}
            >
              {employees.length === 0 && <option value="">Загрузка...</option>}
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} — {emp.position_name}, {emp.department_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Квартал</label>
            <select
              className="select-field w-full"
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
            >
              <option value="Q1">Q1</option>
              <option value="Q2">Q2</option>
              <option value="Q3">Q3</option>
              <option value="Q4">Q4</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Год</label>
            <input
              type="number"
              className="input-field"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Количество целей</label>
            <select
              className="select-field w-full"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value))}
            >
              <option value={3}>3 цели</option>
              <option value={4}>4 цели</option>
              <option value={5}>5 целей</option>
            </select>
          </div>
        </div>

        {/* Focus Areas */}
        {focusAreas.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Фокус-направления квартала
              <span className="text-gray-400 font-normal ml-1">(опционально)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {focusAreas.map((area) => (
                <button
                  key={area.id}
                  onClick={() => toggleFocusArea(area.name)}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer border ${
                    selectedFocusAreas.includes(area.name)
                      ? 'bg-primary-50 text-primary-700 border-primary-300'
                      : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-150'
                  }`}
                  title={area.description}
                >
                  {area.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-6 rounded-xl border border-purple-100 bg-purple-50 px-4 py-3 text-sm text-purple-900">
          Для защиты удобно показать два контраста: генерацию без фокусов и генерацию с фокусами вроде
          “Цифровизация” или “Снижение затрат”. Разница в контексте будет видна сразу.
        </div>

        <div className="border-t border-gray-200 pt-5">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="btn-primary gap-2 text-sm px-6 py-2.5"
          >
            <SparklesIcon className="h-4 w-4" />
            {loading ? 'Генерация...' : 'Сгенерировать цели'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-xs p-10 text-center">
          <div className="inline-flex items-center gap-3">
            <svg
              className="h-5 w-5 text-primary-600 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <div className="text-left">
              <p className="text-sm font-medium text-gray-900">Генерация целей...</p>
              <p className="text-sm text-gray-500">AI анализирует документы и формирует цели</p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">

          {/* Results Header */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-xs p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-1">Сгенерированные цели</h2>
                <p className="text-sm text-gray-500">
                  {result.employee_name}
                  <span className="mx-2 text-gray-300">|</span>
                  {result.position}
                  <span className="mx-2 text-gray-300">|</span>
                  {result.department}
                </p>
              </div>
              <div className="text-right flex-shrink-0 ml-4">
                <span className="inline-block px-2.5 py-1 text-sm font-medium bg-primary-50 text-primary-700 rounded-lg border border-primary-200">
                  {result.quarter} {result.year}
                </span>
                <div className="text-sm text-gray-500 mt-2">
                  Сумма весов: <span className="font-semibold text-gray-900">{result.total_suggested_weight.toFixed(0)}%</span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">MVP-функция</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">Генерация 3-5 целей</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Обоснование</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">Источник ВНД + rationale</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Контроль</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">SMART + историческая достижимость</div>
              </div>
            </div>

            {acceptedCount > 0 && (
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={handleSaveAccepted}
                  disabled={saving}
                  className="btn-primary gap-2 text-sm px-5 py-2"
                >
                  <CheckIcon className="h-4 w-4" />
                  {saving ? 'Сохранение...' : `Сохранить принятые цели (${acceptedCount})`}
                </button>
              </div>
            )}

            {savedCount > 0 && (
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                Сохранено {savedCount} {savedCount === 1 ? 'цель' : savedCount < 5 ? 'цели' : 'целей'} в систему как черновик.
              </div>
            )}

            {result.generation_context && (
              <div className="mt-4 p-3 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-800">
                <span className="font-semibold">Контекст генерации:</span>{' '}
                {result.generation_context}
              </div>
            )}

            {/* F-14: Cascading indicator */}
            {result.cascaded_from_manager && (
              <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800">
                <span className="font-semibold">Каскадирование:</span>{' '}
                Цели сформированы с учётом целей руководителя ({result.manager_name}).
                {result.manager_goals_used?.length > 0 && (
                  <ul className="mt-2 space-y-1 list-disc list-inside text-purple-700">
                    {result.manager_goals_used.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* F-20: Historical achievability check */}
            {result.historical_check && (
              <div className={`mt-4 p-3 rounded-lg text-sm border ${
                result.historical_check.completion_rate >= 70
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : result.historical_check.completion_rate >= 40
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : result.historical_check.total_past_goals > 0
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-gray-50 border-gray-200 text-gray-700'
              }`}>
                <span className="font-semibold">Историческая достижимость:</span>{' '}
                {result.historical_check.assessment}
                <div className="mt-2 flex flex-wrap gap-4 text-xs font-medium">
                  <span>Целей в истории: {result.historical_check.total_past_goals}</span>
                  <span>Выполнено: {result.historical_check.completed_count} ({result.historical_check.completion_rate}%)</span>
                  {result.historical_check.avg_smart_score && (
                    <span>Средний SMART: {(result.historical_check.avg_smart_score * 100).toFixed(0)}%</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Goal Cards */}
          {result.generated_goals.map((goal, index) => {
            const state = goalStates[index]
            const borderClass = state === 'accepted' ? 'border-emerald-300'
              : state === 'rejected' ? 'border-rose-300'
              : state === 'saved' ? 'border-emerald-400'
              : 'border-gray-200'

            return (
            <div key={index} className={`bg-white border rounded-xl shadow-xs p-6 transition-colors ${borderClass} ${state === 'rejected' ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-3">
                    <span className="inline-block px-2.5 py-0.5 text-sm font-medium bg-primary-50 text-primary-700 rounded-lg border border-primary-200">
                      Цель {index + 1}
                    </span>
                    <span className={`inline-block px-2.5 py-0.5 text-sm font-medium rounded-lg border ${strategicLinkColor(goal.strategic_link)}`}>
                      {goal.strategic_link_russian}
                    </span>
                    <span className="inline-block px-2.5 py-0.5 text-sm font-medium bg-gray-50 text-gray-600 rounded-lg border border-gray-200">
                      {goal.goal_type_russian}
                    </span>
                    {state === 'saved' && (
                      <span className="inline-block px-2.5 py-0.5 text-sm font-medium bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
                        Сохранено
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 leading-snug mb-3">{goal.goal_text}</h3>
                  <div className="flex items-baseline gap-1.5 text-sm">
                    <span className="font-medium text-gray-500">Показатель:</span>
                    <span className="text-gray-700">{goal.metric}</span>
                  </div>
                </div>
                <div className="flex-shrink-0 text-center">
                  <div className={`inline-flex flex-col items-center justify-center w-20 h-20 rounded-lg border ${getScoreBg(goal.smart_score)}`}>
                    <span className={`text-2xl font-semibold leading-none ${getScoreColor(goal.smart_score)}`}>
                      {(goal.smart_score * 100).toFixed(0)}%
                    </span>
                    <span className="text-xs text-gray-500 mt-1 font-medium">SMART</span>
                  </div>
                  <div className="mt-2 text-sm font-medium text-gray-500">Вес: {goal.suggested_weight.toFixed(0)}%</div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600 leading-relaxed">
                  <span className="font-medium text-gray-700">Обоснование:</span>{' '}
                  {goal.rationale}
                </p>
              </div>

              {goal.source_document && (
                <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center mt-0.5">
                      <DocumentTextIcon className="h-4 w-4 text-gray-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-700">{goal.source_document.title}</div>
                      <div className="mt-1 inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        Источник из ВНД / стратегии
                      </div>
                      <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                        {goal.source_document.relevant_fragment.substring(0, 200)}...
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Accept / Reject buttons */}
              {state !== 'saved' && (
                <div className="mt-4 pt-4 border-t border-gray-200 flex items-center gap-2">
                  <button
                    onClick={() => toggleGoalState(index, 'accepted')}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer border ${
                      state === 'accepted'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'
                    }`}
                  >
                    <CheckIcon className="h-4 w-4" />
                    Принять
                  </button>
                  <button
                    onClick={() => toggleGoalState(index, 'rejected')}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer border ${
                      state === 'rejected'
                        ? 'bg-rose-50 text-rose-700 border-rose-300'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300'
                    }`}
                  >
                    <XMarkIcon className="h-4 w-4" />
                    Отклонить
                  </button>
                </div>
              )}
            </div>
          )})}
        </div>
      )}
    </div>
  )
}
