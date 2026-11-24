export function formatTotal(amountMinor, currency) {
  if (amountMinor == null) return 'Price to be agreed'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountMinor / 100)
}

export function paymentLabel(order) {
  if (order.paymentStatus === 'paid') {
    return order.provider === 'demo' ? 'Demo payment recorded' : 'Stripe test payment confirmed'
  }
  return order.paymentStatus === 'agreement_required' ? 'Awaiting price' : 'Awaiting payment'
}

export async function orderRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}
