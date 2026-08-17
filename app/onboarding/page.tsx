import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { resolveUserEffectiveRole } from "@/lib/auth/effective-role"
import { OnboardingForm } from "@/components/onboarding/onboarding-form"

export default async function OnboardingPage() {
  const session = await getSession()
  if (!session) redirect("/auth/login")

  const resolution = await resolveUserEffectiveRole(session.userId, session.email)
  if (resolution.role !== "unonboarded_creator") {
    redirect(resolution.destination)
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <OnboardingForm />
    </main>
  )
}
