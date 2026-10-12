'use client'

import React from 'react'

export type MoneyFlowDirection = 'in' | 'out'

export interface MoneyFlowOption {
  value: string
  icon: string
  label: string
  description?: string
}

interface MoneyFlowMethodPickerProps {
  value: string
  onChange: (value: string) => void
  options: MoneyFlowOption[]
  title?: string
}

export function MoneyFlowMethodPicker({
  value,
  onChange,
  options,
  title = 'Money Flow',
}: MoneyFlowMethodPickerProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-gray-600">{title}</label>
        <span className="text-[10px] uppercase tracking-wider text-gray-400">Payment route</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {options.map(opt => {
          const active = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={[
                'relative min-h-[88px] p-3 rounded-2xl border-2 text-left transition-all',
                'active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-200',
                active
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
              ].join(' ')}
            >
              {active && (
                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] flex items-center justify-center">
                  ✓
                </span>
              )}
              <p className="text-xl mb-1">{opt.icon}</p>
              <p className="text-sm font-semibold text-gray-800">{opt.label}</p>
              {opt.description && (
                <p className="text-[11px] leading-4 text-gray-500 mt-0.5">{opt.description}</p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface MoneyFlowImpactProps {
  direction: MoneyFlowDirection
  amount: number
  routeLabel: string
  accountLabel?: string
  helper?: string
}

export function MoneyFlowImpact({
  direction,
  amount,
  routeLabel,
  accountLabel,
  helper,
}: MoneyFlowImpactProps) {
  const isOut = direction === 'out'
  const amountText = Number(amount || 0).toLocaleString()

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span
            className={[
              'w-8 h-8 rounded-xl flex items-center justify-center text-base',
              isOut ? 'bg-rose-50' : 'bg-emerald-50',
            ].join(' ')}
          >
            {isOut ? '↘️' : '↗️'}
          </span>
          <div>
            <p className="text-xs font-semibold text-gray-800">
              {isOut ? 'Money Out' : 'Money In'}
            </p>
            <p className="text-[10px] text-gray-400">Flow impact</p>
          </div>
        </div>
        <p className={['text-lg font-bold', isOut ? 'text-rose-600' : 'text-emerald-600'].join(' ')}>
          {isOut ? '-' : '+'}{amountText} Ks
        </p>
      </div>

      <div className="px-4 py-3 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-500">Route</span>
          <span className="font-medium text-gray-800 text-right">{routeLabel}</span>
        </div>
        {accountLabel && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-gray-500">Account</span>
            <span className="font-medium text-gray-800 text-right">{accountLabel}</span>
          </div>
        )}
        {helper && (
          <p className="pt-1 text-[11px] leading-4 text-gray-400">{helper}</p>
        )}
      </div>
    </div>
  )
}

interface MoneyFlowOverviewProps {
  totalBalance: number
  activeAccounts: number
}

export function MoneyFlowOverview({ totalBalance, activeAccounts }: MoneyFlowOverviewProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">💸</span>
            <div>
              <p className="text-sm font-bold text-gray-800">Money Flow</p>
              <p className="text-[11px] text-gray-400">Accounts used for incoming and outgoing money</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-5 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">Available balance</p>
            <p className="text-lg font-bold text-gray-800">{Number(totalBalance || 0).toLocaleString()} Ks</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">Active</p>
            <p className="text-lg font-bold text-gray-800">{activeAccounts}</p>
          </div>
        </div>
      </div>
      <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500">
        Sales, returns, AR/AP payments and expenses can use the same account route.
      </div>
    </div>
  )
}
