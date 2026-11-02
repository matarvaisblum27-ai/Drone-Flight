import { ReactNode, HTMLAttributes } from 'react'

type Variant = 'default' | 'flat' | 'strong'
type Padding = 'none' | 'sm' | 'md' | 'lg'

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant
  padding?: Padding
  lift?: boolean
  children: ReactNode
  as?: 'div' | 'section' | 'article' | 'aside'
}

/**
 * GlassPanel — the atomic surface of the Night Ops Glass system.
 * Translucent dark-green glass with an inner highlight and a soft emerald
 * outer glow. Use `variant="flat"` for nested panels (no outer glow).
 */
export function GlassPanel({
  variant = 'default',
  padding = 'md',
  lift = false,
  children,
  className = '',
  as: Tag = 'div',
  ...rest
}: Props) {
  const base =
    variant === 'flat' ? 'glass-flat'
    : variant === 'strong' ? 'glass glass-strong'
    : 'glass'
  const pad =
    padding === 'none' ? ''
    : padding === 'sm' ? 'p-3 sm:p-4'
    : padding === 'lg' ? 'p-6 sm:p-8'
    : 'p-4 sm:p-5'
  const liftCls = lift ? 'lift' : ''
  return (
    <Tag className={`${base} ${pad} ${liftCls} ${className}`} {...rest}>
      {children}
    </Tag>
  )
}
