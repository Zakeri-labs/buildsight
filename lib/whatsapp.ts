/**
 * WhatsApp click-to-chat link. `phone` is reduced to digits (country code
 * included, no "+"); without a phone, WhatsApp asks the user to pick a chat.
 */
export function whatsappUrl(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? "").replace(/[^0-9]/g, "")
  const query = `text=${encodeURIComponent(text)}`
  return digits ? `https://wa.me/${digits}?${query}` : `https://wa.me/?${query}`
}
