import { Link } from 'react-router-dom'
import {
  ClipboardDocumentCheckIcon,
  SparklesIcon,
  ChartBarIcon,
  UserGroupIcon,
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
  { value: '58', label: 'Сотрудников' },
  { value: '150+', label: 'Целей' },
  { value: '0.75', label: 'Средний SMART' },
]

export default function Home() {
  return (
    <div className="animate-fade-in space-y-6">
      {/* Welcome banner */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-xs p-6">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">
          HR AI Module
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">
          Интеллектуальная система управления целями сотрудников. Оценивайте
          цели по SMART, генерируйте новые на основе стратегии компании
          и отслеживайте качество целеполагания в реальном времени.
        </p>
      </div>

      {/* Feature cards */}
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

      {/* Stats row */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          Быстрая статистика
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-white border border-gray-200 rounded-lg shadow-xs py-4 px-3 text-center"
            >
              <div className="text-lg font-semibold text-gray-900">
                {stat.value}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* About section */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-xs p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">О проекте</h3>
        <p className="text-sm text-gray-500 leading-relaxed">
          Данный модуль разработан в рамках хакатона &laquo;Внедрение ИИ
          в HR-процессы&raquo;. Система использует GPT-4 для оценки и генерации
          целей, RAG-pipeline для работы с внутренними нормативными документами
          (ВНД) и ChromaDB для векторного поиска.
        </p>
      </div>
    </div>
  )
}
