import React, { useCallback, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import useLiveRefresh from '../hooks/useLiveRefresh'
import { formatTotal, orderRequest, paymentLabel } from '../utils/order'

export default function Orders() {
  const { user, loading } = useAuth()
  const { id } = useParams()
  const [query] = useSearchParams()
  const [orders, setOrders] = useState([])
  const [order, setOrder] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (signal) => {
    try {
      const result = await orderRequest(id ? `/api/orders/${id}` : '/api/orders', { signal })
      if (signal?.aborted) return
      if (id) setOrder(result)
      else setOrders(result)
    } catch (error) {
      if (!signal?.aborted) setError(error.message)
    } finally {
      if (!signal?.aborted) setLoaded(true)
    }
  }, [id])
  useLiveRefresh(Boolean(user), refresh)

  async function submit(action, data) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await orderRequest(
        action === 'complete' ? `/api/jobs/${id}/complete` : `/api/orders/${id}/${action}`,
        { method: action === 'complete' ? 'PUT' : 'POST', body: JSON.stringify(data || {}) },
      )
      if (result.url) window.location.assign(result.url)
      else if (action === 'complete') await refresh()
      else setOrder(result)
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  function submitForm(action, event) {
    event.preventDefault()
    void submit(action, Object.fromEntries(new FormData(event.currentTarget)))
  }

  if (loading || (user && !loaded)) return <p>Loading orders…</p>
  if (!user) return <p><Link className='font-semibold underline' to='/login'>Log in</Link> to view your orders.</p>
  if (!id) {
    return (
      <div className='max-w-4xl mx-auto space-y-5'>
        <h1 className='text-3xl font-semibold'>Orders</h1>
        {error && <p role='alert' className='text-red-600'>{error}</p>}
        {orders.length === 0 && <p className='card'>Orders appear here after a client accepts a proposal.</p>}
        <ul className='space-y-3'>
          {orders.map((item) => (
            <li key={item.id}>
              <Link to={`/orders/${item.id}`} className='card flex flex-wrap justify-between gap-3 hover:shadow-md'>
                <span>
                  <span className='block font-semibold'>{item.title}</span>
                  <span className='text-sm text-gray-600'>{item.clientName} · {item.freelancerName}</span>
                </span>
                <span className='text-right'>
                  <span className='block font-medium capitalize'>{item.status}</span>
                  <span className='text-sm text-gray-600'>{paymentLabel(item)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (order?.id !== id) return <p role={error ? 'alert' : undefined}>{error || 'Loading order…'}</p>
  const isClient = user.id === order.clientId
  const isFreelancer = user.id === order.freelancerId
  const paid = order.paymentStatus === 'paid'

  return (
    <div className='max-w-4xl mx-auto space-y-6'>
      <Link to='/orders' className='order-actions text-sm font-semibold underline'>All orders</Link>
      <section className='card space-y-5 order-receipt'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <p className='text-sm text-gray-600'>Order #{order.id}</p>
            <h1 className='text-3xl font-semibold'>{order.title}</h1>
          </div>
          <span className='px-3 py-1 border rounded-full capitalize text-sm'>{order.status}</span>
        </div>
        <dl className='grid grid-cols-1 sm:grid-cols-3 gap-4 border-y py-4'>
          <div><dt className='text-sm text-gray-600'>Client</dt><dd>{order.clientName}</dd></div>
          <div><dt className='text-sm text-gray-600'>Freelancer</dt><dd>{order.freelancerName}</dd></div>
          <div><dt className='text-sm text-gray-600'>Total</dt><dd>{formatTotal(order.amountMinor, order.currency)}</dd></div>
        </dl>
        <div>
          <h2 className='font-semibold'>Payment</h2>
          <p>{paymentLabel(order)}</p>
          {paid && <p className='text-sm text-gray-600'>Recorded {new Date(order.paidAt).toLocaleString()}</p>}
        </div>
        {order.deliveryNote && (
          <div>
            <h2 className='font-semibold'>Delivery</h2>
            <p className='whitespace-pre-wrap break-words'>{order.deliveryNote}</p>
          </div>
        )}
      </section>
      <div className='order-actions space-y-5'>
        {error && <p role='alert' className='text-red-600'>{error}</p>}
        {query.has('checkout') && !paid && <p role='status'>Waiting for Stripe confirmation.</p>}
        {isClient && order.paymentStatus === 'agreement_required' && (
          <form className='card space-y-3' onSubmit={event => submitForm('terms', event)}>
            <h2 className='text-lg font-semibold'>Set the agreed price</h2>
            <p className='text-sm text-gray-600'>Confirm the amount with your freelancer in order chat first.</p>
            <div className='flex flex-wrap gap-3'>
              <label className='flex flex-col gap-1'>Currency
                <select name='currency' defaultValue='$'>
                  {order.paymentMode === 'demo' && <option value='৳'>BDT</option>}
                  <option value='$'>USD</option><option value='€'>EUR</option>
                </select>
              </label>
              <label className='flex flex-col gap-1'>Amount
                <input name='amount' type='number' min='0.01' max='9999999.99' step='0.01' required />
              </label>
            </div>
            <button type='submit' disabled={busy} className='btn-indigo'>Save agreed price</button>
          </form>
        )}
        <div className='flex flex-wrap items-center gap-4'>
          {order.canPay && <button className='btn-indigo' disabled={busy} onClick={() => submit('checkout')}>{order.paymentMode === 'demo' ? 'Record demo payment' : 'Open Stripe test checkout'}</button>}
          {isClient && !order.canPay && order.paymentStatus === 'unpaid' && <p>Stripe test checkout is available for USD and EUR orders.</p>}
          {isClient && order.status === 'delivered' && <button className='btn-indigo' disabled={busy} onClick={() => submit('complete')}>Approve and complete</button>}
          {paid && <button className='underline font-medium' onClick={() => window.print()}>Print receipt</button>}
          {(isClient || isFreelancer) && <Link to={`/chat/${id}`} className='underline font-medium'>Order chat</Link>}
          <Link to={`/gigs/${order.jobId}`} className='underline font-medium'>View job</Link>
          <Link to={`/tickets?order=${id}`} className='underline font-medium'>Get support</Link>
        </div>
        {isFreelancer && paid && order.status === 'assigned' && (
          <form className='card space-y-3' onSubmit={event => submitForm('deliver', event)}>
            <label className='block font-semibold' htmlFor='delivery'>Delivery note</label>
            <textarea name='note' id='delivery' rows={3} maxLength={4000} required className='w-full' placeholder='Add a summary or a link to your completed work.' />
            <button type='submit' disabled={busy} className='btn-indigo'>Submit delivery</button>
          </form>
        )}
      </div>
    </div>
  )
}
