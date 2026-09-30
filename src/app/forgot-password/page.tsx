'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

export default function ForgotPasswordPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    setMessage(error ? 'Error: ' + error.message : t.reset_sent)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow w-96">
        <h1 className="text-xl font-bold text-center mb-6">{t.forgot_pwd_title}</h1>
        {message && <p className="text-green-600 text-sm mb-4">{message}</p>}
        <form onSubmit={handleReset}>
          <div className="mb-4">
            <label className="block text-sm mb-1">{t.email}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border rounded p-2" required />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded">
            {loading ? t.loading : t.reset_btn}
          </button>
        </form>
        <a href="/login" className="block text-center mt-4 text-blue-600 text-sm">{t.back_to_login}</a>
      </div>
    </div>
  )
}
