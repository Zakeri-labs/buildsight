"use client"

import { dictionaries } from "@/lib/i18n/dictionaries"

/** Shown when the gallery cannot be loaded (e.g. the database is unreachable). Both languages, no data. */
export default function DesignsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ar = dictionaries.ar.designGalleryPublic
  const en = dictionaries.en.designGalleryPublic
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#0e1b30] px-6 text-center text-white">
      <p className="text-lg font-semibold" dir="rtl" lang="ar">
        {ar.errorTitle}
      </p>
      <p className="text-white/70" lang="en">
        {en.errorTitle}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-[#e0ad3a] px-4 py-2 text-sm font-semibold text-[#1a1405] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <span lang="ar">{ar.retry}</span> · <span lang="en">{en.retry}</span>
      </button>
    </main>
  )
}
