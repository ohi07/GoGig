import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'

/**
 * Gig detail page.  Displays the job information and proposals.  Clients
 * can view all proposals on their job and accept one.  Freelancers can
 * submit a proposal if they haven't already and the job is open.  If
 * the job is flagged it is hidden from freelancers and unauthenticated users.
 */
export default function GigDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [job, setJob] = useState(null)
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [coverLetter, setCoverLetter] = useState('')
  const [amount, setAmount] = useState('')
  const [bidCurrency, setBidCurrency] = useState('')
  const [message, setMessage] = useState('')

  // Review state: list of reviews for this job and form fields
  const [reviews, setReviews] = useState([])
  const [rating, setRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [hasReviewed, setHasReviewed] = useState(false)

  // Cache for user info by id to display names and roles
  const [userMap, setUserMap] = useState({})

  async function load() {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/jobs/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      const data = await res.json()
      if (res.ok) {
        setJob({ ...data })
        setProposals(data.proposals || [])
        // Default proposal currency to the job's currency
        if (data.currency) {
          setBidCurrency(data.currency)
        }
        // Fetch client and freelancer info for proposals
        const idsToFetch = []
        if (data.clientId) idsToFetch.push(data.clientId)
        ;(data.proposals || []).forEach((p) => {
          if (p.freelancerId) idsToFetch.push(p.freelancerId)
        })
        const uniqueIds = Array.from(new Set(idsToFetch))
        const token2 = localStorage.getItem('token')
        const newMap = {}
        for (const uid of uniqueIds) {
          try {
            const resUser = await fetch(`/api/users/${uid}`, {
              headers: token2 ? { Authorization: `Bearer ${token2}` } : {}
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
        // If the job is completed, load reviews
        if (data.status === 'completed') {
          try {
            const revRes = await fetch(`/api/jobs/${id}/reviews`, {
              headers: token2 ? { Authorization: `Bearer ${token2}` } : {},
            })
            const revData = await revRes.json()
            if (revRes.ok) {
              setReviews(revData)
              // Determine if current user has reviewed
              if (user) {
                setHasReviewed(revData.some((r) => r.reviewerId === user.id))
              }
            }
          } catch (err) {
            setReviews([])
          }
        } else {
          setReviews([])
          setHasReviewed(false)
        }
      } else {
        setJob(null)
        setProposals([])
        setMessage(data.error || 'Job not found')
      }
    } catch (err) {
      setJob(null)
      setProposals([])
      setMessage('Failed to load job')
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id])

  async function submitProposal(e) {
    e.preventDefault()
    setMessage('')
    if (!coverLetter) {
      setMessage('Cover letter is required')
      return
    }
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/jobs/${id}/proposals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ coverLetter, amount, currency: bidCurrency })
      })
      const data = await res.json()
      if (res.ok) {
        setCoverLetter('')
        setAmount('')
        setBidCurrency(job && job.currency ? job.currency : '')
        setMessage('Proposal submitted')
        load()
      } else {
        setMessage(data.error || 'Failed to submit proposal')
      }
    } catch (err) {
      setMessage('Failed to submit proposal')
    }
  }

  // Helper to display currency and amount consistently
  function formatCurrency(curr, amt) {
    if (curr === 'Discuss' || amt === null || amt === undefined) {
      return 'Upon discussion';
    }
    const symbols = { BDT: '৳', USD: '$', EUR: '€' };
    const symbol = symbols[curr] || curr || '৳';
    return `${symbol}${amt}`;
  }

  async function acceptProposal(proposalId) {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/jobs/${id}/proposals/${proposalId}/accept`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) {
        setMessage('Proposal accepted')
        load()
      } else {
        setMessage(data.error || 'Failed to accept proposal')
      }
    } catch (err) {
      setMessage('Failed to accept proposal')
    }
  }

  // Mark job as completed (client only)
  async function markComplete() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/jobs/${id}/complete`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Job marked as completed');
        load();
      } else {
        setMessage(data.error || 'Failed to mark complete');
      }
    } catch (err) {
      setMessage('Failed to mark complete');
    }
  }

  // Submit a review for this job
  async function handleReview(e) {
    e.preventDefault()
    setMessage('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/jobs/${id}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rating, comment: reviewComment }),
      })
      const data = await res.json()
      if (res.ok) {
        setReviewComment('')
        setRating(5)
        setHasReviewed(true)
        // refresh reviews
        setReviews((prev) => [data, ...prev])
        setMessage('Review submitted')
      } else {
        setMessage(data.error || 'Failed to submit review')
      }
    } catch (err) {
      setMessage('Failed to submit review')
    }
  }

  if (loading) {
    return <p>Loading...</p>
  }
  if (!job) {
    return <p>{message || 'Job not found'}</p>
  }

  const isClientOwner = user && user.id === job.clientId
  const isFreelancer = user && user.role === 'freelancer'
  const hasProposed = proposals.some((p) => p.freelancerId === (user && user.id))
  const canViewProposals = user && (user.role === 'admin' || (user.role === 'client' && user.id === job.clientId))

  return (
    <div className='max-w-3xl mx-auto'>
      {job.flagged && (
        <p className='mb-4 text-red-500'>This job has been flagged for review.</p>
      )}
      <div className='card'>
        <h2 className='text-2xl font-semibold mb-2'>{job.title}</h2>
        {job.image && (
          <img src={job.image} alt='Job visual' className='w-full h-64 object-cover rounded mb-3' />
        )}
        <p className='text-gray-700 mb-2'>{job.description}</p>
        {/* Display client name */}
        {userMap[job.clientId] && (
          <p className='text-sm text-gray-500'>Posted by: <Link to={`/profile/${job.clientId}`} className='text-indigo-600 hover:underline'>{userMap[job.clientId].name}</Link></p>
        )}
        {/* Budget display handling currency and upon discussion */}
        <p className='font-semibold mb-1'>
          Budget: {formatCurrency(job.currency, job.budget)}
        </p>
        {job.deadline && <p className='text-sm text-gray-500 mb-1'>Deadline: {job.deadline}</p>}
        <p className='text-sm text-gray-500'>Status: {job.status}</p>
        {/* Display assigned freelancer name when job is assigned */}
        {job.status === 'assigned' && job.assignedFreelancerId && (
          <p className='text-sm text-gray-500'>
            Assigned to:{' '}
            {userMap[job.assignedFreelancerId] ? (
              <Link to={`/profile/${job.assignedFreelancerId}`} className='text-indigo-600 hover:underline'>
                {userMap[job.assignedFreelancerId].name}
              </Link>
            ) : (
              job.assignedFreelancerId
            )}
          </p>
        )}
      </div>

      {(isClientOwner || user?.id === job.assignedFreelancerId) && job.assignedFreelancerId && (
        <div className='my-5 flex flex-wrap items-center gap-4'>
          {job.orderId && <Link to={`/orders/${job.orderId}`} className='btn-indigo'>View order</Link>}
          <Link to={`/chat/${job.id}`} className='font-medium underline'>Job chat</Link>
          {isClientOwner && job.status === 'assigned' && !job.orderId && (
            <button type='button' onClick={markComplete} className='btn-indigo'>Mark as completed</button>
          )}
        </div>
      )}

      {/* Freelancer Proposal Form */}
      {isFreelancer && job.status === 'open' && !hasProposed && !job.flagged && (
        <div className='card mt-6'>
          <h3 className='text-lg font-semibold mb-2'>Submit a Proposal</h3>
          <form onSubmit={submitProposal} className='space-y-3'>
            <textarea
              className='w-full border px-3 py-2 rounded'
              placeholder='Cover letter'
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              rows={4}
              required
            ></textarea>
            <div className='flex gap-2'>
              <select
                value={bidCurrency}
                onChange={(e) => setBidCurrency(e.target.value)}
                className='border px-3 py-2 rounded'
              >
                {job.currency && <option value={job.currency}>{job.currency}</option>}
                <option value='৳'>৳ (BDT)</option>
                <option value='$'>$ (USD)</option>
                <option value='€'>€ (EUR)</option>
                <option value='Discuss'>Upon discussion</option>
              </select>
              <input
                className='flex-1 border px-3 py-2 rounded'
                placeholder={bidCurrency === 'Discuss' ? 'Discuss' : 'Bid amount'}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={bidCurrency === 'Discuss'}
                required={bidCurrency !== 'Discuss'}
              />
            </div>
            <button type='submit' className='btn-indigo'>Submit Proposal</button>
          </form>
        </div>
      )}
      {isFreelancer && hasProposed && (
        <p className='mt-4 text-gray-600'>You have already submitted a proposal for this job.</p>
      )}

      {/* Client and admin view of proposals */}
      {canViewProposals && (
        <div className='mt-6'>
          <h3 className='text-lg font-semibold mb-2'>Proposals</h3>
          {proposals.length === 0 && <p className='text-gray-600'>No proposals yet.</p>}
          <ul className='space-y-4'>
            {proposals.map((p) => (
              <li key={p.id} className='border rounded p-4'>
                <p className='font-semibold'>
                  Freelancer:{' '}
                  {userMap[p.freelancerId] ? (
                    <Link to={`/profile/${p.freelancerId}`} className='text-indigo-600 hover:underline'>
                      {userMap[p.freelancerId].name}
                    </Link>
                  ) : (
                    p.freelancerId
                  )}
                </p>
                <p className='text-sm mt-1'>Cover: {p.coverLetter}</p>
                <p className='text-sm'>
                  Bid:{' '}
                  {p.amount === null && p.currency === 'Discuss'
                    ? 'Upon discussion'
                    : p.amount !== null
                    ? `${p.currency || '৳'}${p.amount}`
                    : ''}
                </p>
                <p className='text-sm'>Status: {p.status}</p>
                {job.status === 'open' && p.status === 'pending' && isClientOwner && (
                  <button
                    onClick={() => acceptProposal(p.id)}
                    className='mt-2 px-3 py-1 bg-green-500 text-white rounded'
                  >
                    Accept Proposal
                  </button>
                )}
                {p.flagged && <p className='text-xs text-red-500 mt-1'>Flagged</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Reviews section */}
      {job.status === 'completed' && (
        <div className='mt-6'>
          <h3 className='text-lg font-semibold mb-2'>Reviews</h3>
          {reviews.length === 0 && <p className='text-gray-600'>No reviews yet.</p>}
          <ul className='space-y-3'>
            {reviews.map((r) => (
              <li key={r.id} className='p-4 border rounded'>
                <p className='font-semibold mb-1'>
                  {userMap[r.reviewerId] ? userMap[r.reviewerId].name : r.reviewerId} →{' '}
                  {userMap[r.revieweeId] ? userMap[r.revieweeId].name : r.revieweeId}
                </p>
                <p className='text-yellow-500'>
                  {Array.from({ length: r.rating }, (_, i) => (
                    <span key={i}>★</span>
                  ))}
                  {Array.from({ length: 5 - r.rating }, (_, i) => (
                    <span key={i}>☆</span>
                  ))}
                </p>
                {r.comment && <p className='text-sm mt-1' style={{ color: 'var(--text)' }}>{r.comment}</p>}
              </li>
            ))}
          </ul>
          {/* Review form for participants who haven't reviewed yet */}
          {!hasReviewed && user && ((user.role === 'client' && user.id === job.clientId) || (user.role === 'freelancer' && user.id === job.assignedFreelancerId)) && (
            <div className='mt-4 card p-4'>
              <h4 className='font-semibold mb-2'>Leave a Review</h4>
              <form onSubmit={handleReview} className='space-y-2'>
                <div className='flex items-center gap-2'>
                  <label className='text-sm'>Rating:</label>
                  <select
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                    className='border px-2 py-1 rounded'
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder='Comment (optional)'
                  rows={3}
                  className='w-full border px-3 py-2 rounded'
                ></textarea>
                <button type='submit' className='btn-indigo'>Submit Review</button>
              </form>
            </div>
          )}
        </div>
      )}
      {message && <p className='mt-4 text-red-500'>{message}</p>}
    </div>
  )
}