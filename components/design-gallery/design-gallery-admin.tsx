"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarClock, ImageOff, Inbox, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useI18n } from "@/lib/i18n"
import { activateDesignGallery, saveBookingSettings, saveDesignGallerySite } from "@/lib/design-gallery/actions"
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

function BookingSettingsCard({ site, calendarConnected }: { site: DesignGallerySite; calendarConnected: boolean }) {
  const { t } = useI18n()
  const b = t.designGallery.bookingSettings
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const booking = site.booking
  // Shown starting with the week's first working day of the region (Sunday).
  const dayOrder = [0, 1, 2, 3, 4, 5, 6]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4" />
          {b.title}
        </CardTitle>
        <p className="text-sm text-muted-foreground text-pretty">{b.hint}</p>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const raw: Record<string, unknown> = Object.fromEntries(form.entries())
            raw.workDays = form.getAll("workDays")
            startTransition(async () => {
              setMessage(null)
              const result = await saveBookingSettings(raw)
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
          <p
            className={cn(
              "rounded-lg border p-3 text-sm sm:col-span-2",
              calendarConnected ? "border-emerald-600/30 bg-emerald-600/5" : "border-amber-500/40 bg-amber-500/10",
            )}
          >
            {calendarConnected ? b.calendarConnected : b.calendarNotConnected}
          </p>

          <fieldset className="grid min-w-0 gap-2 sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium">{b.workDays}</legend>
            <div className="flex flex-wrap gap-2">
              {dayOrder.map((day) => (
                <label
                  key={day}
                  className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
                >
                  <input type="checkbox" name="workDays" value={day} defaultChecked={booking.workDays.includes(day)} className="size-4 accent-primary" />
                  {b.days[day]}
                </label>
              ))}
            </div>
            {fieldErrors.workDays ? <p className="text-xs text-destructive">{fieldErrors.workDays}</p> : null}
          </fieldset>

          <div className="grid grid-cols-2 items-end gap-4 sm:col-span-2 sm:grid-cols-4">
            <Field id="dayStart" label={b.dayStart} error={fieldErrors.dayStart}>
              <Input id="dayStart" name="dayStart" type="time" step={300} defaultValue={booking.dayStart} dir="ltr" aria-invalid={Boolean(fieldErrors.dayStart)} />
            </Field>
            <Field id="dayEnd" label={b.dayEnd} error={fieldErrors.dayEnd}>
              <Input id="dayEnd" name="dayEnd" type="time" step={300} defaultValue={booking.dayEnd} dir="ltr" aria-invalid={Boolean(fieldErrors.dayEnd)} />
            </Field>
            <Field id="slotMinutes" label={b.slotMinutes} error={fieldErrors.slotMinutes}>
              <Input id="slotMinutes" name="slotMinutes" inputMode="numeric" defaultValue={booking.slotMinutes} dir="ltr" aria-invalid={Boolean(fieldErrors.slotMinutes)} />
            </Field>
            <Field id="minNoticeHours" label={b.minNoticeHours} error={fieldErrors.minNoticeHours}>
              <Input id="minNoticeHours" name="minNoticeHours" inputMode="numeric" defaultValue={booking.minNoticeHours} dir="ltr" aria-invalid={Boolean(fieldErrors.minNoticeHours)} />
            </Field>
            <Field id="daysAhead" label={b.daysAhead} error={fieldErrors.daysAhead}>
              <Input id="daysAhead" name="daysAhead" inputMode="numeric" defaultValue={booking.daysAhead} dir="ltr" aria-invalid={Boolean(fieldErrors.daysAhead)} />
            </Field>
            <Field id="timeZone" label={b.timeZone} error={fieldErrors.timeZone}>
              <Input id="timeZone" name="timeZone" defaultValue={booking.timeZone} dir="ltr" aria-invalid={Boolean(fieldErrors.timeZone)} />
            </Field>
          </div>

          <Field id="officeAddressAr" label={b.officeAddressAr} hint={b.officeHint} error={fieldErrors.officeAddressAr}>
            <Input id="officeAddressAr" name="officeAddressAr" defaultValue={site.officeAddressAr ?? ""} dir="rtl" maxLength={200} />
          </Field>
          <Field id="officeAddressEn" label={b.officeAddressEn} error={fieldErrors.officeAddressEn}>
            <Input id="officeAddressEn" name="officeAddressEn" defaultValue={site.officeAddressEn ?? ""} dir="ltr" maxLength={200} />
          </Field>

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? t.designGallery.saving : b.save}
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
  calendarConnected = false,
  newRequests = 0,
}: {
  site: DesignGallerySite | null
  categories: DesignCategory[]
  designs: Design[]
  calendarConnected?: boolean
  /** Requests still waiting for the team ("new" or "confirmed"). */
  newRequests?: number
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" render={<Link href="/design-gallery/requests" />}>
              <Inbox />
              {t.designGallery.bookingSettings.requests}
              {newRequests > 0 ? <Badge className="ms-1">{newRequests}</Badge> : null}
            </Button>
            <Button render={<Link href="/design-gallery/new" />}>
              <Plus />
              {t.designGallery.newDesign}
            </Button>
          </div>
        ) : null}
      </div>

      {!site ? (
        <ActivateCard />
      ) : (
        <>
          <SiteSettingsCard site={site} />
          <BookingSettingsCard site={site} calendarConnected={calendarConnected} />

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
                    <li key={design.id} className="min-w-0">
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
                          <p className="font-medium text-pretty [overflow-wrap:anywhere]">{title}</p>
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
