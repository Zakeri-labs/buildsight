"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Check, Circle, Loader2, Pentagon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  calculatePolygonAreaSquareMeters,
  checkZonesOverlap,
} from "@/lib/zones/geometry"
import type { ProjectZone, ProjectZoneType, ZoneGeometry } from "@/lib/zones/types"

export const ZONE_COLOR_PALETTE = [
  "#2563eb", // Blue
  "#0284c7", // Sky
  "#0d9488", // Teal
  "#16a34a", // Green
  "#84cc16", // Lime
  "#ca8a04", // Yellow
  "#ea580c", // Orange
  "#dc2626", // Red
  "#db2777", // Pink
  "#9333ea", // Purple
  "#4f46e5", // Indigo
  "#475569", // Slate
]

import { formatArea, formatDistance } from "./formatters"

const COLOR_HEX_REGEX = /^#[0-9a-f]{6}$/i

export type ZoneDialogProps = {
  open: boolean
  mode: "create" | "edit"
  zoneType: ProjectZoneType
  geometry: ZoneGeometry | null
  initialName?: string
  initialColor?: string
  existingZones: ProjectZone[]
  currentZoneId?: string
  locale?: string
  isSubmitting?: boolean
  onSave: (name: string, color: string) => Promise<void> | void
  onCancel: () => void
}

export function ZoneDialog({
  open,
  mode,
  zoneType,
  geometry,
  initialName = "",
  initialColor = "#2563eb",
  existingZones,
  currentZoneId,
  locale = "en",
  isSubmitting = false,
  onSave,
  onCancel,
}: ZoneDialogProps) {
  const isArabic = locale === "ar"
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState(initialColor)
  const [colorInput, setColorInput] = useState(initialColor)

  useEffect(() => {
    if (open) {
      setName(initialName || "")
      const clr = initialColor || "#2563eb"
      setColor(clr)
      setColorInput(clr)
    }
  }, [open, initialName, initialColor])

  // Overlap detection
  const overlappingZones = useMemo(() => {
    if (!geometry) return []
    return existingZones.filter((z) => {
      if (currentZoneId && z.id === currentZoneId) return false
      return checkZonesOverlap(geometry, z.geometry)
    })
  }, [geometry, existingZones, currentZoneId])

  const trimmedName = name.trim()
  const isNameValid = trimmedName.length >= 2 && trimmedName.length <= 80
  const isColorValid = COLOR_HEX_REGEX.test(color)
  const canSubmit = isNameValid && isColorValid && !isSubmitting

  const handleColorChange = (newColor: string) => {
    setColor(newColor)
    setColorInput(newColor)
  }

  const handleCustomHexInput = (val: string) => {
    setColorInput(val)
    if (COLOR_HEX_REGEX.test(val)) {
      setColor(val.toLowerCase())
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    void onSave(trimmedName, color.toLowerCase())
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent
        className="max-w-md p-6 font-sans sm:max-w-md"
        dir={isArabic ? "rtl" : "ltr"}
        showCloseButton={!isSubmitting}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader className="gap-1.5 text-start">
            <div className="flex items-center gap-2">
              <span
                className="size-3 rounded-full shrink-0 shadow-xs ring-2 ring-white dark:ring-slate-900"
                style={{ backgroundColor: color }}
              />
              <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">
                {mode === "create"
                  ? isArabic
                    ? "تفاصيل المنطقة الجديدة"
                    : "Create Geographic Zone"
                  : isArabic
                    ? "تعديل تفاصيل المنطقة"
                    : "Edit Geographic Zone"}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              {mode === "create"
                ? isArabic
                  ? "حدد اسم المنطقة ولونها لتمييزها وتجميع المشاريع جغرافياً."
                  : "Set a recognizable name and color to group and identify projects geographically."
                : isArabic
                  ? "تعديل الاسم واللون المخصص لهذه المنطقة الجغرافية."
                  : "Update the name and custom color for this geographic zone."}
            </DialogDescription>
          </DialogHeader>

          {/* Zone Type & Geometry Stats Card */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-2 dark:border-slate-800/60">
              <span className="font-medium text-slate-600 dark:text-slate-400">
                {isArabic ? "نوع المنطقة" : "Zone Type"}
              </span>
              <Badge variant="outline" className="gap-1 px-2 py-0.5 text-xs font-semibold">
                {zoneType === "circle" ? (
                  <>
                    <Circle className="size-3 text-blue-600 dark:text-blue-400" />
                    <span>{isArabic ? "دائرية" : "Circle"}</span>
                  </>
                ) : (
                  <>
                    <Pentagon className="size-3 text-emerald-600 dark:text-emerald-400" />
                    <span>{isArabic ? "مضلعة" : "Polygon"}</span>
                  </>
                )}
              </Badge>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-400">
              {geometry?.type === "circle" ? (
                <>
                  <div>
                    <span className="text-[11px] text-slate-400 block">
                      {isArabic ? "مركز الدائرة" : "Center"}
                    </span>
                    <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200">
                      {geometry.center.lat.toFixed(4)}, {geometry.center.lng.toFixed(4)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">
                      {isArabic ? "نصف القطر" : "Radius"}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formatDistance(geometry.radiusMeters, isArabic)}
                    </span>
                  </div>
                </>
              ) : geometry?.type === "polygon" ? (
                <>
                  <div>
                    <span className="text-[11px] text-slate-400 block">
                      {isArabic ? "عدد النقاط" : "Vertices"}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {geometry.coordinates.length} {isArabic ? "نقاط" : "points"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">
                      {isArabic ? "المساحة التقريبية" : "Approx. Area"}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formatArea(calculatePolygonAreaSquareMeters(geometry.coordinates), isArabic)}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {/* Overlap Warning Notice (Non-blocking) */}
          {overlappingZones.length > 0 ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <p className="font-semibold">
                  {isArabic ? "تنبيه: تداخل جغرافي" : "Notice: Geographic Overlap"}
                </p>
                <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                  {isArabic
                    ? `تتداخل هذه المنطقة مع: ${overlappingZones.map((z) => z.name).join("، ")}. يُسمح بالتداخل وستُطبق قواعد الأولوية لاحقاً.`
                    : `This zone overlaps with: ${overlappingZones.map((z) => z.name).join(", ")}. Overlaps are permitted; priority rules will determine primary grouping.`}
                </p>
              </div>
            </div>
          ) : null}

          {/* Zone Name Field */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="zone-name" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {isArabic ? "اسم المنطقة" : "Zone Name"} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="zone-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isArabic ? "مثال: منطقة مسقط الكبرى، السيب..." : "e.g., Muscat North, Mawelah Zone..."}
              maxLength={80}
              className="text-sm"
              disabled={isSubmitting}
              autoFocus
            />
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>{isArabic ? "بين 2 و 80 حرفاً" : "2 to 80 characters"}</span>
              <span>{name.length}/80</span>
            </div>
          </div>

          {/* Zone Color Palette Field */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {isArabic ? "لون المنطقة" : "Zone Color"}
              </Label>
              <div className="flex items-center gap-1.5">
                <span
                  className="size-3.5 rounded-full border border-slate-300 dark:border-slate-700"
                  style={{ backgroundColor: color }}
                />
                <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                  {color.toUpperCase()}
                </span>
              </div>
            </div>

            {/* 12 Swatches */}
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
              {ZONE_COLOR_PALETTE.map((c) => {
                const isSelected = color.toLowerCase() === c.toLowerCase()
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleColorChange(c)}
                    disabled={isSubmitting}
                    className={`relative flex size-7 items-center justify-center rounded-lg transition-transform hover:scale-110 focus:outline-hidden ${
                      isSelected ? "ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900" : ""
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  >
                    {isSelected ? <Check className="size-3.5 text-white drop-shadow-xs" /> : null}
                  </button>
                )
              })}
            </div>

            {/* Custom Hex Input */}
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {isArabic ? "كود مخصص:" : "Custom HEX:"}
              </span>
              <Input
                type="text"
                value={colorInput}
                onChange={(e) => handleCustomHexInput(e.target.value)}
                placeholder="#3b82f6"
                maxLength={7}
                disabled={isSubmitting}
                className="h-8 max-w-[120px] font-mono text-xs"
              />
            </div>
          </div>

          {/* Dialog Actions */}
          <DialogFooter className="mt-2 flex-row justify-end gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!canSubmit}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  <span>{isArabic ? "جاري الحفظ..." : "Saving..."}</span>
                </>
              ) : (
                <span>
                  {mode === "create"
                    ? isArabic
                      ? "حفظ المنطقة"
                      : "Save Zone"
                    : isArabic
                      ? "حفظ التغييرات"
                      : "Save Changes"}
                </span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
