import Link from "next/link"
import { ArrowRight, Mail, MapPin, Phone } from "lucide-react"
import { galleryHref, type PublicLocale } from "@/lib/design-gallery/public-locale"
import type { DesignGallerySite } from "@/lib/design-gallery/types"
import { BONYAN_CONTACT, BonyanBrand, BonyanLanguageSwitcher, mainSiteUrl } from "./bonyan-header"

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}

export function BonyanFooter({
  site,
  locale,
  alternateHref,
}: {
  site: DesignGallerySite
  locale: PublicLocale
  alternateHref: string
}) {
  const isAr = locale === "ar"
  const baseUrl = (site.websiteUrl || "https://bonyanec.com").replace(/\/$/, "")

  const quickLinks = [
    { label: isAr ? "الرئيسية" : "Home", href: mainSiteUrl("/", locale, baseUrl) },
    { label: isAr ? "من نحن" : "About", href: mainSiteUrl("/about", locale, baseUrl) },
    { label: isAr ? "فريقنا" : "Our Team", href: mainSiteUrl("/team", locale, baseUrl) },
    { label: isAr ? "الخدمات" : "Services", href: mainSiteUrl("/services", locale, baseUrl) },
    { label: isAr ? "أعمالنا" : "Portfolio", href: mainSiteUrl("/portfolio", locale, baseUrl) },
    { label: isAr ? "معرض التصاميم" : "Designs", href: galleryHref("/designs", locale), isLocal: true },
    { label: isAr ? "الوظائف" : "Careers", href: mainSiteUrl("/career", locale, baseUrl) },
    { label: isAr ? "تواصل معنا" : "Contact", href: mainSiteUrl("/contact", locale, baseUrl) },
  ]

  const services = [
    { id: "design", ar: "التصميم المعماري والإنشائي", en: "Architectural & Structural Design" },
    { id: "mep", ar: "الهندسة الكهروميكانيكية (MEP)", en: "MEP Engineering" },
    { id: "supervision", ar: "الإشراف على التنفيذ ومراقبة الجودة", en: "Construction Supervision & Quality Control" },
    { id: "construction", ar: "أعمال البناء", en: "Building Construction" },
    { id: "management", ar: "إدارة المشاريع والبناء", en: "Project & Construction Management" },
    { id: "quantity", ar: "حصر الكميات وضبط التكلفة", en: "Quantity Surveying & Cost Control" },
  ]

  return (
    <footer className="border-t border-[var(--gallery-accent,#cfa043)]/30 bg-[#131e30] text-white">
      <div className="mx-auto max-w-7xl px-5 py-16 grid gap-10 md:grid-cols-2 lg:grid-cols-4">
        {/* Column 1: Brand & Social */}
        <div>
          <BonyanBrand site={site} locale={locale} baseUrl={baseUrl} />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/70">
            {isAr ? "وضوح هندسي من الفكرة إلى الموقع." : "Engineering clarity from concept to site."}
          </p>
          <div className="mt-6 flex gap-3">
            {BONYAN_CONTACT.social.map((account) => (
              <a
                key={account.label}
                href={account.href}
                aria-label={account.label}
                title={account.label}
                target="_blank"
                rel="noreferrer"
                className="flex size-11 items-center justify-center rounded-xs border border-white/15 text-white/70 transition-colors hover:border-[var(--gallery-accent,#cfa043)] hover:text-[var(--gallery-accent,#cfa043)]"
              >
                <InstagramIcon aria-hidden="true" className="size-4" />
              </a>
            ))}
          </div>
          <BonyanLanguageSwitcher className="mt-6 w-fit" alternateHref={alternateHref} locale={locale} />
        </div>

        {/* Column 2: Quick Links */}
        <nav aria-label={isAr ? "روابط سريعة" : "Quick Links"}>
          <h2 className="text-sm font-bold uppercase tracking-widest text-white">
            {isAr ? "روابط سريعة" : "Quick Links"}
          </h2>
          <ul className="mt-5 space-y-3 text-sm text-white/70">
            {quickLinks.map((q) => (
              <li key={q.label}>
                {q.isLocal ? (
                  <Link
                    href={q.href}
                    className="text-[var(--gallery-accent,#cfa043)] font-semibold transition-colors hover:underline"
                  >
                    {q.label}
                  </Link>
                ) : (
                  <a href={q.href} className="transition-colors hover:text-[var(--gallery-accent,#cfa043)]">
                    {q.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {/* Column 3: Our Services */}
        <nav aria-label={isAr ? "خدماتنا" : "Our Services"}>
          <h2 className="text-sm font-bold uppercase tracking-widest text-white">
            {isAr ? "خدماتنا" : "Our Services"}
          </h2>
          <ul className="mt-5 space-y-3 text-sm text-white/70">
            {services.map((s) => (
              <li key={s.id}>
                <a
                  href={`${mainSiteUrl("/services", locale, baseUrl)}#${s.id}`}
                  className="transition-colors hover:text-[var(--gallery-accent,#cfa043)]"
                >
                  {isAr ? s.ar : s.en}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Column 4: Contact Us */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-white">
            {isAr ? "تواصل معنا" : "Contact Us"}
          </h2>
          <ul className="mt-5 space-y-4 text-sm text-white/70">
            <li className="flex items-start gap-3">
              <Phone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--gallery-accent,#cfa043)]" />
              <a href={BONYAN_CONTACT.phoneHref} dir="ltr" className="hover:text-white">
                {BONYAN_CONTACT.phone}
              </a>
            </li>
            <li className="flex items-start gap-3">
              <Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--gallery-accent,#cfa043)]" />
              <a href={`mailto:${BONYAN_CONTACT.email}`} dir="ltr" className="text-sky-400 hover:underline">
                {BONYAN_CONTACT.email}
              </a>
            </li>
            <li className="flex items-start gap-3">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--gallery-accent,#cfa043)]" />
              <a href={BONYAN_CONTACT.mapHref} target="_blank" rel="noreferrer" className="hover:text-white">
                {isAr ? BONYAN_CONTACT.addressAr : BONYAN_CONTACT.addressEn}
              </a>
            </li>
          </ul>

          <Link
            href={galleryHref("/designs/book", locale)}
            className="group mt-6 flex w-full min-h-11 items-center justify-center gap-2 rounded-xs bg-[var(--gallery-accent,#cfa043)] px-4 py-2.5 text-sm font-semibold text-[#121b2a] shadow-[0_8px_24px_-14px_rgba(207,160,67,0.6)] transition-all hover:brightness-110 hover:-translate-y-0.5"
          >
            <span>{isAr ? "احجز استشارة" : "Book Consultation"}</span>
            <ArrowRight
              aria-hidden="true"
              className="size-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
            />
          </Link>

          <a
            href={BONYAN_CONTACT.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block text-sm text-white/70 transition-colors hover:text-[var(--gallery-accent,#cfa043)]"
          >
            {isAr ? "واتساب: " : "WhatsApp: "}
            <span dir="ltr">{BONYAN_CONTACT.whatsapp}</span>
          </a>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-6 flex flex-col gap-3 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()}{" "}
            {isAr
              ? "بنيان للإنشاء والاستشارات الهندسية. جميع الحقوق محفوظة."
              : "Bonyan Construction for Engineering Consultancy. All rights reserved."}
          </p>
          <div className="flex gap-6">
            <span className="hover:text-white/80 cursor-pointer">{isAr ? "سياسة الخصوصية" : "Privacy Policy"}</span>
            <span className="hover:text-white/80 cursor-pointer">{isAr ? "شروط الاستخدام" : "Terms of Use"}</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
