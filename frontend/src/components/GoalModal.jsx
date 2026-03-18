import { useEffect, useState } from 'react'
import { getGoalWorkflow, approveGoal, rejectGoal, submitGoal, commentGoal } from '../api/client'

const statusConfig = {
  draft: { label: 'Черновик', dot: 'var(--fg-quaternary)' },
  active: { label: 'Активна', dot: 'var(--fg-brand-primary)' },
  submitted: { label: 'На согласовании', dot: 'var(--text-warning-primary)' },
  approved: { label: 'Утверждена', dot: 'var(--fg-success-primary)' },
  in_progress: { label: 'В работе', dot: 'var(--fg-brand-primary)' },
  done: { label: 'Выполнена', dot: 'var(--fg-success-primary)' },
  cancelled: { label: 'Отменена', dot: 'var(--fg-error-secondary)' },
  overdue: { label: 'Просрочена', dot: 'var(--fg-error-secondary)' },
  archived: { label: 'Архив', dot: 'var(--fg-quaternary)' },
}

const statusFlow = ['draft', 'submitted', 'approved', 'in_progress', 'done']
const statusLabels = { draft: 'Черновик', submitted: 'Согласование', approved: 'Утверждена', in_progress: 'В работе', done: 'Выполнена' }

const getScoreStyle = (s) => {
  if (!s && s !== 0) return { color: 'var(--text-quaternary)' }
  if (s >= 0.85) return { color: 'var(--text-success-primary)' }
  if (s >= 0.7) return { color: 'var(--text-warning-primary)' }
  return { color: 'var(--fg-error-secondary)' }
}
const fmt = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(d) : '0' }

export default function GoalModal({ goal, onClose, onUpdate }) {
  const [wf, setWf] = useState(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => {
    if (!goal) return
    setLoading(true)
    getGoalWorkflow(goal.id)
      .then(data => setWf(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [goal?.id])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!goal) return null

  const sc = statusConfig[goal.status] || statusConfig.draft
  const currentIdx = statusFlow.indexOf(goal.status)
  const isSubmitted = goal.status === 'submitted'
  const isDraft = goal.status === 'draft' || goal.status === 'active'

  const handleAction = async (action) => {
    const text = comment.trim() || null
    if (action === 'comment' && !text) return
    setActionLoading(action)
    try {
      const payload = { comment: text }
      if (action === 'submit') await submitGoal(goal.id, payload)
      if (action === 'approve') await approveGoal(goal.id, payload)
      if (action === 'reject') await rejectGoal(goal.id, payload)
      if (action === 'comment') await commentGoal(goal.id, payload)
      setComment('')
      // Refresh
      const data = await getGoalWorkflow(goal.id)
      setWf(data)
      if (onUpdate) onUpdate()
    } catch {}
    finally { setActionLoading(null) }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60]" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[10vh] sm:pt-[12vh] overflow-y-auto">
        <div className="w-full max-w-2xl rounded-2xl shadow-2xl animate-fade-in"
          style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 px-6 py-5" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: sc.dot }} />
                  {sc.label}
                </span>
                {goal.goal_type && (
                  <span className="text-xs rounded-full px-2 py-0.5"
                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-quaternary)' }}
                  >{goal.goal_type}</span>
                )}
                {goal.strategic_link && (
                  <span className="text-xs rounded-full px-2 py-0.5 badge-brand">{goal.strategic_link}</span>
                )}
              </div>
              <h2 className="text-base font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>{goal.title}</h2>
            </div>
            <button onClick={onClose}
              className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--fg-quaternary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Pipeline */}
          <div className="px-6 py-4 flex justify-center" style={{ borderBottom: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
            <div className="flex items-center gap-1.5">
              {statusFlow.map((step, i) => {
                const isPast = i < currentIdx
                const isCurrent = i === currentIdx
                return (
                  <div key={step} className="flex items-center gap-1.5">
                    {i > 0 && <div className="w-8 h-0.5 rounded-full" style={{ backgroundColor: isPast ? 'var(--fg-success-primary)' : 'var(--border-secondary)' }} />}
                    <div className="flex flex-col items-center">
                      <div className={`h-3.5 w-3.5 rounded-full border-2 ${isCurrent ? 'scale-110' : ''}`} style={{
                        backgroundColor: isPast ? 'var(--fg-success-primary)' : isCurrent ? sc.dot : 'transparent',
                        borderColor: isPast ? 'var(--fg-success-primary)' : isCurrent ? sc.dot : 'var(--border-secondary)',
                      }}>
                        {isPast && <svg className="h-full w-full p-[1px]" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <span className="text-[10px] mt-1" style={{
                        color: isCurrent ? 'var(--text-primary)' : 'var(--text-quaternary)',
                        fontWeight: isCurrent ? 600 : 400,
                      }}>{statusLabels[step]}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Сотрудник', value: goal.employee_name },
                { label: 'Подразделение', value: goal.department_name },
                { label: 'Вес', value: `${fmt(goal.weight)}%` },
                { label: 'SMART', value: goal.smart_score != null ? `${fmt(goal.smart_score * 100)}%` : '—', style: getScoreStyle(goal.smart_score) },
              ].map(d => (
                <div key={d.label} className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                  <div className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-quaternary)' }}>{d.label}</div>
                  <div className="text-sm font-medium mt-0.5 truncate" style={d.style || { color: 'var(--text-primary)' }}>{d.value || '—'}</div>
                </div>
              ))}
            </div>

            {/* Metric */}
            {goal.metric && (
              <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>Показатель: </span>{goal.metric}
              </div>
            )}

            {/* Period */}
            {goal.quarter && (
              <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>Период: </span>{goal.quarter} {goal.year}
              </div>
            )}

            {/* SMART details */}
            {goal.smart_details && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-quaternary)' }}>SMART-оценка</div>
                <div className="grid grid-cols-5 gap-2">
                  {['specific', 'measurable', 'achievable', 'relevant', 'time_bound'].map(key => {
                    const d = goal.smart_details?.[key]
                    if (!d) return null
                    const score = d.score || 0
                    return (
                      <div key={key} className="rounded-lg px-2 py-2 text-center" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                        <div className="text-lg font-semibold" style={getScoreStyle(score)}>{(score * 100).toFixed(0)}</div>
                        <div className="text-[10px] uppercase mt-0.5" style={{ color: 'var(--text-quaternary)' }}>{key.charAt(0).toUpperCase()}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            {(isDraft || isSubmitted) && (
              <div className="flex flex-wrap gap-2 pt-2" style={{ borderTop: '1px solid var(--border-secondary)' }}>
                {isDraft && (
                  <button onClick={() => handleAction('submit')} disabled={actionLoading === 'submit'}
                    className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                    style={{ backgroundColor: 'var(--bg-brand-solid)', color: '#fff' }}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    Отправить на согласование
                  </button>
                )}
                {isSubmitted && (
                  <>
                    <button onClick={() => handleAction('approve')} disabled={actionLoading === 'approve'}
                      className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                      style={{ backgroundColor: 'var(--bg-success-primary)', color: 'var(--text-success-primary)', border: '1px solid var(--border-success)' }}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                      Утвердить
                    </button>
                    <button onClick={() => handleAction('reject')} disabled={actionLoading === 'reject'}
                      className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                      style={{ backgroundColor: 'var(--bg-warning-primary)', color: 'var(--text-warning-primary)', border: '1px solid var(--border-warning)' }}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      На доработку
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Comment */}
            <div className="flex gap-2">
              <input type="text" className="input-field flex-1 text-sm"
                placeholder="Добавить комментарий..."
                value={comment} onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && comment.trim()) handleAction('comment') }}
              />
              <button onClick={() => handleAction('comment')}
                disabled={!comment.trim() || actionLoading === 'comment'}
                className="inline-flex items-center justify-center h-10 w-10 rounded-lg transition-colors disabled:opacity-40"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--fg-quaternary)' }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>

            {/* Workflow history */}
            {loading ? (
              <div className="text-sm py-2" style={{ color: 'var(--text-tertiary)' }}>Загрузка истории...</div>
            ) : wf && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-quaternary)' }}>
                  История
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {[
                    ...(wf.events || []).map(e => ({ ...e, _type: 'event', _time: e.created_at })),
                    ...(wf.reviews || []).map(r => ({ ...r, _type: 'review', _time: r.created_at })),
                  ].sort((a, b) => new Date(b._time) - new Date(a._time)).slice(0, 15).map((item, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2"
                      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1.5" style={{
                        backgroundColor: item._type === 'review'
                          ? (item.verdict === 'approve' ? 'var(--fg-success-primary)' : 'var(--text-warning-primary)')
                          : 'var(--fg-brand-primary)',
                      }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                          {(item.event_type || item.verdict || '').replace(/_/g, ' ')}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>
                          {item.actor_name || item.reviewer_name || 'Система'} · {new Date(item._time).toLocaleString()}
                        </div>
                        {(item.comment || item.comment_text) && (
                          <div className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.comment || item.comment_text}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {!(wf.events?.length || wf.reviews?.length) && (
                    <p className="text-xs py-2" style={{ color: 'var(--text-quaternary)' }}>Нет событий</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
