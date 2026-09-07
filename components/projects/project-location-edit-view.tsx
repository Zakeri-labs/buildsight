"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import React, { useState } from "react"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  Save,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ProjectLocationField } from "@/components/projects/project-location-field"
import { updateProjectLocationAction } from "@/lib/actions/projects"
import { useI18n } from "@/lib/i18n"
import type { ProjectLocationValue } from "@/lib/locations/types"

export type ProjectLocationEditData = {
  id: string
  name: string
  code: string | null
  location: string | null
  region: string | null
  phase?: string | null
  latitude: number | null
  longitude: number | null
}

export function ProjectLocationEditView({
  project,
}: {
  project: ProjectLocationEditData
}) {
  const router = useRouter()
  const { locale } = useI18n()
  const isArabic = locale === "ar"

  const [location, setLocation] = useState<ProjectLocationValue>({
    address: project.location === "—" || project.location === "Location not set" ? "" : project.location || "",
    latitude: project.latitude ?? null,
    longitude: project.longitude ?? null,
    verified: project.latitude != null && project.longitude != null,
    source: project.latitude != null && project.longitude != null ? "map" : "manual",
  })
  const [areaDistrict, setAreaDistrict] = useState(project.region || "")
  const [phase, setPhase] = useState(project.phase || "")
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)
    setIsSaving(true)

    try {
      const result = await updateProjectLocationAction({
        projectId: project.id,
        address: location.address,
        areaDistrict,
        phase,
        latitude: location.latitude,
        longitude: location.longitude,
      })

      if (!result.ok) {
        setErrorMessage(result.error || (isArabic ? "فشل حفظ الموقع." : "Failed to update project location."))
        setIsSaving(false)
        return
      }

      setSuccessMessage(isArabic ? "تم تحديث موقع المشروع بنجاح." : "Project location updated successfully.")
      setTimeout(() => {
        router.push(`/projects/${project.id}`)
        router.refresh()
      }, 500)
    } catch {
      setErrorMessage(isArabic ? "حدث خطأ غير متوقع أثناء الحفظ." : "An unexpected error occurred while saving.")
      setIsSaving(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Navigation Header */}
      <div className="flex flex-col gap-2">
        <Link
          href={`/projects/${project.id}`}
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {isArabic ? <ArrowRight className="size-3.5" /> : <ArrowLeft className="size-3.5" />}
          <span>{isArabic ? "العودة إلى المشروع" : "Back to Project"}</span>
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {isArabic ? "تعديل موقع المشروع" : "Edit Project Location"}
            </h1>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
              <Building2 className="size-3.5" />
              <span className="font-medium text-foreground/80">{project.name}</span>
              {project.code && (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
                  {project.code}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-medium text-destructive sm:text-sm">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 sm:text-sm">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Main Edit Form */}
      <form onSubmit={handleSave} className="flex flex-col gap-6">
        <Card className="shadow-xs">
          <CardContent className="p-4 sm:p-5 lg:p-6">
            <ProjectLocationField
              id={`supervisor-project-location-${project.id}`}
              value={location}
              onChange={setLocation}
              areaField={{
                value: areaDistrict,
                onChange: setAreaDistrict,
                label: isArabic ? "المنطقة / الحي" : "Area / District",
                placeholder: isArabic ? "مثال: مسقط / الخوض" : "e.g. Muscat / Al Khoudh",
              }}
              contentAfterAreaField={
                <div className="space-y-2.5">
                  <Label htmlFor={`supervisor-project-phase-${project.id}`}>
                    {isArabic ? "المرحلة (اختياري)" : "Phase (Optional)"}
                  </Label>
                  <Input
                    id={`supervisor-project-phase-${project.id}`}
                    value={phase}
                    onChange={(e) => setPhase(e.target.value)}
                    placeholder={isArabic ? "مثال: المرحلة 1" : "e.g. Phase 1"}
                    disabled={isSaving}
                    className="h-10 text-xs sm:text-sm"
                  />
                </div>
              }
              disabled={isSaving}
            />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/projects/${project.id}`)}
            disabled={isSaving}
          >
            {isArabic ? "إلغاء" : "Cancel"}
          </Button>
          <Button type="submit" disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            <span>
              {isSaving
                ? isArabic
                  ? "جارٍ الحفظ..."
                  : "Saving..."
                : isArabic
                  ? "حفظ موقع المشروع"
                  : "Save Location"}
            </span>
          </Button>
        </div>
      </form>
    </div>
  )
}
