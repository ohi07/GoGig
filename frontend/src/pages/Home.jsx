import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import GigCard from '../components/GigCard'
import { useAuth } from '../context/AuthContext'

const searches = ['Design', 'Development', 'Writing', 'Marketing']

export default function Home() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [gigs, setGigs] = useState([])
  const [query, setQuery] = useState('')
  const [state, setState] = useState('loading')
  const canPost = user?.role === 'client' || user?.role === 'admin'

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/jobs', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Jobs unavailable')
        return response.json()
      })
      .then(items => {
        setGigs(items.slice().reverse().slice(0, 6))
        setState('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error')
      })
    return () => controller.abort()
  }, [])

  function handleSearch(event) {
    event.preventDefault()
    navigate(query.trim() ? `/explore?q=${encodeURIComponent(query.trim())}` : '/explore')
  }

  return (
    <div className='home-page space-y-12'>
      <section className='home-hero'>
        <div className='home-hero-content'>
          <h1>Good work starts<br className='hidden sm:block' /> with a gig.</h1>
          <p>Post a project, find independent talent, or pitch for work you’d love to do.</p>
          <form role='search' onSubmit={handleSearch} className='home-search'>
            <label className='sr-only' htmlFor='job-search'>Search jobs</label>
            <input id='job-search' type='search' value={query} onChange={event => setQuery(event.target.value)} placeholder='Search open jobs' />
            <button className='btn-indigo' type='submit'>Search</button>
          </form>
          <div className='flex flex-wrap gap-x-5 gap-y-2 mt-5'>
            <Link className='home-text-link' to='/explore'>Browse all jobs</Link>
            {(!user || canPost) && <Link className='home-text-link' to={canPost ? '/gigs/create' : '/signup'}>Post a job</Link>}
          </div>
        </div>
        <img className='home-hero-image' src='/images/workspace.webp' alt='A freelance workspace with a laptop and a monitor' fetchPriority='high' />
      </section>

      <section aria-label='Popular searches' className='home-search-topics flex flex-wrap items-center gap-3'>
        <h2 className='font-semibold mr-2'>Popular searches</h2>
        {searches.map(label => <Link key={label} to={`/explore?q=${label}`} className='home-chip'>{label}</Link>)}
      </section>

      <section className='space-y-4'>
        <div className='flex items-center justify-between gap-4'>
          <h2 className='text-2xl sm:text-3xl font-semibold'>Open jobs</h2>
          <Link className='home-text-link' to='/explore'>View all</Link>
        </div>
        {state === 'loading' && <p>Loading open jobs…</p>}
        {state === 'error' && <p role='alert'>Open jobs are temporarily unavailable.</p>}
        {state === 'ready' && gigs.length === 0 && <p className='card'>No jobs are open yet.</p>}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {gigs.map(gig => <GigCard key={gig.id} gig={gig} />)}
        </div>
      </section>
    </div>
  )
}
