import { useState, useEffect, useRef } from 'react'
import { generateGoals, getFocusAreas, getEmployees, getGoals, saveAcceptedGeneratedGoals, quickScore } from '../api/client'
import EmployeePicker from '../components/EmployeePicker'
import AIThinking from '../components/AIThinking'
import { getCurrentPeriod, getYearRange, QUARTERS } from '../utils/period'
import { useAuth } from '../contexts/AuthContext'

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
  const { user, role } = useAuth()
  const isEmployeeRole = role === 'employee'
  const currentPeriod = getCurrentPeriod()
  const yearOptions = getYearRange(currentPeriod.year, 1, 2)
  const [employeeId,         setEmployeeId]         = useState('')
  const [quarter,            setQuarter]            = useState(currentPeriod.quarter)
  const [year,               setYear]               = useState(currentPeriod.year)
  const [selectedFocusAreas, setSelectedFocusAreas] = useState([])
  const [count,              setCount]              = useState(3)
  const [loading,            setLoading]            = useState(false)
  const [result,             setResult]             = useState(null)
  const [error,              setError]              = useState(null)
  const [focusAreas,         setFocusAreas]         = useState([])
  const [employees,          setEmployees]          = useState([])
  const [goalStates,         setGoalStates]         = useState({})
  const [goalEdits,          setGoalEdits]          = useState({})   // { idx: editedText }
  const [goalLiveScores,     setGoalLiveScores]     = useState({})   // { idx: scoreData }
  const [editingIdx,         setEditingIdx]         = useState(null)
  const [saving,             setSaving]             = useState(false)
  const [saveSummary,        setSaveSummary]        = useState(null)
  const editTimerRef = useRef({})

  const handleGoalTextEdit = (idx, newText) => {
    setGoalEdits(prev => ({ ...prev, [idx]: newText }))
    // Update the actual goal object so it saves with the edited text
    if (result?.generated_goals?.[idx]) {
      result.generated_goals[idx] = { ...result.generated_goals[idx], goal_text: newText }
    }
    // Live scoring
    clearTimeout(editTimerRef.current[idx])
    if (newText.trim().length >= 5) {
      editTimerRef.current[idx] = setTimeout(() => {
        quickScore(newText).then(data => {
          setGoalLiveScores(prev => ({ ...prev, [idx]: data }))
        }).catch(() => {})
      }, 600)
    }
  }

  // Cascade state
  const [managerInfo,        setManagerInfo]        = useState(null) // { id, name }
  const [managerGoals,       setManagerGoals]       = useState([])
  const [selectedManagerGoals, setSelectedManagerGoals] = useState(new Set())
  const [cascadeLoading,     setCascadeLoading]     = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const fa = await getFocusAreas()
        setFocusAreas(fa.focus_areas || [])

        if (isEmployeeRole) {
          const selfEmployeeId = user?.employee_id || ''
          setEmployees(
            user?.employee_id
              ? [{
                id: user.employee_id,
                full_name: user.employee_name || 'Сотрудник',
                position_name: user.position_name || null,
                department_name: user.department_name || null,
              }]
              : []
          )
          setEmployeeId(selfEmployeeId)
          return
        }

        const emp = await getEmployees()
        const list = emp.employees || []
        setEmployees(list)
        if (list.length > 0) setEmployeeId(list[0].id)
      } catch (e) {
        console.error(e)
      }
    }
    load()
  }, [isEmployeeRole, user])

  // Load manager goals when employee changes
  useEffect(() => {
    if (!employeeId) { setManagerInfo(null); setManagerGoals([]); return }
    const loadManager = async () => {
      setCascadeLoading(true)
      setManagerInfo(null); setManagerGoals([]); setSelectedManagerGoals(new Set())
      try {
        // Get one goal to find manager
        const r = await getGoals({ employee_id: employeeId, page: 1, per_page: 1 })
        const goal = r.goals?.[0]
        if (!goal?.manager_id || !goal?.manager_name) { setCascadeLoading(false); return }
        setManagerInfo({ id: goal.manager_id, name: goal.manager_name })
        // Load manager goals for the selected period
        const mg = await getGoals({ employee_id: goal.manager_id, quarter, year, page: 1, per_page: 20 })
        setManagerGoals(mg.goals || [])
      } catch { /* ignore */ }
      finally { setCascadeLoading(false) }
    }
    loadManager()
  }, [employeeId, quarter, year])

  const toggleManagerGoal = (goalId) => {
    setSelectedManagerGoals(prev => {
      const next = new Set(prev)
      next.has(goalId) ? next.delete(goalId) : next.add(goalId)
      return next
    })
  }

  const selectAllManagerGoals = () => {
    if (selectedManagerGoals.size === managerGoals.length) {
      setSelectedManagerGoals(new Set())
    } else {
      setSelectedManagerGoals(new Set(managerGoals.map(g => g.id)))
    }
  }

  const handleGenerate = async () => {
    setLoading(true); setError(null)
    try {
      if (!employeeId) {
        throw new Error('Сотрудник не выбран')
      }
      // Pass selected manager goals as text for cascading
      const managerGoalTexts = selectedManagerGoals.size > 0
        ? managerGoals.filter(g => selectedManagerGoals.has(g.id)).map(g => g.title)
        : null
      const d = await generateGoals(Number(employeeId), quarter, year, selectedFocusAreas.length > 0 ? selectedFocusAreas : null, count, managerGoalTexts)
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

  const handleSaveAccepted = async () => {
    if (acceptedCount === 0) return
    setSaving(true); setError(null)
    try {
      const acceptedGoals = result.generated_goals
        .map((g, i) => ({ g, i }))
        .filter(({ i }) => goalStates[i] === 'accepted')
        .map(({ g }) => g)
      const sr = await saveAcceptedGeneratedGoals({
        employee_id: Number(employeeId), quarter, year,
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

  const selectedEmp = employees.find(e => e.id === employeeId)
    || (user?.employee_id && Number(user.employee_id) === Number(employeeId)
      ? {
        id: user.employee_id,
        full_name: user.employee_name || 'Сотрудник',
        position_name: user.position_name || null,
        department_name: user.department_name || null,
      }
      : null)

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">

      {/* Page header */}
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Генерация целей</h1>
        <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-tertiary)' }}>
          Формирует цели на основе профиля сотрудника, ВНД и целей руководителя.
        </p>
      </div>

      {/* Parameters card */}
      <div className="card p-6">
        <div className="mb-5 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Параметры генерации</div>

        <div className="mb-5">
          {isEmployeeRole ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Сотрудник</label>
              <div className="rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {user?.employee_name || 'Текущий сотрудник'}
                </div>
                <div className="mt-0.5 text-xs" style={{ color: 'var(--text-quaternary)' }}>
                  {[user?.position_name, user?.department_name].filter(Boolean).join(' · ') || 'Профиль сотрудника'}
                </div>
              </div>
            </div>
          ) : (
            <EmployeePicker
              employees={employees}
              value={employeeId}
              onChange={setEmployeeId}
              label="Сотрудник"
              emptyText={employees.length === 0 ? 'Загрузка...' : 'Не найдено'}
            />
          )}
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Квартал</label>
            <select className="select-field w-full" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
              {QUARTERS.map(q => <option key={q}>{q}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Год</label>
            <select className="select-field w-full" value={year} onChange={(e) => setYear(+e.target.value)}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
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
      </div>

      {/* Cascade panel */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: 'var(--bg-brand-primary)', color: 'var(--fg-brand-primary)' }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Каскадирование целей</div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {managerInfo ? `Руководитель: ${managerInfo.name}` : 'Выберите сотрудника для загрузки целей руководителя'}
              </div>
            </div>
          </div>
          {managerGoals.length > 0 && (
            <button onClick={selectAllManagerGoals}
              className="text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
              style={{ color: 'var(--fg-brand-primary)', border: '1px solid var(--border-brand-secondary)' }}
            >
              {selectedManagerGoals.size === managerGoals.length ? 'Снять все' : 'Выбрать все'}
            </button>
          )}
        </div>

        <div className="px-6 py-4">
          {cascadeLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
              <svg className="h-4 w-4 animate-spin spinner-brand" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Загрузка целей руководителя...
            </div>
          ) : !managerInfo ? (
            <div className="flex items-center gap-2 py-2 text-sm" style={{ color: 'var(--text-quaternary)' }}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Руководитель не найден — цели будут сгенерированы без каскадирования
            </div>
          ) : managerGoals.length === 0 ? (
            <div className="flex items-center gap-2 py-2 text-sm" style={{ color: 'var(--text-quaternary)' }}>
              У руководителя нет целей за {quarter} {year}
            </div>
          ) : (
            <>
              {/* Cascade tree visual */}
              <div className="flex items-center gap-2 mb-4 text-xs" style={{ color: 'var(--text-quaternary)' }}>
                <span className="font-medium" style={{ color: 'var(--text-tertiary)' }}>{managerInfo.name}</span>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 6 15 12 9 18"/></svg>
                <span className="font-medium" style={{ color: 'var(--text-brand-primary)' }}>{selectedEmp?.full_name || 'Сотрудник'}</span>
                {selectedManagerGoals.size > 0 && (
                  <span className="ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: 'var(--bg-brand-primary)', color: 'var(--fg-brand-primary)' }}
                  >
                    {selectedManagerGoals.size} выбрано
                  </span>
                )}
              </div>

              {/* Manager goals list */}
              <div className="space-y-2">
                {managerGoals.map((g) => {
                  const isSelected = selectedManagerGoals.has(g.id)
                  const sc = g.smart_score
                  return (
                    <label key={g.id}
                      className="flex items-start gap-3 rounded-lg px-4 py-3 cursor-pointer transition-all"
                      style={{
                        border: `1.5px solid ${isSelected ? 'var(--fg-brand-primary)' : 'var(--border-secondary)'}`,
                        backgroundColor: isSelected ? 'var(--bg-brand-primary)' : '',
                      }}
                    >
                      <input type="checkbox" checked={isSelected} onChange={() => toggleManagerGoal(g.id)}
                        className="mt-0.5 h-4 w-4 rounded flex-shrink-0"
                        style={{ accentColor: 'var(--fg-brand-primary)' }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>{g.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs rounded-full px-2 py-0.5"
                            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-quaternary)' }}
                          >{g.status}</span>
                          {g.goal_type && (
                            <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>{g.goal_type}</span>
                          )}
                          {g.strategic_link && (
                            <span className="text-xs rounded-full px-2 py-0.5 badge-brand">{g.strategic_link}</span>
                          )}
                        </div>
                      </div>
                      {sc != null && (
                        <span className="text-sm font-semibold flex-shrink-0" style={getScoreStyle(sc).color ? { color: getScoreStyle(sc).color } : {}}>
                          {(sc * 100).toFixed(0)}%
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Generate button */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {selectedManagerGoals.size > 0
              ? `Каскадирование от ${selectedManagerGoals.size} целей руководителя`
              : 'Генерация без каскадирования'}
          </div>
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
      {loading && <AIThinking mode="generate" />}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Summary card */}
          <div className="card p-6">
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
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold status-brand">
                  {result.quarter} {result.year}
                </span>
                <div className="mt-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Сумма весов: <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{result.total_suggested_weight.toFixed(0)}%</span>
                </div>
              </div>
            </div>

            {/* Cascade info */}
            {result.cascaded_from_manager && (
              <div className="mt-4 rounded-lg px-4 py-3 flex items-start gap-3"
                style={{ backgroundColor: 'var(--bg-brand-primary)', border: '1px solid var(--border-brand-secondary)' }}
              >
                <svg className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--fg-brand-primary)' }}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
                </svg>
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-brand-primary)' }}>
                    Каскадировано от {result.manager_name}
                  </div>
                  {result.manager_goals_used?.length > 0 && (
                    <ul className="mt-1.5 space-y-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {result.manager_goals_used.map((g, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--fg-brand-primary)' }} />
                          {g.length > 100 ? g.substring(0, 100) + '...' : g}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

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
                Сохранено {savedCount} {savedCount === 1 ? 'цель' : savedCount < 5 ? 'цели' : 'целей'} как черновик.
              </div>
            )}

            {saveSummary?.skipped_duplicates?.length > 0 && (
              <div className="status-warning mt-3 flex items-start gap-2 rounded-xl px-4 py-3 text-sm">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Пропущено как дубликат: {saveSummary.skipped_duplicates.length}
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
                  <span className="font-semibold">Историческая достижимость:</span> {r.assessment}
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
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium status-success">
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                          Сохранено
                        </span>
                      )}
                      {state === 'duplicate' && (
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium status-warning">Дубликат</span>
                      )}
                    </div>
                    {editingIdx === idx ? (
                      <textarea
                        className="input-field w-full text-sm leading-relaxed"
                        rows={3}
                        value={goalEdits[idx] ?? goal.goal_text}
                        onChange={(e) => handleGoalTextEdit(idx, e.target.value)}
                        onBlur={() => setEditingIdx(null)}
                        autoFocus
                        style={{ resize: 'vertical' }}
                      />
                    ) : (
                      <h3 className="text-sm font-semibold leading-snug cursor-pointer group"
                        style={{ color: 'var(--text-primary)' }}
                        onClick={() => { setEditingIdx(idx); setGoalEdits(prev => ({ ...prev, [idx]: prev[idx] ?? goal.goal_text })) }}
                        title="Нажмите чтобы редактировать"
                      >
                        {goal.goal_text}
                        <svg className="inline-block ml-1.5 h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </h3>
                    )}
                    {/* Live SMART score for edited goal */}
                    {goalLiveScores[idx] && editingIdx === idx && (
                      <div className="flex flex-wrap gap-1.5 mt-2 animate-fade-in">
                        {['specific', 'measurable', 'achievable', 'relevant', 'time_bound'].map((key) => {
                          const c = goalLiveScores[idx].criteria?.[key]
                          if (!c) return null
                          const s = c.score || 0
                          const clr = s >= 0.7 ? 'var(--fg-success-primary)' : s >= 0.5 ? 'var(--text-warning-primary)' : 'var(--fg-error-primary)'
                          const bg = s >= 0.7 ? 'var(--bg-success-secondary)' : s >= 0.5 ? 'var(--bg-warning-secondary)' : 'var(--bg-error-secondary)'
                          return (
                            <span key={key} className="rounded-full px-2 py-0.5 text-xs font-medium transition-all duration-300"
                              style={{ backgroundColor: bg, color: clr }}>
                              {key === 'time_bound' ? 'T' : key[0].toUpperCase()} {Math.round(s * 100)}%
                            </span>
                          )
                        })}
                      </div>
                    )}
                    <div className="mt-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                      <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>Показатель: </span>
                      {goal.metric}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-center">
                    <div className="flex h-16 w-16 sm:h-20 sm:w-20 flex-col items-center justify-center rounded-xl"
                      style={{ backgroundColor: scoreStyle.bg, border: `1px solid ${scoreStyle.border}` }}
                    >
                      <span className="text-xl sm:text-2xl font-semibold leading-none" style={{ color: scoreStyle.color }}>
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
                      <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
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
