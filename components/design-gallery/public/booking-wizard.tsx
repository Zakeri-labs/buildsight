"use client"

import Link from "next/link"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { CalendarCheck, Check, FileText, Loader2, MapPin, Paperclip, Phone, Video, X } from "lucide-react"
import { loadBookingAvailability, prepareBookingFileUpload, sendMeetingRequest } from "@/lib/design-gallery/booking/actions"
import { dayChip, meetingWhen, timeLabel } from "@/lib/design-gallery/booking/format"
import type { BookingConfirmation, BookingError } from "@/lib/design-gallery/booking/server"
import type { BookingDay } from "@/lib/design-gallery/booking/slots"
import {
  IDEA_FILE_MAX_BYTES,
  IDEA_FILE_MAX_COUNT,
  IDEA_FILE_TYPES,
  LAND_STATUSES,
  MEETING_MODES,
  PROJECT_TYPES,
  START_TIMELINES,
  type MeetingMode,
  type MeetingPath,
} from "@/lib/design-gallery/booking/types"
import { validateMeetingRequest, type BookingFieldError } from "@/lib/design-gallery/booking/validation"
import { OMAN_GOVERNORATES } from "@/lib/design-gallery/booking/wilayat"
import { fill, type PublicLocale } from "@/lib/design-gallery/public-locale"
import { dictionaries } from "@/lib/i18n/dictionaries"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { rememberVisitSource } from "./client"
import { buttonClass } from "./public-shell"

const MEETING_FILES_BUCKET = "design-meeting-files"
const OTHER = "__other__"

type Fields = {
  clientName: string
  whatsappPhone: string
  email: string
  projectType: string
  landStatus: string
  wilayatKey: string
  wilayatOther: string
  landAreaSqm: string
  startTimeline: string
  ideaText: string
}
type FieldKey = keyof Fields | "wilayat" | "attachmentPaths" | "slotStart" | "meetingMode"
type UploadedFile = { id: string; name: string; status: "uploading" | "done" | "error"; path?: string; error?: string }

/** Fields of step 1; errors on these send the visitor back to step 1. */
const STEP_ONE: FieldKey[] = ["clientName", "whatsappPhone", "projectType", "landStatus", "wilayat", "landAreaSqm", "startTimeline", "ideaText", "attachmentPaths"]

const inputClass =
  "block w-full min-h-11 rounded-lg border border-white/15 bg-[var(--gallery-card)] px-3 py-2 text-base text-white placeholder:text-white/35 focus:border-[var(--gallery-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--gallery-accent)]/40 aria-[invalid=true]:border-red-400"

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16))
}

export function BookingWizard({
  locale,
  path,
  design,
  officeAddress,
  timeZone,
  galleryHref,
  backHref,
}: {
  locale: PublicLocale
  path: MeetingPath
  design: { slug: string; title: string; code: string; coverUrl: string | null } | null
  officeAddress: string | null
  timeZone: string
  galleryHref: string
  backHref: string
}) {
  const t = dictionaries[locale].designGalleryPublic.booking
  const formId = useId()
  const topRef = useRef<HTMLDivElement>(null)
  const [requestKey] = useState(newKey)
  const [openedAt] = useState(() => Date.now())
  const [step, setStep] = useState<1 | 2>(1)
  const [fields, setFields] = useState<Fields>({
    clientName: "",
    whatsappPhone: "",
    email: "",
    projectType: "",
    landStatus: "",
    wilayatKey: "",
    wilayatOther: "",
    landAreaSqm: "",
    startTimeline: "",
    ideaText: "",
  })
  const [honeypot, setHoneypot] = useState("")
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [errors, setErrors] = useState<Partial<Record<FieldKey, BookingFieldError | "fileType" | "fileSize" | "uploadFailed">>>({})
  const [mode, setMode] = useState<MeetingMode | "">("")
  const [days, setDays] = useState<BookingDay[] | null>(null)
  const [daysState, setDaysState] = useState<"idle" | "loading" | "failed">("idle")
  const [day, setDay] = useState<string>("")
  const [slot, setSlot] = useState<string>("")
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<BookingError | null>(null)
  const [done, setDone] = useState<BookingConfirmation | null>(null)

  const set = (key: keyof Fields) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = event.target.value
    setFields((current) => ({ ...current, [key]: value }))
    const errorKey: FieldKey = key === "wilayatKey" || key === "wilayatOther" ? "wilayat" : key
    setErrors((current) => (current[errorKey] ? { ...current, [errorKey]: undefined } : current))
  }

  const wilayat = fields.wilayatKey === OTHER ? `other:${fields.wilayatOther}` : fields.wilayatKey
  const uploading = files.some((f) => f.status === "uploading")
  const attachmentPaths = files.flatMap((f) => (f.status === "done" && f.path ? [f.path] : []))

  const payload = (overrides: Record<string, unknown> = {}) => ({
    requestKey,
    // Time spent on the form, measured on the visitor's own clock (bot check).
    elapsedMs: Date.now() - openedAt,
    website: honeypot,
    path,
    designSlug: design?.slug ?? "",
    clientName: fields.clientName,
    whatsappPhone: fields.whatsappPhone,
    email: fields.email,
    projectType: fields.projectType,
    landStatus: fields.landStatus,
    wilayat,
    landAreaSqm: fields.landAreaSqm,
    startTimeline: fields.startTimeline,
    ideaText: path === "idea" ? fields.ideaText : "",
    attachmentPaths: path === "idea" ? attachmentPaths : [],
    meetingMode: mode,
    slotStart: mode === "call_me" ? "" : slot,
    locale,
    ...overrides,
  })

  const scrollTop = () => topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })

  const focusFirstError = (found: Partial<Record<string, unknown>>) => {
    requestAnimationFrame(() => {
      const first = Object.keys(found).find((key) => found[key])
      const target = first ? document.querySelector<HTMLElement>(`[data-field="${first}"]`) : null
      target?.focus()
      target?.scrollIntoView({ block: "center", behavior: "smooth" })
    })
  }

  const goToStepTwo = () => {
    // Step 1 checks only its own fields: the meeting is chosen next.
    const result = validateMeetingRequest(payload({ meetingMode: "call_me", slotStart: "" }))
    const stepErrors = result.ok ? {} : Object.fromEntries(Object.entries(result.errors).filter(([key]) => STEP_ONE.includes(key as FieldKey)))
    if (Object.keys(stepErrors).length) {
      setErrors(stepErrors)
      focusFirstError(stepErrors)
      return
    }
    setErrors({})
    setStep(2)
    scrollTop()
  }

  const loadDays = useCallback(async () => {
    setDaysState("loading")
    const result = await loadBookingAvailability().catch(() => null)
    if (!result || !result.ok) {
      setDaysState("failed")
      return
    }
    const open = result.data.days.filter((d) => d.slots.length > 0)
    setDays(open)
    setDaysState("idle")
    setDay((current) => (open.some((d) => d.date === current) ? current : open[0]?.date ?? ""))
  }, [])

  useEffect(() => {
    if (step === 2 && mode && mode !== "call_me" && days === null && daysState === "idle") void loadDays()
  }, [step, mode, days, daysState, loadDays])

  const chosenDay = days?.find((d) => d.date === day) ?? null

  const submit = async () => {
    if (sending || uploading) return
    const raw = payload()
    const check = validateMeetingRequest(raw)
    if (!check.ok) {
      setErrors(check.errors)
      if (Object.keys(check.errors).some((key) => STEP_ONE.includes(key as FieldKey))) setStep(1)
      focusFirstError(check.errors)
      return
    }
    setSending(true)
    setFailure(null)
    const source = rememberVisitSource()
    const result = await sendMeetingRequest({ ...raw, ...source }).catch(() => null)
    setSending(false)
    if (!result) {
      setFailure("failed")
      return
    }
    if (result.ok) {
      setDone(result.data)
      scrollTop()
      return
    }
    setFailure(result.error)
    if (result.error === "slotTaken") {
      setSlot("")
      setDays(null) // reload the free times
    }
    if (result.fieldErrors) {
      setErrors(result.fieldErrors)
      if (Object.keys(result.fieldErrors).some((key) => STEP_ONE.includes(key as FieldKey))) setStep(1)
      focusFirstError(result.fieldErrors)
    }
  }

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return
    setErrors((current) => ({ ...current, attachmentPaths: undefined, ideaText: undefined }))
    const room = IDEA_FILE_MAX_COUNT - files.filter((f) => f.status !== "error").length
    const chosen = Array.from(list)
    if (chosen.length > room) setErrors((current) => ({ ...current, attachmentPaths: "tooManyFiles" }))
    for (const file of chosen.slice(0, Math.max(room, 0))) {
      const id = newKey()
      if (!(IDEA_FILE_TYPES as readonly string[]).includes(file.type)) {
        setFiles((current) => [...current, { id, name: file.name, status: "error", error: t.errors.fileType }])
        continue
      }
      if (file.size > IDEA_FILE_MAX_BYTES) {
        setFiles((current) => [...current, { id, name: file.name, status: "error", error: t.errors.fileSize }])
        continue
      }
      setFiles((current) => [...current, { id, name: file.name, status: "uploading" }])
      const update = (patch: Partial<UploadedFile>) => setFiles((current) => current.map((f) => (f.id === id ? { ...f, ...patch } : f)))
      try {
        const prepared = await prepareBookingFileUpload({ requestKey, name: file.name, size: file.size, type: file.type })
        if (!prepared.ok) {
          const code = prepared.fieldErrors?.attachmentPaths
          update({ status: "error", error: code === "tooManyFiles" ? t.errors.tooManyFiles : t.errors.uploadFailed })
          continue
        }
        const { error } = await createClient()
          .storage.from(MEETING_FILES_BUCKET)
          .uploadToSignedUrl(prepared.data.storagePath, prepared.data.token, file, { contentType: file.type })
        update(error ? { status: "error", error: t.errors.uploadFailed } : { status: "done", path: prepared.data.storagePath })
      } catch {
        update({ status: "error", error: t.errors.uploadFailed })
      }
    }
  }

  const errorText = (key: FieldKey) => {
    const code = errors[key]
    return code ? (t.errors as Record<string, string>)[code] ?? t.errors.required : null
  }

  if (done) {
    return (
      <div ref={topRef} className="mx-auto max-w-xl scroll-mt-24">
        <Confirmation done={done} locale={locale} officeAddress={officeAddress} galleryHref={galleryHref} />
      </div>
    )
  }

  return (
    <div ref={topRef} className="mx-auto flex max-w-xl scroll-mt-24 flex-col gap-5">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-medium text-[var(--gallery-accent)]">{fill(t.step, { step })}</p>
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[var(--gallery-card)] p-3">
          {design?.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={design.coverUrl} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
          ) : null}
          <div className="min-w-0">
            <p className="font-semibold [overflow-wrap:anywhere]">{design ? design.title : t.ideaHeading}</p>
            <p className="text-sm text-white/60">
              {design ? (
                <>
                  <span dir="ltr">{design.code}</span> · {path === "modified" ? t.pathModified : t.pathSame}
                </>
              ) : (
                t.ideaSubheading
              )}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5" aria-hidden>
          <span className="h-1 rounded-full bg-[var(--gallery-accent)]" />
          <span className={cn("h-1 rounded-full", step === 2 ? "bg-[var(--gallery-accent)]" : "bg-white/15")} />
        </div>
      </header>

      <form
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (step === 1) goToStepTwo()
          else void submit()
        }}
        className="flex flex-col gap-5"
      >
        {/* Hidden from people; bots fill it in. */}
        <div className="sr-only" aria-hidden>
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} name="website" />
          </label>
        </div>

        {step === 1 ? (
          <>
            <h1 className="text-2xl font-bold">{t.aboutTitle}</h1>
            <Field label={t.name} error={errorText("clientName")} htmlFor={`${formId}-name`}>
              <input
                id={`${formId}-name`}
                data-field="clientName"
                className={inputClass}
                autoComplete="name"
                placeholder={t.namePlaceholder}
                value={fields.clientName}
                onChange={set("clientName")}
                aria-invalid={Boolean(errors.clientName)}
                maxLength={100}
              />
            </Field>
            <Field label={t.whatsapp} hint={t.whatsappHint} error={errorText("whatsappPhone")} htmlFor={`${formId}-phone`}>
              <input
                id={`${formId}-phone`}
                data-field="whatsappPhone"
                className={cn(inputClass, "text-start")}
                dir="ltr"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+968 9XXXXXXX"
                value={fields.whatsappPhone}
                onChange={set("whatsappPhone")}
                aria-invalid={Boolean(errors.whatsappPhone)}
                maxLength={24}
              />
            </Field>
            <Choices
              name="projectType"
              legend={t.projectType}
              options={PROJECT_TYPES.map((key) => ({ value: key, label: t.projectTypes[key] }))}
              value={fields.projectType}
              onChange={set("projectType")}
              error={errorText("projectType")}
            />
            <Choices
              name="landStatus"
              legend={t.landStatus}
              options={LAND_STATUSES.map((key) => ({ value: key, label: t.landStatuses[key] }))}
              value={fields.landStatus}
              onChange={set("landStatus")}
              error={errorText("landStatus")}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t.wilayat} optional={t.optional} error={errorText("wilayat")} htmlFor={`${formId}-wilayat`}>
                <select
                  id={`${formId}-wilayat`}
                  data-field="wilayat"
                  className={inputClass}
                  value={fields.wilayatKey}
                  onChange={set("wilayatKey")}
                  aria-invalid={Boolean(errors.wilayat)}
                >
                  <option value="">{t.wilayatPlaceholder}</option>
                  {OMAN_GOVERNORATES.map((governorate) => (
                    <optgroup key={governorate.en} label={locale === "ar" ? governorate.ar : governorate.en}>
                      {governorate.wilayat.map((w) => (
                        <option key={w.key} value={w.key}>
                          {locale === "ar" ? w.ar : w.en}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={OTHER}>{t.wilayatOther}</option>
                </select>
                {fields.wilayatKey === OTHER ? (
                  <input
                    className={cn(inputClass, "mt-2")}
                    placeholder={t.wilayatOtherPlaceholder}
                    aria-label={t.wilayatOtherPlaceholder}
                    value={fields.wilayatOther}
                    onChange={set("wilayatOther")}
                    maxLength={60}
                  />
                ) : null}
              </Field>
              <Field label={t.landArea} optional={t.optional} error={errorText("landAreaSqm")} htmlFor={`${formId}-area`}>
                <input
                  id={`${formId}-area`}
                  data-field="landAreaSqm"
                  className={inputClass}
                  dir="ltr"
                  inputMode="decimal"
                  placeholder="600"
                  value={fields.landAreaSqm}
                  onChange={set("landAreaSqm")}
                  aria-invalid={Boolean(errors.landAreaSqm)}
                  maxLength={12}
                />
              </Field>
            </div>
            <Choices
              name="startTimeline"
              legend={t.startTimeline}
              options={START_TIMELINES.map((key) => ({ value: key, label: t.timelines[key] }))}
              value={fields.startTimeline}
              onChange={set("startTimeline")}
              error={errorText("startTimeline")}
            />
            {path === "idea" ? (
              <>
                <Field label={t.ideaText} error={errorText("ideaText")} htmlFor={`${formId}-idea`}>
                  <textarea
                    id={`${formId}-idea`}
                    data-field="ideaText"
                    className={cn(inputClass, "min-h-28")}
                    placeholder={t.ideaPlaceholder}
                    value={fields.ideaText}
                    onChange={set("ideaText")}
                    aria-invalid={Boolean(errors.ideaText)}
                    maxLength={2000}
                  />
                </Field>
                <FilePicker
                  files={files}
                  t={t}
                  error={errorText("attachmentPaths")}
                  canAdd={files.filter((f) => f.status !== "error").length < IDEA_FILE_MAX_COUNT}
                  onAdd={addFiles}
                  onRemove={(id) => setFiles((current) => current.filter((f) => f.id !== id))}
                />
              </>
            ) : null}
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-between">
              <Link href={backHref} className={buttonClass.outline}>
                {t.back}
              </Link>
              <button type="submit" className={buttonClass.primary} disabled={uploading}>
                {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {uploading ? t.uploading : t.next}
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">{t.meetingTitle}</h1>
            <fieldset data-field="meetingMode" tabIndex={-1} className="flex flex-col gap-2 focus:outline-none">
              <legend className="sr-only">{t.meetingTitle}</legend>
              <div className="grid grid-cols-3 gap-2">
                {MEETING_MODES.map((key) => {
                  const Icon = key === "remote" ? Video : key === "office" ? MapPin : Phone
                  return (
                    <label
                      key={key}
                      className="relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-white/15 bg-[var(--gallery-card)] p-2 text-center transition-colors has-[:checked]:border-[var(--gallery-accent)] has-[:checked]:bg-[var(--gallery-accent)]/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--gallery-accent)]"
                    >
                      <input
                        type="radio"
                        name="meetingMode"
                        value={key}
                        checked={mode === key}
                        onChange={() => {
                          setMode(key)
                          setFailure(null)
                          setErrors((current) => ({ ...current, meetingMode: undefined, email: undefined, slotStart: undefined }))
                        }}
                        className="sr-only"
                      />
                      <Icon className="size-5 text-[var(--gallery-accent)]" aria-hidden />
                      <span className="text-sm font-semibold">{t.modes[key]}</span>
                      <span className="line-clamp-2 text-[11px] text-white/55 [overflow-wrap:anywhere]">
                        {key === "office" ? officeAddress || t.modeHints.office : t.modeHints[key]}
                      </span>
                    </label>
                  )
                })}
              </div>
              {errors.meetingMode ? <p className="text-sm text-red-300">{errorText("meetingMode")}</p> : null}
            </fieldset>

            {mode === "remote" || mode === "office" ? (
              <>
                <Slots
                  t={t}
                  locale={locale}
                  timeZone={timeZone}
                  days={days}
                  state={daysState}
                  day={day}
                  slot={slot}
                  chosenDay={chosenDay}
                  error={errorText("slotStart")}
                  onDay={(value) => {
                    setDay(value)
                    setSlot("")
                  }}
                  onSlot={(value) => {
                    setSlot(value)
                    setFailure(null)
                    setErrors((current) => ({ ...current, slotStart: undefined }))
                  }}
                  onRetry={() => {
                    setDaysState("idle")
                    setDays(null)
                  }}
                />
                <Field
                  label={t.email}
                  optional={mode === "office" ? t.optional : undefined}
                  hint={mode === "remote" ? t.emailRemoteHint : undefined}
                  error={errorText("email")}
                  htmlFor={`${formId}-email`}
                >
                  <input
                    id={`${formId}-email`}
                    data-field="email"
                    className={inputClass}
                    dir="ltr"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={fields.email}
                    onChange={set("email")}
                    aria-invalid={Boolean(errors.email)}
                    maxLength={254}
                  />
                </Field>
              </>
            ) : mode === "call_me" ? (
              <p className="rounded-xl border border-white/10 bg-[var(--gallery-card)] p-4 text-sm text-white/75">{t.callMeNote}</p>
            ) : null}

            {failure ? (
              <p role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
                {t.failures[failure]}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-between">
              <button
                type="button"
                className={buttonClass.outline}
                onClick={() => {
                  setStep(1)
                  setFailure(null)
                  scrollTop()
                }}
              >
                {t.back}
              </button>
              <button type="submit" className={buttonClass.primary} disabled={sending || !mode || (mode !== "call_me" && !slot)}>
                {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarCheck className="size-4" aria-hidden />}
                {sending ? t.sending : mode === "call_me" ? t.submitCallMe : t.submit}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}

type Texts = (typeof dictionaries)[PublicLocale]["designGalleryPublic"]["booking"]

function Field({
  label,
  hint,
  optional,
  error,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  optional?: string
  error: string | null
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {optional ? <span className="ms-1 text-xs font-normal text-white/45">({optional})</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-white/50">{hint}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  )
}

function Choices({
  name,
  legend,
  options,
  value,
  onChange,
  error,
}: {
  name: string
  legend: string
  options: { value: string; label: string }[]
  value: string
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  error: string | null
}) {
  return (
    <fieldset data-field={name} tabIndex={-1} className="flex min-w-0 flex-col gap-2 focus:outline-none" aria-invalid={Boolean(error)}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="relative inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-[var(--gallery-card)] px-3.5 py-1.5 text-sm transition-colors has-[:checked]:border-[var(--gallery-accent)] has-[:checked]:bg-[var(--gallery-accent)] has-[:checked]:font-semibold has-[:checked]:text-[var(--gallery-accent-foreground)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/70"
          >
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={onChange} className="sr-only" />
            {value === option.value ? <Check className="size-3.5" aria-hidden /> : null}
            {option.label}
          </label>
        ))}
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </fieldset>
  )
}

function FilePicker({
  files,
  t,
  error,
  canAdd,
  onAdd,
  onRemove,
}: {
  files: UploadedFile[]
  t: Texts
  error: string | null
  canAdd: boolean
  onAdd: (list: FileList | null) => void
  onRemove: (id: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div data-field="attachmentPaths" tabIndex={-1} className="flex flex-col gap-2 focus:outline-none">
      <p className="text-sm font-medium">
        {t.files} <span className="text-xs font-normal text-white/45">({t.optional})</span>
      </p>
      {files.length ? (
        <ul className="flex flex-col gap-2">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-[var(--gallery-card)] px-3 py-2 text-sm">
              {file.status === "uploading" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-white/60" aria-hidden />
              ) : (
                <FileText className={cn("size-4 shrink-0", file.status === "error" ? "text-red-300" : "text-[var(--gallery-accent)]")} aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate" dir="auto">
                  {file.name}
                </p>
                {file.error ? <p className="text-xs text-red-300">{file.error}</p> : null}
              </div>
              {file.status !== "uploading" ? (
                <button
                  type="button"
                  onClick={() => onRemove(file.id)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
                  aria-label={fill(t.removeFile, { name: file.name })}
                >
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canAdd ? (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={IDEA_FILE_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              onAdd(event.target.files)
              event.target.value = ""
            }}
          />
          <button type="button" onClick={() => inputRef.current?.click()} className={cn(buttonClass.outline, "w-fit border-dashed")}>
            <Paperclip className="size-4" aria-hidden />
            {t.addFile}
          </button>
        </>
      ) : null}
      <p className="text-xs text-white/50">{t.filesHint}</p>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  )
}

function Slots({
  t,
  locale,
  timeZone,
  days,
  state,
  day,
  slot,
  chosenDay,
  error,
  onDay,
  onSlot,
  onRetry,
}: {
  t: Texts
  locale: PublicLocale
  timeZone: string
  days: BookingDay[] | null
  state: "idle" | "loading" | "failed"
  day: string
  slot: string
  chosenDay: BookingDay | null
  error: string | null
  onDay: (date: string) => void
  onSlot: (start: string) => void
  onRetry: () => void
}) {
  const chips = useMemo(() => (days ?? []).map((d) => ({ date: d.date, ...dayChip(d.date, locale) })), [days, locale])
  if (state === "failed") {
    return (
      <div className="flex flex-col items-start gap-2 rounded-xl border border-white/10 p-4 text-sm text-white/75">
        <p>{t.slotsFailed}</p>
        <button type="button" onClick={onRetry} className={buttonClass.outline}>
          {dictionaries[locale].designGalleryPublic.retry}
        </button>
      </div>
    )
  }
  if (days === null || state === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-white/60" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden /> {t.loadingSlots}
      </p>
    )
  }
  if (days.length === 0) return <p className="rounded-xl border border-white/10 p-4 text-sm text-white/75">{t.noSlots}</p>
  return (
    <div data-field="slotStart" tabIndex={-1} className="flex min-w-0 flex-col gap-4 focus:outline-none">
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium">{t.pickDay}</legend>
        <div className="relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:thin] sm:mx-0 sm:px-0">
          {chips.map((chip) => (
            <label
              key={chip.date}
              className="relative flex min-w-16 shrink-0 cursor-pointer flex-col items-center rounded-xl border border-white/15 bg-[var(--gallery-card)] px-2 py-2 text-center has-[:checked]:border-[var(--gallery-accent)] has-[:checked]:bg-[var(--gallery-accent)] has-[:checked]:text-[var(--gallery-accent-foreground)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/70"
            >
              <input type="radio" name="day" value={chip.date} checked={day === chip.date} onChange={() => onDay(chip.date)} className="sr-only" />
              <span className="text-xs">{chip.weekday}</span>
              <span className="text-lg font-bold leading-tight">{chip.day}</span>
              <span className="text-[11px] opacity-70">{chip.month}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium">{t.pickTime}</legend>
        {chosenDay?.slots.length ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {chosenDay.slots.map((s) => (
              <label
                key={s.start}
                className="relative flex min-h-10 cursor-pointer items-center justify-center rounded-lg border border-white/15 bg-[var(--gallery-card)] px-2 text-sm has-[:checked]:border-[var(--gallery-accent)] has-[:checked]:bg-[var(--gallery-accent)] has-[:checked]:font-semibold has-[:checked]:text-[var(--gallery-accent-foreground)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/70"
              >
                <input type="radio" name="slot" value={s.start} checked={slot === s.start} onChange={() => onSlot(s.start)} className="sr-only" />
                <span dir="ltr">{timeLabel(s.start, locale, timeZone)}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/60">{t.noSlotsDay}</p>
        )}
        <p className="mt-2 text-xs text-white/50">
          {timeZone === "Asia/Muscat" ? t.timeZoneNote : fill(t.timeZoneNoteOther, { zone: timeZone })}
        </p>
        {error ? <p className="mt-1 text-sm text-red-300">{error}</p> : null}
      </fieldset>
    </div>
  )
}

function Confirmation({
  done,
  locale,
  officeAddress,
  galleryHref,
}: {
  done: BookingConfirmation
  locale: PublicLocale
  officeAddress: string | null
  galleryHref: string
}) {
  const t = dictionaries[locale].designGalleryPublic.booking
  const address = (locale === "ar" ? done.officeAddressAr || done.officeAddressEn : done.officeAddressEn || done.officeAddressAr) ?? officeAddress
  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-[var(--gallery-card)] p-6 text-center" aria-live="polite">
      <span className="flex size-14 items-center justify-center rounded-full bg-[var(--gallery-accent)]/15 text-[var(--gallery-accent)]">
        <Check className="size-7" aria-hidden />
      </span>
      <h1 className="text-2xl font-bold">{done.startsAt ? t.confirmedTitle : t.callMeTitle}</h1>
      {done.startsAt ? (
        <>
          <p className="text-lg font-semibold">
            {meetingWhen(done.startsAt, locale, done.timeZone)} · {t.modes[done.mode]}
          </p>
          {done.mode === "office" && address ? <p className="text-sm text-white/75">{fill(t.officeAt, { address })}</p> : null}
          <p className="text-sm text-white/75">{done.calendarInvite ? t.inviteSent : t.inviteLater}</p>
          {done.meetLink ? (
            <a href={done.meetLink} target="_blank" rel="noopener noreferrer" className={buttonClass.outline} dir="ltr">
              <Video className="size-4" aria-hidden />
              {t.joinMeeting}
            </a>
          ) : null}
          <p className="text-sm text-white/60">{t.engineerNote}</p>
        </>
      ) : (
        <p className="text-sm text-white/75">{t.callMeBody}</p>
      )}
      <Link href={galleryHref} className={buttonClass.primary}>
        {t.backToGallery}
      </Link>
    </section>
  )
}
