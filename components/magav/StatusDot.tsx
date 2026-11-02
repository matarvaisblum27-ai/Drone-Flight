interface Props {
  tone: 'ok' | 'caution' | 'critical' | 'info' | 'idle'
  pulse?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * StatusDot — a glowing ring (not a flat dot) that encodes state at a
 * glance. Always paired with an icon or text in the UI (never color alone).
 * The pulse variant marks LIVE / currently-updating state only.
 */
export function StatusDot({ tone, pulse = false, size = 'sm', className = '' }: Props) {
  const dim = size === 'xs' ? 'w-2 h-2' : size === 'md' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-4 h-4' : 'w-2.5 h-2.5'
  const toneBg =
    tone === 'ok' ? 'bg-emerald-400'
    : tone === 'caution' ? 'bg-amber-400'
    : tone === 'critical' ? 'bg-red-500'
    : tone === 'info' ? 'bg-sky-400'
    : 'bg-slate-500'
  const toneGlow =
    tone === 'ok' ? 'shadow-[0_0_12px_rgba(46,229,157,0.6)]'
    : tone === 'caution' ? 'shadow-[0_0_12px_rgba(245,185,68,0.5)]'
    : tone === 'critical' ? 'shadow-[0_0_12px_rgba(255,77,77,0.6)]'
    : tone === 'info' ? 'shadow-[0_0_12px_rgba(79,166,255,0.5)]'
    : ''
  const pulseCls = pulse && tone === 'ok' ? 'live-pulse' : pulse && tone === 'critical' ? 'pulse-critical' : ''
  return (
    <span className={`inline-block rounded-full ${dim} ${toneBg} ${toneGlow} ${pulseCls} ${className}`} />
  )
}
