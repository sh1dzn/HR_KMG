import { Link } from 'react-router-dom'

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
    description: 'Alert Manager, ручная переиндексация ВНД и mock-интеграция с внешними HR-системами',
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
  { value: '8',    label: 'Подразделений' },
  { value: '420',  label: 'Сотрудников' },
  { value: '9000', label: 'Целей в базе' },
  { value: '160',  label: 'Документов ВНД' },
]

const checkItems = [
  'SMART-оценка одной цели через API',
  'Переформулировка слабой формулировки',
  'Генерация 3–5 целей по роли и ВНД',
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

export default function Home() {
  return (
    <div className="space-y-6 animate-fade-in">

      {/* Hero banner */}
      <div className="card rounded-2xl overflow-hidden">
        <div className="px-6 py-8 sm:px-8 sm:py-10 relative overflow-hidden">
          {/* subtle gradient blob */}
          <div className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full" style={{ background: 'radial-gradient(circle, rgba(21,112,239,0.08) 0%, transparent 70%)' }} />
          <div className="pointer-events-none absolute -bottom-12 -left-12 h-48 w-48 rounded-full" style={{ background: 'radial-gradient(circle, rgba(23,178,106,0.07) 0%, transparent 70%)' }} />

          <div className="relative grid gap-8 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <div className="status-brand mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--fg-brand-primary)' }} />
                Corporate Goal Quality Platform
              </div>
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
              <div className="surface-dark rounded-xl px-5 py-4">
                <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--surface-dark-muted)' }}>Контур данных</div>
                <div className="mt-2 text-sm leading-6" style={{ color: 'var(--surface-dark-text)' }}>
                  Восстановленный PostgreSQL-дамп, реальные сотрудники, документы, KPI и история постановки целей.
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                  <div className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-quaternary)' }}>Методика</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>SMART, релевантность роли и квартальный контекст.</div>
                </div>
                <div className="rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                  <div className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-quaternary)' }}>Сценарий</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Оценка, подготовка, согласование и аналитика.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card px-5 py-4 text-center"
          >
            <div className="text-2xl font-semibold" style={{ color: 'var(--fg-brand-primary)' }}>{s.value}</div>
            <div className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Feature cards */}
      <div>
        <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Модули системы</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {features.map((f) => (
            <Link key={f.name} to={f.href}
              className="card group flex items-start gap-4 p-5 transition-all duration-100"
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-brand-secondary)'; e.currentTarget.style.boxShadow = '0px 4px 6px -1px rgba(10,13,18,0.07)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; e.currentTarget.style.boxShadow = '0px 1px 2px rgba(10,13,18,0.05)' }}
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
        <div className="card p-5"
        >
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
        <div className="card p-5"
        >
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
