import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { lang } from 'next/root-params'

import { Agenda } from '@/components/tasks/agenda'
import { isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary()
  return { title: dict.tasks.title }
}

/**
 * The way into the product, and the only screen that spans spaces.
 *
 * No middleware entry is needed and none should be added: /tasks is absent from
 * PUBLIC_PREFIXES in lib/supabase/middleware.ts, so an unauthenticated visitor
 * is already sent to /{locale}/auth/login.
 */
export default async function TasksPage() {
  const locale = await lang()
  if (!isLocale(locale)) notFound()

  const dict = await getDictionary()

  return (
    <main className="flex-1 bg-muted px-4 py-6 sm:px-6 lg:px-8 lg:py-8 dark:bg-background">
      <div className="mx-auto w-full max-w-5xl">
        <Agenda dict={dict.tasks} />
      </div>
    </main>
  )
}
