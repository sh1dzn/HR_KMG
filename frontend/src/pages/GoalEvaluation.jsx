import { useState } from 'react'
import { evaluateGoal, reformulateGoal } from '../api/client'
import SMARTScoreCard from '../components/SMARTScoreCard'
import AIThinking from '../components/AIThinking'

const evaluationSignals = [
  'SMART по 5 критериям',
  'Релевантность роли и подразделению',
  'Рекомендации к улучшению',
  'Переформулировка слабой цели',
]

const exampleGoals = [
  'Увеличить объём продаж на 20% к концу Q2 2026',
  'Улучшить работу отдела',
  'Внедрить систему автоматизации к 31 марта',
  'Работать эффективнее',
]

export default function GoalEvaluation() {
  const [goalText,   setGoalText]   = useState('')
  const [position,   setPosition]   = useState('')
  const [department, setDepartment] = useState('')
  const [loading,    setLoading]    = useState(false)
  const [evaluation, setEvaluation] = useState(null)
  const [error,      setError]      = useState(null)

  const handleEvaluate = async () => {
    if (!goalText.trim())                 { setError('Введите текст цели'); return }
    if (goalText.trim().length < 10)      { setError('Текст цели должен содержать минимум 10 символов'); return }
    setLoading(true); setError(null)
    try {
      setEvaluation(await evaluateGoal(goalText, position || null, department || null))
    } catch (err) {
      const d = err.response?.data?.detail
      setError(typeof d === 'string' ? d : Array.isArray(d) ? d.map(e => e.msg || e.message || JSON.stringify(e)).join('; ') : 'Ошибка при оценке цели')
    } finally { setLoading(false) }
  }

  const handleReformulate = async () => {
    if (!goalText.trim()) return
    setLoading(true); setError(null)
    try {
      const r = await reformulateGoal(goalText, position || null, department || null)
      setEvaluation(prev => ({ ...prev, reformulated_goal: r.reformulated_goal }))
    } catch (err) {
      const d = err.response?.data?.detail
      setError(typeof d === 'string' ? d : Array.isArray(d) ? d.map(e => e.msg || e.message || JSON.stringify(e)).join('; ') : 'Ошибка при переформулировке')
    } finally { setLoading(false) }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">

      {/* Page header */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Оценка целей по SMART</h1>
          <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-tertiary)' }}>
            Проверка качества формулировки цели, измеримости результата, достижимости и привязки к роли сотрудника.
            На выходе — индекс качества, пояснения и улучшенная редакция формулировки.
          </p>
        </div>
        <div className="rounded-xl p-4"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
        >
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-quaternary)' }}>Состав результата</div>
          <div className="flex flex-wrap gap-2">
            {evaluationSignals.map((s) => (
              <span key={s} className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)' }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Input card */}
      <div className="card p-6"
      >
        <div className="mb-5">
          <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Текст цели <span style={{ color: 'var(--border-error)' }}>*</span>
          </label>
          <textarea
            className="input-field"
            rows={4}
            placeholder="Например: Увеличить объём продаж на 20% к концу Q2 2026"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
          />
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Должность <span className="font-normal" style={{ color: 'var(--text-quaternary)' }}>(опционально)</span>
            </label>
            <input type="text" className="input-field" placeholder="Менеджер по продажам" value={position} onChange={(e) => setPosition(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Подразделение <span className="font-normal" style={{ color: 'var(--text-quaternary)' }}>(опционально)</span>
            </label>
            <input type="text" className="input-field" placeholder="Управление продаж" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
        </div>

        <div className="status-info mb-5 flex items-start gap-3 rounded-xl px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <p className="text-sm">
            Наиболее показательный результат получается для целей в формате: ожидаемый результат, метрика оценки и целевой срок.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleEvaluate} disabled={loading} className="btn-primary">
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Оценка...
              </>
            ) : 'Оценить цель'}
          </button>
          {evaluation && (
            <button onClick={handleReformulate} disabled={loading} className="btn-secondary">
              Переформулировать
            </button>
          )}
        </div>

        {error && (
          <div className="status-error mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm">
            <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}
      </div>

      {/* Quick examples */}
      <div>
        <p className="mb-2 text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Примеры для быстрого тестирования:</p>
        <div className="flex flex-wrap gap-2">
          {exampleGoals.map((g, i) => (
            <button key={i} onClick={() => setGoalText(g)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-100"
              style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)', boxShadow: '0px 1px 2px rgba(10,13,18,0.05)' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-brand-secondary)'; e.currentTarget.style.color = 'var(--text-brand-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              {g.length > 42 ? g.substring(0, 42) + '…' : g}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && <AIThinking mode="evaluate" />}

      {/* Results */}
      {evaluation && !loading && <SMARTScoreCard evaluation={evaluation} />}
    </div>
  )
}
