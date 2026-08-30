import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getDictionary } from '@/lib/i18n/dictionaries'

export default async function Page(props: PageProps<'/[lang]/auth/error'>) {
  const params = await props.searchParams
  const dict = await getDictionary()
  const error = typeof params.error === 'string' ? params.error : null

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{dict.auth.error.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {error ? `Code error: ${error}` : dict.auth.error.unspecified}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
