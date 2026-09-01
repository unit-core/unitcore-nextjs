'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

/**
 * `next-themes` in a client boundary so the root layout can stay a Server
 * Component. It writes the `.dark` class onto <html> from a blocking inline
 * script, which is what keeps the theme from flashing on a statically
 * rendered page — the reason the choice is not read from a cookie on the
 * server, which would opt every page out of static rendering.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      // `@custom-variant dark (&:is(.dark *))` in globals.css keys off a class.
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
