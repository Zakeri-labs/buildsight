import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { authUserExistsByEmail } from "@/lib/auth/auth-users"
import { roleLabel } from "@/lib/db/types"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AcceptInvite } from "@/components/invite/accept-invite"

export const dynamic = "force-dynamic"
export const revalidate = 0

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

  const requestClient = await createClient()
  const {
    data: { user },
    error: authError,
  } = await requestClient.auth.getUser()
  if (authError) {
    console.error("Invite page could not resolve the request-scoped session:", authError.message)
  }

  const expired = invite ? new Date(invite.expires_at).getTime() < Date.now() : false
  const invalid = !invite || invite.status !== "pending" || expired
  const validInvite = invalid ? null : invite

  let invitedUserExists = false
  if (validInvite && !user) {
    try {
      invitedUserExists = await authUserExistsByEmail(validInvite.email)
    } catch (error) {
      console.error(
        "Invite page could not check whether the invited Auth account exists:",
        error instanceof Error ? error.message : "Unknown error",
      )
    }
  }

  const invitationPath = `/invite/${token}`
  const loginQuery = new URLSearchParams({ next: invitationPath, email: validInvite?.email ?? "" })
  const signUpQuery = new URLSearchParams({ next: invitationPath, email: validInvite?.email ?? "" })

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo textClassName="text-foreground" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl text-balance">
              {!validInvite ? "Invitation unavailable" : `Join ${orgName}`}
            </CardTitle>
            <CardDescription className="text-pretty">
              {!validInvite
                ? "This invitation is invalid, has been revoked, has already been used, or has expired. Ask an administrator to send a new one."
                : `You've been invited as ${roleLabel(validInvite.organization_role)}${
                    projectName ? ` on ${projectName}` : ""
                  }.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!validInvite ? (
              <Button
                render={<Link href="/">Go to dashboard</Link>}
                variant="outline"
                className="w-full bg-transparent"
              />
            ) : !user ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground text-pretty">
                  {invitedUserExists ? "Sign in" : "Create an account"} using{" "}
                  <span className="font-medium text-foreground">{validInvite.email}</span> to accept this invitation.
                </p>
                {invitedUserExists ? (
                  <>
                    <Button
                      render={<Link href={`/auth/login?${loginQuery.toString()}`}>Sign in and continue</Link>}
                      className="w-full"
                    />
                    <p className="text-center text-xs text-muted-foreground">
                      This email already has an account. Use its existing password rather than creating a duplicate account.
                    </p>
                  </>
                ) : (
                  <>
                    <Button
                      render={<Link href={`/auth/sign-up?${signUpQuery.toString()}`}>Create account and continue</Link>}
                      className="w-full"
                    />
                    <Button
                      render={<Link href={`/auth/login?${loginQuery.toString()}`}>I already have an account</Link>}
                      variant="outline"
                      className="w-full bg-transparent"
                    />
                  </>
                )}
              </div>
            ) : (
              <AcceptInvite
                token={token}
                inviteEmail={validInvite.email}
                sessionEmail={user.email ?? ""}
                orgName={orgName}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
