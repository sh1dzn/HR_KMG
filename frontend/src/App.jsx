import { Routes, Route, NavLink } from 'react-router-dom'
import {
  HomeIcon,
  ClipboardDocumentCheckIcon,
  SparklesIcon,
  ChartBarIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline'
import GoalEvaluation from './pages/GoalEvaluation'
import GoalGeneration from './pages/GoalGeneration'
import Dashboard from './pages/Dashboard'
import EmployeeGoals from './pages/EmployeeGoals'
import Home from './pages/Home'

const navigation = [
  { name: 'Главная', href: '/', icon: HomeIcon },
  { name: 'Оценка целей', href: '/evaluation', icon: ClipboardDocumentCheckIcon },
  { name: 'Генерация целей', href: '/generation', icon: SparklesIcon },
  { name: 'Дашборд', href: '/dashboard', icon: ChartBarIcon },
  { name: 'Цели сотрудников', href: '/employees', icon: UserGroupIcon },
]

function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg">
        <div className="flex h-16 items-center justify-center border-b border-gray-200">
          <h1 className="text-xl font-bold text-primary-600">HR AI Module</h1>
        </div>
        <nav className="mt-6 px-3">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 mb-1 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <item.icon className="h-5 w-5 mr-3" />
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 text-center">
            HR AI Module v1.0.0
            <br />
            Хакатон 2026
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="pl-64">
        <header className="bg-white shadow-sm">
          <div className="px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Управление целями сотрудников
            </h2>
          </div>
        </header>

        <main className="p-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/evaluation" element={<GoalEvaluation />} />
            <Route path="/generation" element={<GoalGeneration />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/employees" element={<EmployeeGoals />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default App
