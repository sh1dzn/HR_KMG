import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom'
import GoalEvaluation from './pages/GoalEvaluation'
import GoalGeneration from './pages/GoalGeneration'
import Dashboard from './pages/Dashboard'
import EmployeeGoals from './pages/EmployeeGoals'
import Operations from './pages/Operations'
import Home from './pages/Home'
import Settings from './pages/Settings'
import Approvals from './pages/Approvals'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import KmgLogo from './components/KmgLogo'
import ChatWidget from './components/ChatWidget'
import { getDashboardSummary, getGoals } from './api/client'
import { useAuth } from './contexts/AuthContext'

// SVG Icon components for sidebar navigation
function HomeIcon(props) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}
function BarChartIcon(props) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}
function ChecklistIcon(props) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}
function FolderIcon(props) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}
function PieChartIcon(props) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  )
}
function SettingsIcon(props) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
function ChatIcon(props) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}
function UsersIcon(props) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
function StarIcon(props) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}
function BellIcon(props) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}
// Navigation config with dividers
// Items can use `nameByRole` and `iconByRole` to show role-specific labels/icons
function TargetIcon(props) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  )
}

const navigation = [
  {
    name: 'Главная', href: '/',
    icon: HomeIcon,
    roles: ['employee', 'manager', 'admin'],
  },
  {
    name: 'Мои цели',
    nameByRole: { manager: 'Сотрудники', admin: 'Сотрудники' },
    icon: TargetIcon,
    iconByRole: { manager: UsersIcon, admin: UsersIcon },
    href: '/employees',
    badgeKey: 'employees',
    badgeRoles: ['manager', 'admin'],
    roles: ['employee', 'manager', 'admin'],
    filters: [
      { label: 'Все',              href: '/employees' },
      { label: 'Черновики',        href: '/employees?status=draft',       dot: 'var(--fg-quaternary)' },
      { label: 'На согласовании',  href: '/employees?status=submitted',   dot: 'var(--text-warning-primary)' },
      { label: 'Утверждённые',     href: '/employees?status=approved',    dot: 'var(--fg-success-primary)' },
      { label: 'В работе',         href: '/employees?status=in_progress', dot: 'var(--fg-brand-primary)' },
      { label: 'Выполненные',      href: '/employees?status=done',        dot: 'var(--fg-success-primary)' },
    ],
  },
  {
    name: 'Оценка целей', href: '/evaluation',
    icon: ChecklistIcon,
    roles: ['employee', 'manager', 'admin'],
  },
  {
    name: 'Генерация целей', href: '/generation',
    icon: StarIcon,
    roles: ['employee', 'manager', 'admin'],
  },
  { divider: true },
  {
    name: 'Согласование', href: '/approvals',
    icon: ChecklistIcon,
    badgeKey: 'pending',
    badgeRoles: ['manager', 'admin'],
    roles: ['employee', 'manager', 'admin'],
  },
  {
    name: 'Дашборд', href: '/dashboard',
    icon: BarChartIcon,
    roles: ['manager', 'admin'],
  },
  {
    name: 'Операции', href: '/operations',
    icon: BellIcon,
    roles: ['admin'],
  },
  { divider: true },
  {
    name: 'Настройки', href: '/settings',
    icon: SettingsIcon,
    roles: ['employee', 'manager', 'admin'],
  },
]

const pageTitles = {
  '/': 'Главная',
  '/evaluation': 'Оценка целей',
  '/generation': 'Генерация целей',
  '/dashboard': 'Дашборд',
  '/employees': 'Сотрудники',
  '/operations': 'Операции',
  '/approvals': 'Согласование',
  '/settings': 'Настройки',
}

function SunIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}
function MoonIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}
function MonitorIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}
function MenuIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}
function XIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, loading, user } = useAuth()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.must_change_password) return <Navigate to="/change-password" replace />
  if (allowedRoles) {
    const userRole = user?.role
    if (!allowedRoles.includes(userRole)) return <Navigate to="/" replace />
  }
  return children
}

function App() {
  const { isAuthenticated, loading, user, role, logout } = useAuth()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('kmg-sidebar-collapsed') === 'true')
  const [themeMode, setThemeMode] = useState('system')
  const [sidebarStats, setSidebarStats] = useState({})
  const [systemTheme, setSystemTheme] = useState('light')
  const currentTitle = pageTitles[location.pathname] || 'HR AI Module'
  const resolvedTheme = themeMode === 'system' ? systemTheme : themeMode

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const applySystemTheme = () => setSystemTheme(mq.matches ? 'dark' : 'light')
    applySystemTheme()
    const storedMode = localStorage.getItem('kmg-theme-mode')
    if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'system') {
      setThemeMode(storedMode)
    } else {
      setThemeMode('system')
    }
    mq.addEventListener('change', applySystemTheme)
    return () => mq.removeEventListener('change', applySystemTheme)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', resolvedTheme === 'dark')
    localStorage.setItem('kmg-theme-mode', themeMode)
  }, [themeMode, resolvedTheme])

  useEffect(() => { setMobileMenuOpen(false) }, [location.pathname])

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      localStorage.setItem('kmg-sidebar-collapsed', !prev)
      return !prev
    })
  }

  useEffect(() => {
    Promise.all([
      getDashboardSummary('Q2', 2026),
      getGoals({ status: 'submitted', page: 1, per_page: 1 }),
    ]).then(([d, pending]) => {
      setSidebarStats({
        employees: d.total_employees,
        goals: d.total_goals,
        pending: pending.total || 0,
      })
    }).catch(() => {})
  }, [])

  const modeMeta = {
    light:  { icon: SunIcon,     short: 'L', label: 'Light' },
    system: { icon: MonitorIcon, short: 'A', label: 'Auto' },
    dark:   { icon: MoonIcon,    short: 'D', label: 'Dark' },
  }
  const cycleTheme = () => {
    const order = ['light', 'system', 'dark']
    setThemeMode(order[(order.indexOf(themeMode) + 1) % order.length])
  }

  const ThemeSwitch = ({ compact = false }) => {
    if (compact) {
      return (
        <button type="button" onClick={cycleTheme} className="theme-switch-mobile" aria-label={`Theme: ${modeMeta[themeMode].label}`}>
          {(() => { const Icon = modeMeta[themeMode].icon; return <Icon className="h-3.5 w-3.5" /> })()}
          <span className="theme-switch-mobile-label">{modeMeta[themeMode].short}</span>
        </button>
      )
    }
    return (
      <div className="theme-switch">
        {['light', 'system', 'dark'].map((mode) => {
          const { icon: Icon, label } = modeMeta[mode]
          return (
            <button key={mode} type="button" onClick={() => setThemeMode(mode)}
              className={`theme-mode-btn ${themeMode === mode ? 'theme-mode-btn-active' : ''}`}
              title={label}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    )
  }

  if (!isAuthenticated && !loading) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Закрыть меню"
          className="fixed inset-0 z-40 lg:hidden"
          style={{ backgroundColor: 'rgba(12,17,29,0.48)', backdropFilter: 'blur(2px)' }}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 flex max-w-[88vw] flex-col transition-all duration-200 ease-out lg:translate-x-0',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
          sidebarCollapsed ? 'lg:w-[68px]' : 'lg:w-[280px]',
          'w-[280px]',
        ].join(' ')}
        style={{
          backgroundColor: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--sidebar-border)',
        }}
      >
        {/* Logo area */}
        <div className={`flex h-[64px] flex-shrink-0 items-center ${sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`} style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
          <div className="flex items-center gap-3">
            <div className="gradient-brand flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
              style={{ boxShadow: '0px 1px 2px rgba(10,13,18,0.10)' }}
            >
              <KmgLogo className="h-5 w-5 text-white" />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
                  Performance Goals
                </div>
                <div className="text-xs leading-tight truncate" style={{ color: 'var(--text-tertiary)' }}>
                  КМГ-КУМКОЛЬ
                </div>
              </div>
            )}
          </div>
          {/* Collapse toggle — desktop */}
          {!sidebarCollapsed && (
            <button
              type="button"
              aria-label="Свернуть"
              onClick={toggleSidebar}
              className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md transition-colors"
              style={{ color: 'var(--fg-quaternary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--sidebar-item-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>
              </svg>
            </button>
          )}
          {/* Close — mobile */}
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--fg-quaternary)' }}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {navigation.filter((item) => item.divider || !item.roles || item.roles.includes(role)).map((item, idx) => {
            if (item.divider) {
              return <div key={`divider-${idx}`} className="my-2" style={{ height: '1px', backgroundColor: 'var(--sidebar-border)' }} />
            }

            const Icon = (item.iconByRole && item.iconByRole[role]) || item.icon
            const displayName = (item.nameByRole && item.nameByRole[role]) || item.name
            const showBadge = !item.badgeRoles || item.badgeRoles.includes(role)
            const badgeValue = (item.badgeKey && showBadge) ? sidebarStats[item.badgeKey] : null
            const hasFilters = item.filters && item.filters.length > 0
            const isOnPage = location.pathname === item.href?.split('?')[0]

            return (
              <div key={item.name}>
                <NavLink
                  to={item.href}
                  end={item.href === '/' || hasFilters}
                  className={({ isActive }) => [
                    `flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors duration-100 ease-linear ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'}`,
                    (isActive || (hasFilters && isOnPage)) ? 'sidebar-nav-active' : 'sidebar-nav-item',
                  ].join(' ')}
                  style={({ isActive }) => (isActive || (hasFilters && isOnPage))
                    ? { backgroundColor: 'var(--sidebar-item-active)', color: 'var(--text-brand-primary)' }
                    : { color: 'var(--sidebar-text)' }
                  }
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.classList.contains('sidebar-nav-active')) {
                      e.currentTarget.style.backgroundColor = 'var(--sidebar-item-hover)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!e.currentTarget.classList.contains('sidebar-nav-active')) {
                      e.currentTarget.style.backgroundColor = ''
                    }
                  }}
                >
                  {({ isActive }) => {
                    const active = isActive || (hasFilters && isOnPage)
                    return (
                      <>
                        <span style={{ color: active ? 'var(--text-brand-primary)' : 'var(--fg-quaternary)' }}>
                          <Icon />
                        </span>
                        {!sidebarCollapsed && (
                          <>
                            <span className="flex-1">{displayName}</span>
                            {badgeValue != null && (
                              <span className="rounded-full px-2 py-0.5 text-xs font-medium"
                                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-quaternary)' }}
                              >
                                {badgeValue}
                              </span>
                            )}
                          </>
                        )}
                      </>
                    )
                  }}
                </NavLink>

                {/* Status filter sub-items */}
                {hasFilters && isOnPage && !sidebarCollapsed && (
                  <div className="ml-8 mt-1 space-y-0.5">
                    {item.filters.map((f) => {
                      const currentUrl = location.pathname + location.search
                      const isFilterActive = currentUrl === f.href || (f.href === item.href && currentUrl === item.href)
                      return (
                        <NavLink
                          key={f.href}
                          to={f.href}
                          className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors duration-100"
                          style={{
                            backgroundColor: isFilterActive ? 'var(--sidebar-item-active)' : '',
                            color: isFilterActive ? 'var(--text-brand-primary)' : 'var(--sidebar-text)',
                            fontWeight: isFilterActive ? 500 : 400,
                          }}
                          onMouseEnter={(e) => { if (!isFilterActive) e.currentTarget.style.backgroundColor = 'var(--sidebar-item-hover)' }}
                          onMouseLeave={(e) => { if (!isFilterActive) e.currentTarget.style.backgroundColor = '' }}
                        >
                          {f.dot && <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: f.dot }} />}
                          {f.label}
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className={`flex-shrink-0 py-3 space-y-3 ${sidebarCollapsed ? 'px-2' : 'px-3'}`} style={{ borderTop: '1px solid var(--sidebar-border)' }}>
          {/* Expand button when collapsed */}
          {sidebarCollapsed && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden lg:flex w-full items-center justify-center h-9 rounded-lg transition-colors"
              style={{ color: 'var(--fg-quaternary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--sidebar-item-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
              title="Развернуть"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>
              </svg>
            </button>
          )}
          {!sidebarCollapsed && (
            <>
              <div className="status-success rounded-lg px-3 py-2 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--fg-success-primary)' }} />
                  База: mock_smart
                </div>
              </div>
              <div className="flex items-center gap-3 px-1">
                <div className="gradient-brand flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
                  {user?.employee_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{user?.employee_name || 'User'}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {user?.role === 'admin' ? 'Администратор' : user?.role === 'manager' ? 'Руководитель' : 'Сотрудник'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  title="Выйти"
                  className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                  style={{ color: 'var(--fg-quaternary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--sidebar-item-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </div>
            </>
          )}
          {sidebarCollapsed && (
            <div className="flex justify-center">
              <div className="gradient-brand flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
                {user?.employee_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'U'}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className={`flex min-w-0 flex-1 flex-col transition-all duration-200 ${sidebarCollapsed ? 'lg:pl-[68px]' : 'lg:pl-[280px]'}`}>
        {/* Header */}
        <header
          className="sticky top-0 z-30"
          style={{
            backgroundColor: 'var(--header-bg)',
            borderBottom: '1px solid var(--header-border)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex h-[64px] items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Открыть меню"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
                style={{ border: '1px solid var(--border-secondary)', color: 'var(--fg-secondary)', backgroundColor: 'var(--bg-primary)' }}
              >
                <MenuIcon className="h-4 w-4" />
              </button>
              <div>
                <h1 className="text-base font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
                  {currentTitle}
                </h1>
                <p className="text-xs leading-tight" style={{ color: 'var(--text-tertiary)' }}>
                  Управление качеством целеполагания
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-quaternary)', border: '1px solid var(--border-secondary)' }}
              >
                PostgreSQL · FastAPI · React
              </span>
              <ThemeSwitch compact />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden p-4 sm:p-6 lg:p-8">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/evaluation" element={<ProtectedRoute><GoalEvaluation /></ProtectedRoute>} />
            <Route path="/generation" element={<ProtectedRoute><GoalGeneration /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['manager', 'admin']}><Dashboard /></ProtectedRoute>} />
            <Route path="/employees" element={<ProtectedRoute><EmployeeGoals /></ProtectedRoute>} />
            <Route path="/operations" element={<ProtectedRoute allowedRoles={['admin']}><Operations /></ProtectedRoute>} />
            <Route path="/approvals" element={<ProtectedRoute><Approvals /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          </Routes>
        </main>
      </div>

      {/* AI Chat Widget */}
      <ChatWidget />
    </div>
  )
}

export default App
