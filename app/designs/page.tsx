import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Search } from "lucide-react"
import { DesignCard, IdeaCard } from "@/components/design-gallery/public/design-card"
import { PageView } from "@/components/design-gallery/public/client"
import { PublicShell, siteName } from "@/components/design-gallery/public/public-shell"
import { absoluteUrl, loadPublicGallery } from "@/lib/design-gallery/public"
import { fill, galleryHref, parsePublicLocale, type PublicLocale } from "@/lib/design-gallery/public-locale"
import { filterDesigns } from "@/lib/design-gallery/search"
import { dictionaries } from "@/lib/i18n/dictionaries"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

type SearchParams = Promise<{ lang?: string | string[]; q?: string | string[]; category?: string | string[] }>

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ""

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams
  const locale = parsePublicLocale(params.lang)
  const gallery = await loadPublicGallery()
  if (!gallery) return {}
  const t = dictionaries[locale].designGalleryPublic
  const name = siteName(gallery.site, locale)
  const url = (l: PublicLocale) => absoluteUrl(gallery.origin, galleryHref("/designs", l))
  const cover = gallery.designs[0]?.images[0]?.url
  const title = fill(t.metaTitle, { name })
  const description = fill(t.metaDescription, { name })
  return {
    title,
    description,
    alternates: { canonical: url(locale), languages: { ar: url("ar"), en: url("en"), "x-default": url("ar") } },
    // Search results are not separate pages for search engines.
    robots: first(params.q) ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website",
      title,
      description,
      url: url(locale),
      siteName: name,
      locale: locale === "ar" ? "ar_OM" : "en_US",
      images: cover ? [{ url: absoluteUrl(gallery.origin, cover) }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default async function DesignsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const locale = parsePublicLocale(params.lang)
  const gallery = await loadPublicGallery()
  if (!gallery) notFound()

  const t = dictionaries[locale].designGalleryPublic
  const query = first(params.q).slice(0, 100)
  const categoryKey = first(params.category)
  const activeCategory = gallery.categories.find((c) => c.key === categoryKey) ?? null
  const visible = filterDesigns(gallery.designs, gallery.categories, { query, categoryKey: activeCategory?.key ?? null })
  const categoryById = new Map(gallery.categories.map((c) => [c.id, c]))
  // Only categories that have at least one published design get a filter chip.
  const usedCategories = gallery.categories.filter((c) => gallery.designs.some((d) => d.categoryId === c.id))
  const chips = [{ key: "", label: t.all }, ...usedCategories.map((c) => ({ key: c.key, label: locale === "ar" ? c.nameAr : c.nameEn }))]

  return (
    <PublicShell
      site={gallery.site}
      locale={locale}
      alternateHref={galleryHref("/designs", locale === "ar" ? "en" : "ar", { q: query, category: activeCategory?.key })}
    >
      <PageView locale={locale} />
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <span className="inline-block rounded-full border border-[var(--gallery-accent)]/50 px-3 py-1 text-xs text-[var(--gallery-accent)]">
              {t.eyebrow}
            </span>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{t.title}</h1>
            <p className="mt-2 text-white/70 text-pretty">{t.subtitle}</p>
          </div>
          <form action="/designs" method="get" role="search" className="flex w-full gap-2 lg:max-w-sm">
            {locale === "en" ? <input type="hidden" name="lang" value="en" /> : null}
            {activeCategory ? <input type="hidden" name="category" value={activeCategory.key} /> : null}
            <label htmlFor="design-search" className="sr-only">
              {t.searchLabel}
            </label>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-white/40" aria-hidden />
              <input
                id="design-search"
                type="search"
                name="q"
                defaultValue={query}
                placeholder={t.searchPlaceholder}
                maxLength={100}
                className="h-11 w-full rounded-lg border border-white/15 bg-white/5 ps-9 pe-3 text-base text-white placeholder:text-white/40 focus:border-[var(--gallery-accent)] focus:outline-none sm:text-sm"
              />
            </div>
            <button type="submit" className="h-11 shrink-0 rounded-lg bg-white/10 px-4 text-sm font-medium hover:bg-white/15">
              {t.search}
            </button>
          </form>
        </div>

        <nav aria-label={t.searchLabel} className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
            {chips.map((chip) => {
              const active = (activeCategory?.key ?? "") === chip.key
              return (
                <li key={chip.key || "all"}>
                  <Link
                    href={galleryHref("/designs", locale, { q: query, category: chip.key })}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-9 items-center rounded-full border px-4 text-sm transition-colors",
                      active
                        ? "border-[var(--gallery-accent)] bg-[var(--gallery-accent)] font-semibold text-[var(--gallery-accent-foreground)]"
                        : "border-white/15 text-white/80 hover:border-white/40",
                    )}
                  >
                    {chip.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {visible.length === 0 ? (
          <div className="rounded-2xl border border-white/10 p-10 text-center">
            <p className="text-white/70">{t.noResults}</p>
            <Link href={galleryHref("/designs", locale)} className="mt-3 inline-block text-sm text-[var(--gallery-accent)] underline">
              {t.showAll}
            </Link>
          </div>
        ) : null}

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((design) => (
            <li key={design.id}>
              <DesignCard
                design={design}
                category={categoryById.get(design.categoryId) ?? null}
                locale={locale}
                whatsappPhone={gallery.site.whatsappPhone}
                designUrl={absoluteUrl(gallery.origin, galleryHref(`/designs/${design.slug}`, locale))}
              />
            </li>
          ))}
          <li>
            <IdeaCard locale={locale} whatsappPhone={gallery.site.whatsappPhone} />
          </li>
        </ul>
      </section>
    </PublicShell>
  )
}
