import { ReactNode } from 'react'

type Tone = 'default' | 'ok' | 'caution' | 'critical' | 'info' | 'brand'

interface Props {
  tone?: Tone
  icon?: ReactNode
  children: ReactNode
  className?: string
  onClick?: () => void
}

const toneClasses: Record<Tone, string> = {
  default:  'bg-white/5 text-slate-200 border-white/10',
  ok:       'bg-emerald-500/14 text-emerald-200 border-emerald-400/30',
  caution:  'bg-amber-500/14 text-amber-200 border-amber-400/30',
  critical: 'bg-red-500/14 text-red-200 border-red-400/30',
  info:     'bg-sky-500/14 text-sky-200 border-sky-400/30',
  brand:    'bg-emerald-900/40 text-emerald-100 border-emerald-700/40',
}

/**
 * Chip — small pill with icon + label. Semantic tone drives color, text is
 * always present (never color alone). Can be interactive via `onClick`.
 */
export function Chip({ tone = 'default', icon, children, className = '', onClick }: Props) {
  const Tag: 'button' | 'span' = onClick ? 'button' : 'span'
  return (
    <Tag
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${toneClasses[tone]} ${onClick ? 'hover:brightness-110 cursor-pointer' : ''} ${className}`}
    >
      {icon && <span className="w-3 h-3">{icon}</span>}
      {children}
    </Tag>
  )
}
