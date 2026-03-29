import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import client from '../api/client'

const AuthContext = createContext(null)

const TOKEN_KEY = 'kmg-access-token'
const USER_KEY = 'kmg-user'

// Module-level access token with localStorage persistence
let accessToken = localStorage.getItem(TOKEN_KEY)

export function getAccessToken() {
  return accessToken
}

export function setAccessToken(token) {
  accessToken = token
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

function getSavedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveUser(user) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(USER_KEY)
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getSavedUser)
  const [loading, setLoading] = useState(!accessToken)

  const isAuthenticated = !!user
  const role = user?.role || null

  const logout = useCallback(async () => {
    try {
      await client.post('/auth/logout')
    } catch {
      // ignore errors on logout
    }
    setAccessToken(null)
    saveUser(null)
    setUser(null)
  }, [])

  const refreshToken = useCallback(async () => {
    try {
      const res = await client.post('/auth/refresh', null, { withCredentials: true })
      setAccessToken(res.data.access_token)
      const me = await client.get('/auth/me', {
        headers: { Authorization: `Bearer ${res.data.access_token}` },
      })
      saveUser(me.data)
      setUser(me.data)
      return true
    } catch {
      setAccessToken(null)
      saveUser(null)
      setUser(null)
      return false
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await client.post('/auth/login', { email, password }, { withCredentials: true })
    setAccessToken(res.data.access_token)
    saveUser(res.data.user)
    setUser(res.data.user)
    return res.data
  }, [])

  // On mount: if we have a saved token, verify it; otherwise try cookie refresh
  useEffect(() => {
    if (accessToken) {
      client.get('/auth/me')
        .then(res => { saveUser(res.data); setUser(res.data) })
        .catch(() => refreshToken())
        .finally(() => setLoading(false))
    } else {
      refreshToken().finally(() => setLoading(false))
    }
  }, [refreshToken])

  const value = {
    user,
    role,
    isAuthenticated,
    loading,
    login,
    logout,
    refreshToken,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
