"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { ArrowLeft, Building2, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ProjectLocationField } from "@/components/projects/project-location-field"
import { createProject } from "@/lib/actions/projects"
import { useI18n } from "@/lib/i18n"
import { EMPTY_PROJECT_LOCATION, type ProjectLocationValue } from "@/lib/locations/types"

export function ProjectCreateForm({ supervisingOrg }: { supervisingOrg: { id: string; name: string } }) {
  const router = useRouter()
  const { locale } = useI18n()
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [location, setLocation] = useState<ProjectLocationValue>(EMPTY_PROJECT_LOCATION)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, startTransition] = useTransition()

  const copy = locale === "ar"
    ? {
        back: "العودة إلى المشاريع",
        title: "إضافة مشروع",
        subtitle: `سيتم إنشاء هذا المشروع ضمن ${supervisingOrg.name}.`,
        org: "الجهة المشرفة",
        name: "اسم المشروع",
        namePlaceholder: "مثال: برج المرسى السكني",
        code: "رمز المشروع",
        codePlaceholder: "مثال: PRJ-009",
        cancel: "إلغاء",
        create: "إنشاء المشروع",
        creating: "جارٍ إنشاء المشروع…",
        created: "تم إنشاء المشروع بنجاح. جارٍ فتح صفحة المشاريع…",
      }
    : {
        back: "Back to Projects",
        title: "Add Project",
        subtitle: `This project will be created under ${supervisingOrg.name}.`,
        org: "Supervising organization",
        name: "Project name",
        namePlaceholder: "e.g. Marina West Residences",
        code: "Project code",
        codePlaceholder: "e.g. PRJ-009",
        cancel: "Cancel",
        create: "Create Project",
        creating: "Creating project…",
        created: "Project created successfully. Opening Projects…",
      }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(false)

    startTransition(async () => {
      const result = await createProject({
        supervisingOrgId: supervisingOrg.id,
        name,
        code,
        location: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
      })

      if (!result.ok || !result.data) {
        setError(result.error)
        return
      }

      setSuccess(true)
      router.replace(`/projects?created=${encodeURIComponent(result.data.id)}`)
      router.refresh()
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Link
        href="/projects"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {copy.back}
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">{copy.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">{copy.subtitle}</p>
      </div>

      <form onSubmit={submit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4 text-primary" />
              {copy.org}: {supervisingOrg.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-project-name">{copy.name}</Label>
              <Input
                id="new-project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={copy.namePlaceholder}
                autoComplete="organization"
                required
                minLength={2}
                disabled={pending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-project-code">{copy.code}</Label>
              <Input
                id="new-project-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder={copy.codePlaceholder}
                disabled={pending}
              />
            </div>

            <ProjectLocationField
              id="new-project-location"
              value={location}
              onChange={setLocation}
              disabled={pending}
            />

            {error && (
              <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {success && (
              <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="size-4 shrink-0" />
                {copy.created}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" render={<Link href="/projects" />} disabled={pending}>
              {copy.cancel}
            </Button>
            <Button type="submit" disabled={pending || name.trim().length < 2}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {pending ? copy.creating : copy.create}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}
