import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './global.css'


const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://arklms.institute'),
  title: {
    default: 'ARK LMS | ARK Technological Institute Education System Inc.',
    template: '%s | ARK LMS',
  },
  description:
    'The official Learning Management System of ARK Technological Institute Education System Inc. Access your classes, lessons, activities, quizzes, and grades in one place.',
  applicationName: 'ARK LMS',
  openGraph: {
    title: 'ARK LMS | ARK Technological Institute Education System Inc.',
    description:
      'Access your classes, lessons, activities, quizzes, and grades in one place.',
    url: 'https://arklms.institute',
    siteName: 'ARK LMS',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}