import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import './global.css'

export const metadata: Metadata = {
  title: 'Ark Learning Management System',
  description: 'ARK Technological Institute Learning Management System',
  icons: {
    icon: '/ark-logo.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={GeistSans.className} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}