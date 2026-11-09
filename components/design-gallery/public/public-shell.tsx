import type { PublicLocale } from "@/lib/design-gallery/public-locale"
import type { DesignGallerySite } from "@/lib/design-gallery/types"
import { HtmlLocale } from "./client"
import { BonyanHeader } from "./bonyan-header"
import { BonyanFooter } from "./bonyan-footer"
import { BonyanMobileNav } from "./bonyan-mobile-nav"

export function siteName(site: DesignGallerySite, locale: PublicLocale): string {
  return (locale === "ar" ? site.displayNameAr || site.displayNameEn : site.displayNameEn || site.displayNameAr) ?? ""
}

/** Gold call-to-action and outline button styles shared by the public pages. */
export const buttonClass = {
  primary:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xs bg-[var(--gallery-accent)] px-4 py-2 text-sm font-semibold text-[var(--gallery-accent-foreground)] transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
  outline:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xs border border-white/25 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/50 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gallery-accent)]",
  whatsapp:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xs border border-emerald-400/70 px-4 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300",
}

/**
 * Public frame for Bonyan Design Gallery:
 * Replicates the header, footer, brand, fonts, and mobile navigation of the
 * main bonyan website, while keeping app.bonyanec.com's app shell untouched.
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
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap');

        .bonyan-designs-page,
        .bonyan-designs-page * {
          font-family: "Manrope", "IBM Plex Sans Arabic", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        .bonyan-designs-page[lang="ar"],
        .bonyan-designs-page[lang="ar"] *,
        .bonyan-designs-page[dir="rtl"],
        .bonyan-designs-page[dir="rtl"] *,
        [dir="rtl"] .bonyan-designs-page,
        [dir="rtl"] .bonyan-designs-page * {
          font-family: "IBM Plex Sans Arabic", "Manrope", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        .bonyan-designs-page h1,
        .bonyan-designs-page h2,
        .bonyan-designs-page h3,
        .bonyan-designs-page h4 {
          font-family: "Manrope", "IBM Plex Sans Arabic", system-ui, -apple-system, sans-serif;
          letter-spacing: -0.02em;
        }

        .bonyan-designs-page[lang="ar"] h1,
        .bonyan-designs-page[lang="ar"] h2,
        .bonyan-designs-page[lang="ar"] h3,
        .bonyan-designs-page[lang="ar"] h4,
        .bonyan-designs-page[dir="rtl"] h1,
        .bonyan-designs-page[dir="rtl"] h2,
        .bonyan-designs-page[dir="rtl"] h3,
        .bonyan-designs-page[dir="rtl"] h4,
        [dir="rtl"] .bonyan-designs-page h1,
        [dir="rtl"] .bonyan-designs-page h2,
        [dir="rtl"] .bonyan-designs-page h3,
        [dir="rtl"] .bonyan-designs-page h4 {
          font-family: "IBM Plex Sans Arabic", "Manrope", system-ui, -apple-system, sans-serif;
          letter-spacing: 0;
          line-height: 1.35;
        }

        .bonyan-designs-page[lang="ar"] p,
        .bonyan-designs-page[lang="ar"] li,
        .bonyan-designs-page[dir="rtl"] p,
        .bonyan-designs-page[dir="rtl"] li,
        [dir="rtl"] .bonyan-designs-page p,
        [dir="rtl"] .bonyan-designs-page li {
          line-height: 1.85;
        }
      `}</style>

      <div
        lang={locale}
        dir={locale === "ar" ? "rtl" : "ltr"}
        className="bonyan-designs-page min-h-dvh flex flex-col bg-[#101826] text-white [--gallery-accent-foreground:#121b2a] [--gallery-accent:#cfa043] [--gallery-bg:#101826] [--gallery-card:#162237] selection:bg-[#cfa043]/30"
      >
        <HtmlLocale locale={locale} />
        <BonyanHeader site={site} locale={locale} alternateHref={alternateHref} />
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
          {children}
        </main>
        <BonyanFooter site={site} locale={locale} alternateHref={alternateHref} />
        {/* keeps content clear of the fixed mobile bar */}
        <div
          aria-hidden="true"
          className="h-[calc(3.5rem+env(safe-area-inset-bottom))] shrink-0 lg:hidden"
        />
        <BonyanMobileNav site={site} locale={locale} />
      </div>
    </>
  )
}
