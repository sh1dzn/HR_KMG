import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import KmgLogo from '../components/KmgLogo'

/* ── Demo account quick-fill buttons ──────────────────────────────────────── */
const DEMO_ACCOUNTS = [
  { label: 'Администратор', email: 'admin@kmkl.kmg.kz', password: 'KMG2026!', color: 'var(--fg-error-secondary)', icon: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )},
  { label: 'Сотрудник', email: 'employee@kmkl.kmg.kz', password: 'KMG2026!', color: 'var(--fg-brand-primary)', icon: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  )},
]

/* ── Feature showcase cards ───────────────────────────────────────────────── */
const FEATURES = [
  { title: 'SMART-оценка', desc: 'AI анализирует цели по 5 критериям и предлагает улучшения', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )},
  { title: 'RAG-генерация', desc: 'Создание целей на основе внутренних документов компании', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )},
  { title: 'Аналитика', desc: 'Дашборд зрелости, heatmap подразделений, тренды по кварталам', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )},
  { title: 'Workflow', desc: 'Черновик — согласование — утверждение — выполнение', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )},
  { title: 'Предсказание рисков', desc: 'Прогнозирование провала целей по 5 факторам с LLM-объяснением', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )},
  { title: 'Каскадирование', desc: 'Автоматический спуск целей от руководителей к подчинённым', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )},
]

/* ── Mock data for preview ────────────────────────────────────────────────── */
const MOCK_STATS = [
  { label: 'Подразделений', value: '8' },
  { label: 'Сотрудников', value: '450' },
  { label: 'Целей', value: '9 000' },
  { label: 'Документов ВНД', value: '160+' },
]

const MOCK_SMART = [
  { criteria: 'Specific', score: 0.92, label: 'Конкретность' },
  { criteria: 'Measurable', score: 0.45, label: 'Измеримость' },
  { criteria: 'Achievable', score: 0.78, label: 'Достижимость' },
  { criteria: 'Relevant', score: 0.85, label: 'Релевантность' },
  { criteria: 'Time-bound', score: 0.62, label: 'Срочность' },
]

const scoreColor = (s) => {
  if (s >= 0.85) return 'var(--fg-success-primary, #16a34a)'
  if (s >= 0.7) return 'var(--text-warning-primary, #ca8a04)'
  return 'var(--fg-error-secondary, #dc2626)'
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login(email, password)
      if (data.must_change_password) {
        navigate('/change-password')
      } else {
        navigate('/')
      }
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(detail || 'Ошибка входа. Проверьте email и пароль.')
    } finally {
      setLoading(false)
    }
  }

  const fillAccount = (acc) => {
    setEmail(acc.email)
    setPassword(acc.password)
    setError('')
  }

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <div className="mx-auto max-w-6xl px-3 sm:px-4 py-6 sm:py-10">

        {/* ── Top: Logo + Title ──────────────────────────────────── */}
        <div className="mb-5 sm:mb-8 flex flex-col items-center gap-2 sm:gap-3 text-center">
          <div className="gradient-brand flex h-11 w-11 sm:h-14 sm:w-14 items-center justify-center rounded-xl sm:rounded-2xl" style={{ boxShadow: '0px 2px 8px rgba(10,13,18,0.15)' }}>
            <KmgLogo className="h-5 w-5 sm:h-7 sm:w-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold sm:text-3xl" style={{ color: 'var(--text-primary)' }}>HR AI Module</h1>
            <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Управление целями | КМГ-КУМКОЛЬ
            </p>
          </div>
        </div>

        {/* ── Main grid: Login + Preview ─────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">

          {/* ── Login form (first on mobile, left on desktop) ────── */}
          <div className="lg:sticky lg:top-6 h-fit order-first">
            <div className="card p-5 sm:p-8">
              <div className="mb-6 text-center">
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Вход в систему</h2>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>Войдите чтобы увидеть реальные данные</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'var(--bg-error-secondary)', color: 'var(--text-error-primary)' }}>
                    {error}
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Пароль</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
                    placeholder="Введите пароль"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="gradient-brand w-full rounded-lg py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60"
                >
                  {loading ? 'Вход...' : 'Войти'}
                </button>
              </form>

              {/* Demo accounts */}
              <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border-secondary)' }}>
                <div className="mb-3 text-xs font-medium" style={{ color: 'var(--text-quaternary)' }}>Демо-аккаунты:</div>
                <div className="space-y-2">
                  {DEMO_ACCOUNTS.map(acc => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => fillAccount(acc)}
                      className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
                      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-brand-secondary)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-secondary)' }}
                    >
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: acc.color, opacity: 0.15 }}>
                        <span style={{ color: acc.color }}>{acc.icon}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{acc.label}</div>
                        <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{acc.email}</div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
                <div className="mt-3 text-center text-[11px]" style={{ color: 'var(--text-quaternary)' }}>
                  Пароль для всех: <code className="font-mono px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>KMG2026!</code>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right: System preview (below login on mobile) ───── */}
          <div className="space-y-4 animate-fade-in order-last">

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              {MOCK_STATS.map(s => (
                <div key={s.label} className="card px-3 py-3 sm:px-4 sm:py-3.5 text-center">
                  <div className="text-xl sm:text-2xl font-semibold" style={{ color: 'var(--fg-brand-primary)' }}>{s.value}</div>
                  <div className="mt-0.5 text-xs leading-tight" style={{ color: 'var(--text-tertiary)' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* SMART preview */}
            <div className="card p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--fg-brand-primary)' }}>
                  <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>SMART-оценка цели</span>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>(пример)</span>
              </div>
              <div className="mb-3 rounded-lg px-3 py-2 text-xs sm:text-sm" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}>
                "Увеличить продажи на 15% к концу Q2 2026 через внедрение CRM"
              </div>
              <div className="space-y-2">
                {MOCK_SMART.map(item => (
                  <div key={item.criteria} className="flex items-center gap-1.5 sm:gap-3">
                    <span className="w-[72px] sm:w-24 text-[11px] sm:text-xs flex-shrink-0 truncate" style={{ color: 'var(--text-tertiary)' }}>{item.label}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="h-2 rounded-full transition-all" style={{ width: `${item.score * 100}%`, backgroundColor: scoreColor(item.score) }} />
                    </div>
                    <span className="w-8 sm:w-10 text-right text-[11px] sm:text-xs font-semibold" style={{ color: scoreColor(item.score) }}>
                      {(item.score * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <span>Общий балл:</span>
                <span className="font-semibold text-sm" style={{ color: scoreColor(0.72) }}>72%</span>
              </div>
            </div>

            {/* Feature grid */}
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-3">
              {FEATURES.map(f => (
                <div key={f.title} className="card p-2.5 sm:p-4 flex flex-col sm:flex-row items-center sm:items-start gap-1.5 sm:gap-3 text-center sm:text-left">
                  <div className="flex h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--bg-brand-primary)', color: 'var(--fg-brand-primary)' }}>
                    {f.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] sm:text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{f.title}</div>
                    <div className="mt-0.5 text-xs leading-4 hidden sm:block" style={{ color: 'var(--text-tertiary)' }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Workflow preview */}
            <div className="card p-4 sm:p-5">
              <div className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Жизненный цикл цели</div>
              <div className="flex items-center gap-0.5 sm:gap-2 overflow-x-auto pb-1">
                {['Черновик', 'Согласов.', 'Утвержд.', 'В работе', 'Готово'].map((step, i, arr) => (
                  <div key={step} className="flex items-center gap-0.5 sm:gap-2 flex-shrink-0">
                    <div className="rounded-md sm:rounded-lg px-1.5 sm:px-2.5 py-1 sm:py-1.5 text-[9px] sm:text-xs font-medium whitespace-nowrap" style={{
                      backgroundColor: i === 2 ? 'var(--bg-success-primary)' : 'var(--bg-secondary)',
                      color: i === 2 ? 'var(--text-success-primary)' : 'var(--text-secondary)',
                      border: `1px solid ${i === 2 ? 'var(--border-success)' : 'var(--border-secondary)'}`,
                    }}>
                      {step}
                    </div>
                    {i < arr.length - 1 && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tech stack */}
            <div className="card p-4 sm:p-5">
              <div className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Технологии</div>
              <div className="flex flex-wrap gap-1 sm:gap-2">
                {['React', 'FastAPI', 'PostgreSQL', 'ChromaDB', 'GPT-4o', 'Docker', 'Tailwind', 'SQLAlchemy'].map(t => (
                  <span key={t} className="rounded-full px-2 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-xs font-medium" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs" style={{ color: 'var(--text-quaternary)' }}>
          SilkRoadTech | Хакатон КМГ-КУМКОЛЬ 2026
        </div>
      </div>
    </div>
  )
}
