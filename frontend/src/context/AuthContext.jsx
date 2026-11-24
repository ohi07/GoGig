import React, { createContext, useContext, useEffect, useState } from 'react'

// A simple authentication context that stores the current logged‑in user and
// exposes helpers to register, log in and log out.  It persists the
// authentication token in localStorage so the session is restored on
// refresh.  This context relies on the backend API endpoints defined in
// ../backend/server.js.

const AuthContext = createContext({})

// Provider component to wrap the application.  It will attempt to fetch
// the currently logged in user on mount if a token is present in
// localStorage.  While fetching, `loading` will be true so pages can
// display a spinner if desired.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Attempt to load the current user from the token stored in
  // localStorage.  If there is no token then loading finishes quickly.
  useEffect(() => {
    async function load() {
      const token = localStorage.getItem('token')
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          setUser(data)
        } else {
          // token might be invalid or expired
          localStorage.removeItem('token')
          setUser(null)
        }
      } catch (err) {
        // ignore fetch errors
        localStorage.removeItem('token')
        setUser(null)
      }
      setLoading(false)
    }
    load()
  }, [])

  // Helper to register a new user.  Accepts name, email, password and
  // role ('client', 'freelancer' or 'admin').  On success stores the
  // token and user and returns null.  On failure returns an error
  // message.
  async function register({ name, email, password, role, age, skills, education, company, about }) {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          age,
          skills,
          education,
          company,
          about
        })
      })
      const data = await res.json()
      if (!res.ok) {
        return data.error || 'Registration failed'
      }
      localStorage.setItem('token', data.token)
      setUser(data.user)
      return null
    } catch (err) {
      return 'Registration failed'
    }
  }

  // Helper to log in.  Accepts email and password.  On success stores
  // token and user and returns null; on failure returns an error message.
  async function login({ email, password }) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!res.ok) {
        return data.error || 'Login failed'
      }
      localStorage.setItem('token', data.token)
      setUser(data.user)
      return null
    } catch (err) {
      return 'Login failed'
    }
  }

  // Helper to log out.  Clears token and user state.
  function logout() {
    const token = localStorage.getItem('token')
    if (token) {
      void fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
    }
    localStorage.removeItem('token')
    setUser(null)
  }

  // Helper to update the current user's profile.  Accepts partial
  // updates for name, age, skills, education, company and about.
  // On success updates the local user state and returns null.
  // On failure returns an error message.
  async function updateProfile(updates) {
    const token = localStorage.getItem('token')
    if (!token) return 'Not authenticated'
    try {
      const res = await fetch('/api/users/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      })
      const data = await res.json()
      if (!res.ok) {
        return data.error || 'Profile update failed'
      }
      // Merge returned profile into current user state
      setUser((prev) => (prev ? { ...prev, ...data } : prev))
      return null
    } catch (err) {
      return 'Profile update failed'
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

// Convenience hook to access auth context
export function useAuth() {
  return useContext(AuthContext)
}