import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { BookingWizard } from "@/components/design-gallery/public/booking-wizard"
import { designTitle } from "@/components/design-gallery/public/design-card"
import { PublicShell, siteName } from "@/components/design-gallery/public/public-shell"
import { loadPublicDesign, loadPublicSite } from "@/lib/design-gallery/public"
import { fill, galleryHref, parsePublicLocale } from "@/lib/design-gallery/public-locale"
import { dictionaries } from "@/lib/i18n/dictionaries"

export const dynamic = "force-dynamic"

type SearchParams = Promise<{ lang?: string | string[]; design?: string | string[]; path?: string | string[] }>

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ""

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const locale = parsePublicLocale((await searchParams).lang)
  const resolved = await loadPublicSite()
  if (!resolved) return {}
  return {
    title: fill(dictionaries[locale].designGalleryPublic.booking.metaTitle, { name: siteName(resolved.site, locale) }),
    // A form, not content: kept out of search results.
    robots: { index: false, follow: false },
  }
}

/**
 * Booking wizard: /designs/book?design=<slug>&path=same|modified for a
 * design, /designs/book (path "idea") for the visitor's own idea.
 */
export default async function BookPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const locale = parsePublicLocale(params.lang)
  const slug = first(params.design)

  let site
  let design: { slug: string; title: string; code: string; coverUrl: string | null } | null = null
  if (slug) {
    const found = await loadPublicDesign(slug)
    if (!found) notFound()
    // Reference projects are not booked: back to the design page and its "Similar project?" button.
    if (!found.design.isBookable) redirect(galleryHref(`/designs/${found.design.slug}`, locale))
    site = found.site
    design = {
      slug: found.design.slug,
      title: designTitle(found.design, locale),
      code: found.design.code,
      coverUrl: found.design.images[0]?.url ?? null,
    }
  } else {
    const resolved = await loadPublicSite()
    if (!resolved) notFound()
    site = resolved.site
  }
  const path = design ? (first(params.path) === "modified" ? "modified" : "same") : "idea"
  const officeAddress = (locale === "ar" ? site.officeAddressAr || site.officeAddressEn : site.officeAddressEn || site.officeAddressAr) ?? null

  return (
    <PublicShell
      site={site}
      locale={locale}
      alternateHref={galleryHref("/designs/book", locale === "ar" ? "en" : "ar", { design: design?.slug, path: design ? path : null })}
    >
      <BookingWizard
        locale={locale}
        path={path}
        design={design}
        officeAddress={officeAddress}
        timeZone={site.booking.timeZone}
        galleryHref={galleryHref("/designs", locale)}
        backHref={design ? galleryHref(`/designs/${design.slug}`, locale) : galleryHref("/designs", locale)}
      />
    </PublicShell>
  )
}
