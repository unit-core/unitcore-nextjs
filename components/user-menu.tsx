'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import {
  CheckIcon,
  CopyIcon,
  LanguagesIcon,
  LogInIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  RefreshCwIcon,
  SettingsIcon,
  SunIcon,
} from 'lucide-react'

import { CurrentUserAvatar } from '@/components/current-user-avatar'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useMyTag } from '@/hooks/use-my-tag'
import { LOCALE_COOKIE, locales, stripLocale, type Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { useLocale } from '@/lib/i18n/use-locale'
import { localeHref } from '@/lib/i18n/urls'
import { createClient } from '@/lib/supabase/client'
import { formatTag } from '@/lib/tags'

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
 * Signed out that is a way in; signed in it is your tag, settings and a way
 * out. Theme and language sit in both, because neither needs an account.
 */
export function UserMenu({ dict, articleLocales }: UserMenuProps) {
  const user = useCurrentUser()
  const locale = useLocale()
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  // Latches on the first open and stays: the tag is one round trip, and paying
  // for it on every page load would be paying for a string most visits never
  // look at. Once fetched it survives the menu closing.
  const [wasMenuOpened, setWasMenuOpened] = useState(false)
  const [isRegenerateOpen, setIsRegenerateOpen] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  const { tag, isLoading, isRegenerating, error, regenerate } = useMyTag(
    {
      notAllowed: dict.tag.notAllowed,
      tooSoon: dict.tag.tooSoon,
      unknown: dict.tag.unknown,
    },
    user !== null && wasMenuOpened
  )

  // The "Copied" state is a two-second acknowledgement, and the timer has to be
  // cleared: the menu unmounts on close, which is exactly when it is running.
  useEffect(() => {
    if (!isCopied) return
    const timer = setTimeout(() => setIsCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [isCopied])

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

  /** The formatted tag, not the raw one — the server normalises it back. */
  const copyTag = async () => {
    if (!tag) return
    try {
      await navigator.clipboard.writeText(formatTag(tag))
      setCopyError(null)
      setIsCopied(true)
    } catch {
      // No clipboard: an insecure origin, or a browser that refused. The tag is
      // selectable text, so there is something the reader can still do.
      setCopyError(dict.tag.copyFailed)
    }
  }

  // The dialog stays open on a refusal, because it is the only thing on
  // screen: the menu that would otherwise show the message was closed to make
  // room for it. "Wait a minute" has to be readable where it was provoked.
  const handleRegenerate = async () => {
    if (await regenerate()) setIsRegenerateOpen(false)
  }

  return (
    <>
      <DropdownMenu
        open={isMenuOpen}
        onOpenChange={(open) => {
          setIsMenuOpen(open)
          if (open) setWasMenuOpened(true)
        }}
      >
        <DropdownMenuTrigger
          aria-label={dict.account}
          className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <CurrentUserAvatar />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {user ? (
            <DropdownMenuGroup>
              {/*
               * The tag, where the address used to be. An email is an
               * identifier of a person that we have spent the schema trying to
               * stop being one; a tag is a handle its owner can throw away.
               *
               * Plain elements rather than menu items: these do not navigate,
               * and a menu item would close the menu on the first click —
               * taking the "Copied" acknowledgement with it.
               */}
              <div className="px-1.5 py-1">
                <p className="text-xs font-medium text-muted-foreground">{dict.tag.title}</p>
                <div className="mt-1 flex items-center gap-1">
                  <span className="flex-1 truncate font-mono text-sm select-all">
                    {tag ? formatTag(tag) : isLoading ? dict.tag.loading : '—'}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={isCopied ? dict.tag.copied : dict.tag.copy}
                    disabled={!tag}
                    onClick={() => void copyTag()}
                  >
                    {isCopied ? <CheckIcon /> : <CopyIcon />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={dict.tag.regenerate}
                    disabled={!tag || isRegenerating}
                    onClick={() => {
                      // The menu closes first: the dialog is portalled next to
                      // it, and two overlays fighting over focus is how a
                      // confirmation stops being readable.
                      setIsMenuOpen(false)
                      setIsRegenerateOpen(true)
                    }}
                  >
                    <RefreshCwIcon />
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{dict.tag.hint}</p>
                {(error ?? copyError) && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {error ?? copyError}
                  </p>
                )}
              </div>

              <DropdownMenuSeparator />

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

      {/* Outside the menu, so closing the menu does not unmount the dialog. */}
      <AlertDialog open={isRegenerateOpen} onOpenChange={setIsRegenerateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dict.tag.dialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{dict.tag.dialogBody}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{dict.tag.cancel}</AlertDialogCancel>
            <Button
              type="button"
              disabled={isRegenerating}
              onClick={() => void handleRegenerate()}
            >
              {dict.tag.confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
