import { NextRequest, NextResponse } from 'next/server'

const attempts = new Map<string, { count: number; resetAt: number }>()

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown'
  const now = Date.now()
  const window = 15 * 60 * 1000
  const maxAttempts = 10

  const record = attempts.get(ip)
  if (record && now < record.resetAt) {
    if (record.count >= maxAttempts) {
      return NextResponse.json(
        { blocked: true, retryAfter: Math.ceil((record.resetAt - now) / 1000) },
        { status: 429 }
      )
    }
    record.count++
  } else {
    attempts.set(ip, { count: 1, resetAt: now + window })
  }
  return NextResponse.json({ blocked: false })
}
