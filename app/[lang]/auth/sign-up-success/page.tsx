import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getDictionary } from '@/lib/i18n/dictionaries'

export default async function Page() {
  const dict = await getDictionary()

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{dict.auth.signUpSuccess.title}</CardTitle>
              <CardDescription>{dict.auth.signUpSuccess.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{dict.auth.signUpSuccess.body}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
