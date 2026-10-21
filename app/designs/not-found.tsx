import Link from "next/link"

/**
 * Missing or unpublished design, or no gallery for this host. The language of
 * the request is unknown here, so the message is in both.
 */
export default function DesignNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#0e1b30] px-6 text-center text-white">
      <p className="text-lg font-semibold" dir="rtl" lang="ar">
        الصفحة غير موجودة أو لم تعد منشورة.
      </p>
      <p className="text-white/70" lang="en">
        This page does not exist or is no longer published.
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
