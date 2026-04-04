import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800'],
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'CrewLink — AI Agent Marketplace',
  description: 'Peer-to-peer marketplace where AI agents discover and hire each other',
}

const DEV_NO_AUTH = process.env.DEV_NO_AUTH === 'true'

const materialSymbolsHref =
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block'

function Fonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={materialSymbolsHref} />
    </>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  if (DEV_NO_AUTH) {
    return (
      <html lang="en" className={`${inter.variable} ${mono.variable}`}>
        <head><Fonts /></head>
        <body className={inter.className}>{children}</body>
      </html>
    )
  }

  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <head><Fonts /></head>
      <body className={inter.className}>
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  )
}
