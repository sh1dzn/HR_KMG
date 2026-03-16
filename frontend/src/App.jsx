import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import {
  HomeIcon,
  ClipboardDocumentCheckIcon,
  SparklesIcon,
  ChartBarIcon,
  UserGroupIcon,
  BellAlertIcon,
  Bars3Icon,
  ComputerDesktopIcon,
  MoonIcon,
  SunIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import GoalEvaluation from './pages/GoalEvaluation'
import GoalGeneration from './pages/GoalGeneration'
import Dashboard from './pages/Dashboard'
import EmployeeGoals from './pages/EmployeeGoals'
import Operations from './pages/Operations'
import Home from './pages/Home'
import KmgLogo from './components/KmgLogo'

const navigation = [
  { name: 'Главная', href: '/', icon: HomeIcon },
  { name: 'Оценка целей', href: '/evaluation', icon: ClipboardDocumentCheckIcon },
  { name: 'Генерация целей', href: '/generation', icon: SparklesIcon },
  { name: 'Дашборд', href: '/dashboard', icon: ChartBarIcon },
  { name: 'Сотрудники', href: '/employees', icon: UserGroupIcon },
  { name: 'Операции', href: '/operations', icon: BellAlertIcon },
]

const pageTitles = {
  '/': 'Главная',
  '/evaluation': 'Оценка целей',
  '/generation': 'Генерация целей',
  '/dashboard': 'Дашборд',
  '/employees': 'Цели сотрудников',
  '/operations': 'Операции',
}

function App() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [themeMode, setThemeMode] = useState('system')
  const [systemTheme, setSystemTheme] = useState('light')
  const currentTitle = pageTitles[location.pathname] || 'HR AI Module'
  const resolvedTheme = themeMode === 'system' ? systemTheme : themeMode

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const applySystemTheme = () => {
      setSystemTheme(mq.matches ? 'dark' : 'light')
    }
    applySystemTheme()

    const storedMode = localStorage.getItem('kmg-theme-mode')
    const legacyTheme = localStorage.getItem('kmg-theme')
    if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'system') {
      setThemeMode(storedMode)
    } else if (legacyTheme === 'light' || legacyTheme === 'dark') {
      setThemeMode(legacyTheme)
    } else {
      setThemeMode('system')
    }

    mq.addEventListener('change', applySystemTheme)
    return () => mq.removeEventListener('change', applySystemTheme)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('theme-dark', resolvedTheme === 'dark')
    localStorage.setItem('kmg-theme-mode', themeMode)
  }, [themeMode, resolvedTheme])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const cycleThemeMode = () => {
    const order = ['light', 'system', 'dark']
    const currentIndex = order.indexOf(themeMode)
    const nextMode = order[(currentIndex + 1) % order.length]
    setThemeMode(nextMode)
  }

  const modeMeta = {
    light: { icon: SunIcon, short: 'L', title: 'Light' },
    system: { icon: ComputerDesktopIcon, short: 'A', title: 'System' },
    dark: { icon: MoonIcon, short: 'D', title: 'Dark' },
  }

  const ThemeSwitch = ({ compact = false }) => (
    compact ? (
      <button
        type="button"
        onClick={cycleThemeMode}
        className="theme-switch-mobile"
        title={`Theme: ${modeMeta[themeMode].title}`}
        aria-label={`Theme mode ${modeMeta[themeMode].title}`}
      >
        {(() => {
          const Icon = modeMeta[themeMode].icon
          return <Icon className="h-4 w-4" />
        })()}
        <span className="theme-switch-mobile-label">{modeMeta[themeMode].short}</span>
      </button>
    ) : (
      <div className="theme-switch">
        <button
          type="button"
          onClick={() => setThemeMode('light')}
          className={`theme-mode-btn ${themeMode === 'light' ? 'theme-mode-btn-active' : ''}`}
          title="Светлая тема"
        >
          <SunIcon className="h-4 w-4" />
          <span>Light</span>
        </button>
        <button
          type="button"
          onClick={() => setThemeMode('system')}
          className={`theme-mode-btn ${themeMode === 'system' ? 'theme-mode-btn-active' : ''}`}
          title="Системная тема"
        >
          <ComputerDesktopIcon className="h-4 w-4" />
          <span>System</span>
        </button>
        <button
          type="button"
          onClick={() => setThemeMode('dark')}
          className={`theme-mode-btn ${themeMode === 'dark' ? 'theme-mode-btn-active' : ''}`}
          title="Темная тема"
        >
          <MoonIcon className="h-4 w-4" />
          <span>Dark</span>
        </button>
      </div>
    )
  )

  return (
    <div className="flex min-h-screen bg-transparent">
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Закрыть меню"
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[88vw] flex-col border-r border-slate-800 bg-slate-950 text-slate-100 transition-transform duration-200 ease-out lg:w-64',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <KmgLogo className="h-7 w-7 text-slate-100" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-white">Performance Goals</div>
            <div className="text-[11px] leading-tight text-slate-400">КМГ-КУМКОЛЬ</div>
          </div>
          <button
            type="button"
            aria-label="Закрыть меню"
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
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

      <div className="flex flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
          <div className="px-4 py-3 sm:px-6 lg:flex lg:h-16 lg:items-center lg:justify-between lg:px-8 lg:py-0">
            <div className="lg:hidden">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Открыть меню"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm"
                    onClick={() => setMobileMenuOpen(true)}
                  >
                    <Bars3Icon className="h-5 w-5" />
                  </button>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                      <KmgLogo className="h-5 w-5 text-slate-800" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        KMG Goals
                      </div>
                      <div className="truncate text-sm font-semibold text-slate-900">Performance Goals</div>
                    </div>
                  </div>
                </div>
                <ThemeSwitch compact />
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold text-slate-900">{currentTitle}</h1>
                  <div className="text-xs text-slate-500">Модуль управления качеством целеполагания</div>
                </div>
                <div className="flex-shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  mock_smart
                </div>
              </div>
            </div>

            <div className="hidden lg:block">
              <div>
                <h1 className="text-base font-semibold text-slate-900">{currentTitle}</h1>
                <div className="text-xs text-slate-500">Модуль управления качеством целеполагания</div>
              </div>
            </div>
            <div className="hidden items-center gap-3 md:hidden lg:flex">
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                PostgreSQL • FastAPI • React
              </div>
              <ThemeSwitch />
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/evaluation" element={<GoalEvaluation />} />
            <Route path="/generation" element={<GoalGeneration />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/employees" element={<EmployeeGoals />} />
            <Route path="/operations" element={<Operations />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default App
