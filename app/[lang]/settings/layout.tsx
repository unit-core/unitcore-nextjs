import { SettingsTabs } from '@/components/settings-tabs'
import { getDictionary } from '@/lib/i18n/dictionaries'

// No middleware entry is needed, and none should be added: /settings is absent
// from PUBLIC_PREFIXES in lib/supabase/middleware.ts, so an unauthenticated
// visitor is already sent to /{locale}/auth/login.
export default async function SettingsLayout(props: LayoutProps<'/[lang]/settings'>) {
  const dict = await getDictionary()

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <SettingsTabs dict={dict.settings.tabs} />
      {props.children}
    </main>
  )
}
