import { useEffect, useState } from 'react'

const thinkingSteps = {
  generate: [
    { icon: 'search', text: 'Анализ профиля сотрудника...' },
    { icon: 'doc', text: 'Поиск релевантных документов ВНД...' },
    { icon: 'brain', text: 'Формирование контекста...' },
    { icon: 'spark', text: 'Генерация формулировок SMART...' },
    { icon: 'check', text: 'Проверка качества и уникальности...' },
  ],
  evaluate: [
    { icon: 'search', text: 'Анализ формулировки цели...' },
    { icon: 'brain', text: 'Проверка SMART-критериев...' },
    { icon: 'chart', text: 'Расчёт индекса качества...' },
    { icon: 'spark', text: 'Подготовка рекомендаций...' },
  ],
}

const icons = {
  search: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  doc: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  brain: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
    </svg>
  ),
  spark: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  check: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  chart: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
}

export default function AIThinking({ mode = 'generate' }) {
  const steps = thinkingSteps[mode] || thinkingSteps.generate
  const [activeStep, setActiveStep] = useState(0)
  const [dots, setDots] = useState('')

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setActiveStep(prev => (prev + 1) % steps.length)
    }, 3000)
    return () => clearInterval(stepInterval)
  }, [steps.length])

  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.')
    }, 400)
    return () => clearInterval(dotInterval)
  }, [])

  return (
    <div className="card overflow-hidden">
      {/* Header with pulsing brain */}
      <div className="px-6 py-5 text-center" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
        <div className="inline-flex items-center justify-center mb-4">
          <div className="relative">
            {/* Outer pulse ring */}
            <div className="absolute inset-0 rounded-full animate-ping opacity-20"
              style={{ backgroundColor: 'var(--fg-brand-primary)', animationDuration: '2s' }}
            />
            {/* Middle glow */}
            <div className="absolute -inset-2 rounded-full opacity-10 animate-pulse"
              style={{ backgroundColor: 'var(--fg-brand-primary)', animationDuration: '3s' }}
            />
            {/* Icon container */}
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: 'var(--bg-brand-primary)', border: '2px solid var(--fg-brand-primary)' }}
            >
              <svg className="h-7 w-7 animate-pulse" style={{ color: 'var(--fg-brand-primary)' }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.5v1h2a3 3 0 0 1 3 3v1a2 2 0 0 1-2 2h-1v2a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3v-2H7a2 2 0 0 1-2-2v-1a3 3 0 0 1 3-3h2v-1A4.5 4.5 0 0 1 8 6a4 4 0 0 1 4-4z"/>
                <circle cx="9" cy="13" r="0.5" fill="currentColor"/>
                <circle cx="15" cy="13" r="0.5" fill="currentColor"/>
                <path d="M10 16.5c0 .8.9 1.5 2 1.5s2-.7 2-1.5"/>
              </svg>
            </div>
          </div>
        </div>
        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          {mode === 'evaluate' ? 'AI анализирует цель' : 'AI генерирует цели'}
        </h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          {mode === 'evaluate'
            ? 'Модель проверяет формулировку по SMART-критериям'
            : 'Модель анализирует документы и формирует предложения'
          }
        </p>
      </div>

      {/* Steps */}
      <div className="px-6 py-5">
        <div className="space-y-3">
          {steps.map((step, i) => {
            const isActive = i === activeStep
            const isPast = i < activeStep

            return (
              <div key={i}
                className="flex items-center gap-3 rounded-lg px-4 py-2.5 transition-all duration-500"
                style={{
                  backgroundColor: isActive ? 'var(--bg-brand-primary)' : isPast ? 'var(--bg-secondary)' : '',
                  border: isActive ? '1px solid var(--border-brand-secondary)' : '1px solid transparent',
                  opacity: isActive ? 1 : isPast ? 0.5 : 0.35,
                }}
              >
                <span className={isActive ? 'animate-pulse' : ''} style={{
                  color: isActive ? 'var(--fg-brand-primary)' : isPast ? 'var(--fg-success-primary)' : 'var(--fg-quaternary)',
                }}>
                  {isPast ? (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : icons[step.icon]}
                </span>
                <span className="text-sm font-medium" style={{
                  color: isActive ? 'var(--text-brand-primary)' : isPast ? 'var(--text-tertiary)' : 'var(--text-quaternary)',
                }}>
                  {step.text}{isActive ? dots : ''}
                </span>
              </div>
            )
          })}
        </div>

        {/* Progress bar */}
        <div className="mt-5 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <div
            className="h-1 rounded-full transition-all duration-[3000ms] ease-linear"
            style={{
              backgroundColor: 'var(--fg-brand-primary)',
              width: `${((activeStep + 1) / steps.length) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  )
}
