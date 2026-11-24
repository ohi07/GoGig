import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Registration page.  Allows new users to create an account as a client
 * or freelancer. On success the user is redirected to the dashboard.
 */
export default function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('client')
  // Additional profile fields
  const [age, setAge] = useState('')
  const [skills, setSkills] = useState('')
  const [education, setEducation] = useState('')
  const [company, setCompany] = useState('')
  const [about, setAbout] = useState('')
  const [error, setError] = useState('')
  const { register } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    // Normalize skills string into array (handled on backend but pass as string)
    const err = await register({
      name,
      email,
      password,
      role,
      age: age || null,
      skills: skills || null,
      education: education || null,
      company: company || null,
      about: about || null
    })
    if (err) {
      setError(err)
    } else {
      setError('')
      navigate('/dashboard')
    }
  }

  return (
    <div className='max-w-md mx-auto card'>
      <h2 className='text-xl font-semibold mb-4' style={{ color: 'var(--text)' }}>
        Join GoGig
      </h2>
      {error && <p className='text-red-600 mb-2'>{error}</p>}
      <form onSubmit={handleSubmit} className='space-y-4'>
        <input
          className='w-full border px-3 py-2 rounded'
          placeholder='Name'
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className='w-full border px-3 py-2 rounded'
          placeholder='Email'
          type='email'
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type='password'
          className='w-full border px-3 py-2 rounded'
          placeholder='Password (10 or more characters)'
          minLength={10}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <select
          className='w-full border px-3 py-2 rounded'
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value='client'>Client</option>
          <option value='freelancer'>Freelancer</option>
        </select>

        {/* Conditional fields based on role */}
        {role === 'freelancer' && (
          <>
            <input
              type='number'
              className='w-full border px-3 py-2 rounded'
              placeholder='Age (optional)'
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
              placeholder='Education (optional)'
              value={education}
              onChange={(e) => setEducation(e.target.value)}
            />
            <textarea
              className='w-full border px-3 py-2 rounded'
              placeholder='About you (optional)'
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              rows={3}
            ></textarea>
          </>
        )}
        {role === 'client' && (
          <>
            <input
              className='w-full border px-3 py-2 rounded'
              placeholder='Company / Organization (optional)'
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
            <textarea
              className='w-full border px-3 py-2 rounded'
              placeholder='About you or your company (optional)'
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              rows={3}
            ></textarea>
          </>
        )}
        <button type='submit' className='w-full btn-indigo'>Sign up</button>
      </form>
    </div>
  );
}