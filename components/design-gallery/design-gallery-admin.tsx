"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ImageOff, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useI18n } from "@/lib/i18n"
import { activateDesignGallery, saveDesignGallerySite } from "@/lib/design-gallery/actions"
import type { Design, DesignCategory, DesignGallerySite, DesignStatus } from "@/lib/design-gallery/types"
import { cn } from "@/lib/utils"

export function DesignStatusBadge({ status }: { status: DesignStatus }) {
  const { t } = useI18n()
  return (
    <Badge
      variant={status === "published" ? "default" : status === "draft" ? "secondary" : "outline"}
      className={cn(status === "published" && "bg-emerald-600 text-white")}
    >
      {t.designGallery.status[status]}
    </Badge>
  )
}

function ActivateCard() {
  const { t } = useI18n()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 py-8">
        <h2 className="text-lg font-semibold">{t.designGallery.activateTitle}</h2>
        <p className="text-sm text-muted-foreground text-pretty">{t.designGallery.activateBody}</p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await activateDesignGallery()
              if (!result.ok) setError(t.designGallery.errors[result.error])
              else router.refresh()
            })
          }
        >
          {t.designGallery.activate}
        </Button>
      </CardContent>
    </Card>
  )
}

function SiteSettingsCard({ site }: { site: DesignGallerySite }) {
  const { t } = useI18n()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [isEnabled, setIsEnabled] = useState(site.isEnabled)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const publicPath = "/designs"

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.designGallery.settings}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const raw = Object.fromEntries(form.entries())
            startTransition(async () => {
              setMessage(null)
              const result = await saveDesignGallerySite({ ...raw, isEnabled })
              if (result.ok) {
                setFieldErrors({})
                setMessage({ kind: "ok", text: t.designGallery.saved })
                router.refresh()
              } else {
                setFieldErrors(
                  Object.fromEntries(
                    Object.entries(result.fieldErrors ?? {}).map(([key, code]) => [key, t.designGallery.errors[code]]),
                  ),
                )
                setMessage({ kind: "error", text: t.designGallery.errors[result.error] })
              }
            })
          }}
        >
          <div className="flex items-start justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
            <div>
              <Label htmlFor="design-gallery-enabled">{t.designGallery.enabled}</Label>
              <p className="mt-1 text-xs text-muted-foreground">{t.designGallery.enabledHint}</p>
            </div>
            <Switch id="design-gallery-enabled" checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <span className="text-sm font-medium">{t.designGallery.publicAddress}</span>
            <a href={publicPath} target="_blank" rel="noreferrer" className="w-fit text-sm text-primary underline" dir="ltr">
              {publicPath}
            </a>
          </div>

          <Field id="displayNameAr" label={t.designGallery.displayNameAr} error={fieldErrors.displayNameAr}>
            <Input id="displayNameAr" name="displayNameAr" defaultValue={site.displayNameAr ?? ""} dir="rtl" />
          </Field>
          <Field id="displayNameEn" label={t.designGallery.displayNameEn} error={fieldErrors.displayNameEn}>
            <Input id="displayNameEn" name="displayNameEn" defaultValue={site.displayNameEn ?? ""} dir="ltr" />
          </Field>
          <Field
            id="whatsappPhone"
            label={t.designGallery.whatsappPhone}
            hint={t.designGallery.whatsappHint}
            error={fieldErrors.whatsappPhone}
          >
            <Input
              id="whatsappPhone"
              name="whatsappPhone"
              inputMode="tel"
              defaultValue={site.whatsappPhone ?? ""}
              dir="ltr"
              aria-invalid={Boolean(fieldErrors.whatsappPhone)}
            />
          </Field>

          <Field
            id="websiteUrl"
            label={t.designGallery.websiteUrl}
            hint={t.designGallery.websiteHint}
            error={fieldErrors.websiteUrl}
          >
            <Input
              id="websiteUrl"
              name="websiteUrl"
              inputMode="url"
              defaultValue={site.websiteUrl ?? ""}
              dir="ltr"
              aria-invalid={Boolean(fieldErrors.websiteUrl)}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? t.designGallery.saving : t.designGallery.saveSettings}
            </Button>
            {message ? (
              <p className={cn("text-sm", message.kind === "ok" ? "text-emerald-600" : "text-destructive")} role="status">
                {message.text}
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function DesignGalleryAdmin({
  site,
  categories,
  designs,
}: {
  site: DesignGallerySite | null
  categories: DesignCategory[]
  designs: Design[]
}) {
  const { t, locale } = useI18n()
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, locale === "ar" ? c.nameAr : c.nameEn])),
    [categories, locale],
  )
  const visible = categoryFilter === "all" ? designs : designs.filter((d) => d.categoryId === categoryFilter)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-balance">{t.designGallery.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">{t.designGallery.subtitle}</p>
        </div>
        {site ? (
          <Button render={<Link href="/design-gallery/new" />}>
            <Plus />
            {t.designGallery.newDesign}
          </Button>
        ) : null}
      </div>

      {!site ? (
        <ActivateCard />
      ) : (
        <>
          <SiteSettingsCard site={site} />

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t.designGallery.designs}</h2>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {[{ id: "all", label: t.designGallery.allCategories }, ...categories.map((c) => ({ id: c.id, label: categoryName.get(c.id) ?? "" }))].map(
                (chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setCategoryFilter(chip.id)}
                    aria-pressed={categoryFilter === chip.id}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
                      categoryFilter === chip.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    {chip.label}
                  </button>
                ),
              )}
            </div>

            {visible.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">{t.designGallery.noDesigns}</CardContent>
              </Card>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((design) => {
                  const cover = design.images[0]
                  const title = locale === "ar" ? design.titleAr : design.titleEn
                  return (
                    <li key={design.id}>
                      <Link
                        href={`/design-gallery/${design.id}`}
                        className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover.url} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                          ) : (
                            <div className="flex size-full items-center justify-center text-muted-foreground">
                              <ImageOff className="size-6" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-2 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <DesignStatusBadge status={design.status} />
                            <span className="text-xs text-muted-foreground">{categoryName.get(design.categoryId)}</span>
                            {!design.isBookable ? (
                              <Badge variant="outline">{t.designGallery.referenceOnly}</Badge>
                            ) : null}
                          </div>
                          <p className="break-words font-medium text-pretty">{title}</p>
                          <p className="mt-auto text-xs text-muted-foreground" dir="ltr">
                            {design.code} · /{design.slug}
                          </p>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
