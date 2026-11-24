import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Inbox page.  Shows a list of your direct message conversations.  Each
 * conversation item displays the other user's name, avatar (if any), the
 * latest message snippet, timestamp, and a badge with the number of
 * unread messages.  Clicking on a conversation navigates to the DM
 * chat with that user.
 */
export default function Inbox() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const token = localStorage.getItem('token')
        const res = await fetch('/api/dm/conversations', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const data = await res.json()
        if (res.ok) {
          setConversations(data)
        } else {
          setError(data.error || 'Unable to load conversations')
        }
      } catch (err) {
        setError('Unable to load conversations')
      }
      setLoading(false)
    }
    if (user) {
      load()
    } else {
      setConversations([])
      setLoading(false)
    }
  }, [user])

  if (!user) {
    return <p>You need to be logged in to view your inbox.</p>
  }
  if (loading) {
    return <p>Loading inbox…</p>
  }
  if (error) {
    return <p className='text-red-500'>{error}</p>
  }

  return (
    <div className='max-w-3xl mx-auto space-y-6'>
      <h2 className='text-3xl font-bold mb-4'>Inbox</h2>
      {conversations.length === 0 && <p>No conversations yet.</p>}
      <ul className='space-y-4'>
        {conversations.map((convo) => {
          const last = convo.lastMessage || {}
          const snippet = last.text ? (last.text.length > 50 ? last.text.slice(0, 50) + '…' : last.text) : ''
          const time = last.createdAt ? new Date(last.createdAt).toLocaleString() : ''
          return (
            <li key={convo.otherId} className='border rounded p-3 flex justify-between items-center hover:bg-opacity-50 hover:bg-gray-700 transition'>
              <Link to={`/dm/${convo.otherId}`} className='flex items-center gap-3 flex-1'>
                {convo.otherAvatar && (() => {
                  let src = convo.otherAvatar
                  if (!/^https?:\/\//.test(src)) {
                    const origin = window.location.origin
                    const backend = origin
                    src = backend + src
                  }
                  return <img src={src} alt='avatar' className='w-10 h-10 rounded-full object-cover' />
                })()}
                <div className='flex-1'>
                  <p className='font-semibold' style={{ color: 'var(--text)' }}>{convo.otherName}</p>
                  <p className='text-sm text-gray-500'>{snippet || 'Start a conversation'}</p>
                </div>
              </Link>
              <div className='flex items-center gap-2'>
                {convo.unreadCount > 0 && (
                  <span className='px-2 py-0.5 text-xs rounded-full' style={{ backgroundColor: 'red', color: '#fff' }}>
                    {convo.unreadCount}
                  </span>
                )}
                {time && <span className='text-xs text-gray-500'>{time}</span>}
                {/* Profile link */}
                <Link
                  to={`/profile/${convo.otherId}`}
                  className='text-xs text-indigo-500 hover:underline'
                >
                  Profile
                </Link>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}