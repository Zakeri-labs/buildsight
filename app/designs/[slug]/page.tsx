import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight, MessageCircle } from "lucide-react"
import { categoryName, designTitle, formatNumber } from "@/components/design-gallery/public/design-card"
import { ContactLink, PageView } from "@/components/design-gallery/public/client"
import { DesignImages } from "@/components/design-gallery/public/design-images"
import { buttonClass, PublicShell, siteName } from "@/components/design-gallery/public/public-shell"
import { contactMessage, type ContactIntent } from "@/lib/design-gallery/contact"
import { absoluteUrl, loadPublicDesign } from "@/lib/design-gallery/public"
import { fill, galleryHref, parsePublicLocale, type PublicLocale } from "@/lib/design-gallery/public-locale"
import { dictionaries } from "@/lib/i18n/dictionaries"
import { whatsappUrl } from "@/lib/whatsapp"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string | string[] }> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const locale = parsePublicLocale(query.lang)
  const found = await loadPublicDesign(slug)
  if (!found) notFound()
  const { design, site, origin } = found
  const title = `${designTitle(design, locale)} — ${siteName(site, locale)}`
  const description =
    (locale === "ar" ? design.descriptionAr || design.summaryAr : design.descriptionEn || design.summaryEn) ??
    fill(dictionaries[locale].designGalleryPublic.metaDescription, { name: siteName(site, locale) })
  const url = (l: PublicLocale) => absoluteUrl(origin, galleryHref(`/designs/${design.slug}`, l))
  return {
    title,
    description,
    alternates: { canonical: url(locale), languages: { ar: url("ar"), en: url("en"), "x-default": url("ar") } },
    openGraph: {
      type: "article",
      title,
      description,
      url: url(locale),
      siteName: siteName(site, locale),
      locale: locale === "ar" ? "ar_OM" : "en_US",
      images: design.images.slice(0, 4).map((image) => ({ url: absoluteUrl(origin, image.url), alt: designTitle(design, locale) })),
    },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default async function DesignPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const locale = parsePublicLocale(query.lang)
  const found = await loadPublicDesign(slug)
  if (!found) notFound()

  const { design, site, origin, category } = found
  const t = dictionaries[locale].designGalleryPublic
  const title = designTitle(design, locale)
  const description = locale === "ar" ? design.descriptionAr || design.summaryAr : design.descriptionEn || design.summaryEn
  const designUrl = absoluteUrl(origin, galleryHref(`/designs/${design.slug}`, locale))
  const message = (intent: ContactIntent) => whatsappUrl(site.whatsappPhone, contactMessage(intent, locale, { title, code: design.code, url: designUrl }))
  const BackIcon = locale === "ar" ? ArrowRight : ArrowLeft

  const specs = [
    { label: t.floors, value: locale === "ar" ? design.floorsAr : design.floorsEn },
    {
      label: t.area,
      value: design.builtAreaSqm ? fill(t.areaValue, { value: formatNumber(design.builtAreaSqm) }) : null,
    },
    { label: t.bedrooms, value: design.bedrooms != null ? formatNumber(design.bedrooms) : null },
    { label: t.service, value: locale === "ar" ? design.serviceAr : design.serviceEn },
  ].flatMap((spec) => (spec.value ? [{ label: spec.label, value: spec.value }] : []))

  return (
    <PublicShell site={site} locale={locale} alternateHref={galleryHref(`/designs/${design.slug}`, locale === "ar" ? "en" : "ar")}>
      <PageView locale={locale} design={design.slug} />
      <Link href={galleryHref("/designs", locale)} className="mb-5 inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white">
        <BackIcon className="size-4" aria-hidden />
        {t.back}
      </Link>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
        <div className="order-last flex flex-col gap-5 lg:order-first">
          <span className="w-fit rounded-full bg-[var(--gallery-accent)]/15 px-3 py-1 text-xs font-medium text-[var(--gallery-accent)]">
            <span dir="ltr">{t.badge3d}</span>
            {category ? <> · {categoryName(category, locale)}</> : null}
          </span>
          <h1 className="break-words text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
          {description ? <p className="whitespace-pre-line leading-relaxed text-white/75">{description}</p> : null}

          {specs.length ? (
            <div>
              <dl className="grid grid-cols-2 gap-3">
                {specs.map((spec) => (
                  <div key={spec.label} className="rounded-xl border border-white/10 bg-[var(--gallery-card)] p-3">
                    <dt className="text-xs text-white/55">{spec.label}</dt>
                    <dd className="mt-1 font-semibold">{spec.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-white/45">{t.illustrative}</p>
            </div>
          ) : null}

          {site.whatsappPhone ? (
            <div className="flex flex-col gap-2.5">
              {design.isBookable ? (
                <>
                  <ContactLink href={message("same")} intent="same" design={design.slug} locale={locale} className={buttonClass.primary}>
                    {t.wantSame}
                  </ContactLink>
                  <ContactLink href={message("modified")} intent="modified" design={design.slug} locale={locale} className={buttonClass.outline}>
                    {t.wantModified}
                  </ContactLink>
                </>
              ) : (
                <>
                  <p className="text-sm text-white/65">{t.referenceNote}</p>
                  <ContactLink href={message("similar")} intent="similar" design={design.slug} locale={locale} className={buttonClass.primary}>
                    {t.similar}
                  </ContactLink>
                </>
              )}
              <ContactLink href={message("question")} intent="question" design={design.slug} locale={locale} className={buttonClass.whatsapp}>
                <MessageCircle className="size-4" aria-hidden />
                {t.askWhatsapp}
              </ContactLink>
            </div>
          ) : null}
        </div>

        <div className="order-first lg:order-last">
          <DesignImages images={design.images} alt={title} imageLabel={t.imageLabel} />
        </div>
      </div>
    </PublicShell>
  )
}
