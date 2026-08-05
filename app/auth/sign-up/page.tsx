"use client"

import type React from "react"
import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { isInvitationPath, safeNextPath } from "@/lib/auth/redirects"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

function SignUpCard() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNextPath(params.get("next"), "/onboarding")
  const prefillEmail = params.get("email")?.trim().toLowerCase() ?? ""
  const invitationFlow = isInvitationPath(next) && Boolean(prefillEmail)
  const loginHref = invitationFlow
    ? `/auth/login?${new URLSearchParams({ next, email: prefillEmail }).toString()}`
    : "/auth/login"
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState(prefillEmail)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const callbackUrl = new URL(
        process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? "/auth/callback",
        window.location.origin,
      )
      callbackUrl.searchParams.set("next", next)

      const normalizedEmail = email.trim().toLowerCase()
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: callbackUrl.toString(),
          data: { full_name: fullName.trim() },
        },
      })
      if (signUpError) {
        setError(
          invitationFlow
            ? "Unable to create this account. Sign in instead if the invited email already has an account."
            : signUpError.message,
        )
        return
      }

      // If email confirmation is disabled, a session exists immediately.
      if (data.session) {
        router.replace(next)
        router.refresh()
        return
      }

      router.replace(
        `/auth/sign-up-success?${new URLSearchParams({ next, email: normalizedEmail }).toString()}`,
      )
    } catch (error) {
      setError(
        invitationFlow
          ? "Unable to create the invited account. Please try again."
          : error instanceof Error
            ? error.message
            : "Unable to create your account. Please try again.",
      )
    } finally {
      setLoading(false)
    }
  }


  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>
          {invitationFlow
            ? "Create your account to accept the organization invitation"
            : "Set up your Provision supervising organization"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={invitationFlow}
              placeholder="you@company.com"
            />
            {invitationFlow && (
              <p className="text-xs text-muted-foreground">
                This email is fixed to the address that received the invitation.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {"Already have an account? "}
          <Link href={loginHref} className="font-medium text-accent underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-6 w-32 bg-muted rounded mb-2"></div>
          <div className="h-4 w-56 bg-muted rounded"></div>
        </CardHeader>
        <CardContent className="h-[320px] flex items-center justify-center">
          <div className="text-muted-foreground text-sm">Loading sign up...</div>
        </CardContent>
      </Card>
    }>
      <SignUpCard />
    </Suspense>
  )
}

