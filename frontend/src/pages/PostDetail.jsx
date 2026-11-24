import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Detailed view for a single gig post.  Shows the post content,
 * optional image, author information and all comments.  Logged in
 * users can add a comment.  Comments and post data are fetched
 * from the backend.  Flagged posts are hidden from regular
 * users by the backend.
 */
export default function PostDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  const [userMap, setUserMap] = useState({})
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  // Toggle heart on post
  async function togglePostReaction(idPost) {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`/api/posts/${idPost}/react`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setPost((prev) => prev ? { ...prev, reactions: data.reactions } : prev);
      }
    } catch (err) {
      // ignore
    }
  }

  // Toggle heart on comment
  async function toggleCommentReaction(commentId) {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`/api/posts/${id}/comments/${commentId}/react`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, reactions: data.reactions } : c))
        );
      }
    } catch (err) {
      // ignore
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function load() {
    setLoading(true)
    setMessage('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/posts/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = await res.json()
      if (res.ok) {
        setPost(data)
        setComments(data.comments || [])
        // Fetch author and commenter user details
        const ids = [data.userId, ...(data.comments || []).map((c) => c.userId)]
        const unique = Array.from(new Set(ids))
        const newMap = {}
        for (const uid of unique) {
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
      } else {
        setPost(null)
        setComments([])
        setMessage(data.error || 'Post not found')
      }
    } catch (err) {
      setPost(null)
      setComments([])
      setMessage('Failed to load post')
    }
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!content.trim()) {
      setMessage('Comment content is required')
      return
    }
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/posts/${id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: content.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setContent('')
        // Reload comments
        load()
      } else {
        setMessage(data.error || 'Failed to add comment')
      }
    } catch (err) {
      setMessage('Failed to add comment')
    }
  }

  // Delete or report the post
  async function handleDelete() {
    const token = localStorage.getItem('token')
    if (!token) return
    const reason = window.prompt('Reason for deleting this post?', '') || ''
    try {
      const res = await fetch(`/api/posts/${post.id}?reason=${encodeURIComponent(reason)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        // Redirect to explore page after deletion
        window.location.href = '/explore'
      }
    } catch (err) {
      // ignore
    }
  }
  async function handleReport() {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const res = await fetch(`/api/posts/${post.id}/report`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        window.alert('Post has been reported')
      }
    } catch (err) {
      // ignore
    }
  }

  if (loading) {
    return <p>Loading post…</p>
  }
  if (!post) {
    return <p className='text-red-500'>{message || 'Post not available'}</p>
  }
  // Determine image path
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
    <div className='max-w-3xl mx-auto space-y-6'>
      <div
        className='card p-4'
        onDoubleClick={() => {
          if (user) togglePostReaction(post.id)
        }}
      >
        <div className='flex items-center gap-2 mb-2'>
          {author && author.avatar && (() => {
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
          })()}
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
            className='mt-2 w-full max-h-96 object-cover rounded'
          />
        )}
        {/* Reaction for post */}
        <div className='mt-2 flex items-center gap-2 text-sm'>
          {user && (
            <button
              type='button'
              onClick={() => togglePostReaction(post.id)}
              className='flex items-center gap-1'
              style={{ color: post.reactions && post.reactions[user?.id] ? 'red' : 'var(--primary)' }}
            >
              ❤️
              {post.reactions && Object.keys(post.reactions).length > 0 && (
                <span>{Object.keys(post.reactions).length}</span>
              )}
            </button>
          )}
          {/* Delete or report actions */}
          {user && user.id === post.userId && (
            <button
              onClick={handleDelete}
              className='text-xs text-red-500 hover:underline'
            >
              Delete Post
            </button>
          )}
          {user && user.id !== post.userId && (
            <button
              onClick={handleReport}
              className='text-xs text-yellow-600 hover:underline'
            >
              Flag Post
            </button>
          )}
        </div>
      </div>

      {/* Comments section */}
      <div className='card p-4'>
        <h3 className='text-lg font-semibold mb-2'>Comments</h3>
        {comments.length === 0 && (
          <p className='text-gray-500'>No comments yet.</p>
        )}
        <ul className='space-y-3 mb-4'>
          {comments.map((c) => {
            const commenter = userMap[c.userId];
            const reactionCount = c.reactions ? Object.keys(c.reactions).length : 0;
            const reacted = c.reactions && c.reactions[user?.id];
            return (
              <li
                key={c.id}
                className='border rounded p-2'
                onDoubleClick={() => {
                  if (user) toggleCommentReaction(c.id)
                }}
              >
                <div className='mb-1 flex items-center gap-2'>
                  {commenter ? (
                    <Link
                      to={`/profile/${commenter.id}`}
                      className='font-semibold text-sm hover:underline'
                      style={{ color: 'var(--primary)' }}
                    >
                      {commenter.name}
                    </Link>
                  ) : (
                    <span className='font-semibold text-sm'>{c.userId}</span>
                  )}
                  <span className='text-xs text-gray-500'>
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className='text-sm' style={{ color: 'var(--text)' }}>{c.content}</p>
                {user && (
                  <button
                    type='button'
                    onClick={() => toggleCommentReaction(c.id)}
                    className='mt-1 text-xs flex items-center gap-1'
                    style={{ color: reacted ? 'red' : 'var(--primary)' }}
                  >
                    ❤️ {reactionCount > 0 && <span>{reactionCount}</span>}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {user && (
          <form onSubmit={handleSubmit} className='space-y-3'>
            {message && <p className='text-red-500'>{message}</p>}
            <textarea
              className='w-full border px-3 py-2 rounded'
              placeholder='Add a comment'
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
            ></textarea>
            <button type='submit' className='btn-indigo'>Comment</button>
          </form>
        )}
      </div>
    </div>
  )
}