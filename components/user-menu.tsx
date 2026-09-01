'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  CheckIcon,
  LanguagesIcon,
  LogInIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
} from 'lucide-react'

import { CurrentUserAvatar } from '@/components/current-user-avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCurrentUser } from '@/hooks/use-current-user'
import { LOCALE_COOKIE, locales, stripLocale, type Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { useLocale } from '@/lib/i18n/use-locale'
import { localeHref } from '@/lib/i18n/urls'
import { createClient } from '@/lib/supabase/client'

const LOCALE_LABELS: Record<Locale, string> = { en: 'English', ru: 'Русский' }

const ONE_YEAR = 60 * 60 * 24 * 365

/**
 * Module scope on purpose: this writes to `document`, and the React Compiler
 * lint rules reject mutating anything defined outside the component from inside
 * its render scope, even from an event handler.
 */
function rememberLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax`
}

/** The slug when the path is an article, otherwise null. */
function articleSlug(path: string): string | null {
  const match = /^\/blog\/([^/]+)$/.exec(path)
  return match ? match[1] : null
}

interface UserMenuProps {
  dict: Dictionary['nav']
  /**
   * slug -> locales that article exists in. Every other page exists in every
   * locale; articles are the one thing that may be translated later, and this
   * is what stops the switcher offering a link to a 404.
   */
  articleLocales: Record<string, readonly Locale[]>
}

/**
 * The one control in the header that changes with who is looking: the avatar
 * from the Supabase block, and behind it everything an account can do here.
 * Signed out that is a way in; signed in it is settings and a way out. Theme
 * and language sit in both, because neither needs an account.
 */
export function UserMenu({ dict, articleLocales }: UserMenuProps) {
  const user = useCurrentUser()
  const locale = useLocale()
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  // The current path is what lets a language switch stay on the same page
  // instead of dumping the reader on the home page.
  const path = stripLocale(usePathname())
  const slug = articleSlug(path)
  const available = slug ? (articleLocales[slug] ?? []) : locales
  const localeOptions = locales.filter((option) => available.includes(option))

  const signOut = async () => {
    await createClient().auth.signOut()
    // Home rather than the login page: signing out from an article should not
    // read as a demand to sign back in. `refresh` drops any server-rendered
    // page still holding the old session.
    router.push(localeHref(locale, '/'))
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={dict.account}
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <CurrentUserAvatar />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {user ? (
          // A group, not a fragment: Base UI's GroupLabel throws outside one.
          <DropdownMenuGroup>
            {user.email && (
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                {user.email}
              </DropdownMenuLabel>
            )}
            <DropdownMenuItem
              render={<Link href={localeHref(locale, '/settings/connections')} />}
            >
              <SettingsIcon />
              {dict.settings}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ) : (
          <DropdownMenuItem render={<Link href={localeHref(locale, '/auth/login')} />}>
            <LogInIcon />
            {dict.signIn}
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {/* CSS-only, so this stays correct through the no-flash script
                without waiting for the theme to be readable in JS. */}
            <SunIcon className="dark:hidden" />
            <MoonIcon className="hidden dark:block" />
            {dict.theme.label}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <SunIcon />
                {dict.theme.light}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <MoonIcon />
                {dict.theme.dark}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <MonitorIcon />
                {dict.theme.system}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* One language to offer is no choice at all. */}
        {localeOptions.length > 1 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <LanguagesIcon />
              {dict.language}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {localeOptions.map((option) => (
                <DropdownMenuItem
                  key={option}
                  /*
                   * A bare <a>, not <Link>, so this is a document navigation.
                   *
                   * `[lang]` is a segment of the root layout, so crossing
                   * locales through the router tears that layout down and
                   * rebuilds it on the client — and next-themes' no-flash
                   * <script> is rebuilt with it, which React rejects
                   * ("Encountered a script tag while rendering React
                   * component"). A document navigation never re-runs the
                   * layout on the client, so the script stays server-only.
                   *
                   * Nothing is lost: every string on the page changes anyway,
                   * `<html lang>` and the font subset with them, and this
                   * drops the prefetch of both locales of every page.
                   */
                  render={
                    <a
                      href={localeHref(option, path)}
                      hrefLang={option}
                      lang={option}
                      aria-current={option === locale ? 'true' : undefined}
                    />
                  }
                  onClick={() => rememberLocale(option)}
                >
                  {LOCALE_LABELS[option]}
                  {option === locale && <CheckIcon className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {user && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut}>
              <LogOutIcon />
              {dict.signOut}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
