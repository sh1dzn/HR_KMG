import { useState, useEffect, useRef, useCallback } from 'react'
import { quickScore, reformulateGoal } from '../api/client'

const CRITERIA_ORDER = ['specific', 'measurable', 'achievable', 'relevant', 'time_bound']
const CRITERIA_ICONS = {
  specific: 'S',
  measurable: 'M',
  achievable: 'A',
  relevant: 'R',
  time_bound: 'T',
}

function scoreColor(score) {
  if (score >= 0.7) return 'var(--fg-success-primary)'
  if (score >= 0.5) return 'var(--text-warning-primary)'
  return 'var(--fg-error-primary)'
}

function scoreBg(score) {
  if (score >= 0.7) return 'var(--bg-success-secondary)'
  if (score >= 0.5) return 'var(--bg-warning-secondary)'
  return 'var(--bg-error-secondary)'
}

function ScoreRing({ score, size = 80 }) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - score)
  const pct = Math.round(score * 100)

  return (
    <svg width={size} height={size} className="transition-all duration-500">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth="6"
        style={{ stroke: 'var(--border-secondary)' }} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth="6"
        strokeLinecap="round"
        style={{
          stroke: scoreColor(score),
          strokeDasharray: circumference,
          strokeDashoffset: offset,
          transform: 'rotate(-90deg)',
          transformOrigin: '50% 50%',
          transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease',
        }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        className="text-lg font-bold" style={{ fill: scoreColor(score), transition: 'fill 0.3s ease' }}>
        {pct}
      </text>
    </svg>
  )
}

export default function SmartCoach({ initialText = '', onReformulated }) {
  const [text, setText] = useState(initialText)
  const [scores, setScores] = useState(null)
  const [tips, setTips] = useState([])
  const [reformulating, setReformulating] = useState(false)
  const [reformulated, setReformulated] = useState(null)
  const timerRef = useRef(null)
  const textareaRef = useRef(null)

  const fetchScore = useCallback(async (value) => {
    if (!value || value.trim().length < 5) {
      setScores(null)
      setTips([])
      return
    }
    try {
      const data = await quickScore(value)
      setScores(data)
      setTips(data.tips || [])
    } catch { /* ignore */ }
  }, [])

  const handleChange = (e) => {
    const val = e.target.value
    setText(val)
    setReformulated(null)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fetchScore(val), 600)
  }

  const handleReformulate = async () => {
    if (!text.trim()) return
    setReformulating(true)
    try {
      const data = await reformulateGoal(text)
      setReformulated(data.reformulated_goal)
      if (onReformulated) onReformulated(data.reformulated_goal)
    } catch { /* ignore */ }
    setReformulating(false)
  }

  const applyReformulated = () => {
    if (reformulated) {
      setText(reformulated)
      setReformulated(null)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => fetchScore(reformulated), 300)
    }
  }

  useEffect(() => {
    if (initialText) fetchScore(initialText)
    return () => clearTimeout(timerRef.current)
  }, []) // eslint-disable-line

  const criteria = scores?.criteria || {}
  const overall = scores?.overall_score || 0

  return (
    <div className="space-y-5">
      {/* Textarea */}
      <div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          placeholder="Начните вводить цель... Например: Увеличить продажи на 15% к концу Q2 2026"
          rows={4}
          className="input-field w-full text-sm leading-relaxed"
          style={{ resize: 'vertical', minHeight: '100px' }}
        />
      </div>

      {/* Scores panel */}
      {scores && (
        <div className="card p-5 animate-fade-in">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Score ring */}
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <ScoreRing score={overall} size={88} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>SMART Score</span>
            </div>

            {/* Criteria bars */}
            <div className="flex-1 space-y-3">
              {CRITERIA_ORDER.map((key) => {
                const c = criteria[key]
                if (!c) return null
                const score = c.score || 0
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-xs font-bold"
                      style={{ backgroundColor: scoreBg(score), color: scoreColor(score), transition: 'all 0.3s ease' }}
                    >
                      {CRITERIA_ICONS[key]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{c.label}</span>
                        <span className="text-xs font-semibold tabular-nums" style={{ color: scoreColor(score), transition: 'color 0.3s ease' }}>
                          {Math.round(score * 100)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round(score * 100)}%`,
                            backgroundColor: scoreColor(score),
                            transition: 'width 0.5s ease, background-color 0.3s ease',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tips */}
          {tips.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>Рекомендации</div>
              {tips.map((tip, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: 'var(--bg-error-secondary)', color: 'var(--text-error-primary)' }}>
                  <svg className="h-4 w-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {tip}
                </div>
              ))}
            </div>
          )}

          {/* AI Improve button */}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleReformulate}
              disabled={reformulating || !text.trim()}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              {reformulating ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Анализ...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
                  </svg>
                  Улучшить с AI
                </>
              )}
            </button>
          </div>

          {/* Reformulated result */}
          {reformulated && (
            <div className="mt-4 rounded-xl p-4 animate-fade-in" style={{ backgroundColor: 'var(--bg-success-secondary)', border: '1px solid var(--border-success)' }}>
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--fg-success-primary)' }}>Улучшенная формулировка</div>
              <div className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{reformulated}</div>
              <button
                type="button"
                onClick={applyReformulated}
                className="mt-3 text-sm font-medium"
                style={{ color: 'var(--fg-success-primary)' }}
              >
                Применить
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
