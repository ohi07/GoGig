import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import logo from '../assets/logo.png'

/**
 * Navigation bar.  Displays a logo on the left and a series of links on
 * the right that change depending on whether the user is logged in and
 * their role.  Logged out users see login/sign up buttons.  Clients
 * see a link to post a job.  Admins see an admin link.  All
 * authenticated users see a dashboard link and a logout button.
 */
export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const { theme, setTheme } = useTheme()

  // Track unread direct messages count
  const [dmCount, setDmCount] = React.useState(0)
  const [notifCount, setNotifCount] = React.useState(0)

  // Poll unread DM count every 8 seconds when logged in
  React.useEffect(() => {
    let interval
    async function fetchUnread() {
      try {
        const token = localStorage.getItem('token')
        if (!token) {
          setDmCount(0)
          return
        }
        const res = await fetch('/api/dm/unreadCount', {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json()
        if (res.ok) {
          setDmCount(data.count || 0)
        }
      } catch (err) {
        // ignore errors
      }
    }
    if (user) {
      fetchUnread()
      interval = setInterval(fetchUnread, 8000)
    } else {
      setDmCount(0)
    }
    return () => clearInterval(interval)
  }, [user])

  // Track unread notifications count
  React.useEffect(() => {
    let interval
    async function fetchNotifUnread() {
      try {
        const token = localStorage.getItem('token')
        if (!token) {
          setNotifCount(0)
          return
        }
        const res = await fetch('/api/notifications/unreadCount', {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json()
        if (res.ok) {
          setNotifCount(data.count || 0)
        }
      } catch (err) {
        // ignore errors
      }
    }
    if (user) {
      fetchNotifUnread()
      interval = setInterval(fetchNotifUnread, 8000)
    } else {
      setNotifCount(0)
    }
    return () => clearInterval(interval)
  }, [user])

  // Cycle through available themes (light → dark → night → back to light)
  function cycleTheme() {
    const themes = ['light', 'dark', 'night']
    const current = themes.indexOf(theme)
    const next = (current + 1) % themes.length
    setTheme(themes[next])
  }

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <header className='header-glass sticky top-0 z-50 shadow-sm'>
      <div className='container flex items-center justify-between py-4'>
        <Link to='/' className='flex items-center gap-3'>
          <img src={logo} alt='GoGig logo' className='w-10 h-10 rounded' />
          <span className='text-2xl font-semibold' style={{ color: 'var(--text)' }}>GoGig</span>
        </Link>
        <nav aria-label='Main navigation' className='flex flex-wrap items-center justify-end gap-x-4 gap-y-2'>
          <Link to='/explore' className='nav-link'>Explore</Link>
          {user && user.role === 'client' && (
            <Link to='/gigs/create' className='nav-link'>Post a Job</Link>
          )}
          {user && user.role === 'admin' && (
            <Link to='/admin' className='nav-link'>Admin</Link>
          )}
          {user && user.moderator && user.role !== 'admin' && (
            <Link to='/admin' className='nav-link'>Moderate</Link>
          )}
          {user && (
            <>
              <Link to='/dashboard' className='nav-link'>Dashboard</Link>
              <Link to='/orders' className='nav-link'>Orders</Link>
            </>
          )}
          {!user && (
            <>
              <Link to='/login' className='nav-link'>Log in</Link>
              <Link
                to='/signup'
                className='ml-2 px-3 py-1 rounded'
                style={{ backgroundColor: 'var(--primary)', color: '#ffffff' }}
              >
                Get Started
              </Link>
            </>
          )}
          {user && (
            <>
              {/* Inbox link shows unread DM count */}
              <Link to='/inbox' className='nav-link relative'>
                Inbox
                {dmCount > 0 && (
                  <span
                    className='absolute -top-1 -right-3 text-xs rounded-full px-1'
                    style={{ backgroundColor: 'red', color: '#fff' }}
                  >
                    {dmCount}
                  </span>
                )}
              </Link>
              {/* Notifications link shows unread notification count */}
              <Link to='/notifications' className='nav-link relative'>
                Notifications
                {notifCount > 0 && (
                  <span
                    className='absolute -top-1 -right-3 text-xs rounded-full px-1'
                    style={{ backgroundColor: 'red', color: '#fff' }}
                  >
                    {notifCount}
                  </span>
                )}
              </Link>
              {/* Support tickets link */}
              <Link to='/tickets' className='nav-link'>Support</Link>
              {/* Profile link */}
              <Link to={`/profile/${user.id}`} className='nav-link'>
                Profile
              </Link>
              <button
                onClick={handleLogout}
                className='ml-2 px-3 py-1 rounded'
                style={{ backgroundColor: 'var(--card-bg)', color: 'var(--text)' }}
              >
                Logout
              </button>
            </>
          )}
          {/* Theme toggle: cycles through light/dark/night */}
          <button
            onClick={cycleTheme}
            className='ml-2 px-3 py-1 rounded'
            style={{ backgroundColor: 'var(--card-bg)', color: 'var(--text)' }}
            title={`Switch theme (current: ${theme})`}
          >
            {theme === 'light' && '☀'}
            {theme === 'dark' && '🌙'}
            {theme === 'night' && '🌓'}
          </button>
        </nav>
      </div>
    </header>
  )
}