'use client'
import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

function ProgressBarInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const bar = document.getElementById('progress-bar')
    if (!bar) return
    bar.style.width = '0%'
    bar.style.opacity = '1'
    bar.style.transition = 'none'
    
    requestAnimationFrame(() => {
      bar.style.transition = 'width 0.3s ease'
      bar.style.width = '70%'
    })

    const timer = setTimeout(() => {
      bar.style.width = '100%'
      setTimeout(() => { bar.style.opacity = '0' }, 300)
    }, 100)

    return () => clearTimeout(timer)
  }, [pathname, searchParams])

  return null
}

export default function ProgressBar() {
  return (
    <>
      <div id="progress-bar"
        style={{
          position: 'fixed', top: 0, left: 0, height: '3px',
          backgroundColor: '#3b82f6', zIndex: 9999,
          width: '0%', opacity: 0,
          boxShadow: '0 0 8px rgba(59,130,246,0.6)',
          transition: 'width 0.3s ease',
        }}
      />
      <Suspense fallback={null}>
        <ProgressBarInner />
      </Suspense>
    </>
  )
}
