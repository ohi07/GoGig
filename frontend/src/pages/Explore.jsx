import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import GigCard from '../components/GigCard'

/**
 * Explore page.  Shows a feed of gig posts (similar to short social
 * updates) alongside open job listings.  Users can create their own
 * posts with optional images and comment on posts via the post detail
 * page.  Jobs are fetched from the backend and filtered based on
 * the current user; open and unflagged jobs are shown for
 * visitors and freelancers.  Posts hide flagged content for
 * non‑admin/moderator users.
 */
export default function Explore() {
  const { user } = useAuth()
  const [posts, setPosts] = useState([])
  const [gigs, setGigs] = useState([])
  const [params] = useSearchParams()
  const search = params.get('q') || ''
  const [query, setQuery] = useState(search)
  useEffect(() => setQuery(search), [search])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [imageBase64, setImageBase64] = useState(null)
  const [error, setError] = useState('')
  const [userMap, setUserMap] = useState({})

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      // Fetch open jobs for explore (no token to get open unflagged)
      const jobsRes = await fetch('/api/jobs')
      const jobsData = await jobsRes.json()
      if (jobsRes.ok) {
        setGigs(jobsData)
      } else {
        setGigs([])
      }
      // Fetch posts
      const token = localStorage.getItem('token')
      const postsRes = await fetch('/api/posts', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const postsData = await postsRes.json()
      if (postsRes.ok) {
        setPosts(postsData)
        // Build user map for post authors
        const ids = postsData.map((p) => p.userId)
        const uniqueIds = Array.from(new Set(ids))
        const newMap = {}
        for (const uid of uniqueIds) {
          try {
            const resUser = await fetch(`/api/users/${uid}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
            const dataUser = await resUser.json()
            if (resUser.ok) {
              newMap[uid] = dataUser
            }
          } catch (err) {
            // ignore
          }
        }
        setUserMap((prev) => ({ ...prev, ...newMap }))
      } else {
        setPosts([])
      }
    } catch (err) {
      setGigs([])
      setPosts([])
      setError('Failed to load data')
    }
    setLoading(false)
  }

  // Toggle heart reaction on a post
  async function togglePostReaction(postId) {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`/api/posts/${postId}/react`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, reactions: data.reactions } : p))
        );
      }
    } catch (err) {
      // ignore
    }
  }

  // Delete a post (owner or admin/mod)
  async function deletePost(postId) {
    const token = localStorage.getItem('token')
    if (!token) return
    const reason = window.prompt('Reason for deleting this post?', '') || ''
    try {
      const res = await fetch(`/api/posts/${postId}?reason=${encodeURIComponent(reason)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== postId))
      }
    } catch (err) {
      // ignore
    }
  }

  // Report (flag) a post
  async function reportPost(postId) {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const res = await fetch(`/api/posts/${postId}/report`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        window.alert('Post has been reported to moderators.')
      }
    } catch (err) {
      // ignore
    }
  }

  async function handlePostSubmit(e) {
    e.preventDefault()
    setError('')
    if (!content.trim()) {
      setError('Content is required')
      return
    }
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: content.trim(), imageBase64 }),
      })
      const data = await res.json()
      if (res.ok) {
        setContent('')
        setImageBase64(null)
        // Prepend new post
        setPosts((prev) => [data, ...prev])
        // Add author to map
        if (!userMap[data.userId]) {
          const profileRes = await fetch(`/api/users/${data.userId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
          const profileData = await profileRes.json()
          if (profileRes.ok) {
            setUserMap((prev) => ({ ...prev, [data.userId]: profileData }))
          }
        }
      } else {
        setError(data.error || 'Failed to create post')
      }
    } catch (err) {
      setError('Failed to create post')
    }
  }

  // Filter gigs based on query
  const filteredGigs = gigs.filter((gig) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      gig.title.toLowerCase().includes(q) ||
      gig.description.toLowerCase().includes(q)
    )
  })

  return (
    <div className='space-y-10'>
      {/* Create Post section */}
      {user && (
        <div className='card p-4'>
          <h2 className='text-lg font-semibold mb-2'>Create a Post</h2>
          {error && <p className='text-red-600 mb-2'>{error}</p>}
          <form onSubmit={handlePostSubmit} className='space-y-3'>
            <textarea
              className='w-full border px-3 py-2 rounded'
              placeholder="What's on your mind?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
            ></textarea>
            <div>
              <label className='block mb-1 text-sm font-medium'>Image (optional)</label>
              <input
                type='file'
                accept='image/png,image/jpeg,image/webp'
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (!file) {
                    setImageBase64(null)
                    return
                  }
                  const reader = new FileReader()
                  reader.onloadend = () => {
                    setImageBase64(reader.result)
                  }
                  reader.readAsDataURL(file)
                }}
              />
              {imageBase64 && (
                <img
                  src={imageBase64}
                  alt='Preview'
                  className='mt-2 w-24 h-24 object-cover rounded'
                />
              )}
            </div>
            <button type='submit' className='btn-indigo'>Post</button>
          </form>
        </div>
      )}

      {/* Posts feed */}
      <section>
        <h2
          className='text-2xl font-semibold mb-4'
          style={{ color: 'var(--primary)' }}
        >
          Gig Posts
        </h2>
        {loading && <p>Loading…</p>}
        {!loading && posts.length === 0 && (
          <p style={{ color: 'var(--text)' }}>No posts yet. Be the first to share!</p>
        )}
        <div className='flex flex-col space-y-4'>
          {posts.map((post) => {
            // Determine image URL
            let imageSrc = null
            if (post.image) {
              if (/^https?:\/\//.test(post.image)) {
                imageSrc = post.image
              } else {
                const origin = window.location.origin
                const backend = origin
                imageSrc = backend + post.image
              }
            }
            const author = userMap[post.userId]
            return (
                <div key={post.id} className='card p-4'>
                <div className='flex items-center gap-2 mb-2'>
                  {author && author.avatar && (
                    (() => {
                      let src = author.avatar
                      if (!/^https?:\/\//.test(src)) {
                        const origin = window.location.origin
                        const backend = origin
                        src = backend + src
                      }
                      return (
                        <img
                          src={src}
                          alt='avatar'
                          className='w-8 h-8 rounded-full object-cover'
                        />
                      )
                    })()
                  )}
                  <div>
                    {author ? (
                      <Link
                        to={`/profile/${author.id}`}
                        className='font-semibold hover:underline'
                        style={{ color: 'var(--primary)' }}
                      >
                        {author.name}
                      </Link>
                    ) : (
                      <span className='font-semibold'>{post.userId}</span>
                    )}
                    <span className='text-xs text-gray-500 ml-2'>
                      {new Date(post.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <p style={{ color: 'var(--text)' }}>{post.content}</p>
                {imageSrc && (
                  <img
                    src={imageSrc}
                    alt='post visual'
                    className='mt-2 w-full max-h-64 object-cover rounded'
                  />
                )}
                <div className='mt-2 text-sm flex items-center gap-4'>
                  {/* Heart reaction button */}
                  {user && (
                    <button
                      type='button'
                      onClick={() => togglePostReaction(post.id)}
                      className='flex items-center gap-1 text-sm'
                      style={{ color: post.reactions && post.reactions[user?.id] ? 'red' : 'var(--primary)' }}
                    >
                      ❤️
                      {post.reactions && Object.keys(post.reactions).length > 0 && (
                        <span>{Object.keys(post.reactions).length}</span>
                      )}
                    </button>
                  )}
                  <Link
                    to={`/posts/${post.id}`}
                    className='hover:underline'
                    style={{ color: 'var(--primary)' }}
                  >
                    View & Comment
                  </Link>
                  {/* Post actions */}
                  {user && user.id === post.userId && (
                    <button
                      type='button'
                      onClick={() => deletePost(post.id)}
                      className='text-xs text-red-500 hover:underline'
                    >
                      Delete
                    </button>
                  )}
                  {user && user.id !== post.userId && (
                    <button
                      type='button'
                      onClick={() => reportPost(post.id)}
                      className='text-xs text-yellow-600 hover:underline'
                    >
                      Flag
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Gigs feed */}
      <section>
        <div className='flex items-center justify-between mb-4'>
          <h2 className='text-2xl font-semibold' style={{ color: 'var(--primary)' }}>
            Jobs
          </h2>
          <input
            className='border px-3 py-2 rounded'
            placeholder='Search jobs…'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {loading && <p>Loading…</p>}
        {!loading && filteredGigs.length === 0 && (
          <p style={{ color: 'var(--text)' }}>No jobs found.</p>
        )}
        {!loading && (
          <div className='flex flex-col space-y-4 max-h-[60vh] overflow-y-auto pr-2'>
            {filteredGigs.map((g) => (
              <GigCard key={g.id} gig={g} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}