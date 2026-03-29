import { useMemo, useState } from 'react'

const KANBAN_COLUMNS = [
  'draft',
  'active',
  'in_progress',
  'submitted',
  'approved',
  'done',
  'overdue',
  'cancelled',
  'archived',
]

const fmt = (v, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(d) : '0'
}

export default function GoalsKanban({
  goals = [],
  statusConfig = {},
  statusLabels = {},
  busyKey = null,
  onMoveGoal,
  onCompleteGoal,
  onOpenGoal,
}) {
  const [draggingGoalId, setDraggingGoalId] = useState(null)
  const [hoverStatus, setHoverStatus] = useState(null)

  const goalsByStatus = useMemo(() => {
    const grouped = {}
    for (const status of KANBAN_COLUMNS) grouped[status] = []
    for (const goal of goals) {
      const status = goal.status || 'draft'
      if (!grouped[status]) grouped[status] = []
      grouped[status].push(goal)
    }
    return grouped
  }, [goals])

  const getGoalById = (goalId) => goals.find((goal) => String(goal.id) === String(goalId))

  const handleDrop = async (targetStatus) => {
    if (!draggingGoalId) return
    const goal = getGoalById(draggingGoalId)
    setHoverStatus(null)
    setDraggingGoalId(null)
    if (!goal || goal.status === targetStatus) return
    await onMoveGoal?.(goal, targetStatus)
  }

  return (
    <div className="space-y-3">
      <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>
        Перетаскивайте карточки между колонками, чтобы менять статус цели.
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-3 min-w-max pb-1">
          {KANBAN_COLUMNS.map((status) => {
            const sc = statusConfig[status] || statusConfig.draft || { label: status, dot: 'var(--fg-quaternary)' }
            const label = statusLabels[status] || sc.label || status
            const items = goalsByStatus[status] || []
            const isHovered = hoverStatus === status

            return (
              <div
                key={status}
                className="w-[280px] rounded-xl p-2.5 transition-colors"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: `1px solid ${isHovered ? 'var(--border-brand-secondary)' : 'var(--border-secondary)'}`,
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setHoverStatus(status)
                }}
                onDragLeave={() => setHoverStatus((prev) => (prev === status ? null : prev))}
                onDrop={(e) => {
                  e.preventDefault()
                  void handleDrop(status)
                }}
              >
                <div className="flex items-center justify-between px-1 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: sc.dot }} />
                    <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {label}
                    </span>
                  </div>
                  <span
                    className="text-[11px] rounded-full px-2 py-0.5"
                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-quaternary)' }}
                  >
                    {items.length}
                  </span>
                </div>

                <div className="space-y-2 min-h-[72px]">
                  {items.map((goal) => {
                    const canComplete = ['approved', 'in_progress', 'active', 'overdue'].includes(goal.status)
                    const busy = busyKey && busyKey.startsWith(`${goal.id}:`)
                    return (
                      <div
                        key={goal.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggingGoalId(goal.id)
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', String(goal.id))
                        }}
                        onDragEnd={() => {
                          setDraggingGoalId(null)
                          setHoverStatus(null)
                        }}
                        className="rounded-lg p-2.5 cursor-grab active:cursor-grabbing"
                        style={{
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border-secondary)',
                          opacity: draggingGoalId === goal.id ? 0.55 : 1,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenGoal?.(goal)}
                          className="block text-left text-sm font-medium leading-snug hover:underline w-full"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {goal.title}
                        </button>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>
                            SMART {goal.smart_score != null ? `${fmt(goal.smart_score * 100)}%` : '—'}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>
                            Вес {fmt(goal.weight)}%
                          </span>
                        </div>
                        {canComplete && (
                          <button
                            type="button"
                            onClick={() => onCompleteGoal?.(goal.id)}
                            disabled={busy}
                            className="mt-2 inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50"
                            style={{
                              backgroundColor: 'var(--bg-success-primary)',
                              color: 'var(--text-success-primary)',
                              border: '1px solid var(--border-success)',
                            }}
                          >
                            Выполнить
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
