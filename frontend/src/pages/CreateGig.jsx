import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Form for clients to post a new job (gig).  Allows uploading an
 * optional image which is converted to a base64 data URI and stored
 * in the backend.  Only authenticated clients can access this page.
 */
export default function CreateGig() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [budget, setBudget] = useState('')
  const [currency, setCurrency] = useState('৳')
  const [deadline, setDeadline] = useState('')
  const [imageBase64, setImageBase64] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Redirect non‑clients to home or login
  if (!user) {
    return (
      <p className='text-center'>Please log in as a client to post a job.</p>
    )
  }
  if (user && user.role !== 'client') {
    return (
      <p className='text-center'>Only clients can post jobs.</p>
    )
  }

  function handleImageChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setImageBase64(reader.result)
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    // Basic validation: require title and description.  Budget is only
    // required if currency is not "Discuss".
    if (!title || !description) {
      setError('Title and description are required.')
      return
    }
    if (currency !== 'Discuss' && !budget) {
      setError('Budget is required for selected currency.')
      return
    }
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title,
          description,
          // Pass budget as null if currency is Discuss
          budget: currency === 'Discuss' ? null : budget,
          currency,
          deadline: deadline || null,
          imageBase64,
        })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create job')
      } else {
        setSuccess('Job created successfully!')
        // redirect to gig detail or dashboard
        navigate('/dashboard')
      }
    } catch (err) {
      setError('Failed to create job')
    }
  }

  return (
    <div className='max-w-3xl mx-auto card'>
      <h2 className='text-xl font-semibold mb-4'>Post a New Job</h2>
      {error && <p className='text-red-600 mb-2'>{error}</p>}
      {success && <p className='text-green-600 mb-2'>{success}</p>}
      <form onSubmit={handleSubmit} className='space-y-4'>
        <input
          className='w-full border px-3 py-2 rounded'
          placeholder='Title'
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <textarea
          className='w-full border px-3 py-2 rounded'
          placeholder='Description'
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          required
        ></textarea>
        <div className='flex gap-2'>
          <select
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value)
              // Clear budget when switching to Discuss to avoid confusion
              if (e.target.value === 'Discuss') setBudget('')
            }}
            className='border px-3 py-2 rounded'
          >
            <option value='৳'>৳ (BDT)</option>
            <option value='$'>$ (USD)</option>
            <option value='€'>€ (EUR)</option>
            <option value='Discuss'>Upon discussion</option>
          </select>
          <input
            className='flex-1 border px-3 py-2 rounded'
            placeholder={currency === 'Discuss' ? 'Discuss' : 'Budget amount'}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            disabled={currency === 'Discuss'}
            required={currency !== 'Discuss'}
          />
        </div>
        <input
          className='w-full border px-3 py-2 rounded'
          placeholder='Deadline (optional)'
          type='date'
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
        <div>
          <label className='block mb-1 text-sm font-medium'>Image (optional)</label>
          <input type='file' accept='image/png,image/jpeg,image/webp' onChange={handleImageChange} />
          {imageBase64 && (
            <img src={imageBase64} alt='Preview' className='mt-2 w-24 h-24 object-cover rounded' />
          )}
        </div>
        <button type='submit' className='btn-indigo'>Create Job</button>
      </form>
    </div>
  )
}