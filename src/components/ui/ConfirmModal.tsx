'use client'
import { useI18n } from '@/lib/i18n'
interface Props {
  open: boolean
  message: string
  onConfirm: () => void
  onCancel: () => void
}
export default function ConfirmModal({ open, message, onConfirm, onCancel }: Props) {
  const { t } = useI18n()
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-gray-800 text-sm">{message}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 border rounded-lg text-sm hover:bg-gray-50">{t.cancel}</button>
          <button onClick={onConfirm} className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600">{t.confirm_ok}</button>
        </div>
      </div>
    </div>
  )
}
