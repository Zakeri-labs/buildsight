"use client"

import Link from "next/link"
import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Field, DesignStatusBadge } from "@/components/design-gallery/design-gallery-admin"
import { useI18n } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/client"
import {
  deleteDesign,
  deleteDesignImage,
  finalizeDesignImageUpload,
  prepareDesignImageUpload,
  reorderDesignImages,
  saveDesign,
  setDesignStatus,
  type DesignGalleryActionResult,
} from "@/lib/design-gallery/actions"
import { DESIGN_GALLERY_BUCKET } from "@/lib/design-gallery/images"
import type { Design, DesignCategory, DesignImage, DesignStatus } from "@/lib/design-gallery/types"
import { PROJECT_IMAGE_ACCEPT } from "@/lib/projects/project-image"
import { cn } from "@/lib/utils"

const textareaClass =
  "min-h-24 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30"
const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30"

type Message = { kind: "ok" | "error"; text: string } | null

export function DesignEditor({ design, categories }: { design: Design | null; categories: DesignCategory[] }) {
  const { t, locale } = useI18n()
  const copy = t.designGallery
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<Message>(null)
  const [isBookable, setIsBookable] = useState(design?.isBookable ?? categories[0]?.bookableByDefault ?? true)
  const [bookableTouched, setBookableTouched] = useState(Boolean(design))
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // The version this form was loaded with; sent on save so a concurrent edit is not overwritten.
  const [version, setVersion] = useState(design?.updatedAt ?? "")

  function report(result: DesignGalleryActionResult<unknown>, okText?: string) {
    if (result.ok) {
      setFieldErrors({})
      setMessage(okText ? { kind: "ok", text: okText } : null)
      return true
    }
    setFieldErrors(
      Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([key, code]) => [key, copy.errors[code]])),
    )
    setMessage({ kind: "error", text: copy.errors[result.error] })
    return false
  }

  const err = (name: string) => fieldErrors[name]
  const invalid = (name: string) => Boolean(fieldErrors[name]) || undefined

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/design-gallery" className="w-fit text-sm text-muted-foreground hover:text-foreground">
          {copy.back}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 text-2xl font-semibold text-balance [overflow-wrap:anywhere]">
            {design ? (locale === "ar" ? design.titleAr : design.titleEn) : copy.newDesign}
          </h1>
          {design ? <DesignStatusBadge status={design.status} /> : null}
        </div>
      </div>

      {design ? (
        <StatusBar
          design={design}
          pending={pending}
          onChange={(status) =>
            startTransition(async () => {
              const result = await setDesignStatus(design.id, status)
              if (report(result, copy.saved) && result.ok) {
                setVersion(result.data.updatedAt)
                router.refresh()
              }
            })
          }
        />
      ) : null}

      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault()
          const raw = Object.fromEntries(new FormData(event.currentTarget).entries())
          startTransition(async () => {
            const result = await saveDesign(design?.id ?? null, { ...raw, isBookable, expectedUpdatedAt: version })
            if (!report(result, copy.saved) || !result.ok) return
            setVersion(result.data.updatedAt)
            if (!design) router.push(`/design-gallery/${result.data.id}`)
            else router.refresh()
          })
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>{copy.sections.basics}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="titleAr" label={copy.fields.titleAr} error={err("titleAr")}>
              <Input id="titleAr" name="titleAr" dir="rtl" required defaultValue={design?.titleAr} aria-invalid={invalid("titleAr")} />
            </Field>
            <Field id="titleEn" label={copy.fields.titleEn} error={err("titleEn")}>
              <Input id="titleEn" name="titleEn" dir="ltr" required defaultValue={design?.titleEn} aria-invalid={invalid("titleEn")} />
            </Field>
            <Field id="categoryId" label={copy.fields.categoryId} error={err("categoryId")}>
              <select
                id="categoryId"
                name="categoryId"
                className={selectClass}
                defaultValue={design?.categoryId ?? categories[0]?.id}
                aria-invalid={invalid("categoryId")}
                onChange={(event) => {
                  if (bookableTouched) return
                  const category = categories.find((c) => c.id === event.target.value)
                  if (category) setIsBookable(category.bookableByDefault)
                }}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {locale === "ar" ? category.nameAr : category.nameEn}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="code" label={copy.fields.code} hint={copy.fields.codeHint} error={err("code")}>
              <Input id="code" name="code" dir="ltr" required defaultValue={design?.code} aria-invalid={invalid("code")} />
            </Field>
            <Field id="slug" label={copy.fields.slug} hint={copy.fields.slugHint} error={err("slug")}>
              <Input id="slug" name="slug" dir="ltr" defaultValue={design?.slug} aria-invalid={invalid("slug")} />
            </Field>
            <Field id="sortOrder" label={copy.fields.sortOrder} error={err("sortOrder")}>
              <Input
                id="sortOrder"
                name="sortOrder"
                inputMode="numeric"
                dir="ltr"
                defaultValue={design?.sortOrder ?? 0}
                aria-invalid={invalid("sortOrder")}
              />
            </Field>
            <div className="flex items-start justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
              <div>
                <Label htmlFor="isBookable">{copy.bookable}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{copy.bookableHint}</p>
              </div>
              <Switch
                id="isBookable"
                checked={isBookable}
                onCheckedChange={(value) => {
                  setBookableTouched(true)
                  setIsBookable(value)
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.sections.texts}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="summaryAr" label={copy.fields.summaryAr} error={err("summaryAr")}>
              <Input id="summaryAr" name="summaryAr" dir="rtl" defaultValue={design?.summaryAr ?? ""} aria-invalid={invalid("summaryAr")} />
            </Field>
            <Field id="summaryEn" label={copy.fields.summaryEn} error={err("summaryEn")}>
              <Input id="summaryEn" name="summaryEn" dir="ltr" defaultValue={design?.summaryEn ?? ""} aria-invalid={invalid("summaryEn")} />
            </Field>
            <Field id="descriptionAr" label={copy.fields.descriptionAr} error={err("descriptionAr")}>
              <textarea
                id="descriptionAr"
                name="descriptionAr"
                dir="rtl"
                className={textareaClass}
                defaultValue={design?.descriptionAr ?? ""}
                aria-invalid={invalid("descriptionAr")}
              />
            </Field>
            <Field id="descriptionEn" label={copy.fields.descriptionEn} error={err("descriptionEn")}>
              <textarea
                id="descriptionEn"
                name="descriptionEn"
                dir="ltr"
                className={textareaClass}
                defaultValue={design?.descriptionEn ?? ""}
                aria-invalid={invalid("descriptionEn")}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.sections.specs}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="floorsAr" label={copy.fields.floorsAr} error={err("floorsAr")}>
              <Input id="floorsAr" name="floorsAr" dir="rtl" defaultValue={design?.floorsAr ?? ""} aria-invalid={invalid("floorsAr")} />
            </Field>
            <Field id="floorsEn" label={copy.fields.floorsEn} error={err("floorsEn")}>
              <Input id="floorsEn" name="floorsEn" dir="ltr" defaultValue={design?.floorsEn ?? ""} aria-invalid={invalid("floorsEn")} />
            </Field>
            <Field id="builtAreaSqm" label={copy.fields.builtAreaSqm} error={err("builtAreaSqm")}>
              <Input
                id="builtAreaSqm"
                name="builtAreaSqm"
                inputMode="decimal"
                dir="ltr"
                defaultValue={design?.builtAreaSqm ?? ""}
                aria-invalid={invalid("builtAreaSqm")}
              />
            </Field>
            <Field id="bedrooms" label={copy.fields.bedrooms} error={err("bedrooms")}>
              <Input
                id="bedrooms"
                name="bedrooms"
                inputMode="numeric"
                dir="ltr"
                defaultValue={design?.bedrooms ?? ""}
                aria-invalid={invalid("bedrooms")}
              />
            </Field>
            <Field id="serviceAr" label={copy.fields.serviceAr} error={err("serviceAr")}>
              <Input id="serviceAr" name="serviceAr" dir="rtl" defaultValue={design?.serviceAr ?? ""} aria-invalid={invalid("serviceAr")} />
            </Field>
            <Field id="serviceEn" label={copy.fields.serviceEn} error={err("serviceEn")}>
              <Input id="serviceEn" name="serviceEn" dir="ltr" defaultValue={design?.serviceEn ?? ""} aria-invalid={invalid("serviceEn")} />
            </Field>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? copy.saving : copy.save}
          </Button>
          {message ? (
            <p className={cn("text-sm", message.kind === "ok" ? "text-emerald-600" : "text-destructive")} role="status">
              {message.text}
            </p>
          ) : null}
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>{copy.sections.images}</CardTitle>
        </CardHeader>
        <CardContent>
          {design ? (
            <ImageManager design={design} onResult={(result) => report(result)} />
          ) : (
            <p className="text-sm text-muted-foreground">{copy.createFirst}</p>
          )}
        </CardContent>
      </Card>

      {design ? (
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          {!confirmingDelete ? (
            <Button variant="destructive" disabled={pending} onClick={() => setConfirmingDelete(true)}>
              <Trash2 />
              {copy.delete}
            </Button>
          ) : (
            <>
              <p className="text-sm text-destructive">{copy.confirmDelete}</p>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    if (report(await deleteDesign(design.id))) router.push("/design-gallery")
                  })
                }
              >
                {copy.delete}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setConfirmingDelete(false)}>
                {copy.cancel}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function StatusBar({
  design,
  pending,
  onChange,
}: {
  design: Design
  pending: boolean
  onChange: (status: DesignStatus) => void
}) {
  const { t } = useI18n()
  const copy = t.designGallery
  return (
    <div className="flex flex-wrap gap-2">
      {design.status !== "published" ? (
        <Button disabled={pending} onClick={() => onChange("published")}>
          {copy.publish}
        </Button>
      ) : null}
      {design.status !== "draft" ? (
        <Button variant="outline" disabled={pending} onClick={() => onChange("draft")}>
          {copy.unpublish}
        </Button>
      ) : null}
      {design.status !== "archived" ? (
        <Button variant="ghost" disabled={pending} onClick={() => onChange("archived")}>
          {copy.archive}
        </Button>
      ) : null}
    </div>
  )
}

function ImageManager({
  design,
  onResult,
}: {
  design: Design
  onResult: (result: DesignGalleryActionResult<unknown>) => void
}) {
  const { t, locale } = useI18n()
  const copy = t.designGallery
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<"upload" | "change" | null>(null)
  // Kept from each action's answer, so a quick next click works on the current list.
  const [images, setImages] = useState<DesignImage[]>(design.images)
  const [failedFiles, setFailedFiles] = useState<{ name: string; reason: string }[]>([])
  const alt = locale === "ar" ? design.titleAr : design.titleEn

  async function upload(files: File[]) {
    if (!files.length || busy) return
    setBusy("upload")
    setFailedFiles([])
    const failed: { name: string; reason: string }[] = []
    try {
      const supabase = createClient()
      for (const file of files) {
        const prepared = await prepareDesignImageUpload(design.id, { name: file.name, size: file.size, type: file.type })
        if (!prepared.ok) {
          failed.push({ name: file.name, reason: copy.errors[prepared.error] })
          continue
        }
        const { error } = await supabase.storage
          .from(DESIGN_GALLERY_BUCKET)
          .uploadToSignedUrl(prepared.data.storagePath, prepared.data.token, file, { contentType: file.type })
        if (error) {
          failed.push({ name: file.name, reason: copy.errors.uploadFailed })
          continue
        }
        const finalized = await finalizeDesignImageUpload(design.id, prepared.data.storagePath)
        if (finalized.ok) setImages(finalized.data.images)
        else failed.push({ name: file.name, reason: copy.errors[finalized.error] })
      }
    } finally {
      setFailedFiles(failed)
      setBusy(null)
      if (inputRef.current) inputRef.current.value = ""
      router.refresh()
    }
  }

  async function change(action: () => Promise<DesignGalleryActionResult<{ images: DesignImage[] }>>) {
    if (busy) return
    setBusy("change")
    try {
      const result = await action()
      onResult(result)
      if (result.ok) setImages(result.data.images)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  function move(index: number, offset: -1 | 1) {
    const ids = images.map((image) => image.id)
    const target = index + offset
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    void change(() => reorderDesignImages(design.id, ids))
  }

  // "Earlier" points toward the start of the reading direction.
  const EarlierIcon = locale === "ar" ? ArrowRight : ArrowLeft
  const LaterIcon = locale === "ar" ? ArrowLeft : ArrowRight

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={PROJECT_IMAGE_ACCEPT}
          multiple
          className="sr-only"
          id="design-image-upload"
          onChange={(event) => void upload(Array.from(event.target.files ?? []))}
        />
        <Button variant="outline" disabled={Boolean(busy)} onClick={() => inputRef.current?.click()}>
          <ImagePlus />
          {busy === "upload" ? copy.uploading : copy.upload}
        </Button>
        <p className="text-xs text-muted-foreground">{copy.uploadHint}</p>
      </div>

      {failedFiles.length ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
          <p className="font-medium">{copy.someUploadsFailed}</p>
          <ul className="mt-1 list-disc ps-5">
            {failedFiles.map((file, index) => (
              <li key={`${file.name}-${index}`} className="break-words">
                <span dir="auto">{file.name}</span> — {file.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {images.length ? (
        <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3">
          {images.map((image, index) => (
            <li key={image.id} className="overflow-hidden rounded-lg border">
              <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={alt} className="absolute inset-0 size-full object-cover" loading="lazy" />
                {index === 0 ? (
                  <span className="absolute start-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                    {copy.cover}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-1 p-2">
                <div className="flex gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={copy.moveEarlier}
                    title={copy.moveEarlier}
                    disabled={Boolean(busy) || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <EarlierIcon />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={copy.moveLater}
                    title={copy.moveLater}
                    disabled={Boolean(busy) || index === images.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <LaterIcon />
                  </Button>
                  {index > 0 ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={copy.makeCover}
                      title={copy.makeCover}
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void change(() =>
                          reorderDesignImages(design.id, [image.id, ...images.filter((i) => i.id !== image.id).map((i) => i.id)]),
                        )
                      }
                    >
                      <Star />
                    </Button>
                  ) : null}
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive"
                  aria-label={copy.removeImage}
                  title={copy.removeImage}
                  disabled={Boolean(busy)}
                  onClick={() => void change(() => deleteDesignImage(design.id, image.id))}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
