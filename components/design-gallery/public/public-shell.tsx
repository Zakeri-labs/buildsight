import Link from "next/link"
import { MessageCircle } from "lucide-react"
import { dictionaries } from "@/lib/i18n/dictionaries"
import { contactMessage } from "@/lib/design-gallery/contact"
import { galleryHref, type PublicLocale } from "@/lib/design-gallery/public-locale"
import type { DesignGallerySite } from "@/lib/design-gallery/types"
import { whatsappUrl } from "@/lib/whatsapp"
import { cn } from "@/lib/utils"
import { ContactLink, HtmlLocale } from "./client"

export function siteName(site: DesignGallerySite, locale: PublicLocale): string {
  return (locale === "ar" ? site.displayNameAr || site.displayNameEn : site.displayNameEn || site.displayNameAr) ?? ""
}

/** Gold call-to-action and outline button styles shared by the public pages. */
export const buttonClass = {
  primary:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--gallery-accent)] px-4 py-2 text-sm font-semibold text-[var(--gallery-accent-foreground)] transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
  outline:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/25 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/50 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gallery-accent)]",
  whatsapp:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-400/70 px-4 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300",
}

/**
 * Frame of every public gallery page: fixed language and direction, the
 * organization's logo/name, a link to its main website, the language switch
 * and a WhatsApp contact button.
 */
export function PublicShell({
  site,
  locale,
  alternateHref,
  children,
}: {
  site: DesignGallerySite
  locale: PublicLocale
  /** The same page in the other language. */
  alternateHref: string
  children: React.ReactNode
}) {
  const t = dictionaries[locale].designGalleryPublic
  const name = siteName(site, locale)
  return (
    <div
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="min-h-dvh bg-[var(--gallery-bg)] text-white [--gallery-accent-foreground:#1a1405] [--gallery-accent:#e0ad3a] [--gallery-bg:#0e1b30] [--gallery-card:#15263f]"
    >
      <HtmlLocale locale={locale} />
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[var(--gallery-bg)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href={galleryHref("/designs", locale)} className="flex min-w-0 items-center gap-2">
            {site.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={site.logoUrl} alt={name} className="h-8 w-auto max-w-[140px] object-contain sm:h-9" />
            ) : (
              <span className="truncate text-lg font-semibold">{name}</span>
            )}
          </Link>
          <nav className="ms-auto flex items-center gap-2 sm:gap-3" aria-label={t.title}>
            {site.websiteUrl ? (
              <a href={site.websiteUrl} className="hidden text-sm text-white/70 hover:text-white sm:inline">
                {t.website}
              </a>
            ) : null}
            <Link
              href={alternateHref}
              hrefLang={locale === "ar" ? "en" : "ar"}
              className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/80 hover:border-white/50 hover:text-white"
            >
              {t.switchLanguage}
            </Link>
            {site.whatsappPhone ? (
              <ContactLink
                href={whatsappUrl(site.whatsappPhone, contactMessage("general", locale))}
                intent="general"
                locale={locale}
                className={cn(buttonClass.primary, "min-h-9 px-3")}
              >
                <MessageCircle className="size-4" aria-hidden />
                <span>{t.contact}</span>
              </ContactLink>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">{children}</main>
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-white/50 sm:px-6">
          <span>{name}</span>
          {site.websiteUrl ? (
            <a href={site.websiteUrl} className="hover:text-white" dir="ltr">
              {site.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          ) : null}
        </div>
      </footer>
    </div>
  )
}
