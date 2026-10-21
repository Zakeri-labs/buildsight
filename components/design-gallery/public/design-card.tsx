import Link from "next/link"
import { Pencil } from "lucide-react"
import { dictionaries } from "@/lib/i18n/dictionaries"
import { contactMessage } from "@/lib/design-gallery/contact"
import { fill, galleryHref, type PublicLocale } from "@/lib/design-gallery/public-locale"
import type { Design, DesignCategory } from "@/lib/design-gallery/types"
import { whatsappUrl } from "@/lib/whatsapp"
import { cn } from "@/lib/utils"
import { ContactLink } from "./client"
import { buttonClass } from "./public-shell"

export function designTitle(design: Design, locale: PublicLocale) {
  return locale === "ar" ? design.titleAr : design.titleEn
}

export function categoryName(category: DesignCategory | null | undefined, locale: PublicLocale) {
  return category ? (locale === "ar" ? category.nameAr : category.nameEn) : ""
}

/** Numbers as written in the designs and the proposal: Western digits in both languages. */
export function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

/** "Roof + 2 · ≈ 520 m²": the short spec line under a card title. */
export function specLine(design: Design, locale: PublicLocale): string {
  const t = dictionaries[locale].designGalleryPublic
  const floors = locale === "ar" ? design.floorsAr : design.floorsEn
  const area = design.builtAreaSqm ? fill(t.areaValue, { value: formatNumber(design.builtAreaSqm) }) : null
  const summary = locale === "ar" ? design.summaryAr : design.summaryEn
  // Each part is direction-isolated so mixed Arabic text and numbers keep their order.
  const parts = [floors, area].filter(Boolean).map((part) => `\u2068${part}\u2069`)
  return parts.join(" · ") || summary || ""
}

export function DesignCard({
  design,
  category,
  locale,
  whatsappPhone,
  designUrl,
}: {
  design: Design
  category: DesignCategory | null
  locale: PublicLocale
  whatsappPhone: string | null
  /** Absolute link to the design, included in the WhatsApp message. */
  designUrl: string
}) {
  const t = dictionaries[locale].designGalleryPublic
  const title = designTitle(design, locale)
  const href = galleryHref(`/designs/${design.slug}`, locale)
  const cover = design.images[0]
  const intent = design.isBookable ? "same" : "similar"

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--gallery-card)] transition-colors hover:border-white/25">
      <Link href={href} className="relative block aspect-[4/3] overflow-hidden bg-white/5" tabIndex={-1} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover.url}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <span className="absolute start-3 bottom-3 rounded-md bg-black/60 px-2 py-0.5 text-xs font-semibold text-white" dir="ltr">
          {t.badge3d}
        </span>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {category ? (
          <span className="w-fit rounded-full bg-[var(--gallery-accent)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--gallery-accent)]">
            {categoryName(category, locale)}
          </span>
        ) : null}
        <h2 className="break-words text-base font-semibold leading-snug">
          <Link href={href} className="hover:text-[var(--gallery-accent)] focus-visible:outline-none focus-visible:underline">
            {title}
          </Link>
        </h2>
        <p className="text-sm text-white/60">{specLine(design, locale)}</p>
        <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
          <Link href={href} className={buttonClass.outline}>
            {t.view}
          </Link>
          {whatsappPhone ? (
            <ContactLink
              href={whatsappUrl(whatsappPhone, contactMessage(intent, locale, { title, code: design.code, url: designUrl }))}
              intent={intent}
              design={design.slug}
              locale={locale}
              className={design.isBookable ? buttonClass.primary : cn(buttonClass.outline, "border-[var(--gallery-accent)]/60 text-[var(--gallery-accent)]")}
            >
              {design.isBookable ? t.book : t.similar}
            </ContactLink>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export function IdeaCard({ locale, whatsappPhone }: { locale: PublicLocale; whatsappPhone: string | null }) {
  const t = dictionaries[locale].designGalleryPublic
  return (
    <article className="flex h-full min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--gallery-accent)]/60 p-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-[var(--gallery-accent)]/15 text-[var(--gallery-accent)]">
        <Pencil className="size-5" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold">{t.ideaTitle}</h2>
      <p className="text-sm text-white/60">{t.ideaBody}</p>
      {whatsappPhone ? (
        <ContactLink
          href={whatsappUrl(whatsappPhone, contactMessage("idea", locale))}
          intent="idea"
          locale={locale}
          className={buttonClass.primary}
        >
          {t.ideaCta}
        </ContactLink>
      ) : null}
    </article>
  )
}
