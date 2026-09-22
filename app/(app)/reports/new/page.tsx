import { redirect } from "next/navigation"
import { requireOnboarded } from "@/lib/auth/session"
import { resolveUserEffectiveRole } from "@/lib/auth/effective-role"
import { NewReportForm } from "@/components/reports/new-report-form"

export default async function NewReportPage() {
  const session = await requireOnboarded()
  const roleRes = await resolveUserEffectiveRole(session.userId, session.email)
  if (roleRes.role === "viewer") {
    redirect("/projects")
  }

  return <NewReportForm />
}
