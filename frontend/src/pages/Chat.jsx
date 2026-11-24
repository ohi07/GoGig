import React, { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import useLiveRefresh from '../hooks/useLiveRefresh'

/**
 * Chat page.  Allows the client and the assigned freelancer for a job to
 * communicate. Messages are stored and delivered live. Only participants (client, assigned freelancer or
 * admin) can view and send messages.
 */
export default function Chat() {
  const { jobId } = useParams()
  const { user, loading: authLoading } = useAuth()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [job, setJob] = useState(null)
  const [myProposal, setMyProposal] = useState(null)

  const loadMessages = useCallback(async (signal) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/jobs/${jobId}/messages`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal,
      })
      const data = await res.json()
      if (signal.aborted) return
      if (res.ok) {
        setMessages(data)
        setError('')
      } else {
        setMessages([])
        setError(data.error || 'Unable to load messages')
      }
    } catch {
      if (!signal.aborted) setError('Unable to load messages')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [jobId])
  useLiveRefresh(Boolean(user), loadMessages)

  // Fetch job details for header info
  useEffect(() => {
    async function loadJob() {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`/api/jobs/${jobId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const data = await res.json()
        if (res.ok) {
          setJob(data)
          // Determine current user's accepted proposal if assigned
          if (user && data.proposals && Array.isArray(data.proposals)) {
            const accepted = data.proposals.find((p) => p.status === 'accepted' && p.freelancerId === user.id)
            if (accepted) {
              setMyProposal(accepted)
            }
          }
        }
      } catch (err) {
        // ignore
      }
    }
    loadJob()
  }, [jobId, user])

  async function handleSend(e) {
    e.preventDefault()
    if (!text.trim()) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/jobs/${jobId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ text })
      })
      const data = await res.json()
      if (res.ok) {
        setText('')
        // Append new message to list
        setMessages((prev) => prev.some((message) => message.id === data.id) ? prev : [...prev, data])
      } else {
        setError(data.error || 'Failed to send message')
      }
    } catch (err) {
      setError('Failed to send message')
    }
  }

  if (!authLoading && !user) return <p>Log in to view job chat.</p>
  if (loading) {
    return <p>Loading chat…</p>
  }
  // Toggle reaction on a message
  async function handleReact(msgId) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/jobs/${jobId}/messages/${msgId}/react`, {
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
      // ignore
    }
  }
  return (
    <div className='max-w-3xl mx-auto card'>
      {error && <p className='text-red-600' role='alert'>{error}</p>}
      {/* Job header */}
      {job && (
        <div className='mb-3 space-y-1'>
          <h2 className='text-xl font-semibold' style={{ color: 'var(--primary)' }}>
            {job.title}
          </h2>
          {myProposal && (
            <p className='text-sm' style={{ color: 'var(--text)' }}>
              Agreed Bid: {myProposal.amount !== null && myProposal.amount !== undefined ? `${myProposal.amount} ${myProposal.currency === 'Discuss' ? '(upon discussion)' : myProposal.currency}` : 'Upon discussion'}
            </p>
          )}
          <p className='text-sm' style={{ color: 'var(--text)' }}>
            {job.description}
          </p>
        </div>
      )}
      <div
        className='h-64 overflow-y-auto space-y-2 border rounded p-2'
        style={{ backgroundColor: 'var(--card-bg)' }}
      >
        {messages.length === 0 && <p className='text-gray-500'>No messages yet.</p>}
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
                  ❤️{' '}
                  {reactionCount > 0 && <span>{reactionCount}</span>}
                </button>
              </div>
            </div>
          );
        })}
      </div>
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
    </div>
  )
}