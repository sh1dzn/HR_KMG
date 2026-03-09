import { Link } from 'react-router-dom'
import {
  ClipboardDocumentCheckIcon,
  SparklesIcon,
  ChartBarIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline'

const features = [
  {
    name: 'Оценка целей (SMART)',
    description: 'Автоматическая оценка целей по методологии SMART с рекомендациями по улучшению',
    href: '/evaluation',
    icon: ClipboardDocumentCheckIcon,
    color: 'bg-blue-500',
  },
  {
    name: 'Генерация целей',
    description: 'AI-генерация целей на основе ВНД, стратегии и должности сотрудника',
    href: '/generation',
    icon: SparklesIcon,
    color: 'bg-purple-500',
  },
  {
    name: 'Дашборд качества',
    description: 'Аналитика качества целеполагания по подразделениям и кварталам',
    href: '/dashboard',
    icon: ChartBarIcon,
    color: 'bg-green-500',
  },
  {
    name: 'Цели сотрудников',
    description: 'Просмотр и управление целями сотрудников компании',
    href: '/employees',
    icon: UserGroupIcon,
    color: 'bg-orange-500',
  },
]

export default function Home() {
  return (
    <div>
      {/* Hero section */}
      <div className="bg-white rounded-xl shadow-sm p-8 mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          HR AI Module
        </h1>
        <p className="text-lg text-gray-600 max-w-3xl">
          Интеллектуальная система управления целями сотрудников. Оценивайте цели по SMART,
          генерируйте новые на основе стратегии компании и отслеживайте качество целеполагания
          в реальном времени.
        </p>
      </div>

      {/* Features grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {features.map((feature) => (
          <Link
            key={feature.name}
            to={feature.href}
            className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start">
              <div className={`${feature.color} p-3 rounded-lg`}>
                <feature.icon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {feature.name}
                </h3>
                <p className="mt-1 text-gray-600">
                  {feature.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick stats placeholder */}
      <div className="mt-8 bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Быстрая статистика
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-primary-600">8</div>
            <div className="text-sm text-gray-600">Подразделений</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-primary-600">58</div>
            <div className="text-sm text-gray-600">Сотрудников</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-primary-600">150+</div>
            <div className="text-sm text-gray-600">Целей</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-green-600">0.75</div>
            <div className="text-sm text-gray-600">Средний SMART</div>
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-blue-800 mb-2">
          О проекте
        </h3>
        <p className="text-blue-700">
          Данный модуль разработан в рамках хакатона "Внедрение ИИ в HR-процессы".
          Система использует GPT-4 для оценки и генерации целей, RAG-pipeline для
          работы с внутренними нормативными документами (ВНД) и ChromaDB для
          векторного поиска.
        </p>
      </div>
    </div>
  )
}
