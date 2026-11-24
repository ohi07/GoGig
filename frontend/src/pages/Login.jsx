import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Login page.  Allows an existing user to log in with their email and
 * password.  On success the user is redirected to the dashboard.  If
 * authentication fails an error message is displayed.
 */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    const err = await login({ email, password });
    if (err) {
      setError(err);
    } else {
      setError('');
      navigate('/dashboard');
    }
  }

  /**
   * Use a theme‑aware card container instead of a fixed white
   * background.  This card inherits its background from CSS
   * variables defined in `index.css` so it adapts to light, dark and
   * night themes automatically.  Inputs also inherit theme colors via
   * global CSS rules.
   */
  return (
    <div className='max-w-md mx-auto card'>
      <h2 className='text-xl font-semibold mb-4' style={{ color: 'var(--text)' }}>
        Log in to GoGig
      </h2>
      {error && <p className='text-red-600 mb-2'>{error}</p>}
      <form onSubmit={handleSubmit} className='space-y-4'>
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
          placeholder='Password'
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type='submit' className='w-full btn-indigo'>Log in</button>
      </form>
    </div>
  );
}