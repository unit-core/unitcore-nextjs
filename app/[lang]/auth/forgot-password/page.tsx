import { ForgotPasswordForm } from '@/components/forgot-password-form'
import { getDictionary } from '@/lib/i18n/dictionaries'

export default async function Page() {
  const dict = await getDictionary()

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <ForgotPasswordForm dict={dict.auth.forgotPassword} />
      </div>
    </div>
  )
}
