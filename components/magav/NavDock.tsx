'use client'
import { ReactNode } from 'react'

export interface DockItem {
  key: string
  label: string
  icon: ReactNode
}

interface Props {
  items: DockItem[]
  active: string
  onSelect: (key: string) => void
  variant?: 'bottom-float' | 'inline'
  className?: string
}

/**
 * NavDock — floating glass navigation. Default is "bottom-float", a pill
 * dock centered at the bottom of the screen on phone and tablet.
 * The `inline` variant is used when the dock needs to live inline (e.g.
 * inside a card header) and shouldn't be fixed.
 *
 * Active state is a glowing emerald pill behind the icon + label.
 */
export function NavDock({ items, active, onSelect, variant = 'bottom-float', className = '' }: Props) {
  const wrapperCls =
    variant === 'bottom-float'
      ? 'fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-16px)] sm:w-auto max-w-[720px]'
      : 'relative'

  return (
    <nav aria-label="ניווט ראשי" className={`${wrapperCls} ${className}`}>
      <div className="glass glass-strong flex items-center gap-1 p-1.5 overflow-x-auto scrollbar-hide">
        {items.map(item => {
          const isActive = active === item.key
          return (
            <button
              key={item.key}
              onClick={() => onSelect(item.key)}
              aria-pressed={isActive}
              className="relative flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs font-semibold shrink-0 transition-colors"
              style={{
                color: isActive ? '#FFFFFF' : 'rgb(var(--ink-mute))',
                background: isActive
                  ? 'linear-gradient(135deg, rgb(var(--brand)), rgb(var(--brand-strong)))'
                  : 'transparent',
                boxShadow: isActive
                  ? '0 0 20px rgba(46,229,157,0.28), inset 0 1px 0 rgba(255,255,255,0.14)'
                  : 'none',
                minHeight: '44px',
              }}
            >
              <span className="w-4 h-4 shrink-0">{item.icon}</span>
              <span className="whitespace-nowrap">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
