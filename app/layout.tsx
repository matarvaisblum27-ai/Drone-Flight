import type { Metadata } from 'next'
import './globals.css'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'מערכת ניהול שעות טיסה | יחידת רחפנים',
  description: 'מערכת לניהול ומעקב שעות טיסה לטייסי רחפן',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="bg-slate-900 text-white min-h-screen flex flex-col">
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  )
}
