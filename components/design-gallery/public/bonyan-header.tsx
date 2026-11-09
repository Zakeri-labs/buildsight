"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Mail, MapPin, Menu, Phone, X } from "lucide-react"
import { galleryHref, type PublicLocale } from "@/lib/design-gallery/public-locale"
import type { DesignGallerySite } from "@/lib/design-gallery/types"
import { cn } from "@/lib/utils"
import { BONYAN_CONTACT, mainSiteUrl } from "./bonyan-shared"

export function BonyanBrand({
  locale,
  baseUrl,
}: {
  site?: DesignGallerySite
  locale: PublicLocale
  baseUrl: string
  compact?: boolean
}) {
  const isAr = locale === "ar"
  const brandFull = isAr
    ? "بنيان للإنشاء والاستشارات الهندسية"
    : "Bonyan Construction for Engineering Consultancy"
  const homeHref = mainSiteUrl("/", locale, baseUrl)

  return (
    <a href={homeHref} className="group block" aria-label={brandFull}>
      <span className="relative block h-[52px] w-[141px] shrink-0 overflow-hidden transition-transform duration-300 group-hover:scale-[1.02]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/design-gallery/bonyan-logo.png"
          alt={brandFull}
          className="absolute left-[-7px] top-[-24px] h-auto w-[150px] max-w-none transition-opacity duration-300 group-hover:opacity-95"
        />
      </span>
    </a>
  )
}

export function BonyanLanguageSwitcher({
  className,
  alternateHref,
  locale,
}: {
  className?: string
  alternateHref: string
  locale: PublicLocale
}) {
  const item = (code: PublicLocale, label: string) => {
    const isCurrent = locale === code
    const href = isCurrent ? undefined : alternateHref

    return (
      <Link
        href={href ?? "#"}
        hrefLang={code}
        aria-current={isCurrent ? "true" : undefined}
        className={cn(
          "min-h-9 px-2.5 py-1.5 text-xs font-bold tracking-widest transition-colors",
          isCurrent ? "text-[var(--gallery-accent,#cfa043)]" : "text-white/60 hover:text-white"
        )}
      >
        {label}
      </Link>
    )
  }

  return (
    <div
      className={cn("flex items-center rounded-xs border border-white/15 bg-white/5", className)}
      role="group"
      aria-label={locale === "ar" ? "اللغة" : "Language"}
    >
      {item("en", "EN")}
      <span aria-hidden="true" className="h-4 w-px bg-white/15" />
      {item("ar", "AR")}
    </div>
  )
}

export function BonyanHeader({
  site,
  locale,
  alternateHref,
}: {
  site: DesignGallerySite
  locale: PublicLocale
  alternateHref: string
}) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  const baseUrl = (site.websiteUrl || "https://bonyanec.com").replace(/\/$/, "")
  const isAr = locale === "ar"

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  const navItems = [
    { label: isAr ? "الرئيسية" : "Home", href: mainSiteUrl("/", locale, baseUrl), isActive: false },
    { label: isAr ? "من نحن" : "About", href: mainSiteUrl("/about", locale, baseUrl), isActive: false },
    { label: isAr ? "فريقنا" : "Our Team", href: mainSiteUrl("/team", locale, baseUrl), isActive: false },
    { label: isAr ? "الخدمات" : "Services", href: mainSiteUrl("/services", locale, baseUrl), isActive: false },
    { label: isAr ? "أعمالنا" : "Portfolio", href: mainSiteUrl("/portfolio", locale, baseUrl), isActive: false },
    { label: isAr ? "معرض التصاميم" : "Designs", href: galleryHref("/designs", locale), isActive: true, isLocal: true },
    { label: isAr ? "آراء العملاء" : "Testimonials", href: mainSiteUrl("/#testimonials", locale, baseUrl), isActive: false },
    { label: isAr ? "الوظائف" : "Careers", href: mainSiteUrl("/career", locale, baseUrl), isActive: false },
    { label: isAr ? "تواصل معنا" : "Contact", href: mainSiteUrl("/contact", locale, baseUrl), isActive: false },
  ]

  return (
    <>
      <style>{`
        @keyframes bonyan-pulse {
          0% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .bonyan-status-ping {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background-color: currentColor;
          animation: bonyan-pulse 2.2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
      `}</style>

      <header
        className={cn(
          "sticky top-0 z-50 pt-[env(safe-area-inset-top)] transition-all duration-300",
          scrolled
            ? "border-b border-white/10 bg-[#101826]/95 backdrop-blur-md shadow-lg shadow-black/20"
            : "border-b border-white/10 bg-[#101826]/85 backdrop-blur-sm"
        )}
      >
        {/* Top utility bar (desktop only) */}
        <div className="hidden border-b border-white/10 bg-[#101826]/90 lg:block">
          <div className="mx-auto flex h-9 max-w-7xl items-center justify-between gap-6 px-5 text-[0.6875rem] font-medium text-white/70">
            <a
              href={`mailto:${BONYAN_CONTACT.email}`}
              className="group flex items-center gap-2 text-sky-400 transition-colors hover:underline"
            >
              <Mail
                aria-hidden="true"
                className="size-3.5 text-[var(--gallery-accent,#cfa043)] transition-transform duration-300 group-hover:scale-110"
              />
              <span dir="ltr">{BONYAN_CONTACT.email}</span>
            </a>

            <div className="flex items-center gap-7">
              <a
                href={BONYAN_CONTACT.phoneHref}
                className="group flex items-center gap-2 transition-colors hover:text-[var(--gallery-accent,#cfa043)] text-white/80"
              >
                <Phone
                  aria-hidden="true"
                  className="size-3.5 text-[var(--gallery-accent,#cfa043)] transition-transform duration-300 group-hover:scale-110"
                />
                <span dir="ltr">{BONYAN_CONTACT.phone}</span>
              </a>

              <a
                href={BONYAN_CONTACT.mapHref}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-2 transition-colors hover:text-[var(--gallery-accent,#cfa043)] text-white/80"
              >
                <MapPin
                  aria-hidden="true"
                  className="size-3.5 text-[var(--gallery-accent,#cfa043)] transition-transform duration-300 group-hover:scale-110"
                />
                <span>{isAr ? BONYAN_CONTACT.locationAr : BONYAN_CONTACT.locationEn}</span>
              </a>

              <div className="flex items-center gap-2 border-s border-white/15 ps-4 text-xs font-semibold text-[var(--gallery-accent,#cfa043)]">
                <span className="relative flex size-2 shrink-0">
                  <span className="bonyan-status-ping text-[var(--gallery-accent,#cfa043)]" />
                  <span className="relative inline-flex size-2 rounded-full bg-[var(--gallery-accent,#cfa043)]" />
                </span>
                <span className="text-[0.625rem] font-bold uppercase tracking-wider opacity-90">
                  {isAr ? "استشارات نَشِطة" : "Active Consultancy"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main navigation bar */}
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-5">
          <BonyanBrand site={site} locale={locale} baseUrl={baseUrl} />

          <nav aria-label={isAr ? "القائمة الرئيسية" : "Main menu"} className="hidden items-center gap-7 lg:flex">
            {navItems.map((item) =>
              item.isLocal ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "text-[0.8125rem] font-medium transition-colors hover:text-[var(--gallery-accent,#cfa043)]",
                    item.isActive
                      ? "text-white font-semibold border-b border-[var(--gallery-accent,#cfa043)] pb-0.5"
                      : "text-white/70"
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "text-[0.8125rem] font-medium transition-colors hover:text-[var(--gallery-accent,#cfa043)]",
                    item.isActive
                      ? "text-white font-semibold border-b border-[var(--gallery-accent,#cfa043)] pb-0.5"
                      : "text-white/70"
                  )}
                >
                  {item.label}
                </a>
              )
            )}
          </nav>

          <div className="flex items-center gap-3">
            <BonyanLanguageSwitcher className="hidden sm:flex" alternateHref={alternateHref} locale={locale} />

            <a
              href={mainSiteUrl("/contact", locale, baseUrl)}
              className="hidden min-h-10 items-center justify-center rounded-xs bg-[var(--gallery-accent,#cfa043)] px-5 py-2 text-xs font-semibold text-[#121b2a] shadow-[0_8px_24px_-14px_rgba(207,160,67,0.6)] transition-all duration-300 hover:brightness-110 hover:-translate-y-0.5 lg:inline-flex"
            >
              {isAr ? "تواصل معنا" : "Contact Us"}
            </a>

            <button
              type="button"
              aria-label={isAr ? "فتح القائمة" : "Open menu"}
              onClick={() => setOpen(true)}
              className="flex size-11 items-center justify-center rounded-xs border border-white/15 text-white lg:hidden cursor-pointer hover:border-[var(--gallery-accent,#cfa043)] transition-colors"
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>

        {/* Mobile menu drawer */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />

            {/* Slide-over panel */}
            <div
              className={cn(
                "fixed inset-y-0 z-50 flex w-[86%] max-w-sm flex-col overflow-y-auto border-white/15 bg-[#101826] px-6 py-6 text-white shadow-2xl transition-transform duration-300",
                isAr ? "right-0 border-s" : "right-0 border-s"
              )}
            >
              <div className="flex items-center justify-between">
                <BonyanBrand site={site} locale={locale} baseUrl={baseUrl} compact />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={isAr ? "إغلاق القائمة" : "Close menu"}
                  className="flex size-9 items-center justify-center rounded-xs border border-white/15 text-white/80 hover:text-white hover:border-white/40 transition-colors"
                >
                  <X aria-hidden="true" className="size-5" />
                </button>
              </div>

              <nav className="mt-8 flex flex-col" aria-label={isAr ? "القائمة" : "Menu"}>
                {navItems.map((item) =>
                  item.isLocal ? (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "border-b border-white/10 py-4 text-base font-semibold transition-colors",
                        item.isActive
                          ? "text-[var(--gallery-accent,#cfa043)]"
                          : "text-white/90 hover:text-[var(--gallery-accent,#cfa043)]"
                      )}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <a
                      key={item.label}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "border-b border-white/10 py-4 text-base font-semibold transition-colors",
                        item.isActive
                          ? "text-[var(--gallery-accent,#cfa043)]"
                          : "text-white/90 hover:text-[var(--gallery-accent,#cfa043)]"
                      )}
                    >
                      {item.label}
                    </a>
                  )
                )}
              </nav>

              <ul className="mt-6 space-y-1 border-t border-white/10 pt-5">
                <li>
                  <a
                    href={`mailto:${BONYAN_CONTACT.email}`}
                    className="group flex min-h-12 items-center gap-3 rounded-xs px-2 transition-colors hover:bg-white/5"
                  >
                    <Mail aria-hidden="true" className="size-4 shrink-0 text-[var(--gallery-accent,#cfa043)]" />
                    <span className="min-w-0">
                      <span className="block text-[0.625rem] uppercase tracking-widest text-white/50">
                        {isAr ? "البريد الإلكتروني" : "Email"}
                      </span>
                      <span dir="ltr" className="block text-start text-sm font-medium text-sky-400 underline">
                        {BONYAN_CONTACT.email}
                      </span>
                    </span>
                  </a>
                </li>
                <li>
                  <a
                    href={BONYAN_CONTACT.phoneHref}
                    className="group flex min-h-12 items-center gap-3 rounded-xs px-2 transition-colors hover:bg-white/5"
                  >
                    <Phone aria-hidden="true" className="size-4 shrink-0 text-[var(--gallery-accent,#cfa043)]" />
                    <span className="min-w-0">
                      <span className="block text-[0.625rem] uppercase tracking-widest text-white/50">
                        {isAr ? "الهاتف" : "Phone"}
                      </span>
                      <span dir="ltr" className="block text-start text-sm font-medium text-white">
                        {BONYAN_CONTACT.phone}
                      </span>
                    </span>
                  </a>
                </li>
                <li>
                  <a
                    href={BONYAN_CONTACT.mapHref}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex min-h-12 items-center gap-3 rounded-xs px-2 transition-colors hover:bg-white/5"
                  >
                    <MapPin aria-hidden="true" className="size-4 shrink-0 text-[var(--gallery-accent,#cfa043)]" />
                    <span className="min-w-0">
                      <span className="block text-[0.625rem] uppercase tracking-widest text-white/50">
                        {isAr ? "الموقع" : "Location"}
                      </span>
                      <span className="block text-sm font-medium text-white">
                        {isAr ? BONYAN_CONTACT.locationAr : BONYAN_CONTACT.locationEn}
                      </span>
                    </span>
                  </a>
                </li>
              </ul>

              <div className="mt-5 flex items-center gap-2 border-t border-white/10 pt-5 text-xs font-semibold text-[var(--gallery-accent,#cfa043)]">
                <span className="relative flex size-2 shrink-0">
                  <span className="bonyan-status-ping text-[var(--gallery-accent,#cfa043)]" />
                  <span className="relative inline-flex size-2 rounded-full bg-[var(--gallery-accent,#cfa043)]" />
                </span>
                <span className="font-bold uppercase tracking-wider">
                  {isAr ? "استشارات نَشِطة" : "Active Consultancy"}
                </span>
              </div>

              <div className="mt-auto space-y-4 pt-8">
                <BonyanLanguageSwitcher className="w-fit" alternateHref={alternateHref} locale={locale} />
                <a
                  href={mainSiteUrl("/contact", locale, baseUrl)}
                  onClick={() => setOpen(false)}
                  className="flex w-full min-h-11 items-center justify-center rounded-xs bg-[var(--gallery-accent,#cfa043)] px-4 py-2 text-sm font-semibold text-[#121b2a] transition-all hover:brightness-110"
                >
                  {isAr ? "تواصل معنا" : "Contact Us"}
                </a>
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  )
}
