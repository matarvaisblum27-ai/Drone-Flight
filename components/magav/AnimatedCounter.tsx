'use client'
import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number
  duration?: number
  format?: (n: number) => string
  className?: string
}

/**
 * AnimatedCounter — count-up animation that respects prefers-reduced-motion.
 * Pure visual sugar. When reduced-motion is on OR the value is 0, we skip
 * the animation entirely to keep accessible UX.
 */
export function AnimatedCounter({ value, duration = 800, format, className = '' }: Props) {
  const [n, setN] = useState(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setN(value); return }
    const start = performance.now()
    const from = n
    const to   = value
    const diff = to - from
    if (diff === 0) return

    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3)
      setN(Math.round(from + diff * eased))
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  return <span className={`tabular ltr-num ${className}`}>{format ? format(n) : n.toLocaleString('he-IL')}</span>
}
