import { useState } from 'react'
import { evaluateGoal, reformulateGoal } from '../api/client'
import SMARTScoreCard from '../components/SMARTScoreCard'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

const evaluationSignals = [
  'SMART по 5 критериям',
  'Релевантность роли и подразделению',
  'Рекомендации к улучшению',
  'Переформулировка слабой цели',
]

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
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Оценка целей по SMART</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Экран предназначен для проверки качества формулировки цели,
            измеримости результата, достижимости и привязки к роли сотрудника.
            На выходе пользователь получает индекс качества, пояснения и
            улучшенную редакцию формулировки.
          </p>
        </div>
        <Card className="bg-slate-50/80">
          <CardHeader className="p-4 pb-0">
            <CardTitle className="text-xs uppercase tracking-[0.18em] text-slate-500">Состав результата</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-2">
              {evaluationSignals.map((item) => (
                <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                  {item}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6 pt-6">
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Текст цели <span className="text-red-500">*</span>
          </label>
          <textarea
            className="input-field"
            rows={4}
            placeholder="Например: Увеличить объём продаж на 20% к концу Q2 2026"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Должность
              <span className="font-normal text-gray-400 ml-1">(опционально)</span>
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Менеджер по продажам"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Подразделение
              <span className="font-normal text-gray-400 ml-1">(опционально)</span>
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Управление продаж"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-cyan-100 bg-cyan-50/80 px-4 py-3 text-sm text-cyan-900">
          Наиболее показательный результат получается для целей в формате:
          ожидаемый результат, метрика оценки и целевой срок.
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleEvaluate}
            disabled={loading}
            className="btn-primary inline-flex items-center gap-2"
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {loading ? 'Оценка...' : 'Оценить цель'}
          </button>

          {evaluation && (
            <button
              onClick={handleReformulate}
              disabled={loading}
              className="btn-secondary inline-flex items-center gap-2"
            >
              Переформулировать
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        </CardContent>
      </Card>

      <div>
        <p className="text-sm font-medium text-gray-500 mb-2">Примеры для быстрого тестирования:</p>
        <div className="flex flex-wrap gap-2">
          {exampleGoals.map((goal, i) => (
            <button
              key={i}
              onClick={() => setGoalText(goal)}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors duration-150 hover:border-cyan-300 hover:text-cyan-700"
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
