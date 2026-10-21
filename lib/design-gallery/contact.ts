import type { PublicLocale } from "./public-locale"

export const CONTACT_INTENTS = ["same", "modified", "question", "similar", "idea", "general"] as const
export type ContactIntent = (typeof CONTACT_INTENTS)[number]

type DesignRef = { title: string; code: string; url?: string | null }

const MESSAGES: Record<PublicLocale, Record<ContactIntent, (d: DesignRef | null) => string>> = {
  ar: {
    same: (d) => `مرحباً، أريد تصميماً بطابع «${d?.title}» (${d?.code}).`,
    modified: (d) => `مرحباً، أريد تصميم «${d?.title}» (${d?.code}) مع تعديلات.`,
    question: (d) => `مرحباً، لدي سؤال عن تصميم «${d?.title}» (${d?.code}).`,
    similar: (d) => `مرحباً، أرغب بمناقشة مشروع مماثل لـ«${d?.title}» (${d?.code}).`,
    idea: () => "مرحباً، لدي فكرة لتصميم مختلف وأرغب بحجز اجتماع مع فريق التصميم.",
    general: () => "مرحباً، أرغب بالتواصل بخصوص معرض التصاميم.",
  },
  en: {
    same: (d) => `Hello, I would like a design in the style of "${d?.title}" (${d?.code}).`,
    modified: (d) => `Hello, I would like the "${d?.title}" design (${d?.code}) with some changes.`,
    question: (d) => `Hello, I have a question about the "${d?.title}" design (${d?.code}).`,
    similar: (d) => `Hello, I would like to discuss a project similar to "${d?.title}" (${d?.code}).`,
    idea: () => "Hello, I have an idea for a different design and would like to book a meeting with the design team.",
    general: () => "Hello, I would like to get in touch about the design gallery.",
  },
}

const NEEDS_DESIGN: readonly ContactIntent[] = ["same", "modified", "question", "similar"]

/** The ready-made WhatsApp message for a contact button, with the design name, code and link. */
export function contactMessage(intent: ContactIntent, locale: PublicLocale, design: DesignRef | null = null): string {
  const effective = NEEDS_DESIGN.includes(intent) && !design ? "general" : intent
  const text = MESSAGES[locale][effective](design)
  return design?.url && effective !== "general" && effective !== "idea" ? `${text}\n${design.url}` : text
}
