import Link from "next/link"

/** The language of a missing page is unknown, so the message is in both. */
export default function DesignNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#0e1b30] px-6 text-center text-white">
      <p className="text-lg font-semibold" dir="rtl" lang="ar">
        هذا التصميم غير موجود أو لم يعد منشوراً.
      </p>
      <p className="text-white/70" lang="en">
        This design does not exist or is no longer published.
      </p>
      <div className="flex gap-3">
        <Link href="/designs" className="rounded-lg bg-[#e0ad3a] px-4 py-2 text-sm font-semibold text-[#1a1405]">
          معرض التصاميم
        </Link>
        <Link href="/designs?lang=en" className="rounded-lg border border-white/25 px-4 py-2 text-sm">
          Design Gallery
        </Link>
      </div>
    </main>
  )
}
