import React, { useCallback, useState } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import useLiveRefresh from '../hooks/useLiveRefresh'

/**
 * Tickets page.  Allows users to open support tickets and view their
 * existing tickets.  Moderators and admins can see all tickets.
 * When a ticket ID is present in the route, displays a detailed
 * conversation view for that ticket with the ability to reply and
 * close the ticket.  Ticket messages hide moderator/admin names by
 * displaying MOD/ADMIN instead of their names.
 */
export default function Tickets() {
  const { user, loading: authLoading } = useAuth()
  const params = useParams()
  const navigate = useNavigate()
  const ticketId = params.id
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // For ticket creation
  const [query] = useSearchParams()
  const order = query.get('order')
  const [subject, setSubject] = useState(() => order ? `Help with order #${order.slice(0, 100)}` : '')
  const [message, setMessage] = useState('')
  // For detail view
  const [ticket, setTicket] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMsg, setNewMsg] = useState('')

  const refresh = useCallback(async (signal) => {
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      const path = ticketId ? `/api/tickets/${ticketId}` : '/api/tickets'
      const response = await fetch(path, { headers, signal })
      const data = await response.json()
      if (signal.aborted) return
      if (!response.ok) throw new Error(data.error || 'Unable to load support tickets')
      if (!ticketId) {
        setTickets(data)
      } else {
        const reply = await fetch(`${path}/messages`, { headers, signal })
        const thread = await reply.json()
        if (signal.aborted) return
        if (!reply.ok) throw new Error(thread.error || 'Unable to load messages')
        setTicket(data)
        setMessages(thread)
      }
      setError('')
    } catch (failure) {
      if (!signal.aborted) setError(failure.message)
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [ticketId])
  useLiveRefresh(Boolean(user), refresh)

  async function handleCreate(e) {
    e.preventDefault()
    if (!subject.trim() || !message.trim()) {
      setError('Subject and message are required')
      return
    }
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        // Add to list and reset
        setTickets((prev) => prev.some((entry) => entry.id === data.id) ? prev : [data, ...prev])
        setSubject('')
        setMessage('')
        // Navigate to ticket detail
        navigate(`/tickets/${data.id}`)
      } else {
        setError(data.error || 'Failed to create ticket')
      }
    } catch (err) {
      setError('Failed to create ticket')
    }
  }

  async function handleSendMessage(e) {
    e.preventDefault()
    if (!newMsg.trim()) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/tickets/${ticket.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: newMsg.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        const senderDisplay = user.id === ticket.userId ? user.name : user.role === 'admin' ? 'ADMIN' : 'MOD'
        setMessages((thread) => thread.some((entry) => entry.id === data.id) ? thread : [...thread, { ...data, senderDisplay }])
        setNewMsg('')
      } else {
        setError(data.error || 'Unable to send message')
      }
    } catch {
      setError('Unable to send message')
    }
  }

  async function handleCloseTicket() {
    if (!ticket) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/tickets/${ticket.id}/close`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (res.ok) {
        setTicket(data)
      } else {
        setError(data.error || 'Unable to close ticket')
      }
    } catch {
      setError('Unable to close ticket')
    }
  }

  if (authLoading || (user && loading)) {
    return <p>Loading…</p>
  }
  if (!user) return <p><Link to='/login' className='underline'>Log in</Link> to use support tickets.</p>

  // If a specific ticket ID is provided, render detailed conversation view
  if (ticketId) {
    if (ticket?.id !== ticketId) return <p role={error ? 'alert' : undefined}>{error || 'Loading ticket…'}</p>
    const canClose = ticket.status !== 'closed' && (ticket.userId === user.id || user.role === 'admin' || user.moderator)
    return (
      <div className='max-w-3xl mx-auto space-y-4'>
        <button onClick={() => navigate('/tickets')} className='text-sm text-indigo-600 hover:underline'>← Back to tickets</button>
        <h1 className='text-2xl font-semibold'>{ticket.subject}</h1>
        {error && <p role='alert' className='text-red-600'>{error}</p>}
        <p className='text-sm text-gray-500'>Status: {ticket.status}</p>
        {canClose && (
          <button onClick={handleCloseTicket} className='mt-1 mb-3 px-3 py-1 bg-red-500 text-white rounded'>Close Ticket</button>
        )}
        <div className='border rounded p-3 mb-4 max-h-96 overflow-y-auto'>
          {messages.length === 0 && <p>No messages yet.</p>}
          {messages.map((m) => (
            <div key={m.id} className='mb-3'>
              <p className='text-sm font-semibold' style={{ color: m.senderRole === 'admin' || m.senderRole === 'moderator' ? 'var(--primary)' : 'var(--text)' }}>
                {m.senderDisplay || (m.senderRole === 'admin' ? 'ADMIN' : m.senderRole === 'moderator' ? 'MOD' : 'User')}
                <span className='ml-2 text-xs text-gray-500'>{new Date(m.createdAt).toLocaleString()}</span>
              </p>
              <p className='text-sm' style={{ color: 'var(--text)' }}>{m.text}</p>
            </div>
          ))}
        </div>
        {ticket.status !== 'closed' && (
          <form onSubmit={handleSendMessage} className='flex items-center gap-2'>
            <input
              className='flex-1 border px-3 py-2 rounded'
              placeholder='Write a message…' aria-label='Ticket reply' maxLength={8000} required
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
            />
            <button type='submit' className='px-3 py-2 rounded' style={{ backgroundColor: 'var(--primary)', color: '#fff' }}>
              Send
            </button>
          </form>
        )}
      </div>
    )
  }

  // Otherwise, render ticket list and new ticket form
  return (
    <div className='max-w-3xl mx-auto space-y-6'>
      <h2 className='text-3xl font-bold mb-4'>Support Tickets</h2>
      <div className='card p-4 mb-6'>
        <h3 className='text-xl font-semibold mb-2'>Open a Ticket</h3>
        {error && <p className='text-red-500'>{error}</p>}
        <form onSubmit={handleCreate} className='space-y-3'>
          <input
            className='w-full border px-3 py-2 rounded'
            placeholder='Subject' aria-label='Subject' maxLength={160} required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <textarea
            className='w-full border px-3 py-2 rounded'
            placeholder='Describe your issue' aria-label='Describe your issue' maxLength={8000} required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
          ></textarea>
          <button type='submit' className='btn-indigo'>Submit Ticket</button>
        </form>
      </div>
      <h3 className='text-xl font-semibold mb-2'>{user.role === 'admin' || user.moderator ? 'Ticket queue' : 'Your tickets'}</h3>
      {tickets.length === 0 && <p>No tickets yet.</p>}
      <ul className='space-y-4'>
        {tickets.map((t) => (
          <li key={t.id}>
            <Link to={`/tickets/${t.id}`} className='card flex justify-between items-center hover:shadow-md'>
            <div>
              <p className='font-semibold' style={{ color: 'var(--primary)' }}>{t.subject}</p>
              <p className='text-xs text-gray-500'>Status: {t.status}</p>
              <p className='text-xs text-gray-500'>Opened: {new Date(t.createdAt).toLocaleString()}</p>
            </div>
            {t.status === 'closed' && (
              <span className='text-xs px-2 py-0.5 rounded-full' style={{ backgroundColor: 'var(--primary)', color: '#fff' }}>Closed</span>
            )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}