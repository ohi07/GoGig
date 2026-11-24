import React from 'react'
import { Link } from 'react-router-dom'

export default function GigCard({ gig }) {
  /**
   * Determine the correct image URL for this gig.
   *
   * When running via the Vite dev server the API is on port 5000.  If the
   * gig includes an `image` field we treat it as a relative path under
   * `/uploads/` and prefix it with the backend origin.  Absolute URLs are
   * used as‑is.  When no image is present we fall back to a tiny base64
   * placeholder so that the `<img>` tag never collapses or shows the alt
   * text.  A remote placeholder was removed because it fails when offline.
   */
  const tinyPlaceholder =
    'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  let imageSrc = tinyPlaceholder;
  if (gig.image) {
    try {
      if (/^https?:\/\//.test(gig.image)) {
        // Already absolute
        imageSrc = gig.image;
      } else {
        const origin = window.location.origin;
        const backend = origin;
        imageSrc = backend + gig.image;
      }
    } catch {
      imageSrc = tinyPlaceholder;
    }
  }
  // Compose a truncated description and currency label
  const desc = gig.description || '';
  const shortDesc = desc.length > 60 ? desc.slice(0, 60) + '…' : desc;
  // Determine budget display.  If budget is null and currency is 'Discuss',
  // show 'Upon discussion'.  Otherwise map currency codes to symbols.
  let budgetDisplay = ''
  if (gig.currency === 'Discuss' || gig.budget === null || gig.budget === undefined) {
    budgetDisplay = 'Upon discussion'
  } else {
    const symbols = { BDT: '৳', USD: '$', EUR: '€' }
    const symbol = symbols[gig.currency] || gig.currency || '৳'
    budgetDisplay = `${symbol}${gig.budget}`
  }
  return (
    <div className='card hover:shadow-lg transition-shadow flex flex-col'>
      <div className='flex items-center gap-4'>
        <img
          src={imageSrc}
          alt=''
          className='w-20 h-20 rounded-md object-cover flex-shrink-0'
        />
        <div className='flex-1'>
          <h3 className='text-lg font-semibold' style={{ color: 'var(--text)' }}>
            {gig.title}
          </h3>
          <p className='text-sm mt-1' style={{ color: 'var(--text)' }}>
            {shortDesc}
          </p>
        </div>
      </div>
      <div className='mt-3 flex items-center justify-between'>
        <div className='font-bold' style={{ color: 'var(--primary)' }}>
          {budgetDisplay}
        </div>
        <Link
          to={'/gigs/' + gig.id}
          className='text-sm hover:underline'
          style={{ color: 'var(--primary)' }}
        >
          View
        </Link>
      </div>
    </div>
  );
}
