import { useState, useEffect } from 'react'
import { generateGoals, getFocusAreas, getEmployees, saveAcceptedGeneratedGoals } from '../api/client'
import EmployeePicker from '../components/EmployeePicker'

const generationFlow = [
  { step: '1', text: 'Профиль сотрудника и квартальный фокус' },
  { step: '2', text: 'Подбор релевантных ВНД и стратегий' },
  { step: '3', text: 'Генерация 3–5 целей в SMART-формате' },
  { step: '4', text: 'Каскадирование от руководителя' },
]

const normalizeGoalText = (t = '') =>
  t.toLowerCase().replace(/[^\wа-яА-Яa-zA-Z0-9%\s]/g, ' ').replace(/\s+/g, ' ').trim()

const getScoreStyle = (score) => {
  if (score >= 0.85) return { bg: 'var(--bg-success-primary)', color: 'var(--text-success-primary)', border: 'var(--border-success)' }
  if (score >= 0.7)  return { bg: 'var(--bg-warning-primary)', color: 'var(--text-warning-primary)', border: 'var(--border-warning)' }
  return { bg: 'var(--bg-error-primary)', color: 'var(--fg-error-secondary)', border: 'var(--border-error-secondary)' }
}

const strategicStyle = (link) => {
  const m = {
    strategic:   { bg: 'var(--bg-brand-primary)', color: 'var(--text-brand-primary)',  border: 'var(--border-brand-secondary)' },
    functional:  { bg: 'var(--bg-brand-primary)', color: 'var(--fg-brand-primary)',    border: 'var(--border-brand-secondary)' },
    operational: { bg: 'var(--bg-tertiary)',       color: 'var(--text-secondary)',      border: 'var(--border-primary)' },
  }
  return m[link] || m.operational
}

export default function GoalGeneration() {
  const [employeeId,         setEmployeeId]         = useState('')
  const [quarter,            setQuarter]            = useState('Q2')
  const [year,               setYear]               = useState(2026)
  const [selectedFocusAreas, setSelectedFocusAreas] = useState([])
  const [count,              setCount]              = useState(3)
  const [loading,            setLoading]            = useState(false)
  const [result,             setResult]             = useState(null)
  const [error,              setError]              = useState(null)
  const [focusAreas,         setFocusAreas]         = useState([])
  const [employees,          setEmployees]          = useState([])
  const [goalStates,         setGoalStates]         = useState({})
  const [saving,             setSaving]             = useState(false)
  const [saveSummary,        setSaveSummary]        = useState(null)

  useEffect(() => {
    Promise.all([getFocusAreas(), getEmployees()])
      .then(([fa, emp]) => {
        setFocusAreas(fa.focus_areas || [])
        const list = emp.employees || []
        setEmployees(list)
        if (list.length > 0) setEmployeeId(list[0].id)
      })
      .catch(console.error)
  }, [])

  const handleGenerate = async () => {
    setLoading(true); setError(null)
    try {
      const d = await generateGoals(employeeId, quarter, year, selectedFocusAreas.length > 0 ? selectedFocusAreas : null, count)
      setResult(d); setGoalStates({}); setSaveSummary(null)
    } catch (e) { setError(e.response?.data?.detail || 'Ошибка при генерации целей') }
    finally { setLoading(false) }
  }

  const toggleFocus = (name) =>
    setSelectedFocusAreas(p => p.includes(name) ? p.filter(x => x !== name) : [...p, name])

  const toggleGoalState = (idx, state) =>
    setGoalStates(p => ({ ...p, [idx]: p[idx] === state ? null : state }))

  const acceptedCount  = Object.values(goalStates).filter(s => s === 'accepted').length
  const savedCount     = Object.values(goalStates).filter(s => s === 'saved').length
  const duplicateCount = Object.values(goalStates).filter(s => s === 'duplicate').length

  const handleSaveAccepted = async () => {
    if (acceptedCount === 0) return
    setSaving(true); setError(null)
    try {
      const acceptedGoals = result.generated_goals
        .map((g, i) => ({ g, i }))
        .filter(({ i }) => goalStates[i] === 'accepted')
        .map(({ g }) => g)
      const sr = await saveAcceptedGeneratedGoals({
        employee_id: employeeId, quarter, year,
        accepted_goals: acceptedGoals,
        generation_context: result.generation_context || '',
        cascaded_from_manager: result.cascaded_from_manager || false,
        manager_name: result.manager_name || null,
        manager_goals_used: result.manager_goals_used || [],
      })
      setSaveSummary(sr)
      const saved = new Set((sr.saved_goal_texts || []).map(normalizeGoalText))
      const dups  = new Set((sr.skipped_duplicates || []).map(normalizeGoalText))
      setGoalStates(prev => {
        const u = { ...prev }
        result.generated_goals.forEach((g, i) => {
          if (u[i] !== 'accepted') return
          const n = normalizeGoalText(g.goal_text)
          if (saved.has(n)) u[i] = 'saved'
          else if (dups.has(n)) u[i] = 'duplicate'
        })
        return u
      })
    } catch (e) { setError(e.response?.data?.detail || 'Ошибка при сохранении целей') }
    finally { setSaving(false) }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">

      {/* Page header */}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Генерация целей</h1>
          <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-tertiary)' }}>
            Формирует набор целей по профилю сотрудника, квартальному периоду и выбранным фокус-направлениям.
            Каждая цель сопровождается обоснованием, источником и предварительной оценкой.
          </p>
        </div>
        <div className="rounded-xl p-4"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
        >
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-quaternary)' }}>Процесс подготовки</div>
          <div className="space-y-2">
            {generationFlow.map(({ step, text }) => (
              <div key={step} className="flex items-center gap-3">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ backgroundColor: 'var(--bg-brand-solid)' }}
                >{step}</span>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Parameters card */}
      <div className="rounded-xl p-6"
        style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', boxShadow: '0px 1px 2px rgba(10,13,18,0.05)' }}
      >
        <div className="mb-5 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Параметры генерации</div>

        <div className="mb-5">
          <EmployeePicker
            employees={employees}
            value={employeeId}
            onChange={setEmployeeId}
            label="Сотрудник"
            emptyText={employees.length === 0 ? 'Загрузка...' : 'Не найдено'}
          />
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Квартал</label>
            <select className="select-field w-full" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
              {['Q1','Q2','Q3','Q4'].map(q => <option key={q}>{q}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Год</label>
            <input type="number" className="input-field" value={year} onChange={(e) => setYear(+e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Количество целей</label>
            <select className="select-field w-full" value={count} onChange={(e) => setCount(+e.target.value)}>
              {[3,4,5].map(n => <option key={n} value={n}>{n} цели</option>)}
            </select>
          </div>
        </div>

        {focusAreas.length > 0 && (
          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Фокус-направления <span className="font-normal" style={{ color: 'var(--text-quaternary)' }}>(опционально)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {focusAreas.map((a) => {
                const active = selectedFocusAreas.includes(a.name)
                return (
                  <button key={a.id} onClick={() => toggleFocus(a.name)} title={a.description}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-100 cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--bg-brand-primary)' : 'var(--bg-secondary)',
                      color: active ? 'var(--text-brand-primary)' : 'var(--text-secondary)',
                      border: `1px solid ${active ? 'var(--border-brand-secondary)' : 'var(--border-secondary)'}`,
                    }}
                  >
                    {a.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="mb-5 flex items-start gap-3 rounded-xl px-4 py-3"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
        >
          <svg className="mt-0.5 h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="var(--fg-quaternary)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Фокус-направления помогают сузить контекст и получить более предметные цели по текущему квартальному приоритету.
          </p>
        </div>

        <div style={{ borderTop: '1px solid var(--border-secondary)', paddingTop: '20px' }}>
          <button onClick={handleGenerate} disabled={loading} className="btn-primary">
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Генерация...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                Сгенерировать цели
              </>
            )}
          </button>
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

      {/* Loading state */}
      {loading && (
        <div className="rounded-xl p-10 text-center"
          style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', boxShadow: '0px 1px 2px rgba(10,13,18,0.05)' }}
        >
          <div className="inline-flex items-center gap-3">
            <svg className="h-5 w-5 animate-spin spinner-brand" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <div className="text-left">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Генерация целей...</p>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Сервис анализирует документы и формирует предложения</p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Summary card */}
          <div className="rounded-xl p-6"
            style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', boxShadow: '0px 1px 2px rgba(10,13,18,0.05)' }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Сгенерированные цели</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  <span>{result.employee_name}</span>
                  <span style={{ color: 'var(--border-primary)' }}>·</span>
                  <span>{result.position}</span>
                  <span style={{ color: 'var(--border-primary)' }}>·</span>
                  <span>{result.department}</span>
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold"
                  className="status-brand"
                >
                  {result.quarter} {result.year}
                </span>
                <div className="mt-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Сумма весов: <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{result.total_suggested_weight.toFixed(0)}%</span>
                </div>
              </div>
            </div>

            {/* Meta chips */}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                { label: 'MVP-функция',  value: 'Генерация 3–5 целей' },
                { label: 'Обоснование', value: 'Источник ВНД + rationale' },
                { label: 'Контроль',    value: 'SMART + историческая достижимость' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl px-4 py-3"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
                >
                  <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-quaternary)' }}>{label}</div>
                  <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            {acceptedCount > 0 && (
              <div className="mt-4 flex items-center gap-3">
                <button onClick={handleSaveAccepted} disabled={saving} className="btn-primary">
                  {saving ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      Сохранение...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                      Сохранить принятые ({acceptedCount})
                    </>
                  )}
                </button>
              </div>
            )}

            {savedCount > 0 && (
              <div className="status-success mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm">
                <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                Сохранено {savedCount} {savedCount === 1 ? 'цель' : savedCount < 5 ? 'цели' : 'целей'} в систему как черновик.
              </div>
            )}

            {saveSummary?.skipped_duplicates?.length > 0 && (
              <div className="status-warning mt-3 flex items-start gap-2 rounded-xl px-4 py-3 text-sm">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Пропущено как дубликат: {saveSummary.skipped_duplicates.length}
              </div>
            )}

            {result.generation_context && (
              <div className="status-brand mt-3 rounded-xl px-4 py-3 text-sm">
                <span className="font-semibold">Контекст генерации:</span>{' '}{result.generation_context}
              </div>
            )}

            {result.cascaded_from_manager && (
              <div className="mt-3 rounded-xl px-4 py-3 text-sm"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--text-secondary)' }}
              >
                <span className="font-semibold">Каскадирование:</span>{' '}
                Цели сформированы с учётом целей руководителя ({result.manager_name}).
                {result.manager_goals_used?.length > 0 && (
                  <ul className="mt-2 space-y-1 list-disc list-inside" style={{ color: 'var(--text-tertiary)' }}>
                    {result.manager_goals_used.map((g, i) => <li key={i}>{g}</li>)}
                  </ul>
                )}
              </div>
            )}

            {result.historical_check && (() => {
              const r = result.historical_check
              const style = r.completion_rate >= 70
                ? { bg: 'var(--bg-success-primary)', border: 'var(--border-success)', color: 'var(--text-success-primary)' }
                : r.completion_rate >= 40
                ? { bg: 'var(--bg-warning-primary)', border: 'var(--border-warning)', color: 'var(--text-warning-primary)' }
                : r.total_past_goals > 0
                ? { bg: 'var(--bg-error-primary)', border: 'var(--border-error-secondary)', color: 'var(--fg-error-secondary)' }
                : { bg: 'var(--bg-secondary)', border: 'var(--border-secondary)', color: 'var(--text-secondary)' }
              return (
                <div className="mt-3 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: style.bg, border: `1px solid ${style.border}`, color: style.color }}>
                  <span className="font-semibold">Историческая достижимость:</span>{' '}{r.assessment}
                  <div className="mt-2 flex flex-wrap gap-4 text-xs font-medium">
                    <span>Целей в истории: {r.total_past_goals}</span>
                    <span>Выполнено: {r.completed_count} ({r.completion_rate}%)</span>
                    {r.on_time_completion_rate != null && <span>В срок: {r.on_time_completion_rate}%</span>}
                    {r.avg_smart_score && <span>Средний SMART: {(r.avg_smart_score * 100).toFixed(0)}%</span>}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Goal cards */}
          {result.generated_goals.map((goal, idx) => {
            const state = goalStates[idx]
            const scoreStyle = getScoreStyle(goal.smart_score)
            const stratStyle = strategicStyle(goal.strategic_link)
            const borderColor = state === 'accepted' ? 'var(--border-success)' : state === 'rejected' ? 'var(--border-error-secondary)' : state === 'duplicate' ? 'var(--border-warning)' : state === 'saved' ? 'var(--border-success)' : 'var(--border-secondary)'

            return (
              <div key={idx} className="rounded-xl p-6 transition-all"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: `1px solid ${borderColor}`,
                  boxShadow: '0px 1px 2px rgba(10,13,18,0.05)',
                  opacity: state === 'rejected' ? 0.5 : 1,
                }}
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}
                      >Цель {idx + 1}</span>
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: stratStyle.bg, color: stratStyle.color, border: `1px solid ${stratStyle.border}` }}
                      >{goal.strategic_link_russian}</span>
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}
                      >{goal.goal_type_russian}</span>
                      {state === 'saved' && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                          className="status-success"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                          Сохранено
                        </span>
                      )}
                      {state === 'duplicate' && (
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                          className="status-warning"
                        >Дубликат</span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>{goal.goal_text}</h3>
                    <div className="mt-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                      <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>Показатель: </span>
                      {goal.metric}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-center">
                    <div className="flex h-20 w-20 flex-col items-center justify-center rounded-xl"
                      style={{ backgroundColor: scoreStyle.bg, border: `1px solid ${scoreStyle.border}` }}
                    >
                      <span className="text-2xl font-semibold leading-none" style={{ color: scoreStyle.color }}>
                        {(goal.smart_score * 100).toFixed(0)}%
                      </span>
                      <span className="mt-1 text-xs font-medium" style={{ color: 'var(--text-quaternary)' }}>SMART</span>
                    </div>
                    <div className="mt-2 text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Вес: {goal.suggested_weight.toFixed(0)}%</div>
                  </div>
                </div>

                <div className="mt-4 pt-4 text-sm leading-relaxed" style={{ borderTop: '1px solid var(--border-secondary)', color: 'var(--text-tertiary)' }}>
                  <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>Обоснование: </span>
                  {goal.rationale}
                </div>

                {goal.source_document && (
                  <div className="mt-4 flex items-start gap-3 rounded-xl px-4 py-3"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--fg-quaternary)' }}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{goal.source_document.title}</div>
                      <div className="mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-quaternary)', border: '1px solid var(--border-secondary)' }}
                      >Источник из ВНД / стратегии</div>
                      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                        {goal.source_document.relevant_fragment.substring(0, 200)}...
                      </p>
                    </div>
                  </div>
                )}

                {state !== 'saved' && state !== 'duplicate' && (
                  <div className="mt-4 flex items-center gap-2 pt-4" style={{ borderTop: '1px solid var(--border-secondary)' }}>
                    <button onClick={() => toggleGoalState(idx, 'accepted')}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all duration-100 cursor-pointer"
                      style={{
                        backgroundColor: state === 'accepted' ? 'var(--bg-success-primary)' : 'var(--bg-primary)',
                        color: state === 'accepted' ? 'var(--text-success-primary)' : 'var(--text-secondary)',
                        border: `1px solid ${state === 'accepted' ? 'var(--border-success)' : 'var(--border-secondary)'}`,
                      }}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                      Принять
                    </button>
                    <button onClick={() => toggleGoalState(idx, 'rejected')}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all duration-100 cursor-pointer"
                      style={{
                        backgroundColor: state === 'rejected' ? 'var(--bg-error-primary)' : 'var(--bg-primary)',
                        color: state === 'rejected' ? 'var(--fg-error-secondary)' : 'var(--text-secondary)',
                        border: `1px solid ${state === 'rejected' ? 'var(--border-error-secondary)' : 'var(--border-secondary)'}`,
                      }}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      Отклонить
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
