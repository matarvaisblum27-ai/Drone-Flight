'use client'
import { ReactNode } from 'react'
import { ThemeToggle } from '../ThemeProvider'
import { StatusDot } from './StatusDot'

interface Props {
  title: string
  subtitle?: string
  initial?: string
  rightSlot?: ReactNode
  liveStatus?: 'ok' | 'caution' | 'critical' | 'info'
}

/**
 * TopBar — slim glass bar across the top. Role identity on the right,
 * live status / clock in the center, utility actions on the left.
 * RTL-aware: title block sits on the right side of the RTL flex.
 */
export function TopBar({ title, subtitle, initial, rightSlot, liveStatus = 'ok' }: Props) {
  return (
    <header className="sticky top-0 z-30">
      <div className="glass-strong flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 rounded-none border-b"
           style={{ borderColor: 'rgba(var(--glass-edge-top) / var(--glass-edge-alpha))', borderRadius: 0 }}>
        {/* Identity */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {initial && (
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white"
                   style={{
                     background: 'linear-gradient(135deg, rgb(var(--brand)), rgb(var(--brand-strong)))',
                     boxShadow: '0 0 20px rgba(46,229,157,0.25), inset 0 1px 0 rgba(255,255,255,0.14)',
                   }}>
                {initial}
              </div>
              <StatusDot tone={liveStatus} pulse size="xs" className="absolute -top-0.5 -left-0.5" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-semibold text-white truncate">{title}</h1>
            {subtitle && <p className="label-micro truncate">{subtitle}</p>}
          </div>
        </div>

        {/* Right slot (actions) */}
        <div className="flex items-center gap-2 shrink-0">
          {rightSlot}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
