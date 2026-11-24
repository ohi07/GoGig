import React, { useCallback, useState } from 'react'
import useLiveRefresh from '../hooks/useLiveRefresh'
import { formatTotal, orderRequest } from '../utils/order'

const labels = {
  users: 'Registered users',
  openJobs: 'Open jobs',
  orders: 'Orders',
  completedJobs: 'Completed jobs',
  openTickets: 'Open tickets',
  pendingModeration: 'Flagged content',
}

export default function Analytics() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const refresh = useCallback(async (signal) => {
    try {
      const stats = await orderRequest('/api/admin/analytics', { signal })
      if (!signal?.aborted) {
        setData(stats)
        setError('')
      }
    } catch (error) {
      if (!signal?.aborted) setError(error.message)
    }
  }, [])
  useLiveRefresh(true, refresh)

  if (error) return <p className='text-red-600' role='alert'>{error}</p>
  if (!data) return <p>Loading analytics…</p>
  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between gap-3'>
        <h3 className='text-xl font-semibold'>Platform analytics</h3>
        <button type='button' className='text-sm underline' onClick={() => refresh()}>Refresh metrics</button>
      </div>
      <dl className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
        {Object.entries(labels).map(([key, label]) => (
          <div className='card' key={key}>
            <dt className='text-sm text-gray-600'>{label}</dt>
            <dd className='text-2xl font-semibold'>{data[key]}</dd>
          </div>
        ))}
      </dl>
      <div className='card space-y-2'>
        <h4 className='font-semibold'>Test payment volume</h4>
        {Object.keys(data.paymentVolume).length === 0 && <p className='text-sm text-gray-600'>No test payments recorded.</p>}
        {Object.entries(data.paymentVolume).flatMap(([provider, totals]) =>
          Object.entries(totals).map(([currency, amount]) => (
            <p key={provider + currency}>{provider === 'demo' ? 'Demo' : 'Stripe test'} · {currency} · {formatTotal(amount, currency)}</p>
          ))
        )}
      </div>
    </section>
  )
}
