"use client"

import type React from "react"
import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react"
import { signInWithPassword } from "@/lib/actions/auth"
import { isInvitationPath, safeNextPath } from "@/lib/auth/redirects"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

function LoginCard() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNextPath(params.get("next"), "/")
  const prefillEmail = params.get("email")?.trim().toLowerCase() ?? ""
  const invitationFlow = isInvitationPath(next) && Boolean(prefillEmail)
  const signUpHref = invitationFlow
    ? `/auth/sign-up?${new URLSearchParams({ next, email: prefillEmail }).toString()}`
    : "/auth/sign-up"
  const [email, setEmail] = useState(prefillEmail)
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const result = await signInWithPassword(email, password)
      if (result.error) {
        setError(invitationFlow ? "Unable to sign in with this email and password." : result.error)
        return
      }

      router.replace(next)
      router.refresh()
    } catch (error) {
      setError(
        invitationFlow
          ? "Unable to sign in with the invited account. Please try again."
          : error instanceof Error
            ? error.message
            : "Unable to sign in. Please try again.",
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="gap-0 border-slate-200/80 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
      <CardHeader className="space-y-4 pb-6 pt-8 text-center sm:px-8">
        {/* Prominent LogoB */}
        <div className="flex justify-center">
          <img
            src="/LogoB.png"
            alt="Provision Consultancy Logo"
            className="h-14 w-auto max-w-[220px] object-contain drop-shadow-xs transition-transform hover:scale-[1.02]"
          />
        </div>
        <div className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back
          </CardTitle>
          <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
            Sign in to access your Provision workspace
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pb-8 sm:px-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={invitationFlow}
                placeholder="admin@provision.test"
                className="h-11 border-slate-200 bg-slate-50/50 pl-9 text-sm focus:bg-background dark:border-slate-700 dark:bg-slate-800/50"
              />
            </div>
            {invitationFlow && (
              <p className="text-[11px] text-muted-foreground">
                Sign in with the email address that received the invitation.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Password
              </Label>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 border-slate-200 bg-slate-50/50 px-9 text-sm focus:bg-background dark:border-slate-700 dark:bg-slate-800/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              <ShieldCheck className="size-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            size="lg"
            className="h-11 w-full font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.99]"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Signing in...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                Sign in
                <ArrowRight className="size-4" />
              </span>
            )}
          </Button>
        </form>

        <div className="border-t border-slate-100 pt-4 text-center dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {"Don't have an account? "}
            <Link
              href={signUpHref}
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Sign up
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Card className="animate-pulse">
          <CardHeader className="text-center">
            <div className="mx-auto h-12 w-36 rounded bg-muted"></div>
            <div className="mx-auto mt-4 h-6 w-24 rounded bg-muted"></div>
          </CardHeader>
          <CardContent className="flex h-[250px] items-center justify-center">
            <div className="text-xs text-muted-foreground">Loading workspace...</div>
          </CardContent>
        </Card>
      }
    >
      <LoginCard />
    </Suspense>
  )
}
