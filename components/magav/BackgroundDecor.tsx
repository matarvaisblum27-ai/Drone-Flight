'use client'

/**
 * BackgroundDecor — tactical topographic background with a floating orb and
 * a faint grid. Purely decorative. Fixed to the viewport and sits behind
 * every other z-indexed layer in the app.
 */
export function BackgroundDecor() {
  return (
    <>
      <div aria-hidden className="bg-tactical" />
      {/* Floating emerald orb — subliminal "alive" cue, bottom-left */}
      <div
        aria-hidden
        className="orb-float fixed pointer-events-none"
        style={{
          left: '-80px',
          bottom: '-80px',
          width: '320px',
          height: '320px',
          background: 'radial-gradient(circle, rgba(46,229,157,0.14), transparent 70%)',
          filter: 'blur(28px)',
          zIndex: 0,
        }}
      />
    </>
  )
}
