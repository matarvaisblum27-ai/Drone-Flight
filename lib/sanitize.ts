/**
 * Strip HTML tags and control characters from user-supplied strings.
 * Defense-in-depth: React already escapes output, but this prevents
 * stored XSS if output is ever used outside React's escaping.
 */
export function sanitizeStr(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/<[^>]*>/g, '')          // strip HTML/XML tags
    .replace(/javascript:/gi, '')      // strip javascript: URIs
    .replace(/on\w+\s*=/gi, '')        // strip inline event handlers
    .trim()
    .slice(0, 500)                     // hard max length
}

/** Sanitize and return a safe integer, clamped to [min, max]. */
export function sanitizeInt(input: unknown, min = 0, max = 9999): number {
  const n = parseInt(String(input), 10)
  if (!isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}
