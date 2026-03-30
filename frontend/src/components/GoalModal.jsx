import { useEffect, useState, useRef } from 'react'
import { getGoal, getGoalWorkflow, approveGoal, rejectGoal, submitGoal, commentGoal, createGoal, updateGoal, quickScore } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

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
const statusShort = { draft: 'Черн.', submitted: 'Согл.', approved: 'Утв.', in_progress: 'Работа', done: 'Готово' }

const getScoreStyle = (s) => {
  if (!s && s !== 0) return { color: 'var(--text-quaternary)' }
  if (s >= 0.85) return { color: 'var(--text-success-primary)' }
  if (s >= 0.7) return { color: 'var(--text-warning-primary)' }
  return { color: 'var(--fg-error-secondary)' }
}
const fmt = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(d) : '0' }

export default function GoalModal({ goal: initialGoal, onClose, onUpdate }) {
  const { user } = useAuth()
  const [goal, setGoal] = useState(initialGoal)
  const [wf, setWf] = useState(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [actionLoading, setActionLoading] = useState(null)
  const [actionError, setActionError] = useState(null)

  // Create/edit mode
  const isCreateMode = !initialGoal?.id
  const [editTitle, setEditTitle] = useState(initialGoal?.title || '')
  const [editMetric, setEditMetric] = useState(initialGoal?.metric || '')
  const [editWeight, setEditWeight] = useState(initialGoal?.weight || 20)
  const [saving, setSaving] = useState(false)

  // Live SMART scoring
  const [liveScore, setLiveScore] = useState(null)
  const scoreTimer = useRef(null)

  useEffect(() => {
    clearTimeout(scoreTimer.current)
    if (editTitle.trim().length < 5) { setLiveScore(null); return }
    scoreTimer.current = setTimeout(() => {
      quickScore(editTitle).then(setLiveScore).catch(() => {})
    }, 600)
    return () => clearTimeout(scoreTimer.current)
  }, [editTitle])

  const handleSaveGoal = async () => {
    if (!editTitle.trim() || editTitle.trim().length < 10) {
      setActionError('Минимум 10 символов для текста цели')
      return
    }
    setSaving(true)
    setActionError(null)
    try {
      if (isCreateMode) {
        await createGoal({
          title: editTitle.trim(),
          metric: editMetric.trim() || null,
          weight: editWeight,
          employee_id: user?.employee_id,
          quarter: 'Q1',
          year: 2026,
        })
      } else {
        await updateGoal(goal.id, {
          title: editTitle.trim(),
          metric: editMetric.trim() || null,
          weight: editWeight,
        })
      }
      if (onUpdate) onUpdate()
      onClose()
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Ошибка сохранения')
    }
    setSaving(false)
  }

  useEffect(() => {
    if (!initialGoal?.id) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      getGoal(initialGoal.id).catch(() => initialGoal),
      getGoalWorkflow(initialGoal.id).catch(() => null),
    ]).then(([fullGoal, wfData]) => {
      setGoal(fullGoal)
      setWf(wfData)
      setEditTitle(fullGoal.title || '')
      setEditMetric(fullGoal.metric || '')
      setEditWeight(fullGoal.weight || 0)
    }).finally(() => setLoading(false))
  }, [initialGoal])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!goal && !isCreateMode) return null

  const sc = statusConfig[goal?.status || 'draft'] || statusConfig.draft
  const currentIdx = statusFlow.indexOf(goal?.status || 'draft')
  const isSubmitted = goal?.status === 'submitted'
  const isDraft = isCreateMode || goal?.status === 'draft' || goal?.status === 'active'
  const canEdit = isCreateMode || isDraft

  const handleAction = async (action) => {
    const text = comment.trim() || null
    if (action === 'comment' && !text) return
    setActionLoading(action)
    setActionError(null)
    try {
      const payload = { comment: text }
      if (action === 'submit') await submitGoal(goal.id, payload)
      if (action === 'approve') await approveGoal(goal.id, payload)
      if (action === 'reject') await rejectGoal(goal.id, payload)
      if (action === 'comment') await commentGoal(goal.id, payload)
      setComment('')
      // Refresh
      const [fullGoal, data] = await Promise.all([
        getGoal(goal.id).catch(() => goal),
        getGoalWorkflow(goal.id).catch(() => wf),
      ])
      setGoal(fullGoal)
      setWf(data)
      if (onUpdate) onUpdate()
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Не удалось выполнить действие')
    }
    finally { setActionLoading(null) }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60]" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[70] flex items-end sm:items-start justify-center sm:p-4 sm:pt-[8vh] overflow-y-auto">
        <div className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl animate-fade-in max-h-[92vh] sm:max-h-[85vh] overflow-y-auto"
          style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle on mobile */}
          <div className="sm:hidden flex justify-center pt-2 pb-1">
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--border-secondary)' }} />
          </div>

          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: sc.dot }} />
                  {isCreateMode ? 'Новая цель' : sc.label}
                </span>
                {goal?.goal_type && (
                  <span className="text-xs rounded-full px-2 py-0.5"
                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-quaternary)' }}
                  >{goal.goal_type}</span>
                )}
                {goal?.strategic_link && (
                  <span className="text-xs rounded-full px-2 py-0.5 badge-brand">{goal.strategic_link}</span>
                )}
              </div>
              {canEdit ? (
                <textarea
                  className="input-field w-full text-sm leading-relaxed"
                  rows={3}
                  placeholder="Введите текст цели... Например: Увеличить объём продаж на 20% к концу Q2 2026"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{ resize: 'vertical', minHeight: '60px' }}
                />
              ) : (
                <h2 className="text-base font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>{goal?.title}</h2>
              )}
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

          {/* Pipeline (hide in create mode) */}
          {!isCreateMode && <div className="px-3 py-3 sm:px-6 sm:py-4 flex justify-center" style={{ borderBottom: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
            <div className="flex items-center gap-1">
              {statusFlow.map((step, i) => {
                const isPast = i < currentIdx
                const isCurrent = i === currentIdx
                return (
                  <div key={step} className="flex items-center gap-1">
                    {i > 0 && <div className="w-4 sm:w-8 h-0.5 rounded-full" style={{ backgroundColor: isPast ? 'var(--fg-success-primary)' : 'var(--border-secondary)' }} />}
                    <div className="flex flex-col items-center">
                      <div className={`h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-full border-2 ${isCurrent ? 'scale-110' : ''}`} style={{
                        backgroundColor: isPast ? 'var(--fg-success-primary)' : isCurrent ? sc.dot : 'transparent',
                        borderColor: isPast ? 'var(--fg-success-primary)' : isCurrent ? sc.dot : 'var(--border-secondary)',
                      }}>
                        {isPast && <svg className="h-full w-full p-[1px]" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <span className="text-[9px] sm:text-[10px] mt-0.5 sm:mt-1 whitespace-nowrap" style={{
                        color: isCurrent ? 'var(--text-primary)' : 'var(--text-quaternary)',
                        fontWeight: isCurrent ? 600 : 400,
                      }}>
                        <span className="sm:hidden">{statusShort[step]}</span>
                        <span className="hidden sm:inline">{statusLabels[step]}</span>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>}

          {/* Body */}
          <div className="px-4 py-4 sm:px-6 sm:py-5 space-y-4">
            {/* Live SMART Score (create/edit mode) */}
            {canEdit && liveScore && (
              <div className="flex flex-wrap gap-1.5 animate-fade-in">
                {['specific', 'measurable', 'achievable', 'relevant', 'time_bound'].map((key) => {
                  const c = liveScore.criteria?.[key]
                  if (!c) return null
                  const s = c.score || 0
                  const clr = s >= 0.7 ? 'var(--fg-success-primary)' : s >= 0.5 ? 'var(--text-warning-primary)' : 'var(--fg-error-primary)'
                  const bg = s >= 0.7 ? 'var(--bg-success-secondary)' : s >= 0.5 ? 'var(--bg-warning-secondary)' : 'var(--bg-error-secondary)'
                  return (
                    <div key={key} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-300"
                      style={{ backgroundColor: bg, color: clr }} title={c.tip}>
                      <span className="font-bold">{key === 'time_bound' ? 'T' : key[0].toUpperCase()}</span>
                      <span className="tabular-nums">{Math.round(s * 100)}%</span>
                    </div>
                  )
                })}
                <div className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
                  style={{
                    backgroundColor: liveScore.overall_score >= 0.7 ? 'var(--bg-success-secondary)' : liveScore.overall_score >= 0.5 ? 'var(--bg-warning-secondary)' : 'var(--bg-error-secondary)',
                    color: liveScore.overall_score >= 0.7 ? 'var(--fg-success-primary)' : liveScore.overall_score >= 0.5 ? 'var(--text-warning-primary)' : 'var(--fg-error-primary)',
                  }}>
                  {Math.round(liveScore.overall_score * 100)}%
                </div>
              </div>
            )}

            {/* Editable fields (create/edit mode) */}
            {canEdit && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Показатель</label>
                  <input type="text" className="input-field w-full text-sm" placeholder="KPI, метрика достижения"
                    value={editMetric} onChange={(e) => setEditMetric(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Вес (%)</label>
                  <input type="number" className="input-field w-full text-sm" min="0" max="100"
                    value={editWeight} onChange={(e) => setEditWeight(+e.target.value)} />
                </div>
              </div>
            )}

            {/* Save button (create/edit mode) */}
            {canEdit && (
              <button type="button" onClick={handleSaveGoal} disabled={saving || editTitle.trim().length < 10}
                className="btn-primary w-full flex items-center justify-center gap-2">
                {saving ? 'Сохранение...' : isCreateMode ? 'Создать цель' : 'Сохранить изменения'}
              </button>
            )}

            {/* Info grid (only in view/existing mode) */}
            {!isCreateMode && (
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {[
                  { label: 'Сотрудник', value: goal?.employee_name },
                  { label: 'Должность', value: goal?.position_name },
                  { label: 'Подразделение', value: goal?.department_name },
                  { label: 'Руководитель', value: goal?.manager_name },
                  { label: 'Вес', value: `${fmt(goal?.weight)}%` },
                  { label: 'SMART', value: goal?.smart_score != null ? `${fmt(goal.smart_score * 100)}%` : '—', style: getScoreStyle(goal?.smart_score) },
                ].map(d => (
                  <div key={d.label} className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                    <div className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-quaternary)' }}>{d.label}</div>
                    <div className="text-sm font-medium mt-0.5 truncate" style={d.style || { color: 'var(--text-primary)' }}>{d.value || '—'}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Metric (only in view mode, edit mode has its own input) */}
            {!canEdit && goal?.metric && (
              <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>Показатель: </span>{goal.metric}
              </div>
            )}

            {/* Period */}
            {!isCreateMode && goal?.quarter && (
              <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>Период: </span>{goal.quarter} {goal.year}
              </div>
            )}

            {/* SMART details (view mode only) */}
            {!isCreateMode && goal?.smart_details && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-quaternary)' }}>SMART-оценка</div>
                <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
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

            {/* Actions (not in create mode) */}
            {!isCreateMode && (isDraft || isSubmitted) && (
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

            {/* Error for create mode */}
            {isCreateMode && actionError && (
              <div className="rounded-lg px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-error-secondary)', color: 'var(--text-error-primary)' }}
              >{actionError}</div>
            )}

            {/* Comment, error, workflow (not in create mode) */}
            {!isCreateMode && (
            <>
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
            {actionError && (
              <div className="rounded-lg px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-error-secondary)', color: 'var(--text-error-primary)' }}
              >
                {actionError}
              </div>
            )}

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
            </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
