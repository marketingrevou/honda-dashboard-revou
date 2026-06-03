import type { Metadata } from 'next'
import { Poppins, Mulish, Roboto_Condensed } from 'next/font/google'
import './globals.css'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-poppins-var',
})

const mulish = Mulish({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-mulish-var',
})

const robotoCondensed = Roboto_Condensed({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-roboto-var',
})

export const metadata: Metadata = {
  title: 'Honda Digital Content Intelligence Dashboard',
  icons: {
    icon: 'https://www.honda-indonesia.com/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="id"
      className={`${poppins.variable} ${mulish.variable} ${robotoCondensed.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
