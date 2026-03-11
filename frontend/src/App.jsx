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
    <div className="flex min-h-screen bg-transparent">
      <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-800 bg-slate-950 text-slate-100">
        <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <KmgLogo className="h-7 w-7 text-slate-100" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-white">Performance Goals</div>
            <div className="text-[11px] leading-tight text-slate-400">КМГ-КУМКОЛЬ</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/'}
              className={({ isActive }) =>
                [
                  'group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium cursor-pointer transition-colors duration-150',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={`h-[18px] w-[18px] flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-200'}`} />
                  <span>{item.name}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 px-4 py-4">
          <div className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200">
            Рабочая база: mock_smart
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/10 text-xs font-semibold text-slate-100">
              HR
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">HR Admin</div>
              <div className="text-xs text-slate-400">Администратор платформы</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col pl-64">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/75 px-8 backdrop-blur">
          <div>
            <h1 className="text-base font-semibold text-slate-900">{currentTitle}</h1>
            <div className="text-xs text-slate-500">Модуль управления качеством целеполагания</div>
          </div>
          <div className="hidden rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 md:block">
            PostgreSQL • FastAPI • React
          </div>
        </header>

        <main className="flex-1 p-8">
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
