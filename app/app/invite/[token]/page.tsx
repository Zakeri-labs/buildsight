import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/admin"
import { getSession } from "@/lib/auth/session"
import { roleLabel } from "@/lib/db/types"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AcceptInvite } from "@/components/invite/accept-invite"

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: invite } = await admin
    .from("invitations")
    .select("id, email, organization_id, project_id, organization_role, project_access_role, status, expires_at")
    .eq("token", token)
    .maybeSingle()

  let orgName = ""
  let projectName: string | null = null
  if (invite) {
    const { data: org } = await admin.from("organizations").select("name").eq("id", invite.organization_id).maybeSingle()
    orgName = org?.name ?? ""
    if (invite.project_id) {
      const { data: project } = await admin.from("projects").select("name").eq("id", invite.project_id).maybeSingle()
      projectName = project?.name ?? null
    }
  }

  const session = await getSession()
  const expired = invite ? new Date(invite.expires_at).getTime() < Date.now() : false
  const invalid = !invite || invite.status !== "pending" || expired

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo textClassName="text-foreground" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl text-balance">
              {invalid ? "Invitation unavailable" : `Join ${orgName}`}
            </CardTitle>
            <CardDescription className="text-pretty">
              {invalid
                ? "This invitation is invalid, has been revoked, or has expired. Ask an administrator to send a new one."
                : `You've been invited as ${roleLabel(invite!.organization_role)}${
                    projectName ? ` on ${projectName}` : ""
                  }.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {invalid ? (
              <Button
                render={<Link href="/">Go to dashboard</Link>}
                variant="outline"
                className="w-full bg-transparent"
              />
            ) : !session ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground text-pretty">
                  Sign in or create an account using <span className="font-medium text-foreground">{invite!.email}</span>{" "}
                  to accept this invitation.
                </p>
                <div className="flex gap-2">
                  <Button
                    render={<Link href={`/auth/login?next=/invite/${token}`}>Sign in</Link>}
                    className="flex-1"
                  />
                  <Button
                    render={
                      <Link href={`/auth/sign-up?next=/invite/${token}&email=${encodeURIComponent(invite!.email)}`}>
                        Create account
                      </Link>
                    }
                    variant="outline"
                    className="flex-1 bg-transparent"
                  />
                </div>
              </div>
            ) : (
              <AcceptInvite
                token={token}
                inviteEmail={invite!.email}
                sessionEmail={session.email}
                orgName={orgName}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
