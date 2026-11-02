import { ReactNode } from 'react'

interface Props {
  eyebrow?: string
  title: string
  trailing?: ReactNode
}

/**
 * SectionHeader — the consistent section opener used across all screens.
 * A tiny uppercase eyebrow + a clean large title + an optional trailing
 * slot (filter, toggle, action). The thin emerald bar on the right (RTL)
 * is the visual signature of a Night Ops section break.
 */
export function SectionHeader({ eyebrow, title, trailing }: Props) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4 sm:mb-5">
      <div className="min-w-0">
        {eyebrow && <div className="label-micro mb-1">{eyebrow}</div>}
        <h2 className="text-lg sm:text-xl font-semibold text-white flex items-center gap-3">
          <span
            aria-hidden
            className="inline-block w-1 h-5 rounded-full"
            style={{ background: 'linear-gradient(180deg, rgb(var(--emerald)), rgb(var(--brand)))',
                     boxShadow: '0 0 10px rgba(46,229,157,0.5)' }}
          />
          {title}
        </h2>
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  )
}
