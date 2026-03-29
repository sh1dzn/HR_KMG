import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getGoals } from '../api/client'

/* ── Status config ─────────────────────────────────────────────────────────── */

const STATUS_META = {
  draft:       { label: 'Черновик',       color: 'var(--fg-quaternary)' },
  submitted:   { label: 'На согласовании', color: 'var(--text-warning-primary)' },
  approved:    { label: 'Утверждена',      color: 'var(--fg-success-primary)' },
  in_progress: { label: 'В работе',        color: 'var(--fg-brand-primary)' },
  done:        { label: 'Выполнена',       color: 'var(--fg-success-primary)' },
}

const ROLE_LABELS = {
  admin: 'Администратор',
  manager: 'Руководитель',
  employee: 'Сотрудник',
}

/* ── SVG icons (stroke-based, 20x20, Untitled UI style) ──────────────────── */

const icons = {
  draft: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  submitted: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  approved: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  in_progress: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  ),
  create: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  evaluate: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  goals: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  ),
}

/* ── Summary card definitions ─────────────────────────────────────────────── */

const SUMMARY_CARDS = [
  { key: 'draft',       label: 'Черновики',       icon: icons.draft },
  { key: 'submitted',   label: 'На согласовании', icon: icons.submitted },
  { key: 'approved',    label: 'Утверждённые',    icon: icons.approved },
  { key: 'in_progress', label: 'В работе',        icon: icons.in_progress },
]

/* ── SMART score helpers ─────────────────────────────────────────────────── */

function smartScoreColor(score) {
  if (score >= 0.85) return 'var(--text-success-primary)'
  if (score >= 0.7) return 'var(--text-warning-primary)'
  return 'var(--fg-error-secondary)'
}

function formatScore(score) {
  if (score == null) return '--'
  return Math.round(score * 100) + '%'
}

/* ── Landing page content (fallback for non-authenticated) ───────────────── */

const features = [
  {
    name: 'Оценка целей (SMART)',
    description: 'Автоматическая оценка целей по методологии SMART с детальными рекомендациями по улучшению формулировок',
    href: '/evaluation',
    iconClass: 'icon-box-brand',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    name: 'Генерация целей',
    description: 'Подготовка формулировок на основе внутренних нормативных документов, стратегии компании и роли сотрудника',
    href: '/generation',
    iconClass: 'icon-box-success',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
  },
  {
    name: 'Дашборд качества',
    description: 'Комплексная аналитика качества целеполагания по подразделениям, кварталам и ключевым метрикам',
    href: '/dashboard',
    iconClass: 'icon-box-warning',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    name: 'Цели сотрудников',
    description: 'Централизованный просмотр и управление целями всех сотрудников компании с фильтрацией и поиском',
    href: '/employees',
    iconClass: 'icon-box-error',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    name: 'Операционный контур',
    description: 'Alert Manager, ручная переиндексация ВНД и sandbox-интеграция с внешними HR-системами',
    href: '/operations',
    iconClass: 'icon-box-gray',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
]

const stats = [
  { value: '8',    label: 'Подразделений', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  )},
  { value: '420',  label: 'Сотрудников', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )},
  { value: '9 000', label: 'Целей в базе', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  )},
  { value: '160',  label: 'Документов ВНД', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )},
]

const checkItems = [
  'SMART-оценка одной цели через API',
  'Переформулировка слабой формулировки',
  'Генерация 3-5 целей по роли и ВНД',
  'Источник каждой цели и релевантный фрагмент',
  'Пакетная оценка сотрудника за квартал',
  'Дашборд зрелости по подразделениям',
]

const architecture = [
  {
    title: 'Данные',
    text: 'PostgreSQL-дамп mock_smart: сотрудники, цели, документы, проекты, KPI и история событий.',
    iconClass: 'icon-box-brand',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
  },
  {
    title: 'AI-слой',
    text: 'Сервис оценки и подготовки формулировок поверх RAG-контекста из ВНД и целей руководителя.',
    iconClass: 'icon-box-success',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
      </svg>
    ),
  },
  {
    title: 'MVP-демо',
    text: 'UI для защиты решения: оценка, генерация, аналитика и просмотр целей сотрудников.',
    iconClass: 'icon-box-warning',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9h6M9 12h6M9 15h4" />
      </svg>
    ),
  },
]

/* ── Dashboard (authenticated) ───────────────────────────────────────────── */

function Dashboard({ user }) {
  const [goalsData, setGoalsData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getGoals({ page: 1, per_page: 20 })
      .then((data) => { if (!cancelled) setGoalsData(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const goals = goalsData?.goals || []

  // Count by status
  const counts = { draft: 0, submitted: 0, approved: 0, in_progress: 0 }
  goals.forEach((g) => {
    const s = g.status
    if (s in counts) counts[s]++
  })

  const recentGoals = goals.slice(0, 5)

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Welcome header */}
      <div className="card px-6 py-6 sm:px-8 sm:py-8">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            style={{ backgroundColor: 'var(--bg-brand-secondary)', color: 'var(--fg-brand-primary)' }}
          >
            {(user?.employee_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl" style={{ color: 'var(--text-primary)' }}>
              {user?.employee_name || 'User'}
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {ROLE_LABELS[user?.role] || user?.role || 'Сотрудник'}
            </p>
          </div>
        </div>
      </div>

      {/* Goal status summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {SUMMARY_CARDS.map((card) => (
          <div key={card.key} className="card px-5 py-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>
                {card.label}
              </span>
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ border: '1px solid var(--border-secondary)', color: STATUS_META[card.key].color }}
              >
                {card.icon}
              </div>
            </div>
            <div
              className="text-3xl font-semibold"
              style={{ color: loading ? 'var(--text-quaternary)' : 'var(--text-primary)' }}
            >
              {loading ? '--' : counts[card.key]}
            </div>
          </div>
        ))}
      </div>

      {/* Recent goals */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Последние цели
          </h2>
          <Link to="/employees" className="text-sm font-medium" style={{ color: 'var(--fg-brand-primary)' }}>
            Все цели
          </Link>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm" style={{ color: 'var(--text-quaternary)' }}>
            Загрузка...
          </div>
        ) : recentGoals.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: 'var(--text-quaternary)' }}>
            Целей пока нет
          </div>
        ) : (
          <div className="space-y-2">
            {recentGoals.map((goal) => {
              const meta = STATUS_META[goal.status] || STATUS_META.draft
              const score = goal.smart_score ?? goal.overall_score ?? null
              return (
                <div
                  key={goal.id}
                  className="flex items-center gap-3 rounded-lg px-4 py-3"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
                >
                  {/* Status dot */}
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: meta.color }}
                    title={meta.label}
                  />

                  {/* Goal text */}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {goal.goal_text || goal.title || 'Без названия'}
                    </div>
                  </div>

                  {/* SMART score */}
                  <span
                    className="flex-shrink-0 text-sm font-semibold tabular-nums"
                    style={{ color: score != null ? smartScoreColor(score) : 'var(--text-quaternary)' }}
                  >
                    {formatScore(score)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Быстрые действия
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            to="/generation"
            className="card flex items-center gap-4 p-5 transition-colors hover:bg-[var(--bg-secondary)]"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl icon-box-success">
              {icons.create}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Создать цель</div>
              <div className="mt-0.5 text-sm" style={{ color: 'var(--text-tertiary)' }}>Генерация новых целей</div>
            </div>
          </Link>

          <Link
            to="/evaluation"
            className="card flex items-center gap-4 p-5 transition-colors hover:bg-[var(--bg-secondary)]"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl icon-box-brand">
              {icons.evaluate}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Оценить цель</div>
              <div className="mt-0.5 text-sm" style={{ color: 'var(--text-tertiary)' }}>SMART-оценка формулировки</div>
            </div>
          </Link>

          <Link
            to="/employees"
            className="card flex items-center gap-4 p-5 transition-colors hover:bg-[var(--bg-secondary)]"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl icon-box-warning">
              {icons.goals}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Мои цели</div>
              <div className="mt-0.5 text-sm" style={{ color: 'var(--text-tertiary)' }}>Просмотр всех целей</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

/* ── Landing page (non-authenticated fallback) ───────────────────────────── */

function LandingPage() {
  return (
    <div className="space-y-6 animate-fade-in">

      {/* Intro section */}
      <div className="card p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <h1 className="text-2xl font-semibold leading-tight sm:text-3xl" style={{ color: 'var(--text-primary)' }}>
              Подсистема качества постановки целей
            </h1>
            <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-tertiary)' }}>
              Рабочая витрина модуля: проверка формулировок, подготовка целей по контексту сотрудника,
              квартальная аналитика и единый просмотр целей по подразделениям на базе <code className="text-xs font-mono px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>mock_smart</code>.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/evaluation" className="btn-primary">
                Перейти к оценке
              </Link>
              <Link to="/dashboard" className="btn-secondary">
                Открыть дашборд
              </Link>
            </div>
          </div>

          <div className="grid gap-3 content-start">
            <div className="rounded-lg px-4 py-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
              <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Контур данных</div>
              <div className="mt-1 text-sm leading-6" style={{ color: 'var(--text-tertiary)' }}>
                Восстановленный PostgreSQL-дамп, реальные сотрудники, документы, KPI и история постановки целей.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg px-4 py-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Методика</div>
                <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>SMART, релевантность роли и квартальный контекст.</div>
              </div>
              <div className="rounded-lg px-4 py-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Сценарий</div>
                <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Оценка, подготовка, согласование и аналитика.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card px-5 py-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>{s.label}</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ border: '1px solid var(--border-secondary)', color: 'var(--fg-quaternary)' }}
              >
                {s.icon}
              </div>
            </div>
            <div className="text-3xl font-semibold" style={{ color: 'var(--text-primary)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Feature cards */}
      <div>
        <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Модули системы</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {features.map((f) => (
            <Link key={f.name} to={f.href}
              className="card flex items-start gap-4 p-5 transition-colors hover:bg-[var(--bg-secondary)]"
            >
              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${f.iconClass}`}>
                {f.icon}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{f.name}</div>
                <div className="mt-1 text-sm leading-5" style={{ color: 'var(--text-tertiary)' }}>{f.description}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Bottom two columns */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Checklist */}
        <div className="card p-5">
          <div className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Функциональный контур</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {checkItems.map((item) => (
              <div key={item} className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
              >
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: 'var(--fg-success-primary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Architecture */}
        <div className="card p-5">
          <div className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Архитектура решения</div>
          <div className="space-y-3">
            {architecture.map((a) => (
              <div key={a.title} className="flex gap-3 rounded-lg px-4 py-3"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
              >
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${a.iconClass}`}>
                  {a.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{a.title}</div>
                  <div className="mt-0.5 text-sm leading-5" style={{ color: 'var(--text-tertiary)' }}>{a.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main export ─────────────────────────────────────────────────────────── */

export default function Home() {
  const { user, isAuthenticated } = useAuth()

  if (isAuthenticated && user) {
    return <Dashboard user={user} />
  }

  return <LandingPage />
}
