import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { lang } from 'next/root-params'

import { TaskBoard } from '@/components/tasks/task-board'
import { isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'

/**
 * The section name, not the space name — the same reasoning as the space
 * settings page: reading the space here would put a private name in the browser
 * tab, for a space the visitor may not even be a member of.
 */
export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary()
  return { title: dict.tasks.boardTitle }
}

export default async function TaskBoardPage(props: PageProps<'/[lang]/tasks/[spaceId]'>) {
  const locale = await lang()
  if (!isLocale(locale)) notFound()

  const { spaceId } = await props.params
  const dict = await getDictionary()

  return (
    <main className="flex-1 bg-muted px-4 py-6 sm:px-6 lg:px-8 lg:py-8 dark:bg-background">
      <div className="mx-auto w-full max-w-[1600px]">
        <TaskBoard spaceId={spaceId} dict={dict.tasks} />
      </div>
    </main>
  )
}
