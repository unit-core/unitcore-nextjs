'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useLocale } from '@/lib/i18n/use-locale'
import { localeHref } from '@/lib/i18n/urls'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

interface SignUpFormProps extends React.ComponentPropsWithoutRef<'div'> {
  dict: Dictionary['auth']['signUp']
}

export function SignUpForm({ dict, className, ...props }: SignUpFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const locale = useLocale()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    if (password !== repeatPassword) {
      setError(dict.passwordsDoNotMatch)
      setIsLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Must be covered by the Redirect URLs allowlist of the Supabase
          // project, which now has to permit the locale-prefixed form.
          emailRedirectTo: `${window.location.origin}${localeHref(locale, '/dashboard')}`,
        },
      })
      if (error) throw error
      router.push(localeHref(locale, '/auth/sign-up-success'))
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{dict.title}</CardTitle>
          <CardDescription>{dict.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignUp}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">{dict.email}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">{dict.password}</Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="repeat-password">{dict.repeatPassword}</Label>
                </div>
                <Input
                  id="repeat-password"
                  type="password"
                  required
                  value={repeatPassword}
                  onChange={(e) => setRepeatPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? dict.submitting : dict.submit}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              {dict.haveAccount}{' '}
              <Link
                href={localeHref(locale, '/auth/login')}
                className="underline underline-offset-4"
              >
                {dict.login}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
