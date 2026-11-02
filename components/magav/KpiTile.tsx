import { ReactNode } from 'react'
import { GlassPanel } from './GlassPanel'
import { AnimatedCounter } from './AnimatedCounter'

interface KpiProps {
  label: string
  value: number | string
  unit?: string
  icon?: ReactNode
  tone?: 'default' | 'emerald' | 'caution' | 'critical'
  footnote?: string
  animated?: boolean
  format?: (n: number) => string
  className?: string
}

/**
 * KpiTile — the hero data card of the dashboard. Huge thin number, small
 * uppercase label, optional unit, optional glowing dot icon, optional
 * trend footnote. Count-up animation when `animated` is true and the
 * value is numeric.
 */
export function KpiTile({ label, value, unit, icon, tone = 'default', footnote, animated = true, format, className = '' }: KpiProps) {
  const numberToneCls =
    tone === 'emerald' ? 'text-emerald-400'
    : tone === 'caution' ? 'text-amber-300'
    : tone === 'critical' ? 'text-red-400'
    : 'text-white'
  const isNum = typeof value === 'number'
  return (
    <GlassPanel padding="md" lift className={`relative overflow-hidden ${className}`}>
      <div className="flex items-start justify-between mb-3">
        <span className="label-micro">{label}</span>
        {icon && <span className="text-emerald-300/70">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`font-display text-5xl sm:text-6xl leading-none ${numberToneCls}`}>
          {isNum && animated
            ? <AnimatedCounter value={value as number} format={format} />
            : (isNum ? (value as number).toLocaleString('he-IL') : value)}
        </span>
        {unit && <span className="label-micro mb-1">{unit}</span>}
      </div>
      {footnote && (
        <p className="mt-3 text-xs" style={{ color: 'rgb(var(--ink-mute))' }}>{footnote}</p>
      )}
      {/* subtle emerald corner accent — adds depth without noise */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -left-10 w-32 h-32 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(46,229,157,0.14), transparent 70%)' }}
      />
    </GlassPanel>
  )
}
