import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Analytics from '../components/Analytics'

/**
 * Admin dashboard.  Only accessible to users with the `admin` role.  Allows
 * viewing and moderating flagged jobs and proposals as well as toggling
 * user bans.  Uses the backend admin API endpoints defined in
 * server.js.
 */
export default function Admin() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [flagged, setFlagged] = useState({ jobs: [], proposals: [] })
  const [users, setUsers] = useState([])
  const [jobs, setJobs] = useState([])
  const [allProposals, setAllProposals] = useState([])
  const token = localStorage.getItem('token') || ''

  // Redirect away if not admin or moderator
  useEffect(() => {
    // Redirect away if the user is neither admin nor moderator
    if (!user) return
    if (user.role !== 'admin' && !user.moderator) {
      navigate('/')
    }
  }, [user, navigate])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        // Always fetch flagged jobs and proposals for moderators and admins
        const flaggedRes = await fetch('/api/admin/flagged', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const flaggedData = await flaggedRes.json()
        if (flaggedRes.ok) {
          setFlagged(flaggedData)
        }
        // Fetch user list for admins and moderators
        if (user && (user.role === 'admin' || user.moderator)) {
          const usersRes = await fetch('/api/admin/users', {
            headers: { Authorization: `Bearer ${token}` },
          })
          const usersData = await usersRes.json()
          if (usersRes.ok) {
            setUsers(usersData)
          }
        }
        // Only admins fetch full job lists and all proposals
        if (user && user.role === 'admin') {
          const jobsRes = await fetch('/api/admin/jobs', {
            headers: { Authorization: `Bearer ${token}` },
          })
          const jobsData = await jobsRes.json()
          if (jobsRes.ok) {
            setJobs(jobsData)
          }
          const propsRes = await fetch('/api/admin/proposals', {
            headers: { Authorization: `Bearer ${token}` },
          })
          const propsData = await propsRes.json()
          if (propsRes.ok) {
            setAllProposals(propsData)
          }
        }
      } catch (err) {
        // silently fail
      }
      setLoading(false)
    }
    if (user && (user.role === 'admin' || user.moderator)) {
      load()
    }
  }, [user, token])

  async function unflagJob(id) {
    await fetch(`/api/admin/jobs/${id}/unflag`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    })
    refresh()
  }
  async function deleteJob(id) {
    await fetch(`/api/admin/jobs/${id}/delete`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    refresh()
  }
  async function unflagProposal(id) {
    await fetch(`/api/admin/proposals/${id}/unflag`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    })
    refresh()
  }
  async function deleteProposal(id) {
    await fetch(`/api/admin/proposals/${id}/delete`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    refresh()
  }
  async function toggleBan(userId) {
    await fetch(`/api/admin/users/${userId}/ban`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    })
    refresh()
  }

  // Warn a user with an optional custom message
  async function warnUser(userId) {
    const message = window.prompt('Enter a warning message (optional):', '')
    await fetch(`/api/admin/users/${userId}/warn`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ message })
    })
    // No immediate refresh required; DM will notify user
  }

  // Remove warning from a user
  async function unwarnUser(userId) {
    await fetch(`/api/admin/users/${userId}/unwarn`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    })
    refresh()
  }

  // Toggle admin status (sysop only)
  async function toggleAdmin(userId) {
    await fetch(`/api/admin/users/${userId}/admin`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    })
    refresh()
  }

  async function toggleModerator(userId) {
    await fetch(`/api/admin/users/${userId}/moderator`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    })
    refresh()
  }
  async function refresh() {
    // reload lists
    try {
      const flaggedRes = await fetch('/api/admin/flagged', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const flaggedData = await flaggedRes.json()
      if (flaggedRes.ok) setFlagged(flaggedData)
      if (user && (user.role === 'admin' || user.moderator)) {
        // refresh users list for admins and moderators
        const usersRes = await fetch('/api/admin/users', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const usersData = await usersRes.json()
        if (usersRes.ok) setUsers(usersData)
      }
      if (user && user.role === 'admin') {
        // only admins refresh jobs and all proposals
        const jobsRes = await fetch('/api/admin/jobs', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const jobsData = await jobsRes.json()
        if (jobsRes.ok) setJobs(jobsData)
        const propsRes = await fetch('/api/admin/proposals', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const propsData = await propsRes.json()
        if (propsRes.ok) setAllProposals(propsData)
      }
    } catch (err) {}
  }

  // Editing state for jobs
  const [editingJobId, setEditingJobId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editBudget, setEditBudget] = useState('')
  const [editFlagged, setEditFlagged] = useState(false)
  const [editStatus, setEditStatus] = useState('open')

  function startEdit(job) {
    setEditingJobId(job.id)
    setEditTitle(job.title)
    setEditDescription(job.description)
    setEditBudget(job.budget)
    setEditFlagged(job.flagged)
    setEditStatus(job.status)
  }

  async function saveEdit(jobId) {
    // Call admin update API
    await fetch(`/api/admin/jobs/${jobId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        title: editTitle,
        description: editDescription,
        budget: editBudget,
        flagged: editFlagged,
        status: editStatus,
      }),
    })
    setEditingJobId(null)
    refresh()
  }

  function cancelEdit() {
    setEditingJobId(null)
  }

  // Show nothing if user is not admin or moderator
  if (!user || (user.role !== 'admin' && !user.moderator)) {
    return null
  }

  return (
    <div className='space-y-8'>
      <h2 className='text-2xl font-semibold'>Admin Dashboard</h2>
      {user?.role === 'admin' && <Analytics />}
      {loading && <p>Loading...</p>}
      {!loading && (
        <>
          {/* Flagged Jobs */}
          <section>
            <h3 className='text-xl font-semibold mb-2'>Flagged Jobs</h3>
            {flagged.jobs.length === 0 && <p className='text-gray-600'>No flagged jobs</p>}
            <ul className='space-y-3'>
              {flagged.jobs.map((job) => (
                <li key={job.id} className='p-4 border rounded-lg'>
                  <h4 className='font-semibold'>{job.title}</h4>
                  <p className='text-sm text-gray-600'>
                    Posted by{' '}
                    {(() => {
                      const poster = users.find((u) => u.id === job.clientId)
                      if (poster) {
                        return (
                          <a
                            href={`/profile/${poster.id}`}
                            className='text-indigo-600 hover:underline'
                          >
                            {poster.name}
                          </a>
                        )
                      }
                      return job.clientId
                    })()}
                  </p>
                  <div className='mt-2 space-x-2'>
                    <button onClick={() => unflagJob(job.id)} className='px-3 py-1 bg-green-500 text-white rounded'>Unflag</button>
                    <button onClick={() => deleteJob(job.id)} className='px-3 py-1 bg-red-500 text-white rounded'>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Flagged Proposals */}
          <section>
            <h3 className='text-xl font-semibold mt-8 mb-2'>Flagged Proposals</h3>
            {flagged.proposals.length === 0 && <p className='text-gray-600'>No flagged proposals</p>}
            <ul className='space-y-3'>
              {flagged.proposals.map((p) => (
                <li key={p.id} className='p-4 border rounded-lg'>
                  <p className='font-semibold'>Job ID: {p.jobId}</p>
                  <p className='text-gray-700 text-sm'>"{p.coverLetter.substring(0, 80)}{p.coverLetter.length > 80 ? '...' : ''}"</p>
                  <div className='mt-2 space-x-2'>
                    <button onClick={() => unflagProposal(p.id)} className='px-3 py-1 bg-green-500 text-white rounded'>Unflag</button>
                    <button onClick={() => deleteProposal(p.id)} className='px-3 py-1 bg-red-500 text-white rounded'>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* All Proposals (admin only) */}
          {user.role === 'admin' && (
            <section>
              <h3 className='text-xl font-semibold mt-8 mb-2'>All Proposals</h3>
              {allProposals.length === 0 && <p className='text-gray-600'>No proposals found</p>}
              <ul className='space-y-3'>
                {allProposals.map((p) => (
                  <li key={p.id} className='p-4 border rounded-lg'>
                    <p className='font-semibold'>Job ID: {p.jobId}</p>
                    <p className='text-sm'>Freelancer ID: {p.freelancerId}</p>
                    <p className='text-sm'>
                      Bid:{' '}
                      {p.amount === null && p.currency === 'Discuss'
                        ? 'Upon discussion'
                        : p.amount !== null
                        ? `${p.currency || '৳'}${p.amount}`
                        : ''}
                    </p>
                    <p className='text-xs text-gray-700'>
                      {p.coverLetter.length > 120
                        ? p.coverLetter.substring(0, 120) + '…'
                        : p.coverLetter}
                    </p>
                    {p.flagged && <p className='text-xs text-red-500'>Flagged</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Users (admin and moderators) */}
          {(user.role === 'admin' || user.moderator) && (
            <section>
              <h3 className='text-xl font-semibold mt-8 mb-2'>Users</h3>
              {users.length === 0 && <p className='text-gray-600'>No users</p>}
              <ul className='space-y-3'>
                {users.map((u) => {
                  const isSelf = u.id === user.id
                  const isAdminTarget = u.role === 'admin'
                  const canBan = !isAdminTarget || (user.sysop && u.id !== user.id)
                  const canMod = user.role === 'admin'
                  const canMakeAdmin = user.sysop && u.id !== user.id
                  return (
                    <li key={u.id} className='p-4 border rounded-lg flex items-center justify-between'>
                      <div>
                        <p className='font-semibold'>
                          <a
                            href={`/profile/${u.id}`}
                            className='hover:underline text-indigo-600'
                          >
                            {u.name}
                          </a>{' '}
                          <span className='text-sm text-gray-500'>({u.role})</span>
                          {u.moderator && u.role !== 'admin' && (
                            <span className='ml-2 text-xs text-yellow-600 font-semibold'>[MOD]</span>
                          )}
                          {u.warned && (
                            <span className='ml-2 text-xs text-orange-600 font-semibold'>[WARNED]</span>
                          )}
                          {u.banned && (
                            <span className='ml-2 text-xs text-red-600 font-semibold'>[BANNED]</span>
                          )}
                        </p>
                        <p className='text-xs text-gray-600'>{u.email}</p>
                      </div>
                      {/* Action buttons */}
                      {!isSelf && (
                        <div className='flex flex-wrap gap-2'>
                          {/* Ban/Unban */}
                          {canBan && (
                            <button
                              onClick={() => toggleBan(u.id)}
                              className='px-3 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300'
                            >
                              {u.banned ? 'Unban' : 'Ban'}
                            </button>
                          )}
                          {/* Warn/Unwarn */}
                          {(user.role === 'admin' || user.moderator) && !isAdminTarget && (
                            u.warned ? (
                              <button
                                onClick={() => unwarnUser(u.id)}
                                className='px-3 py-1 rounded bg-green-200 text-green-800 hover:bg-green-300'
                              >
                                Remove Warn
                              </button>
                            ) : (
                              <button
                                onClick={() => warnUser(u.id)}
                                className='px-3 py-1 rounded bg-red-200 text-red-800 hover:bg-red-300'
                              >
                                Warn
                              </button>
                            )
                          )}
                          {/* Toggle moderator (admin only) */}
                          {canMod && !isAdminTarget && (
                            <button
                              onClick={() => toggleModerator(u.id)}
                              className='px-3 py-1 rounded bg-yellow-200 text-yellow-800 hover:bg-yellow-300'
                            >
                              {u.moderator ? 'Demote' : 'Make Mod'}
                            </button>
                          )}
                          {/* Toggle admin (sysop only) */}
                          {canMakeAdmin && (
                            <button
                              onClick={() => toggleAdmin(u.id)}
                              className='px-3 py-1 rounded bg-purple-200 text-purple-800 hover:bg-purple-300'
                            >
                              {isAdminTarget ? 'Demote Admin' : 'Make Admin'}
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* All Jobs (admin only) */}
          {user.role === 'admin' && (
            <section>
              <h3 className='text-xl font-semibold mt-8 mb-2'>All Jobs</h3>
              {jobs.length === 0 && <p className='text-gray-600'>No jobs found</p>}
              <ul className='space-y-3'>
                {jobs.map((job) => (
                  <li key={job.id} className='p-4 border rounded-lg'>
                    {editingJobId === job.id ? (
                      <div className='space-y-2'>
                        <input
                          className='w-full border px-2 py-1 rounded'
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder='Title'
                        />
                        <textarea
                          className='w-full border px-2 py-1 rounded'
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder='Description'
                          rows={2}
                        ></textarea>
                        <input
                          className='w-full border px-2 py-1 rounded'
                          value={editBudget}
                          onChange={(e) => setEditBudget(e.target.value)}
                          placeholder='Budget'
                        />
                        <div className='flex items-center gap-3'>
                          <label className='flex items-center gap-1'>
                            <input
                              type='checkbox'
                              checked={editFlagged}
                              onChange={(e) => setEditFlagged(e.target.checked)}
                            />
                            <span>Flagged</span>
                          </label>
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value)}
                            className='border px-2 py-1 rounded'
                          >
                            <option value='open'>open</option>
                            <option value='assigned'>assigned</option>
                            <option value='completed'>completed</option>
                            <option value='flagged'>flagged</option>
                          </select>
                        </div>
                        <div className='space-x-2 mt-2'>
                          <button onClick={() => saveEdit(job.id)} className='px-3 py-1 bg-green-500 text-white rounded'>Save</button>
                          <button onClick={cancelEdit} className='px-3 py-1 bg-gray-300 rounded'>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className='flex flex-col gap-1'>
                        <h4 className='font-semibold text-lg'>{job.title}</h4>
                        <p className='text-sm text-gray-600'>{job.description?.slice(0, 80)}{job.description && job.description.length > 80 ? '…' : ''}</p>
                        <p className='text-sm'>
                          Budget:{' '}
                          {job.budget === null && job.currency === 'Discuss'
                            ? 'Upon discussion'
                            : job.budget !== null && job.budget !== undefined
                            ? `${job.currency || '৳'}${job.budget}`
                            : ''}
                        </p>
                        <p className='text-sm'>Status: {job.status}</p>
                        {job.flagged && <p className='text-xs text-red-500'>Flagged</p>}
                        <div className='mt-2 space-x-2'>
                          <button onClick={() => startEdit(job)} className='px-3 py-1 bg-blue-500 text-white rounded'>Edit</button>
                          <button onClick={() => deleteJob(job.id)} className='px-3 py-1 bg-red-500 text-white rounded'>Delete</button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}