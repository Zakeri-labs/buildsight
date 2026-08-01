import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function SignUpSuccessPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Check your email</CardTitle>
        <CardDescription>We sent you a confirmation link</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Please confirm your email address to activate your account. Once confirmed, you can{" "}
          <Link href="/auth/login" className="font-medium text-accent underline-offset-4 hover:underline">
            sign in
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  )
}
