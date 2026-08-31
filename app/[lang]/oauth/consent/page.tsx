import { OAuthConsent } from '@/components/oauth-consent'
import { getDictionary } from '@/lib/i18n/dictionaries'

export default async function ConsentPage(props: PageProps<'/[lang]/oauth/consent'>) {
  const { authorization_id } = await props.searchParams
  const dict = await getDictionary()

  return (
    <main className="flex min-h-svh items-center justify-center p-6 md:p-10">
      <OAuthConsent
        className="w-full max-w-lg"
        authorizationId={typeof authorization_id === 'string' ? authorization_id : undefined}
        accessDict={dict.consent.access}
      />
    </main>
  )
}
