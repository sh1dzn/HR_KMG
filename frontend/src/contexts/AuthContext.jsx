import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import client from '../api/client'

const AuthContext = createContext(null)

// Module-level access token storage (not in localStorage for security)
let accessToken = null

export function getAccessToken() {
  return accessToken
}

export function setAccessToken(token) {
  accessToken = token
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const isAuthenticated = !!user
  const role = user?.role || null

  const logout = useCallback(async () => {
    try {
      await client.post('/auth/logout')
    } catch {
      // ignore errors on logout
    }
    setAccessToken(null)
    setUser(null)
  }, [])

  const refreshToken = useCallback(async () => {
    try {
      const res = await client.post('/auth/refresh', null, { withCredentials: true })
      setAccessToken(res.data.access_token)
      const me = await client.get('/auth/me', {
        headers: { Authorization: `Bearer ${res.data.access_token}` },
      })
      setUser(me.data)
      return true
    } catch {
      setAccessToken(null)
      setUser(null)
      return false
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await client.post('/auth/login', { email, password }, { withCredentials: true })
    setAccessToken(res.data.access_token)
    setUser(res.data.user)
    return res.data
  }, [])

  // On mount: try silent refresh
  useEffect(() => {
    refreshToken().finally(() => setLoading(false))
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
