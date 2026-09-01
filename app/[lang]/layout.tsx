import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { notFound } from 'next/navigation'
import { lang } from 'next/root-params'

import { SiteHeader } from '@/components/site-header'
import { ThemeProvider } from '@/components/theme-provider'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { isLocale, locales } from '@/lib/i18n/config'
import { SITE_URL } from '@/lib/i18n/urls'
import '../globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  // Without "cyrillic" the Russian pages fall back to a system font mid-word.
  subsets: ['latin', 'cyrillic'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin', 'cyrillic'],
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Unitcore',
    template: '%s — Unitcore',
  },
  description: 'A shared budget you manage by talking to your AI client.',
}

export function generateStaticParams() {
  return locales.map((locale) => ({ lang: locale }))
}

// Left at the default `true` deliberately. Setting it to false here rejects any
// ungenerated param for the whole subtree at the routing layer, before this
// layout runs — which also swallows an unknown article slug and serves Next's
// bare built-in 404 instead of a localized one. Unsupported locales are caught
// by the isLocale guard below and still answer 404.

export default async function RootLayout(props: LayoutProps<'/[lang]'>) {
  // `lang` is a root parameter because this layout sits under [lang], so every
  // Server Component below can read the locale without it being passed down.
  const locale = await lang()
  if (!isLocale(locale)) notFound()

  const dict = await getDictionary()

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // next-themes writes the theme class onto this element before React
      // hydrates, so the server markup is expected to differ here.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <SiteHeader locale={locale} dict={dict.nav} />
          {props.children}
        </ThemeProvider>
      </body>
    </html>
  )
}
