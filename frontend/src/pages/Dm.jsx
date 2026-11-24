import React, { useCallback, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import useLiveRefresh from '../hooks/useLiveRefresh'

/**
 * Direct message page.  Allows two users to converse privately.  The
 * current user is determined via the AuthContext and the other user
 * is specified by the route parameter.  Messages are fetched from
 * the backend and updated live. Users can send new
 * messages via a simple form.
 */
export default function Dm() {
  const { otherId } = useParams()
  const { user, loading: authLoading } = useAuth()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [otherUser, setOtherUser] = useState(null)

  const load = useCallback(async (signal) => {
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      const [profile, thread] = await Promise.all([
        fetch(`/api/users/${otherId}`, { headers, signal }),
        fetch(`/api/dm/${otherId}/messages`, { headers, signal }),
      ])
      if (profile.ok) {
        const data = await profile.json()
        if (!signal.aborted) setOtherUser(data)
      }
      const data = await thread.json()
      if (signal.aborted) return
      if (!thread.ok) throw new Error(data.error || 'Unable to load messages')
      setMessages(data)
      setError('')
    } catch (error) {
      if (!signal.aborted) setError(error.message)
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [otherId])
  useLiveRefresh(Boolean(user), load)

  // Toggle reaction on a message
  async function handleReact(msgId) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/dm/${otherId}/messages/${msgId}/react`, {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });
      const data = await res.json();
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, reactions: data.reactions } : m))
        );
      }
    } catch (err) {
      // ignore errors
    }
  }
  // Send a direct message
  async function handleSend(e) {
    e.preventDefault()
    if (!text.trim()) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/dm/${otherId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (res.ok) {
        setText('')
        setMessages((prev) => prev.some((message) => message.id === data.id) ? prev : [...prev, data])
      } else {
        setError(data.error || 'Failed to send message')
      }
    } catch (err) {
      setError('Failed to send message')
    }
  }

  if (!authLoading && !user) return <p>Log in to view direct messages.</p>
  if (loading) {
    return <p>Loading chat…</p>
  }
  // Determine header title
  const header = otherUser
    ? `Chat with ${otherUser.name}`
    : 'Direct Messages'

  return (
    <div className='max-w-3xl mx-auto card'>
      {error && <p className='text-red-600' role='alert'>{error}</p>}
      <h2 className='text-xl font-semibold mb-3'>{header}</h2>
      <div
        className='h-64 overflow-y-auto space-y-2 border rounded p-2'
        style={{ backgroundColor: 'var(--card-bg)' }}
      >
        {messages.length === 0 && (
          <p className='text-gray-500'>No messages yet.</p>
        )}
        {messages.map((m) => {
          const isSender = user && m.senderId === user.id;
          const reactionCount = m.reactions ? Object.keys(m.reactions).length : 0;
          const reacted = m.reactions && m.reactions[user?.id];
          return (
            <div
              key={m.id}
              className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}
              onDoubleClick={() => handleReact(m.id)}
            >
              <div
                className='max-w-xs px-3 py-2 rounded-lg'
                style={{
                  backgroundColor: isSender
                    ? 'var(--primary)'
                    : 'var(--card-bg)',
                  color: isSender ? '#ffffff' : 'var(--text)',
                }}
              >
                <div className='whitespace-pre-line'>{m.text}</div>
                <button
                  type='button'
                  onClick={() => handleReact(m.id)}
                  className='mt-1 text-xs flex items-center gap-1'
                  style={{ color: reacted ? 'red' : isSender ? '#ffffff' : 'var(--text)' }}
                >
                  ❤️{reactionCount > 0 && <span>{reactionCount}</span>}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {user && (
        <form onSubmit={handleSend} className='mt-4 flex gap-2'>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className='flex-1 border px-3 py-2 rounded'
            placeholder='Write a message…'
            style={{
              backgroundColor: 'var(--card-bg)',
              color: 'var(--text)',
              caretColor: 'var(--primary)',
            }}
          />
          <button type='submit' className='btn-indigo'>Send</button>
        </form>
      )}
    </div>
  )
}