import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/staff-login',
  '/forgot-password',
  '/signup',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Prevent caching of auth pages + redirect back to landing
  if (['/login', '/staff-login', '/signup'].includes(pathname)) {
    const response = NextResponse.next()
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    response.headers.set('Pragma', 'no-cache')
    return response
  }

  // Public paths - skip check
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    // Already logged in — redirect away from login pages
    const cookies = request.cookies.getAll()
    const hasAdminAuth = cookies.some(c =>
      c.name.includes('auth-token') || c.name.includes('access-token') || c.name.startsWith('sb-')
    )
    const hasStaffAuth = request.cookies.get('staff_session') !== undefined
    if ((pathname === '/login' || pathname === '/staff-login') && (hasAdminAuth || hasStaffAuth)) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next()
  }

  // Static files - skip
  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || 
      pathname.includes('.') ) {
    return NextResponse.next()
  }

  // Check Supabase auth cookie (Admin)
  const cookies = request.cookies.getAll()
  const hasAdminAuth = cookies.some(c =>
    c.name.includes('auth-token') ||
    c.name.includes('access-token') ||
    c.name.startsWith('sb-')
  )

  // Check staff session cookie
  const hasStaffAuth = request.cookies.get('staff_session') !== undefined

  if (!hasAdminAuth && !hasStaffAuth) {
    return NextResponse.redirect(new URL('/staff-login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
