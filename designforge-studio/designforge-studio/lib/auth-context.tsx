'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

export interface AuthUser {
  id: string
  name: string
  email: string
  avatar?: string
  role: 'user' | 'admin'
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password?: string) => Promise<{ ok: boolean; error?: string }>
  register: (name: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  loginWithGoogle: () => void
  logout: () => void
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => ({ ok: false }),
  register: async () => ({ ok: false }),
  loginWithGoogle: () => {},
  logout: () => {},
  isAdmin: false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Verify session on mount using HTTP-only cookie
  useEffect(() => {
    const verifySession = async () => {
      try {
        const res = await fetch('/api/auth', {
          method: 'GET',
          credentials: 'include', // Include cookies in the request
        })

        if (res.ok) {
          const data = await res.json()
          if (data.success) {
            setUser(data.data.user)
          }
        }
      } catch (error) {
        console.error('Session verification failed:', error)
      } finally {
        setLoading(false)
      }
    }

    verifySession()
  }, [])

  const login = useCallback(async (email: string, password: string = '') => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
        credentials: 'include', // Include cookies in the request and response
      })

      const data = await res.json()
      if (!data.success) return { ok: false, error: data.error }

      // User data is returned, JWT is in HTTP-only cookie
      setUser(data.data.user)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Network error. Please try again.' }
    }
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'signup', name, email, password }),
        credentials: 'include', // Include cookies in the request and response
      })

      const data = await res.json()
      if (!data.success) return { ok: false, error: data.error }

      // User data is returned, JWT is in HTTP-only cookie
      setUser(data.data.user)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Registration failed. Please try again.' }
    }
  }, [])

  const loginWithGoogle = useCallback(() => {
    // In production: redirect to Google OAuth
    // window.location.href = '/api/auth/google'
    console.log('[Auth] Google OAuth — configure GOOGLE_CLIENT_ID in .env')
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth', {
        method: 'DELETE',
        credentials: 'include', // Include cookies
      })
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider value={{
      user, loading,
      login, register, loginWithGoogle, logout,
      isAdmin: user?.role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
