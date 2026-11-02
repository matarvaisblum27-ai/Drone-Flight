import { HTMLAttributes } from 'react'

/**
 * Shimmer — skeleton loader. Diagonal emerald sweep across a glass surface.
 */
export function Shimmer({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`shimmer rounded-xl ${className}`}
      style={{ background: 'rgba(var(--glass-fill) / 0.35)', minHeight: '12px' }}
      {...rest}
    />
  )
}
