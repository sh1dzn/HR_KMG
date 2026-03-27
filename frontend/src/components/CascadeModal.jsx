import { useState, useEffect } from 'react'
import { cascadePreview, cascadeConfirm, getEmployees } from '../api/client'
import AIThinking from './AIThinking'

const CONFLICT_STYLES = {
  contradiction: { bg: 'rgba(220,38,38,0.12)', color: '#dc2626', label: 'Противоречие' },
  duplicate: { bg: 'rgba(234,179,8,0.12)', color: '#ca8a04', label: 'Дубликат' },
  resource: { bg: 'rgba(249,115,22,0.12)', color: '#ea580c', label: 'Ресурсный конфликт' },
}

export default function CascadeModal({ goalId, goalText, departments, quarter, year, onClose, onConfirmed }) {
  const [step, setStep] = useState(1)
  const [selectedDepts, setSelectedDepts] = useState([])
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(null)

  const toggleDept = (id) => setSelectedDepts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handlePreview = async () => {
    if (!selectedDepts.length) return
    setLoading(true)
    setError(null)
    try {
      const data = await cascadePreview(goalId, selectedDepts)
      setPreview(data)
      setStep(2)
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка генерации')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!preview) return
    setConfirming(true)
    try {
      const goals = []
      for (const dept of preview.cascaded_goals) {
        for (const g of dept.goals) {
          goals.push({
            department_id: dept.department_id,
            employee_id: 0, // Will need employee selection — use first employee in dept for now
            text: g.text,
            weight: g.suggested_weight,
            quarter, year,
          })
        }
      }
      await cascadeConfirm(goalId, goals)
      onConfirmed?.()
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка создания целей')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(12,17,29,0.48)', backdropFilter: 'blur(2px)' }}>
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-6" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Каскадирование цели</h2>
          <button type="button" onClick={onClose} style={{ color: 'var(--fg-quaternary)' }}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <p className="text-sm mb-4 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          {goalText}
        </p>

        {error && <div className="rounded-lg px-3 py-2 mb-4 text-sm" style={{ backgroundColor: 'var(--bg-error-secondary)', color: 'var(--text-error-primary)' }}>{error}</div>}

        {step === 1 && (
          <>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Выберите отделы</h3>
            <div className="space-y-2 mb-4">
              {departments.map(d => (
                <label key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer" style={{ backgroundColor: selectedDepts.includes(d.id) ? 'var(--bg-brand-secondary)' : 'var(--bg-secondary)' }}>
                  <input type="checkbox" checked={selectedDepts.includes(d.id)} onChange={() => toggleDept(d.id)} />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{d.name}</span>
                </label>
              ))}
            </div>
            <button onClick={handlePreview} disabled={!selectedDepts.length || loading}
              className="gradient-brand w-full rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-60">
              {loading ? 'Генерация...' : 'Preview'}
            </button>
            {loading && <AIThinking label="Генерация каскадных целей..." />}
          </>
        )}

        {step === 2 && preview && (
          <>
            {/* Conflicts */}
            {preview.conflicts.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold mb-2" style={{ color: '#dc2626' }}>Обнаружены конфликты ({preview.conflict_count})</h3>
                <div className="space-y-2">
                  {preview.conflicts.map((c, i) => {
                    const cs = CONFLICT_STYLES[c.type] || CONFLICT_STYLES.contradiction
                    return (
                      <div key={i} className="rounded-lg p-3" style={{ backgroundColor: cs.bg, border: `1px solid ${cs.color}30` }}>
                        <span className="text-xs font-medium" style={{ color: cs.color }}>{cs.label}</span>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>{c.explanation}</p>
                        <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                          {c.goal_a.department}: "{c.goal_a.text?.slice(0, 60)}..." vs {c.goal_b.department}: "{c.goal_b.text?.slice(0, 60)}..."
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Generated goals by department */}
            {preview.cascaded_goals.map(dept => (
              <div key={dept.department_id} className="mb-4">
                <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{dept.department_name}</h3>
                <div className="space-y-2">
                  {dept.goals.map((g, i) => (
                    <div key={i} className="rounded-lg p-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{g.text}</p>
                      <div className="flex gap-4 mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        <span>Вес: {g.suggested_weight}%</span>
                        <span>{g.rationale}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 rounded-lg py-2.5 text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}>
                Назад
              </button>
              <button onClick={handleConfirm} disabled={confirming}
                className="flex-1 gradient-brand rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-60">
                {confirming ? 'Создание...' : 'Подтвердить каскад'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
