import type { Metadata } from 'next'
import { Heebo, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Footer from '@/components/Footer'
import { ThemeProvider } from '@/components/ThemeProvider'
import { BackgroundDecor } from '@/components/magav'

/* ─────────────────────────────────────────────────────────────────────────
 * Fonts: Heebo for Hebrew UI; JetBrains Mono for telemetry / coordinates.
 * Both are exposed as CSS variables and consumed by globals.css + Tailwind.
 * ───────────────────────────────────────────────────────────────────────── */
const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-ui',
  weight: ['300', '400', '500', '600', '700', '800'],
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
    { media: '(prefers-color-scheme: light)', color: '#F5F8F6' },
    { media: '(prefers-color-scheme: dark)',  color: '#07140F' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover' as const,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" data-theme="dark" className={`${heebo.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen flex flex-col antialiased">
        <ThemeProvider>
          {/* Tactical background — fixed behind everything */}
          <BackgroundDecor />

          {/* Page content — sits above the decor */}
          <div className="relative flex-1 flex flex-col" style={{ zIndex: 1 }}>
            {children}
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
