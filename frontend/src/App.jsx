import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import {
  HomeIcon,
  ClipboardDocumentCheckIcon,
  SparklesIcon,
  ChartBarIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import GoalEvaluation from './pages/GoalEvaluation'
import GoalGeneration from './pages/GoalGeneration'
import Dashboard from './pages/Dashboard'
import EmployeeGoals from './pages/EmployeeGoals'
import Home from './pages/Home'
import KmgLogo from './components/KmgLogo'

const navigation = [
  { name: 'Главная', href: '/', icon: HomeIcon },
  { name: 'Оценка целей', href: '/evaluation', icon: ClipboardDocumentCheckIcon },
  { name: 'Генерация целей', href: '/generation', icon: SparklesIcon },
  { name: 'Дашборд', href: '/dashboard', icon: ChartBarIcon },
  { name: 'Сотрудники', href: '/employees', icon: UserGroupIcon },
]

const pageTitles = {
  '/': 'Главная',
  '/evaluation': 'Оценка целей',
  '/generation': 'Генерация целей',
  '/dashboard': 'Дашборд',
  '/employees': 'Цели сотрудников',
}

function App() {
  const location = useLocation()
  const currentTitle = pageTitles[location.pathname] || 'HR AI Module'

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-gray-200 bg-white">
        <div className="flex items-center gap-2.5 px-5 h-14 border-b border-gray-200">
          <KmgLogo className="h-8 w-8 text-primary-600" />
          <div>
            <div className="text-sm font-semibold text-gray-900 leading-tight">HR AI Module</div>
            <div className="text-[11px] text-gray-400 leading-tight">КМГ-КУМКОЛЬ</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/'}
              className={({ isActive }) =>
                [
                  'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium cursor-pointer transition-colors duration-150',
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={`h-[18px] w-[18px] flex-shrink-0 ${isActive ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-600'}`} />
                  <span>{item.name}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-gray-200">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
              HR
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">HR Admin</div>
              <div className="text-xs text-gray-400">Администратор</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col pl-60">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
          <h1 className="text-base font-semibold text-gray-900">{currentTitle}</h1>
        </header>

        <main className="flex-1 p-6">
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
