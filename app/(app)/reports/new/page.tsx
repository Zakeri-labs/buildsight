import { redirect } from "next/navigation"
import { requireOnboarded } from "@/lib/auth/session"
import { resolveUserEffectiveRole } from "@/lib/auth/effective-role"
import { NewReportForm } from "@/components/reports/new-report-form"
import { checkReportCreationCreditAvailability } from "@/lib/db/report-credits"
import { ReportCreationBlocked } from "@/components/reports/report-creation-blocked"

export default async function NewReportPage() {
  const session = await requireOnboarded()
  const roleRes = await resolveUserEffectiveRole(session.userId, session.email)
  if (roleRes.role === "viewer") {
    redirect("/projects")
  }

  const organizationId = session.supervisingOrg?.id ?? session.memberships[0]?.organization?.id ?? null
  const creditCheck = await checkReportCreationCreditAvailability(organizationId)
  if (!creditCheck.allowed) {
    return (
      <ReportCreationBlocked
        remainingReportCredits={creditCheck.remainingReportCredits}
        backHref="/projects"
        backLabel="Back to Projects"
      />
    )
  }

  return <NewReportForm />
}
