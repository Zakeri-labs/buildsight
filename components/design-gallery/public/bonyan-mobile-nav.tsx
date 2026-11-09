import Link from "next/link"
import { Home, Images, LayoutGrid, MessageCircle, Palette } from "lucide-react"
import { galleryHref, type PublicLocale } from "@/lib/design-gallery/public-locale"
import type { DesignGallerySite } from "@/lib/design-gallery/types"
import { BONYAN_CONTACT, mainSiteUrl } from "./bonyan-header"

export function BonyanMobileNav({
  site,
  locale,
}: {
  site: DesignGallerySite
  locale: PublicLocale
}) {
  const isAr = locale === "ar"
  const baseUrl = (site.websiteUrl || "https://bonyanec.com").replace(/\/$/, "")

  const items = [
    { label: isAr ? "الرئيسية" : "Home", href: mainSiteUrl("/", locale, baseUrl), icon: Home, isLocal: false },
    { label: isAr ? "الخدمات" : "Services", href: mainSiteUrl("/services", locale, baseUrl), icon: LayoutGrid, isLocal: false },
    { label: isAr ? "أعمالنا" : "Portfolio", href: mainSiteUrl("/portfolio", locale, baseUrl), icon: Images, isLocal: false },
    { label: isAr ? "التصاميم" : "Designs", href: galleryHref("/designs", locale), icon: Palette, isLocal: true, isActive: true },
  ]

  return (
    <nav
      aria-label={isAr ? "التنقل السريع" : "Quick navigation"}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#101826]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="grid grid-cols-5 ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)]">
        {items.map((item) => (
          <li key={item.label}>
            {item.isLocal ? (
              <Link
                href={item.href}
                className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.625rem] font-semibold leading-tight text-[var(--gallery-accent,#cfa043)] transition-colors"
              >
                <item.icon aria-hidden="true" className="size-5" />
                <span className="truncate">{item.label}</span>
              </Link>
            ) : (
              <a
                href={item.href}
                className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.625rem] font-medium leading-tight text-white/60 transition-colors hover:text-[var(--gallery-accent,#cfa043)]"
              >
                <item.icon aria-hidden="true" className="size-5" />
                <span className="truncate">{item.label}</span>
              </a>
            )}
          </li>
        ))}
        <li>
          <a
            href={BONYAN_CONTACT.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-14 flex-col items-center justify-center gap-1 bg-[var(--gallery-accent,#cfa043)] px-1 py-2 text-[0.625rem] font-semibold leading-tight text-[#121b2a]"
          >
            <MessageCircle aria-hidden="true" className="size-5" />
            <span className="truncate">{isAr ? "واتساب" : "WhatsApp"}</span>
          </a>
        </li>
      </ul>
    </nav>
  )
}
