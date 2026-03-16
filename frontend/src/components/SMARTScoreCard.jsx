import { useState } from 'react'

const criteriaNames = {
  specific:   'S — Конкретность',
  measurable: 'M — Измеримость',
  achievable: 'A — Достижимость',
  relevant:   'R — Релевантность',
  time_bound: 'T — Срок',
}

const qualityConfig = {
  high:   { label: 'Высокое качество', bg: 'var(--bg-success-primary)', color: 'var(--text-success-primary)', border: 'var(--border-success)',         dot: 'var(--fg-success-primary)' },
  medium: { label: 'Среднее качество', bg: 'var(--bg-warning-primary)', color: 'var(--text-warning-primary)', border: 'var(--border-warning)',         dot: 'var(--fg-warning-primary)' },
  low:    { label: 'Требует доработки',bg: 'var(--bg-error-primary)',   color: 'var(--fg-error-secondary)',   border: 'var(--border-error-secondary)', dot: 'var(--border-error)' },
}

const goalTypeLabels     = { activity: 'Деятельностная', output: 'Результатная', impact: 'Влияние на бизнес' }
const strategicLinkLabels= { strategic: 'Стратегическая', functional: 'Функциональная', operational: 'Операционная' }

/* ── Score ring ─────────────────────────────────────────────── */
function ScoreRing({ score }) {
  const pct = Math.round(score * 100)
  const R = 56, sw = 7
  const nr = R - sw / 2
  const circ = 2 * Math.PI * nr
  const offset = circ * (1 - score)
  const color = pct >= 85 ? 'var(--fg-success-primary)' : pct >= 60 ? 'var(--fg-warning-primary)' : 'var(--border-error)'

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={R * 2} height={R * 2} className="-rotate-90">
        <circle cx={R} cy={R} r={nr} fill="none" stroke="var(--bg-tertiary)" strokeWidth={sw} />
        <circle cx={R} cy={R} r={nr} fill="none" stroke={color} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>{pct}%</span>
        <span className="mt-1 text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-quaternary)' }}>SMART</span>
      </div>
    </div>
  )
}

/* ── Criterion card ─────────────────────────────────────────── */
function CriterionCard({ name, criterion }) {
  const pct = Math.round(criterion.score * 100)
  const ok  = criterion.is_satisfied
  const barColor  = ok ? 'var(--fg-success-primary)' : 'var(--border-error)'
  const iconColor = ok ? 'var(--fg-success-primary)' : 'var(--border-error)'

  return (
    <div className="rounded-xl p-4"
      style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', boxShadow: '0px 1px 2px rgba(10,13,18,0.05)' }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{name}</span>
        <svg className="h-5 w-5 flex-shrink-0" style={{ color: iconColor }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {ok
            ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
            : <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>
          }
        </svg>
      </div>
      <div className="mb-2 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{pct}%</div>
      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
        <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
      {criterion.comment && (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{criterion.comment}</p>
      )}
    </div>
  )
}

/* ── Main export ────────────────────────────────────────────── */
export default function SMARTScoreCard({ evaluation }) {
  const [copied, setCopied] = useState(false)
  const { smart_evaluation, overall_score, quality_level, goal_type, strategic_link, recommendations, reformulated_goal, goal_text } = evaluation
  const q = qualityConfig[quality_level] || qualityConfig.low

  const handleCopy = async () => {
    if (!reformulated_goal) return
    try { await navigator.clipboard.writeText(reformulated_goal); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* */ }
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Main result card */}
      <div className="rounded-xl p-6"
        style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', boxShadow: '0px 1px 2px rgba(10,13,18,0.05)' }}
      >
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Результат оценки</div>
            {goal_text && (
              <p className="mt-1 text-sm leading-relaxed line-clamp-2" style={{ color: 'var(--text-tertiary)' }}>{goal_text}</p>
            )}
          </div>
          <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
            style={{ backgroundColor: q.bg, color: q.color, border: `1px solid ${q.border}` }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: q.dot }} />
            {q.label}
          </span>
        </div>

        <div className="flex justify-center py-4 mb-6">
          <ScoreRing score={overall_score} />
        </div>

        <div className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Критерии SMART</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(smart_evaluation).map(([key, criterion]) => (
            <CriterionCard key={key} name={criteriaNames[key]} criterion={criterion} />
          ))}
        </div>
      </div>

      {/* Classification */}
      {(goal_type || strategic_link) && (
        <div className="rounded-xl p-6"
          style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', boxShadow: '0px 1px 2px rgba(10,13,18,0.05)' }}
        >
          <div className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Классификация цели</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {goal_type && (
              <div className="rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-quaternary)' }}>Тип цели</div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {goal_type.type_russian || goalTypeLabels[goal_type.type] || 'Не определён'}
                </div>
                {goal_type.explanation && (
                  <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{goal_type.explanation}</p>
                )}
              </div>
            )}
            {strategic_link && (
              <div className="rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-quaternary)' }}>Стратегическая связка</div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {strategic_link.level_russian || strategicLinkLabels[strategic_link.level] || 'Не определена'}
                </div>
                {strategic_link.explanation && (
                  <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{strategic_link.explanation}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations?.length > 0 && (
        <div className="rounded-xl p-6"
          style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', boxShadow: '0px 1px 2px rgba(10,13,18,0.05)' }}
        >
          <div className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Рекомендации по улучшению</div>
          <ul className="space-y-2.5">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: 'var(--fg-brand-primary)' }} />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reformulated goal */}
      {reformulated_goal && (
        <div className="status-success rounded-xl p-6"
          style={{ boxShadow: '0px 1px 2px rgba(10,13,18,0.05)' }}
        >
          <div className="mb-3 flex items-start justify-between gap-4">
            <div className="text-sm font-semibold" style={{ color: 'var(--text-success-primary)' }}>Улучшенная формулировка</div>
            <button onClick={handleCopy}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-100 cursor-pointer"
              style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-success-primary)', border: '1px solid var(--border-success)' }}
            >
              {copied ? (
                <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> Скопировано</>
              ) : (
                <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Скопировать</>
              )}
            </button>
          </div>
          <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--text-success-secondary)' }}>{reformulated_goal}</p>
        </div>
      )}
    </div>
  )
}
