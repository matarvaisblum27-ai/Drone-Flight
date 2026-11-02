import { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ghost' | 'danger' | 'emerald'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  children?: ReactNode
}

/**
 * GlassButton — the only button component the redesign needs. Primary is a
 * filled bottle-green with an emerald halo (keeps hierarchy clear);
 * `emerald` is used sparingly for the single "LIVE" action on a screen;
 * `ghost` is translucent glass for secondary actions; `danger` is reserved
 * for destructive actions (used with an inline confirmation step upstream).
 */
export function GlassButton({ variant = 'primary', size = 'md', icon, children, className = '', ...rest }: Props) {
  const sizeCls =
    size === 'sm' ? 'px-3 py-2 text-xs min-h-[36px] rounded-xl'
    : size === 'lg' ? 'px-6 py-3.5 text-base min-h-[52px] rounded-2xl'
    : 'px-4 py-2.5 text-sm min-h-[44px] rounded-xl'
  const variantCls =
    variant === 'ghost' ? 'btn btn-ghost'
    : variant === 'danger' ? 'btn btn-danger'
    : variant === 'emerald'
      ? 'btn btn-primary [--brand:46_229_157] [--brand-strong:27_176_120] text-slate-900'
      : 'btn btn-primary'
  return (
    <button className={`${variantCls} ${sizeCls} ${className}`} {...rest}>
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  )
}
