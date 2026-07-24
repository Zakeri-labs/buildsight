import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { OnboardingForm } from "@/components/onboarding/onboarding-form"

export default async function OnboardingPage() {
  const session = await getSession()
  if (!session) redirect("/auth/login")
  if (session.memberships.length > 0) redirect("/")

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <OnboardingForm />
    </main>
  )
}
