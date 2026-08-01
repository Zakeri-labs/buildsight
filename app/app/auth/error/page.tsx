import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function AuthErrorPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Authentication error</CardTitle>
        <CardDescription>Something went wrong</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          We could not complete your request. Please try to{" "}
          <Link href="/auth/login" className="font-medium text-accent underline-offset-4 hover:underline">
            sign in
          </Link>{" "}
          again.
        </p>
      </CardContent>
    </Card>
  )
}
