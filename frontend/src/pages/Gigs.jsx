import React, { useEffect, useState } from 'react'
import GigCard from '../components/GigCard'

/**
 * Gigs list page.  Fetches all gigs/jobs from the backend and allows
 * simple keyword searching by title or description.  The list shown is
 * automatically filtered by the backend depending on the current
 * user (clients see only their jobs, freelancers see only open gigs, admins see all).
 */
export default function Gigs() {
  const [gigs, setGigs] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const token = localStorage.getItem('token')
        const res = await fetch('/api/jobs', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        const data = await res.json()
        if (res.ok) {
          setGigs(data)
        } else {
          setGigs([])
        }
      } catch (err) {
        setGigs([])
      }
      setLoading(false)
    }
    load()
  }, [])

  const filtered = gigs.filter((gig) => {
    if (!query) return true
    const q = query.toLowerCase()
    return gig.title.toLowerCase().includes(q) || gig.description.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className='flex items-center justify-between mb-6'>
        <h1
          className='text-2xl font-semibold'
          style={{ color: 'var(--text)' }}
        >
          Gigs
        </h1>
        <div className='flex gap-2'>
          <input
            className='border px-3 py-2 rounded'
            placeholder='Search gigs...'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {loading && <p>Loading...</p>}
      {!loading && (
        <div className='flex flex-col space-y-4 max-h-[70vh] overflow-y-auto pr-2'>
          {filtered.map((g) => (
            <GigCard key={g.id} gig={g} />
          ))}
          {filtered.length === 0 && <p className='text-gray-600'>No gigs found</p>}
        </div>
      )}
    </div>
  )
}