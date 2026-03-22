import type { Metadata } from 'next'
import './globals.css'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'מערכת ניהול שעות טיסה | יחידת רחפנים',
  description: 'מערכת לניהול ומעקב שעות טיסה לטייסי רחפן',
  icons: { icon: '/logo.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="bg-slate-900 text-white min-h-screen flex flex-col">
        {/* Logo watermark — fixed behind all page content */}
        <div
          className="fixed inset-0 flex items-center justify-center pointer-events-none select-none"
          style={{ zIndex: 0 }}
        >
          <img
            src="/logo.png"
            alt=""
            aria-hidden="true"
            style={{ width: '55vw', maxWidth: '42rem', opacity: 0.06 }}
          />
        </div>
        {/* Page content — sits above watermark */}
        <div className="relative flex-1 flex flex-col" style={{ zIndex: 1 }}>
          {children}
          <Footer />
        </div>
      </body>
    </html>
  )
}
