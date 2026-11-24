import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Dashboard page.  Shows an overview of the logged in user's activity.
 * Clients see the jobs they have posted.  Freelancers see the
 * proposals they have submitted.  Admins see a link to the admin
 * dashboard.
 */
export default function Dashboard() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const [myProposals, setMyProposals] = useState([])
  const [receivedProposals, setReceivedProposals] = useState([])
  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const token = localStorage.getItem('token')
        // Fetch jobs created by the user (if client) or open jobs (if freelancer) from /api/jobs
        const resJobs = await fetch('/api/jobs', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        const dataJobs = await resJobs.json()
        if (resJobs.ok) {
          setJobs(dataJobs)
          // Build user map for assigned freelancers (for clients). Only fetch when jobs for client
          if (user && user.role === 'client') {
            const ids = []
            dataJobs.forEach((job) => {
              if (job.assignedFreelancerId) ids.push(job.assignedFreelancerId)
            })
            const uniqueIds = Array.from(new Set(ids))
            const newMap = {}
            for (const uid of uniqueIds) {
              try {
                const resUser = await fetch(`/api/users/${uid}`, {
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                })
                const userData = await resUser.json()
                if (resUser.ok) {
                  newMap[uid] = userData
                }
              } catch (err) {
                // ignore
              }
            }
            setUserMap((prev) => ({ ...prev, ...newMap }))
          }
        } else {
          setJobs([])
        }
        // If freelancer, fetch proposals belonging to them using new /api/proposals endpoint
        if (user && user.role === 'freelancer') {
          const resProps = await fetch('/api/proposals', {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          })
          const propsData = await resProps.json()
          if (resProps.ok) {
            // Each proposal includes job info
            const proposals = propsData.map((p) => ({ ...p, job: p.job }))
            // Notify server for accepted/rejected proposals not yet notified
            const toNotify = proposals.filter((p) => p.status !== 'pending' && !p.notified)
            for (const p of toNotify) {
              try {
                await fetch(`/api/proposals/${p.id}/notified`, {
                  method: 'PUT',
                  headers: { Authorization: token ? `Bearer ${token}` : '' }
                })
                p.notified = true
              } catch (err) {
                // ignore
              }
            }
            setMyProposals(proposals)
          } else {
            setMyProposals([])
          }
        }
        // If client, fetch proposals submitted to their jobs for logging
        if (user && user.role === 'client') {
          try {
            const resProps = await fetch('/api/proposals', {
              headers: token ? { Authorization: `Bearer ${token}` } : {}
            })
            const propsData = await resProps.json()
            if (resProps.ok) {
              setReceivedProposals(propsData)
            } else {
              setReceivedProposals([])
            }
          } catch (err) {
            setReceivedProposals([])
          }
        }
      } catch (err) {
        setJobs([])
      }
      setLoading(false)
    }
    if (user) {
      load()
    }
  }, [user])

  if (!user) {
    return <p className='text-center'>Please log in to view your dashboard.</p>
  }

  // Helper to display currency and amount consistently
  function formatCurrency(currency, amount) {
    if (currency === 'Discuss' || amount === null || amount === undefined) {
      return 'Upon discussion'
    }
    const symbols = { BDT: '৳', USD: '$', EUR: '€' }
    const symbol = symbols[currency] || currency || '৳'
    return `${symbol}${amount}`
  }

  return (
    <div className='space-y-8'>
      <div className='flex items-center justify-between gap-3'>
        <h2 className='text-2xl font-semibold'>Dashboard</h2>
        <Link className='btn-indigo' to='/orders'>View orders</Link>
      </div>
      {loading && <p>Loading...</p>}
      {!loading && user.role === 'client' && (
        <div className='space-y-8'>
          <div>
            <h3 className='text-xl font-semibold mb-2' style={{ color: 'var(--primary)' }}>Your Jobs</h3>
            {jobs.length === 0 && <p className='text-gray-600'>You haven't posted any jobs yet.</p>}
            <ul className='space-y-3'>
              {jobs.map((job) => (
                <li key={job.id} className='p-4 border rounded flex items-start justify-between'>
                  <div>
                    <Link to={`/gigs/${job.id}`} className='font-semibold hover:underline nav-link'>{job.title}</Link>
                    <p className='text-sm' style={{ color: 'var(--text)' }}>Status: {job.status}</p>
                    {job.flagged && <p className='text-xs text-red-500'>Flagged for review</p>}
                    {/* Show assigned freelancer */}
                    {job.status === 'assigned' && job.assignedFreelancerId && (
                      <p className='text-xs' style={{ color: 'var(--text)' }}>
                        Assigned to: {userMap[job.assignedFreelancerId] ? (
                          <Link to={`/profile/${job.assignedFreelancerId}`} className='text-indigo-600 hover:underline'>
                            {userMap[job.assignedFreelancerId].name}
                          </Link>
                        ) : (
                          job.assignedFreelancerId
                        )}
                      </p>
                    )}
                  </div>
                  <div className='text-right space-y-1'>
                    <p className='font-semibold' style={{ color: 'var(--primary)' }}>
                      {formatCurrency(job.currency, job.budget)}
                    </p>
                    {/* Show chat link if job is assigned to a freelancer */}
                    {job.status === 'assigned' && (
                      <Link
                        to={`/chat/${job.id}`}
                        className='text-sm hover:underline'
                        style={{ color: 'var(--primary)' }}
                      >
                        Open Chat
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {/* Proposals received section */}
          <div>
            <h3 className='text-xl font-semibold mb-2' style={{ color: 'var(--primary)' }}>Proposals Received</h3>
            {receivedProposals.length === 0 && <p className='text-gray-600'>No proposals on your jobs yet.</p>}
            <ul className='space-y-3'>
              {receivedProposals.map((p) => (
                <li key={p.id} className='p-4 border rounded'>
                  <Link to={`/gigs/${p.job.id}`} className='font-semibold hover:underline nav-link'>{p.job.title}</Link>
                  <p className='text-sm mt-1' style={{ color: 'var(--text)' }}>
                    From: {p.freelancer?.name || p.freelancerId}
                  </p>
                  <p className='text-sm' style={{ color: p.status === 'accepted' ? 'green' : p.status === 'rejected' ? 'red' : 'var(--text)' }}>
                    Status: {p.status}
                  </p>
                  <p className='text-sm' style={{ color: 'var(--primary)' }}>
                    Bid: {formatCurrency(p.currency, p.amount)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {!loading && user.role === 'freelancer' && (
        <div>
          <h3 className='text-xl font-semibold mb-2' style={{ color: 'var(--primary)' }}>Your Proposals</h3>
          {myProposals.length === 0 && <p className='text-gray-600'>You haven't submitted any proposals yet.</p>}
          <ul className='space-y-3'>
            {myProposals.map((p) => (
              <li key={p.id} className='p-4 border rounded'>
                <Link to={`/gigs/${p.job.id}`} className='font-semibold hover:underline nav-link'>{p.job.title}</Link>
                <p className='text-sm mt-1' style={{ color: 'var(--primary)' }}>
                  Your bid: {formatCurrency(p.currency, p.amount)}
                </p>
                <p className='text-sm' style={{ color: p.status === 'accepted' ? 'green' : p.status === 'rejected' ? 'red' : 'var(--text)' }}>
                  Status: {p.status}
                  {!p.notified && p.status !== 'pending' && (
                    <span className='ml-2 text-xs' style={{ color: p.status === 'accepted' ? 'green' : 'red' }}>(new)</span>
                  )}
                </p>
                {/* Chat link for accepted proposals */}
                {p.status === 'accepted' && (
                  <Link
                    to={`/dm/${p.job.clientId}`}
                    className='text-sm hover:underline'
                    style={{ color: 'var(--primary)' }}
                  >
                    Open Chat
                  </Link>
                )}
                {p.flagged && <p className='text-xs text-red-500'>Flagged</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!loading && user.role === 'admin' && (
        <div>
          <p className='text-lg'>You are an admin. Visit the{' '}
            <Link to='/admin' className='nav-link'>admin dashboard</Link>{' '}
            to manage flagged content and users.
          </p>
        </div>
      )}
    </div>
  )
}