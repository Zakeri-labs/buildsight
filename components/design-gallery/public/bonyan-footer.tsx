import { ArrowRight, Mail, MapPin, Phone } from "lucide-react"
import type { PublicLocale } from "@/lib/design-gallery/public-locale"
import type { DesignGallerySite } from "@/lib/design-gallery/types"
import { BONYAN_CONTACT, mainSiteUrl } from "./bonyan-shared"
import { BonyanBrand, BonyanLanguageSwitcher } from "./bonyan-header"

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

  const t = {
    meta: {
      brandFull: isAr
        ? "بنيان للإنشاء والاستشارات الهندسية"
        : "Bonyan Construction for Engineering Consultancy",
      slogan: isAr
        ? "وضوح هندسي من الفكرة إلى الموقع."
        : "Engineering clarity from concept to site.",
    },
    nav: {
      home: isAr ? "الرئيسية" : "Home",
      about: isAr ? "من نحن" : "About",
      team: isAr ? "فريقنا" : "Our Team",
      services: isAr ? "الخدمات" : "Services",
      portfolio: isAr ? "أعمالنا" : "Portfolio",
      career: isAr ? "الوظائف" : "Careers",
      contact: isAr ? "تواصل معنا" : "Contact",
      cta: isAr ? "تواصل معنا" : "Contact Us",
      whatsapp: isAr ? "واتساب" : "WhatsApp",
    },
    footer: {
      quickLinks: isAr ? "روابط سريعة" : "Quick Links",
      ourServices: isAr ? "خدماتنا" : "Our Services",
      contactUs: isAr ? "تواصل معنا" : "Contact Us",
      rights: isAr ? "جميع الحقوق محفوظة." : "All rights reserved.",
      privacy: isAr ? "سياسة الخصوصية" : "Privacy Policy",
      terms: isAr ? "شروط الاستخدام" : "Terms of Use",
    },
    contact: {
      address: "Mabela, Sanaya, Muscat",
    },
  }

  const quick = [
    { label: t.nav.home, href: mainSiteUrl("/", locale, baseUrl) },
    { label: t.nav.about, href: mainSiteUrl("/about", locale, baseUrl) },
    { label: t.nav.team, href: mainSiteUrl("/team", locale, baseUrl) },
    { label: t.nav.services, href: mainSiteUrl("/services", locale, baseUrl) },
    { label: t.nav.portfolio, href: mainSiteUrl("/portfolio", locale, baseUrl) },
    { label: t.nav.career, href: mainSiteUrl("/career", locale, baseUrl) },
    { label: t.nav.contact, href: mainSiteUrl("/contact", locale, baseUrl) },
  ]

  const services = [
    {
      id: "design",
      title: isAr ? "التصميم المعماري والإنشائي" : "Architectural & Structural Design",
    },
    {
      id: "mep",
      title: isAr ? "الهندسة الكهروميكانيكية (MEP)" : "MEP Engineering",
    },
    {
      id: "supervision",
      title: isAr ? "الإشراف على التنفيذ ومراقبة الجودة" : "Construction Supervision & Quality Control",
    },
    {
      id: "construction",
      title: isAr ? "أعمال البناء" : "Building Construction",
    },
    {
      id: "management",
      title: isAr ? "إدارة المشاريع والبناء" : "Project & Construction Management",
    },
    {
      id: "quantity",
      title: isAr ? "حصر الكميات وضبط التكلفة" : "Quantity Surveying & Cost Control",
    },
  ]

  return (
    <>
      <style>{`
        .bonyan-footer-root {
          --background: oklch(0.209 0.038 258.5);
          --foreground: oklch(0.965 0.006 90);
          --panel: oklch(0.238 0.04 259);
          --primary: oklch(0.762 0.135 79);
          --primary-foreground: oklch(0.19 0.035 258);
          --muted-foreground: oklch(0.78 0.012 250);
          --border: oklch(1 0 0 / 12%);
          --link: oklch(0.74 0.075 244);
          --font-heading: "Manrope", "IBM Plex Sans Arabic", system-ui, sans-serif;
          --font-body: "Manrope", "IBM Plex Sans Arabic", system-ui, sans-serif;
          --font-display: "Manrope", "IBM Plex Sans Arabic", system-ui, sans-serif;
          background-color: var(--panel) !important;
          color: var(--foreground) !important;
          border-top: 1px solid oklch(0.762 0.135 79 / 30%) !important;
          font-family: var(--font-body) !important;
        }

        [lang="ar"] .bonyan-footer-root,
        .bonyan-footer-root[lang="ar"],
        .bonyan-footer-root[dir="rtl"],
        [dir="rtl"] .bonyan-footer-root {
          --font-heading: "IBM Plex Sans Arabic", "Manrope", system-ui, sans-serif;
          --font-body: "IBM Plex Sans Arabic", "Manrope", system-ui, sans-serif;
          --font-display: "IBM Plex Sans Arabic", "Manrope", system-ui, sans-serif;
        }

        .bonyan-footer-root * {
          box-sizing: border-box;
        }

        .bonyan-footer-root[dir="ltr"],
        .bonyan-footer-root[dir="ltr"] *,
        .bonyan-footer-root[lang="en"],
        .bonyan-footer-root[lang="en"] * {
          font-family: "Manrope", "IBM Plex Sans Arabic", system-ui, sans-serif !important;
        }

        .bonyan-footer-root[dir="rtl"],
        .bonyan-footer-root[dir="rtl"] *,
        .bonyan-footer-root[lang="ar"],
        .bonyan-footer-root[lang="ar"] *,
        [dir="rtl"] .bonyan-footer-root,
        [dir="rtl"] .bonyan-footer-root * {
          font-family: "IBM Plex Sans Arabic", "Manrope", system-ui, sans-serif !important;
        }

        .bonyan-footer-root .container-site {
          width: 100%;
          margin-inline: auto;
          max-width: 80rem;
          padding-inline: 1.25rem;
          padding-inline-start: max(1.25rem, env(safe-area-inset-left));
          padding-inline-end: max(1.25rem, env(safe-area-inset-right));
        }

        .bonyan-footer-root .rounded-xs {
          border-radius: 2px !important;
        }

        .bonyan-footer-root h2,
        .bonyan-footer-root .font-display {
          font-family: var(--font-display) !important;
          font-size: 0.875rem !important;
          font-weight: 700 !important;
          color: var(--foreground) !important;
        }

        .bonyan-footer-root[dir="ltr"] h2,
        .bonyan-footer-root[lang="en"] h2 {
          letter-spacing: 0.1em !important;
          text-transform: uppercase !important;
        }

        .bonyan-footer-root[dir="rtl"] h2,
        .bonyan-footer-root[lang="ar"] h2,
        [dir="rtl"] .bonyan-footer-root h2 {
          letter-spacing: 0 !important;
          line-height: 1.35 !important;
          text-transform: none !important;
        }

        .bonyan-footer-root .text-muted-foreground {
          color: var(--muted-foreground) !important;
        }

        .bonyan-footer-root .hover\\:text-primary:hover {
          color: var(--primary) !important;
        }

        .bonyan-footer-root .text-primary {
          color: var(--primary) !important;
        }

        .bonyan-footer-root .text-link {
          color: var(--link) !important;
        }

        .bonyan-footer-root .border-border {
          border-color: var(--border) !important;
        }

        .bonyan-footer-root .hover\\:border-primary:hover {
          border-color: var(--primary) !important;
        }

        .bonyan-footer-root[dir="rtl"] p,
        .bonyan-footer-root[dir="rtl"] li,
        .bonyan-footer-root[lang="ar"] p,
        .bonyan-footer-root[lang="ar"] li,
        [dir="rtl"] .bonyan-footer-root p,
        [dir="rtl"] .bonyan-footer-root li {
          line-height: 1.9 !important;
        }
      `}</style>

      <footer
        dir={isAr ? "rtl" : "ltr"}
        lang={locale}
        className="bonyan-footer-root"
      >
        <div className="container-site grid gap-10 py-16 md:grid-cols-2 lg:grid-cols-4">
          {/* Column 1: Brand & Social */}
          <div>
            <BonyanBrand site={site} locale={locale} baseUrl={baseUrl} />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {t.meta.slogan}
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
                  className="flex size-11 items-center justify-center rounded-xs border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <InstagramIcon aria-hidden="true" className="size-4" />
                </a>
              ))}
            </div>
            <BonyanLanguageSwitcher className="mt-6 w-fit" alternateHref={alternateHref} locale={locale} />
          </div>

          {/* Column 2: Quick Links */}
          <nav aria-label={t.footer.quickLinks}>
            <h2 className="font-display text-sm font-bold uppercase tracking-widest">
              {t.footer.quickLinks}
            </h2>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
              {quick.map((q) => (
                <li key={q.label}>
                  <a href={q.href} className="transition-colors hover:text-primary">
                    {q.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Column 3: Our Services */}
          <nav aria-label={t.footer.ourServices}>
            <h2 className="font-display text-sm font-bold uppercase tracking-widest">
              {t.footer.ourServices}
            </h2>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
              {services.map((s) => (
                <li key={s.id}>
                  <a
                    href={`${mainSiteUrl("/services", locale, baseUrl)}#${s.id}`}
                    className="transition-colors hover:text-primary"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Column 4: Contact Us */}
          <div>
            <h2 className="font-display text-sm font-bold uppercase tracking-widest">
              {t.footer.contactUs}
            </h2>
            <ul className="mt-5 space-y-4 text-sm text-muted-foreground">
              <li className="flex items-start gap-3">
                <Phone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <a href={BONYAN_CONTACT.phoneHref} dir="ltr" className="transition-colors hover:text-primary">
                  {BONYAN_CONTACT.phone}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <a
                  href={`mailto:${BONYAN_CONTACT.email}`}
                  dir="ltr"
                  className="text-link transition-colors hover:underline"
                >
                  {BONYAN_CONTACT.email}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <a
                  href={BONYAN_CONTACT.mapHref}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-primary"
                >
                  {t.contact.address}
                </a>
              </li>
            </ul>

            <a
              href={mainSiteUrl("/contact", locale, baseUrl)}
              className="group mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xs bg-[var(--primary)] px-6 py-3 text-sm font-semibold tracking-wide text-[var(--primary-foreground)] shadow-[0_8px_24px_-14px_var(--primary)] transition-all duration-300 hover:brightness-110 hover:-translate-y-0.5"
            >
              <span>{t.nav.cta}</span>
              <ArrowRight
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
              />
            </a>

            <a
              href={BONYAN_CONTACT.whatsappHref}
              className="mt-3 block text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              {t.nav.whatsapp}: <span dir="ltr">{BONYAN_CONTACT.whatsapp}</span>
            </a>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-border">
          <div className="container-site flex flex-col gap-3 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {new Date().getFullYear()} {t.meta.brandFull}. {t.footer.rights}
            </p>
            <div className="flex gap-6">
              <span>{t.footer.privacy}</span>
              <span>{t.footer.terms}</span>
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
