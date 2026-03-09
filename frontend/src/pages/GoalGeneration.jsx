import { useState, useEffect } from 'react'
import { generateGoals, getFocusAreas } from '../api/client'
import { SparklesIcon, DocumentTextIcon } from '@heroicons/react/24/outline'

export default function GoalGeneration() {
  const [employeeId, setEmployeeId] = useState(1)
  const [quarter, setQuarter] = useState('Q2')
  const [year, setYear] = useState(2026)
  const [position, setPosition] = useState('Менеджер по продажам')
  const [department, setDepartment] = useState('Управление продаж')
  const [selectedFocusAreas, setSelectedFocusAreas] = useState([])
  const [count, setCount] = useState(3)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [focusAreas, setFocusAreas] = useState([])

  useEffect(() => {
    loadFocusAreas()
  }, [])

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
    if (score >= 0.85) return 'text-green-600'
    if (score >= 0.7) return 'text-yellow-600'
    return 'text-red-600'
  }

  const strategicLinkBadge = (link) => {
    const badges = {
      strategic: 'bg-purple-100 text-purple-800',
      functional: 'bg-blue-100 text-blue-800',
      operational: 'bg-gray-100 text-gray-800'
    }
    return badges[link] || badges.operational
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Генерация целей
        </h1>
        <p className="text-gray-600">
          AI-генерация целей на основе ВНД, стратегии компании и профиля сотрудника
        </p>
      </div>

      {/* Generation form */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ID сотрудника
            </label>
            <input
              type="number"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              value={employeeId}
              onChange={(e) => setEmployeeId(parseInt(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Квартал
            </label>
            <select
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Год
            </label>
            <input
              type="number"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Количество целей
            </label>
            <select
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value))}
            >
              <option value={3}>3 цели</option>
              <option value={4}>4 цели</option>
              <option value={5}>5 целей</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Должность
            </label>
            <input
              type="text"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Подразделение
            </label>
            <input
              type="text"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>
        </div>

        {/* Focus areas */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Фокус-направления квартала (опционально)
          </label>
          <div className="flex flex-wrap gap-2">
            {focusAreas.map((area) => (
              <button
                key={area.id}
                onClick={() => toggleFocusArea(area.name)}
                className={`px-4 py-2 rounded-full text-sm transition-colors ${
                  selectedFocusAreas.includes(area.name)
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                title={area.description}
              >
                {area.name}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SparklesIcon className="h-5 w-5 mr-2" />
          {loading ? 'Генерация...' : 'Сгенерировать цели'}
        </button>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Generation results */}
      {result && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Сгенерированные цели
                </h2>
                <p className="text-gray-600">
                  {result.employee_name} • {result.position} • {result.department}
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">{result.quarter} {result.year}</div>
                <div className="text-sm text-gray-500">
                  Сумма весов: {result.total_suggested_weight.toFixed(0)}%
                </div>
              </div>
            </div>

            {result.generation_context && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg text-blue-800 text-sm">
                <strong>Контекст генерации:</strong> {result.generation_context}
              </div>
            )}
          </div>

          {result.generated_goals.map((goal, index) => (
            <div key={index} className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-primary-100 text-primary-800 text-xs px-2 py-1 rounded">
                      Цель {index + 1}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${strategicLinkBadge(goal.strategic_link)}`}>
                      {goal.strategic_link_russian}
                    </span>
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">
                      {goal.goal_type_russian}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {goal.goal_text}
                  </h3>
                  <p className="text-gray-600 text-sm">
                    <strong>Показатель:</strong> {goal.metric}
                  </p>
                </div>
                <div className="text-right ml-4">
                  <div className={`text-2xl font-bold ${getScoreColor(goal.smart_score)}`}>
                    {(goal.smart_score * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500">SMART</div>
                  <div className="text-sm text-gray-700 mt-2">
                    Вес: {goal.suggested_weight.toFixed(0)}%
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm text-gray-600 mb-2">
                  <strong>Обоснование:</strong> {goal.rationale}
                </p>
              </div>

              {/* Source document */}
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-start">
                  <DocumentTextIcon className="h-5 w-5 text-gray-400 mr-2 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-gray-700">
                      Источник: {goal.source_document.title}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {goal.source_document.relevant_fragment.substring(0, 200)}...
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
