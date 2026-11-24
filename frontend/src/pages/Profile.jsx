import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Profile page.  Displays information about a user.  If viewing your
 * own profile you can edit your details.  Admin profiles are
 * private unless you are the admin or viewing your own profile.
 */
export default function Profile() {
  const { id } = useParams()
  const { user: currentUser, updateProfile } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  // Form state for edits
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [skills, setSkills] = useState('')
  const [education, setEducation] = useState('')
  const [company, setCompany] = useState('')
  const [about, setAbout] = useState('')
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarBase64, setAvatarBase64] = useState(null)
  // Reviews state
  const [reviews, setReviews] = useState([])
  const [avgRating, setAvgRating] = useState(null)

  // Fetch the profile from the backend
  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        let endpoint
        if (id === 'me') {
          // Always fetch via /api/auth/me for current user
          endpoint = '/api/auth/me'
        } else {
          endpoint = `/api/users/${id}`
        }
        const token = localStorage.getItem('token')
        const res = await fetch(endpoint, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        const data = await res.json()
        if (res.ok) {
          setProfile(data)
          // Prepopulate form for editing if viewing self
          if (currentUser && data.id === currentUser.id) {
            setName(data.name || '')
            setAge(data.age || '')
            setSkills((data.skills || []).join(', '))
            setEducation(data.education || '')
            setCompany(data.company || '')
            setAbout(data.about || '')
          setAvatarPreview(data.avatar || null)
          }
        } else {
          setProfile(null)
          setError(data.error || 'Failed to load profile')
        }
      } catch (err) {
        setProfile(null)
        setError('Failed to load profile')
      }
      setLoading(false)
    }
    load()
  }, [id, currentUser])

  // Load reviews whenever the profile changes
  useEffect(() => {
    async function loadReviews() {
      if (!profile) return
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`/api/users/${profile.id}/reviews`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const data = await res.json()
        if (res.ok) {
          setReviews(data)
          if (data.length > 0) {
            const sum = data.reduce((acc, r) => acc + Number(r.rating), 0)
            setAvgRating(Math.round((sum / data.length) * 10) / 10)
          } else {
            setAvgRating(null)
          }
        } else {
          setReviews([])
          setAvgRating(null)
        }
      } catch (err) {
        setReviews([])
        setAvgRating(null)
      }
    }
    loadReviews()
  }, [profile])

  // Determine if the current user can edit this profile
  const canEdit = currentUser && profile && currentUser.id === profile.id

  async function handleUpdate(e) {
    e.preventDefault()
    // Send updated values
    const updates = {
      name,
      age: age || null,
      skills: skills || null,
      education: education || null,
      company: company || null,
      about: about || null,
    }
    if (avatarBase64) {
      updates.avatarBase64 = avatarBase64
    }
    const err = await updateProfile(updates)
    if (err) {
      setError(err)
    } else {
      setError('')
      setIsEditing(false)
      // Refresh profile data
      setProfile((prev) => (prev ? { ...prev, name, age: age ? Number(age) : null, skills: skills ? skills.split(',').map((s) => s.trim()).filter(Boolean) : [], education, company, about } : prev))
      if (avatarPreview) {
        setProfile((prev) => (prev ? { ...prev, avatar: avatarPreview } : prev))
      }
    }
  }

  if (loading) {
    return <p>Loading...</p>
  }
  if (error) {
    return <p className='text-red-500'>{error}</p>
  }
  if (!profile) {
    return <p>Profile not found</p>
  }

  return (
    <div className='max-w-2xl mx-auto space-y-6'>
      <h2 className='text-3xl font-bold mb-4'>Profile</h2>
      {!isEditing && (
        <>
          <div className='card space-y-2'>
            {/* Avatar */}
            {(() => {
              // Construct a full URL for the avatar if necessary.  If the
              // avatar field is a relative path (e.g. /uploads/...)
              // prepend the backend origin (port 5000).  Absolute URLs are
              // used as provided.  When no avatar is set, nothing is
              // displayed.  Using a self‑invoking function keeps the JSX
              // clean and avoids recomputing this logic every render.
              if (profile.avatar) {
                let src = profile.avatar;
                if (!/^https?:\/\//.test(src)) {
                  const origin = window.location.origin;
                  const backend = origin;
                  src = backend + src;
                }
                return (
                  <img
                    src={src}
                    alt=''
                    className='w-24 h-24 rounded-full object-cover mb-2'
                  />
                );
              }
              return null;
            })()}
            <h3 className='text-2xl font-semibold' style={{ color: 'var(--text)' }}>
              {profile.name}
            </h3>
            <p className='text-sm flex items-center gap-2' style={{ color: 'var(--text)' }}>
              Role: {profile.role}
              {profile.moderator && (
                <span
                  className='inline-block px-2 py-0.5 text-xs rounded font-bold'
                  style={{ backgroundColor: 'var(--primary)', color: '#fff' }}
                >
                  MOD
                </span>
              )}
              {profile.warned && (
                <span
                  className='inline-block px-2 py-0.5 text-xs rounded font-bold'
                  style={{ backgroundColor: '#f97316', color: '#fff' }}
                >
                  WARNED
                </span>
              )}
              {profile.banned && (
                <span
                  className='inline-block px-2 py-0.5 text-xs rounded font-bold'
                  style={{ backgroundColor: '#dc2626', color: '#fff' }}
                >
                  BANNED
                </span>
              )}
            </p>
            {profile.role === 'freelancer' && (
              <>
                {profile.age && (
                  <p style={{ color: 'var(--text)' }}>Age: {profile.age}</p>
                )}
                {profile.education && (
                  <p style={{ color: 'var(--text)' }}>Education: {profile.education}</p>
                )}
                {profile.skills && profile.skills.length > 0 && (
                  <p style={{ color: 'var(--text)' }}>Skills: {profile.skills.join(', ')}</p>
                )}
              </>
            )}
            {profile.role === 'client' && (
              <>
                {profile.company && (
                  <p style={{ color: 'var(--text)' }}>Company: {profile.company}</p>
                )}
              </>
            )}
            {profile.about && (
              <p style={{ color: 'var(--text)' }}>About: {profile.about}</p>
            )}
            {canEdit && (
              <button
                onClick={() => setIsEditing(true)}
                className='mt-3 btn-indigo'
              >
                Edit Profile
              </button>
            )}
            {/* Show message button when viewing another user's profile */}
            {currentUser && profile.id !== currentUser.id && (
              <button
                onClick={() => navigate(`/dm/${profile.id}`)}
                className='mt-3 btn-indigo'
              >
                Message
              </button>
            )}
          </div>
          {/* Reviews section for this user */}
          {reviews && reviews.length > 0 && (
            <div className='card'>
              <h3 className='text-xl font-semibold mb-2'>Reviews</h3>
              {avgRating && (
                <p className='mb-2'>Average Rating: {avgRating.toFixed(1)} / 5</p>
              )}
              <ul className='space-y-2'>
                {reviews.map((rev) => (
                  <li key={rev.id} className='border-b pb-2'>
                    <p className='flex items-center gap-2'>
                      <span className='font-semibold'>{rev.reviewerName || 'Anonymous'}</span>
                      <span className='text-sm'>
                        {Array.from({ length: 5 }, (_, i) => (
                          <span key={i} style={{ color: i < rev.rating ? 'gold' : '#ccc' }}>★</span>
                        ))}
                      </span>
                    </p>
                    {rev.comment && (
                      <p className='text-sm' style={{ color: 'var(--text)' }}>{rev.comment}</p>
                    )}
                    <p className='text-xs text-gray-500'>
                      {new Date(rev.createdAt).toLocaleDateString()}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {isEditing && canEdit && (
        <div className='card'>
          <h3 className='text-xl font-semibold mb-3'>Edit Your Profile</h3>
          {error && <p className='text-red-600 mb-2'>{error}</p>}
          <form onSubmit={handleUpdate} className='space-y-3'>
            <input
              className='w-full border px-3 py-2 rounded'
              placeholder='Name'
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {/* Avatar upload */}
            <div>
              <label className='block mb-1 text-sm font-medium'>Profile Picture</label>
              <input
                type='file'
                accept='image/png,image/jpeg,image/webp'
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (file) {
                    const reader = new FileReader()
                    reader.onloadend = () => {
                      setAvatarBase64(reader.result)
                      setAvatarPreview(reader.result)
                    }
                    reader.readAsDataURL(file)
                  }
                }}
              />
              {avatarPreview && (
                <img
                  src={avatarPreview}
                  alt='Avatar preview'
                  className='w-20 h-20 rounded-full object-cover mt-2'
                />
              )}
            </div>

            {/* Age input for freelancers */}
            {profile.role === 'freelancer' && (
              <>
                <input
                  type='number'
                  className='w-full border px-3 py-2 rounded'
                  placeholder='Age'
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                />
                <input
                  className='w-full border px-3 py-2 rounded'
                  placeholder='Skills (comma separated)'
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                />
                <input
                  className='w-full border px-3 py-2 rounded'
                  placeholder='Education'
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                />
              </>
            )}
            {/* Company input for clients */}
            {profile.role === 'client' && (
              <input
                className='w-full border px-3 py-2 rounded'
                placeholder='Company / Organization'
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            )}
            {/* About section */}
            <textarea
              className='w-full border px-3 py-2 rounded'
              placeholder='About you'
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              rows={3}
            ></textarea>
            <div className='flex gap-3'>
              <button type='submit' className='btn-indigo'>Save</button>
              <button type='button' onClick={() => setIsEditing(false)} className='px-3 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300'>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}