"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Building2 } from "lucide-react"
import { createSupervisingOrganization } from "@/lib/actions/onboarding"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function OnboardingForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createSupervisingOrganization(name)
      if (result.ok) {
        router.replace("/")
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="items-center text-center">
        <Logo textClassName="text-foreground" />
        <CardTitle className="mt-4 text-xl">Set up your consultancy</CardTitle>
        <CardDescription>
          Create your supervising organization. You&apos;ll become its Organization Admin and can
          invite the rest of your team.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="org-name">Organization name</Label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Provision Consultancy"
                className="ps-9"
                autoFocus
                required
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating..." : "Create organization"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
