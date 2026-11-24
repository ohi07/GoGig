import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Notifications page.  Shows a list of notification messages separate
 * from direct messages.  Notifications include reactions, comments,
 * review alerts, warnings, bans and ticket updates.  Each
 * notification may include a link to the relevant content; clicking
 * marks the notification as read.  Unauthenticated users are
 * redirected to the login page.
 */
export default function Notifications() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const token = localStorage.getItem('token')
        const res = await fetch('/api/notifications', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const data = await res.json()
        if (res.ok) {
          setNotifications(data)
        } else {
          setError(data.error || 'Unable to load notifications')
        }
      } catch (err) {
        setError('Unable to load notifications')
      }
      setLoading(false)
    }
    if (user) {
      load()
    } else {
      setLoading(false)
      setNotifications([])
    }
  }, [user])

  if (!user) {
    return <p>You need to be logged in to view notifications.</p>
  }
  if (loading) {
    return <p>Loading notifications…</p>
  }
  if (error) {
    return <p className='text-red-500'>{error}</p>
  }

  // Helper to navigate based on linkType and linkId
  function handleNavigate(n) {
    async function markSeen() {
      try {
        const token = localStorage.getItem('token')
        await fetch(`/api/notifications/${n.id}/seen`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch (err) {
        // ignore
      }
    }
    markSeen()
    // Determine route to navigate to
    if (n.linkType === 'post') {
      navigate(`/posts/${n.linkId}`)
    } else if (n.linkType === 'profile') {
      navigate(`/profile/${n.linkId}`)
    } else if (n.linkType === 'job') {
      navigate(`/gigs/${n.linkId}`)
    } else if (n.linkType === 'ticket') {
      navigate(`/tickets/${n.linkId}`)
    } else {
      // If unknown, do nothing
    }
  }

  return (
    <div className='max-w-3xl mx-auto space-y-6'>
      <h2 className='text-3xl font-bold mb-4'>Notifications</h2>
      {notifications.length === 0 && <p>No notifications.</p>}
      <ul className='space-y-4'>
        {notifications.map((n) => (
          <li
            key={n.id}
            className='p-3 border rounded flex items-center justify-between cursor-pointer hover:bg-opacity-50 hover:bg-gray-700 transition'
            onClick={() => handleNavigate(n)}
          >
            <div>
              <p
                className='text-sm'
                style={{ color: n.seen ? 'var(--text)' : 'var(--primary)' }}
              >
                {n.text}
              </p>
              <p className='text-xs text-gray-500'>
                {new Date(n.createdAt).toLocaleString()}
              </p>
            </div>
            {!n.seen && (
              <span className='text-xs px-2 py-0.5 rounded' style={{ backgroundColor: 'var(--primary)', color: '#fff' }}>
                New
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}