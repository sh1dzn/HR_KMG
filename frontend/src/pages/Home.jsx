import { Link } from 'react-router-dom'
import {
  ClipboardDocumentCheckIcon,
  SparklesIcon,
  ChartBarIcon,
  UserGroupIcon,
  DocumentDuplicateIcon,
  BuildingOffice2Icon,
  CheckBadgeIcon,
} from '@heroicons/react/24/outline'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

const features = [
  {
    name: 'Оценка целей (SMART)',
    description:
      'Автоматическая оценка целей по методологии SMART с детальными рекомендациями по улучшению формулировок',
    href: '/evaluation',
    icon: ClipboardDocumentCheckIcon,
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-700',
  },
  {
    name: 'Генерация целей',
    description:
      'Подготовка формулировок на основе внутренних нормативных документов, стратегии компании и роли сотрудника',
    href: '/generation',
    icon: SparklesIcon,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-700',
  },
  {
    name: 'Дашборд качества',
    description:
      'Комплексная аналитика качества целеполагания по подразделениям, кварталам и ключевым метрикам',
    href: '/dashboard',
    icon: ChartBarIcon,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-700',
  },
  {
    name: 'Цели сотрудников',
    description:
      'Централизованный просмотр и управление целями всех сотрудников компании с фильтрацией и поиском',
    href: '/employees',
    icon: UserGroupIcon,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-700',
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
    text: 'Сервис оценки и подготовки формулировок поверх RAG-контекста из ВНД и целей руководителя.',
    icon: BuildingOffice2Icon,
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
      <div className="panel relative overflow-hidden rounded-3xl p-6 sm:p-8">
        <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-slate-900/5 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.5fr_0.95fr]">
          <div>
            <div className="mb-4 inline-flex items-center rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium tracking-wide text-slate-600">
              Corporate Goal Quality Platform
            </div>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950">
              Подсистема качества постановки целей для корпоративного цикла управления эффективностью
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
              Интерфейс собран как рабочая витрина модуля: проверка формулировок,
              подготовка целей по контексту сотрудника, квартальная аналитика и
              единый просмотр целей по подразделениям на базе `mock_smart`.
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

          <div className="grid gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-950 px-5 py-4 text-white">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Контур данных</div>
              <div className="mt-2 text-sm leading-6 text-slate-200">
                Восстановленный PostgreSQL-дамп, реальные сотрудники, документы, KPI и история постановки целей.
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="panel-subtle p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Методика</div>
                <div className="mt-2 text-sm text-slate-700">SMART, релевантность роли и квартальный контекст.</div>
              </div>
              <div className="panel-subtle p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Сценарий</div>
                <div className="mt-2 text-sm text-slate-700">Оценка, подготовка, согласование и аналитика в одном контуре.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {features.map((feature) => (
          <Link
            key={feature.name}
            to={feature.href}
            className="transition-transform duration-150 hover:-translate-y-0.5"
          >
            <Card className="h-full transition-colors hover:border-slate-300">
              <CardHeader className="flex-row items-start gap-3 space-y-0 p-5">
                <span
                  className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${feature.iconBg}`}
                >
                  <feature.icon className={`h-5 w-5 ${feature.iconColor}`} />
                </span>
                <div className="min-w-0">
                  <CardTitle>{feature.name}</CardTitle>
                  <CardDescription className="mt-1">{feature.description}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Масштаб данных</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="text-center">
              <CardContent className="px-3 py-5">
                <div className="text-lg font-semibold text-gray-900">{stat.value}</div>
                <div className="mt-0.5 text-sm text-gray-500">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader className="p-5 pb-0">
            <CardTitle>Функциональный контур</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid gap-2 sm:grid-cols-2">
              {mvpChecklist.map((item) => (
                <div key={item} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm text-slate-700">
                  <CheckBadgeIcon className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 pb-0">
            <CardTitle>Архитектура решения</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="space-y-3">
              {architecture.map((item) => (
                <div key={item.title} className="flex gap-3 rounded-xl border border-slate-200 bg-white/70 px-4 py-3">
                  <item.icon className="mt-0.5 h-5 w-5 flex-none text-slate-700" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                    <div className="text-sm leading-5 text-slate-600">{item.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
