"use client"

import { AlertTriangle, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { ProjectZone } from "@/lib/zones/types"

export type ZoneDeleteDialogProps = {
  open: boolean
  zone: ProjectZone | null
  locale?: string
  isDeleting?: boolean
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

export function ZoneDeleteDialog({
  open,
  zone,
  locale = "en",
  isDeleting = false,
  onConfirm,
  onCancel,
}: ZoneDeleteDialogProps) {
  const isArabic = locale === "ar"

  if (!zone) return null

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent
        className="max-w-md p-6 font-sans sm:max-w-md"
        dir={isArabic ? "rtl" : "ltr"}
        showCloseButton={!isDeleting}
      >
        <DialogHeader className="gap-2 text-start">
          <div className="flex size-10 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400">
            <AlertTriangle className="size-5" />
          </div>
          <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
            {isArabic ? "حذف المنطقة الجغرافية" : "Delete Geographic Zone"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-600 dark:text-slate-400">
            {isArabic ? (
              <>
                هل أنت متأكد من رغبتك في حذف المنطقة{" "}
                <span className="font-semibold text-slate-900 dark:text-white">
                  &ldquo;{zone.name}&rdquo;
                </span>
                ؟ لن يمكن التراجع عن هذا الإجراء.
              </>
            ) : (
              <>
                Are you sure you want to delete the zone{" "}
                <span className="font-semibold text-slate-900 dark:text-white">
                  &ldquo;{zone.name}&rdquo;
                </span>
                ? This action cannot be undone.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
          <span className="font-semibold text-slate-900 dark:text-white">
            {isArabic ? "تأكيد أمان البيانات:" : "Data Safety Note:"}
          </span>{" "}
          {isArabic
            ? "حذف المنطقة يحذف فقط حدودها الإدارية، ولا يؤثر مطلقاً على أي مشاريع، إحداثيات، أو تقارير فنية مخزنة."
            : "Deleting this zone only removes its administrative boundary. It will NEVER delete or modify any projects, project coordinates, or reports."}
        </div>

        <DialogFooter className="mt-2 flex-row justify-end gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isDeleting}
          >
            {isArabic ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => void onConfirm()}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700"
          >
            {isDeleting ? (
              <>
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
                <span>{isArabic ? "جاري الحذف..." : "Deleting..."}</span>
              </>
            ) : (
              <span>{isArabic ? "تأكيد الحذف" : "Delete Zone"}</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
