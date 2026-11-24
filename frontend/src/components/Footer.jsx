import React from 'react'
export default function Footer(){
  // Use theme variables for footer background and text.  Show builder credit.
  const year = new Date().getFullYear()
  return (
    <footer className='border-t mt-8' style={{ backgroundColor: 'var(--card-bg)', color: 'var(--text)' }}>
      <div className='container py-6 text-center text-sm'>
        © {year} GoGig — Built by <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>ohi07</span>
      </div>
    </footer>
  )
}
