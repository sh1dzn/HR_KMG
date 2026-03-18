import { useEffect, useState } from 'react'

const STORAGE_KEY = 'kmg-settings'
const API_BASE = import.meta.env.VITE_API_BASE_URL?.trim()?.replace(/\/+$/, '') || '/api'

const defaultSettings = {
  openaiModel: 'gpt-4o',
  evaluationLanguage: 'ru',
  smartThreshold: 70,
  maxGoalsPerEmployee: 25,
  autoEvaluate: false,
  notificationsEnabled: true,
}

const modelOptions = [
  { value: 'gpt-4o', label: 'GPT-4o', desc: 'Мощная и надёжная — лучшее качество оценки SMART' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Быстрая и экономичная, хорошее качество' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', desc: 'Высокое качество, большой контекст' },
  { value: 'o3-mini', label: 'O3 Mini', desc: 'Reasoning модель — глубокий анализ, медленнее' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', desc: 'Максимальная скорость, базовое качество' },
]

const languageOptions = [
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
  { value: 'kk', label: 'Қазақша' },
]

function SettingsSection({ title, description, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        {description && <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>{description}</p>}
      </div>
      <div className="px-6 py-5 space-y-5">
        {children}
      </div>
    </div>
  )
}

function FieldRow({ label, description, children }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="sm:w-1/3 flex-shrink-0">
        <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</div>
        {description && <div className="mt-0.5 text-xs" style={{ color: 'var(--text-quaternary)' }}>{description}</div>}
      </div>
      <div className="sm:w-2/3">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 ease-in-out"
      style={{
        backgroundColor: checked ? 'var(--bg-brand-solid, #1570EF)' : 'var(--bg-tertiary, #E4E7EC)',
      }}
    >
      <span
        className="inline-block h-5 w-5 rounded-full shadow-sm transition-transform duration-200 ease-in-out"
        style={{
          backgroundColor: '#fff',
          transform: checked ? 'translateX(20px) translateY(2px)' : 'translateX(2px) translateY(2px)',
        }}
      />
    </button>
  )
}

export default function Settings() {
  const [settings, setSettings] = useState(defaultSettings)
  const [saved, setSaved] = useState(false)
  const [serverInfo, setServerInfo] = useState(null)

  const validModels = modelOptions.map(m => m.value)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = { ...defaultSettings, ...JSON.parse(stored) }
        // Reset model if it's not in the valid list
        if (!validModels.includes(parsed.openaiModel)) {
          parsed.openaiModel = defaultSettings.openaiModel
        }
        setSettings(parsed)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
      }
    } catch {}
    // Load server health info
    fetch(API_BASE.replace('/api', '') + '/health')
      .then(r => r.json())
      .then(d => setServerInfo(d))
      .catch(() => {})
  }, [])

  const update = (key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
    setSaved(false)
  }

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Настройки</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Конфигурация AI-модели, параметров оценки и уведомлений.
        </p>
      </div>

      {/* AI Model */}
      <SettingsSection title="AI Модель" description="Предпочтительная модель OpenAI для оценки и генерации целей">
        <FieldRow label="Модель" description="Влияет на качество и скорость оценки">
          <div className="space-y-2">
            {modelOptions.map((m) => (
              <label key={m.value}
                className="flex items-start gap-3 rounded-lg px-4 py-3 cursor-pointer transition-colors"
                style={{
                  border: `1.5px solid ${settings.openaiModel === m.value ? 'var(--fg-brand-primary, #1570EF)' : 'var(--border-secondary)'}`,
                  backgroundColor: settings.openaiModel === m.value ? 'var(--bg-brand-primary, #EFF8FF)' : 'var(--bg-primary)',
                }}
              >
                <input
                  type="radio" name="model" value={m.value}
                  checked={settings.openaiModel === m.value}
                  onChange={() => update('openaiModel', m.value)}
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  style={{ accentColor: 'var(--fg-brand-primary)' }}
                />
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.label}</div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{m.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </FieldRow>
      </SettingsSection>

      {/* Evaluation */}
      <SettingsSection title="Оценка целей" description="Параметры SMART-оценки и пороговые значения">
        <FieldRow label="Язык оценки" description="На каком языке AI анализирует цели">
          <select
            className="select-field w-full sm:w-48"
            value={settings.evaluationLanguage}
            onChange={(e) => update('evaluationLanguage', e.target.value)}
          >
            {languageOptions.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </FieldRow>

        <div style={{ height: '1px', backgroundColor: 'var(--border-secondary)' }} />

        <FieldRow label="Порог SMART-индекса" description="Минимальный проходной балл (%)">
          <div className="flex items-center gap-4">
            <input
              type="range" min="30" max="95" step="5"
              value={settings.smartThreshold}
              onChange={(e) => update('smartThreshold', +e.target.value)}
              className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: 'var(--fg-brand-primary)' }}
            />
            <span className="w-12 text-center text-sm font-semibold rounded-lg px-2 py-1"
              style={{
                backgroundColor: settings.smartThreshold >= 70 ? 'var(--bg-success-primary, #ECFDF3)' : 'var(--bg-warning-primary, #FFFAEB)',
                color: settings.smartThreshold >= 70 ? 'var(--text-success-primary, #039855)' : 'var(--text-warning-primary, #DC6803)',
              }}
            >
              {settings.smartThreshold}%
            </span>
          </div>
        </FieldRow>

        <div style={{ height: '1px', backgroundColor: 'var(--border-secondary)' }} />

        <FieldRow label="Макс. целей на сотрудника" description="Рекомендуемый лимит для пакетной оценки">
          <input
            type="number" min="1" max="50"
            className="input-field w-24"
            value={settings.maxGoalsPerEmployee}
            onChange={(e) => update('maxGoalsPerEmployee', Math.max(1, Math.min(50, +e.target.value)))}
          />
        </FieldRow>

        <div style={{ height: '1px', backgroundColor: 'var(--border-secondary)' }} />

        <FieldRow label="Авто-оценка при импорте" description="Автоматически оценивать новые цели">
          <Toggle checked={settings.autoEvaluate} onChange={(v) => update('autoEvaluate', v)} />
        </FieldRow>
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection title="Уведомления" description="Управление оповещениями системы">
        <FieldRow label="Включить уведомления" description="Показывать оповещения о workflow-событиях">
          <Toggle checked={settings.notificationsEnabled} onChange={(v) => update('notificationsEnabled', v)} />
        </FieldRow>
      </SettingsSection>

      {/* API Info */}
      <SettingsSection title="API и система" description="Информация о подключении к серверу">
        <FieldRow label="API Endpoint">
          <div className="flex items-center gap-2">
            <code className="text-sm px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              {window.location.origin}/api
            </code>
            {serverInfo ? (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ backgroundColor: 'var(--bg-success-primary, #ECFDF3)', color: 'var(--text-success-primary, #039855)' }}
              >
                <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--fg-success-primary, #039855)' }} />
                Подключено
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-quaternary)' }}
              >
                Проверка...
              </span>
            )}
          </div>
        </FieldRow>

        <div style={{ height: '1px', backgroundColor: 'var(--border-secondary)' }} />

        <FieldRow label="Сервер">
          <div className="space-y-1.5">
            {serverInfo ? (
              <>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{serverInfo.service} v{serverInfo.version}</div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: serverInfo.checks?.openai_configured ? 'var(--bg-success-primary, #ECFDF3)' : 'var(--bg-error-primary, #FEF3F2)',
                      color: serverInfo.checks?.openai_configured ? 'var(--text-success-primary, #039855)' : 'var(--fg-error-secondary, #D92D20)',
                    }}
                  >
                    OpenAI: {serverInfo.checks?.openai_configured ? 'настроен' : 'не настроен'}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: serverInfo.checks?.database === 'ok' ? 'var(--bg-success-primary, #ECFDF3)' : 'var(--bg-error-primary, #FEF3F2)',
                      color: serverInfo.checks?.database === 'ok' ? 'var(--text-success-primary, #039855)' : 'var(--fg-error-secondary, #D92D20)',
                    }}
                  >
                    БД: {serverInfo.checks?.database === 'ok' ? 'ок' : 'ошибка'}
                  </span>
                  {serverInfo.checks?.chroma_chunks != null && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-quaternary)' }}
                    >
                      ChromaDB: {serverInfo.checks.chroma_chunks} чанков
                    </span>
                  )}
                </div>
              </>
            ) : (
              <span className="text-sm" style={{ color: 'var(--text-quaternary)' }}>Загрузка...</span>
            )}
          </div>
        </FieldRow>
      </SettingsSection>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} className="btn-primary" style={{ padding: '9px 20px' }}>
          Сохранить настройки
        </button>
        {saved && (
          <span className="text-sm font-medium" style={{ color: 'var(--text-success-primary, #039855)' }}>
            Сохранено
          </span>
        )}
      </div>
    </div>
  )
}
