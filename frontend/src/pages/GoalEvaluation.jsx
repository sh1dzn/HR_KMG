import { useState } from 'react'
import { evaluateGoal, reformulateGoal } from '../api/client'
import SMARTScoreCard from '../components/SMARTScoreCard'

export default function GoalEvaluation() {
  const [goalText, setGoalText] = useState('')
  const [position, setPosition] = useState('')
  const [department, setDepartment] = useState('')
  const [loading, setLoading] = useState(false)
  const [evaluation, setEvaluation] = useState(null)
  const [error, setError] = useState(null)

  const handleEvaluate = async () => {
    if (!goalText.trim()) {
      setError('Введите текст цели')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await evaluateGoal(
        goalText,
        position || null,
        department || null
      )
      setEvaluation(result)
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка при оценке цели')
    } finally {
      setLoading(false)
    }
  }

  const handleReformulate = async () => {
    if (!goalText.trim()) return

    setLoading(true)
    setError(null)

    try {
      const result = await reformulateGoal(
        goalText,
        position || null,
        department || null
      )
      setEvaluation(prev => ({
        ...prev,
        reformulated_goal: result.reformulated_goal
      }))
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка при переформулировке')
    } finally {
      setLoading(false)
    }
  }

  const exampleGoals = [
    'Увеличить объём продаж на 20% к концу Q2 2026',
    'Улучшить работу отдела',
    'Внедрить систему автоматизации к 31 марта',
    'Работать эффективнее',
  ]

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Оценка целей по SMART
        </h1>
        <p className="text-gray-600">
          Введите текст цели для автоматической оценки по методологии SMART
        </p>
      </div>

      {/* Input form */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Текст цели *
          </label>
          <textarea
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            rows={3}
            placeholder="Например: Увеличить объём продаж на 20% к концу Q2 2026"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Должность (опционально)
            </label>
            <input
              type="text"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="Менеджер по продажам"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Подразделение (опционально)
            </label>
            <input
              type="text"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="Управление продаж"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleEvaluate}
            disabled={loading}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Оценка...' : 'Оценить цель'}
          </button>
          {evaluation && (
            <button
              onClick={handleReformulate}
              disabled={loading}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              Переформулировать
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Example goals */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <p className="text-sm text-gray-600 mb-2">Примеры целей для тестирования:</p>
        <div className="flex flex-wrap gap-2">
          {exampleGoals.map((goal, i) => (
            <button
              key={i}
              onClick={() => setGoalText(goal)}
              className="text-sm px-3 py-1 bg-white border border-gray-200 rounded-full hover:border-primary-300 hover:text-primary-600"
            >
              {goal.length > 40 ? goal.substring(0, 40) + '...' : goal}
            </button>
          ))}
        </div>
      </div>

      {/* Evaluation results */}
      {evaluation && (
        <SMARTScoreCard evaluation={evaluation} />
      )}
    </div>
  )
}
