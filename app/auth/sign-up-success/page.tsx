import Link from "next/link"
import { isInvitationPath, safeNextPath } from "@/lib/auth/redirects"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function SignUpSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>
}) {
  const params = await searchParams
  const next = safeNextPath(params.next, "/")
  const email = params.email?.trim().toLowerCase() ?? ""
  const invitationFlow = isInvitationPath(next) && Boolean(email)
  const loginHref = invitationFlow
    ? `/auth/login?${new URLSearchParams({ next, email }).toString()}`
    : "/auth/login"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Check your email</CardTitle>
        <CardDescription>We sent you a confirmation link</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Confirm your email address to activate your account. The confirmation link will return you to
          {invitationFlow ? " the invitation" : " Provision"}. You can also{" "}
          <Link href={loginHref} className="font-medium text-accent underline-offset-4 hover:underline">
            sign in
          </Link>{" "}
          after confirming.
        </p>
      </CardContent>
    </Card>
  )
}
