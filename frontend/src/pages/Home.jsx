import { Link } from 'react-router-dom'
import {
  ClipboardDocumentCheckIcon,
  SparklesIcon,
  ChartBarIcon,
  UserGroupIcon,
  DocumentDuplicateIcon,
  CpuChipIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/outline'

const features = [
  {
    name: 'Оценка целей (SMART)',
    description:
      'Автоматическая оценка целей по методологии SMART с детальными рекомендациями по улучшению формулировок',
    href: '/evaluation',
    icon: ClipboardDocumentCheckIcon,
    iconBg: 'bg-primary-100',
    iconColor: 'text-primary-600',
  },
  {
    name: 'Генерация целей',
    description:
      'AI-генерация целей на основе внутренних нормативных документов, стратегии компании и должности сотрудника',
    href: '/generation',
    icon: SparklesIcon,
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
  },
  {
    name: 'Дашборд качества',
    description:
      'Комплексная аналитика качества целеполагания по подразделениям, кварталам и ключевым метрикам',
    href: '/dashboard',
    icon: ChartBarIcon,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
  },
  {
    name: 'Цели сотрудников',
    description:
      'Централизованный просмотр и управление целями всех сотрудников компании с фильтрацией и поиском',
    href: '/employees',
    icon: UserGroupIcon,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
]

const stats = [
  { value: '8', label: 'Подразделений' },
  { value: '420', label: 'Активных сотрудников' },
  { value: '9000', label: 'Целей в дампе' },
  { value: '160', label: 'ВНД и стратегии' },
]

const mvpChecklist = [
  'SMART-оценка одной цели через API',
  'Переформулировка слабой формулировки',
  'Генерация 3-5 целей по роли и ВНД',
  'Источник каждой цели и релевантный фрагмент',
  'Пакетная оценка сотрудника за квартал',
  'Дашборд зрелости целеполагания по подразделениям',
]

const architecture = [
  {
    title: 'Данные',
    text: 'PostgreSQL-дамп mock_smart: сотрудники, цели, документы, проекты, KPI и история событий.',
    icon: DocumentDuplicateIcon,
  },
  {
    title: 'AI-слой',
    text: 'Quality Evaluator и Goal Generator поверх RAG-контекста из ВНД и целей руководителя.',
    icon: CpuChipIcon,
  },
  {
    title: 'MVP-демо',
    text: 'UI для защиты решения: оценка, генерация, аналитика и просмотр целей сотрудников.',
    icon: CheckBadgeIcon,
  },
]

export default function Home() {
  return (
    <div className="animate-fade-in space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-card sm:p-8">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.24),transparent_55%)] lg:block" />
        <div className="relative grid gap-6 lg:grid-cols-[1.6fr_0.9fr]">
          <div>
            <div className="mb-3 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium tracking-wide text-blue-100">
              Hackathon MVP • Performance Management Platform
            </div>
            <h1 className="max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
              AI-слой для постановки, проверки и выравнивания целей сотрудников
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
              Интерфейс собран под сценарий из `hackaton.md`: SMART-оценка,
              генерация целей по ВНД и KPI, каскадирование от руководителя и
              дашборд зрелости целеполагания на реальном PostgreSQL-дампе.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/evaluation" className="btn-primary bg-white text-slate-900 hover:bg-slate-100">
                Проверить цель
              </Link>
              <Link to="/generation" className="btn-secondary border-white/20 bg-white/5 text-white hover:bg-white/10">
                Сгенерировать набор целей
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-300">RAG + LLM</div>
              <div className="mt-2 text-sm text-slate-100">Генерация целей на основе ВНД, стратегии, KPI и контекста роли.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-300">PostgreSQL 18</div>
              <div className="mt-2 text-sm text-slate-100">Работа идет на восстановленном `mock_smart`-дампе, а не на демо-заглушках.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {features.map((feature) => (
          <Link
            key={feature.name}
            to={feature.href}
            className="bg-white border border-gray-200 rounded-lg shadow-xs p-5 transition-shadow duration-150 hover:shadow-card hover:border-gray-300"
          >
            <div className="flex items-start gap-3">
              <span
                className={`flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg ${feature.iconBg}`}
              >
                <feature.icon className={`w-5 h-5 ${feature.iconColor}`} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  {feature.name}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Данные хакатона</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-slate-200 bg-white py-4 px-3 text-center shadow-xs"
            >
              <div className="text-lg font-semibold text-gray-900">{stat.value}</div>
              <div className="text-sm text-gray-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">MVP, который ждут в hackaton.md</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {mvpChecklist.map((item) => (
              <div key={item} className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900">
                <CheckBadgeIcon className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Архитектура защиты</h3>
          <div className="space-y-3">
            {architecture.map((item) => (
              <div key={item.title} className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <item.icon className="mt-0.5 h-5 w-5 flex-none text-slate-700" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                  <div className="text-sm leading-5 text-slate-600">{item.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
