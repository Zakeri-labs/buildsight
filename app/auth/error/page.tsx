import Link from "next/link"
import { isInvitationPath, safeNextPath } from "@/lib/auth/redirects"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const next = safeNextPath(params.next, "/auth/login")
  const invitationFlow = isInvitationPath(next)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Authentication error</CardTitle>
        <CardDescription>Something went wrong</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          We could not complete your request. Please try to{" "}
          <Link href={next} className="font-medium text-accent underline-offset-4 hover:underline">
            {invitationFlow ? "return to the invitation" : "sign in"}
          </Link>{" "}
          again.
        </p>
      </CardContent>
    </Card>
  )
}
