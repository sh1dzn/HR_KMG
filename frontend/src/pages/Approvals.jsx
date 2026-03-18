import { useEffect, useState } from 'react'
import { getGoals, approveGoal, rejectGoal, commentGoal, getGoalWorkflow } from '../api/client'

const ROWS_PER_PAGE = 15

const statusFlow = ['draft', 'submitted', 'approved', 'in_progress', 'done']
const statusLabels = {
  draft: 'Черновик', submitted: 'На согласовании', approved: 'Утверждена',
  in_progress: 'В работе', done: 'Выполнена', cancelled: 'Отменена',
  overdue: 'Просрочена', archived: 'Архив',
}
const statusDot = {
  draft: 'var(--fg-quaternary)', submitted: 'var(--text-warning-primary)',
  approved: 'var(--fg-success-primary)', in_progress: 'var(--fg-brand-primary)',
  done: 'var(--fg-success-primary)', cancelled: 'var(--fg-error-secondary)',
  overdue: 'var(--fg-error-secondary)', archived: 'var(--fg-quaternary)',
}

const getScoreStyle = (s) => {
  if (!s && s !== 0) return { color: 'var(--text-quaternary)' }
  if (s >= 0.85) return { color: 'var(--text-success-primary)' }
  if (s >= 0.7) return { color: 'var(--text-warning-primary)' }
  return { color: 'var(--fg-error-secondary)' }
}

/* ── Status Pipeline ─────────────────────────────────── */
function StatusPipeline({ current }) {
  const idx = statusFlow.indexOf(current)
  return (
    <div className="flex items-center gap-1">
      {statusFlow.map((step, i) => {
        const isPast = i < idx
        const isCurrent = i === idx
        const isUnreached = i > idx
        return (
          <div key={step} className="flex items-center gap-1">
            {i > 0 && (
              <div className="w-4 sm:w-6 h-0.5 rounded-full" style={{
                backgroundColor: isPast ? 'var(--fg-success-primary)' : 'var(--border-secondary)',
              }} />
            )}
            <div className="flex flex-col items-center">
              <div className={`h-3 w-3 rounded-full border-2 ${isCurrent ? 'scale-125' : ''}`} style={{
                backgroundColor: isPast ? 'var(--fg-success-primary)' : isCurrent ? statusDot[current] : 'transparent',
                borderColor: isPast ? 'var(--fg-success-primary)' : isCurrent ? statusDot[current] : 'var(--border-secondary)',
                transition: 'all 0.2s',
              }}>
                {isPast && (
                  <svg className="h-full w-full p-[1px]" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
              <span className="text-[9px] mt-1 whitespace-nowrap hidden sm:block" style={{
                color: isCurrent ? 'var(--text-primary)' : isUnreached ? 'var(--text-quaternary)' : 'var(--text-tertiary)',
                fontWeight: isCurrent ? 600 : 400,
              }}>
                {statusLabels[step]}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Approvals() {
  const [goals, setGoals] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('submitted') // submitted | all
  const [expandedId, setExpandedId] = useState(null)
  const [workflow, setWorkflow] = useState({})
  const [wfLoading, setWfLoading] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [comments, setComments] = useState({})
  const [selected, setSelected] = useState(new Set())
  const [batchLoading, setBatchLoading] = useState(false)

  const loadGoals = async () => {
    setLoading(true); setError(null)
    try {
      const params = { page, per_page: ROWS_PER_PAGE }
      if (tab === 'submitted') params.status = 'submitted'
      const r = await getGoals(params)
      setGoals(r.goals || [])
      setTotal(r.total || 0)
    } catch (e) { setError(e.response?.data?.detail || 'Ошибка загрузки') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadGoals() }, [page, tab])
  useEffect(() => { setPage(1); setSelected(new Set()) }, [tab])

  const totalPages = Math.max(1, Math.ceil(total / ROWS_PER_PAGE))

  const toggleExpand = async (goalId) => {
    if (expandedId === goalId) { setExpandedId(null); return }
    setExpandedId(goalId)
    if (!workflow[goalId]) {
      setWfLoading(goalId)
      try {
        const wf = await getGoalWorkflow(goalId)
        setWorkflow(p => ({ ...p, [goalId]: wf }))
      } catch {}
      finally { setWfLoading(null) }
    }
  }

  const handleAction = async (goalId, action) => {
    const comment = comments[goalId]?.trim() || null
    if (action === 'comment' && !comment) return
    setActionLoading(`${goalId}:${action}`); setError(null)
    try {
      const payload = { comment }
      if (action === 'approve') await approveGoal(goalId, payload)
      if (action === 'reject') await rejectGoal(goalId, payload)
      if (action === 'comment') await commentGoal(goalId, payload)
      setComments(p => ({ ...p, [goalId]: '' }))
      // Refresh
      const wf = await getGoalWorkflow(goalId)
      setWorkflow(p => ({ ...p, [goalId]: wf }))
      loadGoals()
    } catch (e) { setError(e.response?.data?.detail || 'Ошибка действия') }
    finally { setActionLoading(null) }
  }

  const handleBatchApprove = async () => {
    if (selected.size === 0) return
    setBatchLoading(true); setError(null)
    try {
      for (const goalId of selected) {
        await approveGoal(goalId, { comment: 'Утверждено (массовое)' })
      }
      setSelected(new Set())
      loadGoals()
    } catch (e) { setError(e.response?.data?.detail || 'Ошибка массового утверждения') }
    finally { setBatchLoading(false) }
  }

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const allSelected = goals.length > 0 && goals.every(g => selected.has(g.id))
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(goals.filter(g => g.status === 'submitted').map(g => g.id)))
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Согласование целей</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Очередь на утверждение, история решений и визуальный pipeline статусов.
        </p>
      </div>

      {/* Tabs + batch action */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5">
          {[
            { key: 'submitted', label: 'Ожидают решения' },
            { key: 'all', label: 'Все цели' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: tab === t.key ? 'var(--bg-brand-primary)' : '',
                color: tab === t.key ? 'var(--text-brand-primary)' : 'var(--text-tertiary)',
                border: tab === t.key ? '1px solid var(--border-brand-secondary)' : '1px solid transparent',
              }}
            >
              {t.label}
              {t.key === 'submitted' && total > 0 && tab === 'submitted' && (
                <span className="ml-1.5 text-xs font-semibold">{total}</span>
              )}
            </button>
          ))}
        </div>

        {selected.size > 0 && tab === 'submitted' && (
          <button onClick={handleBatchApprove} disabled={batchLoading}
            className="btn-primary" style={{ padding: '7px 16px', fontSize: '13px' }}
          >
            {batchLoading ? 'Утверждение...' : `Утвердить выбранные (${selected.size})`}
          </button>
        )}
      </div>

      {error && (
        <div className="status-error flex items-center gap-2 rounded-xl px-4 py-3 text-sm">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {typeof error === 'string' ? error : JSON.stringify(error)}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 animate-spin spinner-brand" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Загрузка...</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Select all header for submitted tab */}
          {tab === 'submitted' && goals.length > 0 && (
            <div className="flex items-center gap-3 px-1 py-1">
              <input type="checkbox" checked={allSelected} onChange={toggleAll}
                className="h-4 w-4 rounded" style={{ accentColor: 'var(--fg-brand-primary)' }}
              />
              <span className="text-xs font-medium" style={{ color: 'var(--text-quaternary)' }}>
                {allSelected ? 'Снять все' : 'Выбрать все'}
              </span>
            </div>
          )}

          {goals.map((goal) => {
            const isOpen = expandedId === goal.id
            const wf = workflow[goal.id]
            const initials = (goal.employee_name || '??').split(' ').map(w => w[0]).slice(0, 2).join('')
            const isSubmitted = goal.status === 'submitted'

            return (
              <div key={goal.id} className="card overflow-hidden">
                {/* Goal row */}
                <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5 cursor-pointer"
                  onClick={() => toggleExpand(goal.id)}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                >
                  {/* Checkbox for submitted */}
                  {tab === 'submitted' && isSubmitted && (
                    <div className="flex-shrink-0 pt-1" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(goal.id)} onChange={() => toggleSelect(goal.id)}
                        className="h-4 w-4 rounded" style={{ accentColor: 'var(--fg-brand-primary)' }}
                      />
                    </div>
                  )}

                  {/* Avatar */}
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white gradient-brand mt-0.5">
                    {initials}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>{goal.title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      <span>{goal.employee_name}</span>
                      <span>·</span>
                      <span>{goal.position_name}</span>
                      {goal.department_name && (
                        <span className="hidden sm:inline">· {goal.department_name}</span>
                      )}
                    </div>
                    {/* Pipeline */}
                    <div className="mt-3">
                      <StatusPipeline current={goal.status} />
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {goal.smart_score != null && (
                      <span className="text-sm font-semibold" style={getScoreStyle(goal.smart_score)}>
                        {(goal.smart_score * 100).toFixed(0)}%
                      </span>
                    )}
                    {goal.quarter && (
                      <span className="text-xs rounded-full px-2 py-0.5"
                        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-quaternary)' }}
                      >{goal.quarter} {goal.year}</span>
                    )}
                    {/* Quick approve/reject for submitted */}
                    {isSubmitted && !isOpen && (
                      <div className="flex gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => handleAction(goal.id, 'approve')}
                          disabled={actionLoading === `${goal.id}:approve`}
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors"
                          style={{ color: 'var(--fg-success-primary)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-success-primary)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                          title="Утвердить"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        </button>
                        <button onClick={() => handleAction(goal.id, 'reject')}
                          disabled={actionLoading === `${goal.id}:reject`}
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors"
                          style={{ color: 'var(--fg-error-secondary)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-error-primary)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                          title="Отклонить"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded panel */}
                {isOpen && (
                  <div className="px-4 py-4 sm:px-5" style={{ borderTop: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
                    {/* Goal details */}
                    <div className="grid gap-3 sm:grid-cols-3 mb-4">
                      {[
                        { label: 'Вес', value: `${(goal.weight || 0).toFixed(0)}%` },
                        { label: 'Тип', value: goal.goal_type || '—' },
                        { label: 'Связка', value: goal.strategic_link || '—' },
                      ].map(d => (
                        <div key={d.label} className="rounded-lg px-3 py-2"
                          style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
                          <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>{d.label}</div>
                          <div className="text-sm font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>{d.value}</div>
                        </div>
                      ))}
                    </div>

                    {goal.metric && (
                      <div className="mb-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                        <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>Показатель: </span>{goal.metric}
                      </div>
                    )}

                    {/* Actions */}
                    {isSubmitted && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        <button onClick={() => handleAction(goal.id, 'approve')}
                          disabled={actionLoading === `${goal.id}:approve`}
                          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                          style={{ backgroundColor: 'var(--bg-success-primary)', color: 'var(--text-success-primary)', border: '1px solid var(--border-success)' }}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                          Утвердить
                        </button>
                        <button onClick={() => handleAction(goal.id, 'reject')}
                          disabled={actionLoading === `${goal.id}:reject`}
                          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                          style={{ backgroundColor: 'var(--bg-warning-primary)', color: 'var(--text-warning-primary)', border: '1px solid var(--border-warning)' }}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          На доработку
                        </button>
                      </div>
                    )}

                    {/* Comment */}
                    <div className="mb-4 flex gap-2">
                      <input type="text" className="input-field flex-1 text-sm"
                        placeholder="Комментарий..."
                        value={comments[goal.id] || ''}
                        onChange={(e) => setComments(p => ({ ...p, [goal.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter' && comments[goal.id]?.trim()) handleAction(goal.id, 'comment') }}
                      />
                      <button onClick={() => handleAction(goal.id, 'comment')}
                        disabled={!comments[goal.id]?.trim() || actionLoading === `${goal.id}:comment`}
                        className="inline-flex items-center justify-center h-10 w-10 rounded-lg transition-colors disabled:opacity-40"
                        style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', color: 'var(--fg-quaternary)' }}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                      </button>
                    </div>

                    {/* Workflow history */}
                    {wfLoading === goal.id ? (
                      <div className="text-sm py-2" style={{ color: 'var(--text-tertiary)' }}>Загрузка истории...</div>
                    ) : wf ? (
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-quaternary)' }}>
                          История ({(wf.events || []).length + (wf.reviews || []).length})
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {[
                            ...(wf.events || []).map(e => ({ ...e, _type: 'event', _time: e.created_at })),
                            ...(wf.reviews || []).map(r => ({ ...r, _type: 'review', _time: r.created_at })),
                          ].sort((a, b) => new Date(b._time) - new Date(a._time)).map((item, i) => (
                            <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2"
                              style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
                              <span className="h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1.5" style={{
                                backgroundColor: item._type === 'review'
                                  ? (item.verdict === 'approve' ? 'var(--fg-success-primary)' : item.verdict === 'needs_changes' ? 'var(--text-warning-primary)' : 'var(--fg-quaternary)')
                                  : 'var(--fg-brand-primary)',
                              }} />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                                  {item._type === 'event' ? (item.event_type || '').replace('_', ' ') : item.verdict?.replace('_', ' ')}
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
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}

          {goals.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl p-12 text-center"
              style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--bg-success-primary)' }}>
                <svg className="h-6 w-6" style={{ color: 'var(--fg-success-primary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                {tab === 'submitted' ? 'Нет целей на согласовании' : 'Цели не найдены'}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-quaternary)' }}>
                {tab === 'submitted' ? 'Все цели обработаны' : 'Попробуйте другой фильтр'}
              </p>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40"
                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)' }}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                Назад
              </button>
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{page} из {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40"
                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)' }}>
                Вперёд
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 6 15 12 9 18"/></svg>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
