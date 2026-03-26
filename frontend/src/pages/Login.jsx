import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import KmgLogo from '../components/KmgLogo'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login(email, password)
      if (data.must_change_password) {
        navigate('/change-password')
      } else {
        navigate('/')
      }
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(detail || 'Ошибка входа. Проверьте email и пароль.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <div className="w-full max-w-sm rounded-2xl p-8" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="gradient-brand flex h-12 w-12 items-center justify-center rounded-xl" style={{ boxShadow: '0px 1px 2px rgba(10,13,18,0.10)' }}>
            <KmgLogo className="h-6 w-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Performance Goals</h1>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>КМГ-КУМКОЛЬ</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'var(--bg-error-secondary)', color: 'var(--text-error-primary)' }}>
              {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
              placeholder="Введите пароль"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="gradient-brand w-full rounded-lg py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60"
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
