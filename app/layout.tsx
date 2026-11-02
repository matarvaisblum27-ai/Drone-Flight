import type { Metadata } from 'next'
import Image from 'next/image'
import { Heebo, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Footer from '@/components/Footer'
import { ThemeProvider } from '@/components/ThemeProvider'

// ─────────────────────────────────────────────────────────────────────────────
//  Fonts: Heebo for Hebrew UI, JetBrains Mono for telemetry / coordinates.
//  Exposed as CSS variables so globals.css can reference them in @font-family.
// ─────────────────────────────────────────────────────────────────────────────
const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-ui',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'מערכת ניהול שעות טיסה | יחידת רחפנים',
  description: 'מערכת לניהול ומעקב שעות טיסה לטייסי רחפן',
  icons: { icon: '/logo.png' },
}

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)',  color: '#07140F' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,       // Allow operator to pinch-zoom values if needed
  // viewportFit=cover extends the webview under notches/home-indicator so
  // the body's safe-area padding (in globals.css) does the right thing.
  viewportFit: 'cover' as const,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // data-theme defaults to "dark" (night / ops) and is swapped live by
  // <ThemeProvider /> based on the operator's remembered preference. All
  // Tailwind color tokens are CSS-variable-driven, so no component needs to
  // know which theme is active for colors to be correct.
  return (
    <html lang="he" dir="rtl" data-theme="dark" className={`${heebo.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-bg text-ink min-h-screen flex flex-col font-sans antialiased">
        <ThemeProvider>
          {/* Logo watermark — fixed behind all page content */}
          <div
            className="fixed inset-0 flex items-center justify-center pointer-events-none select-none"
            style={{ zIndex: 0 }}
          >
            <Image
              src="/logo.png"
              alt=""
              aria-hidden="true"
              width={620}
              height={402}
              priority
              style={{ width: '55vw', maxWidth: '42rem', opacity: 0.05 }}
            />
          </div>
          {/* Page content — sits above watermark */}
          <div className="relative flex-1 flex flex-col" style={{ zIndex: 1 }}>
            {children}
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
