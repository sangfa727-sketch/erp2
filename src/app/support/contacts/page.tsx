'use client'
import AppLayout from '@/components/layout/AppLayout'
export default function Page() {
  return (
    <AppLayout>
      <div className="flex items-center justify-center h-[calc(100vh-48px)] opacity-40">
        <div className="text-center">
          <div className="text-5xl mb-3">🚧</div>
          <p className="text-sm">Coming soon — contacts</p>
        </div>
      </div>
    </AppLayout>
  )
}
