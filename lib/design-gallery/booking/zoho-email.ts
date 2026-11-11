import "server-only"
import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"
import { buildIcalendarEvent, type IcalAttendee } from "./ics"
import { formatMeetingTime } from "./notifications"

export type BookingEmailDetails = {
  requestId: string
  clientName: string
  whatsappPhone: string
  clientEmail: string | null
  meetingMode: "office" | "remote" | "call_me"
  startsAt: string | null
  endsAt: string | null
  timeZone?: string
  designCode?: string | null
  designTitleAr?: string | null
  designTitleEn?: string | null
  path: "same" | "modified" | "idea"
  projectType: string
  landStatus: string
  wilayat?: string | null
  landAreaSqm?: number | null
  startTimeline: string
  ideaText?: string | null
  officeAddressAr?: string | null
  officeAddressEn?: string | null
  locale?: "ar" | "en"
}

export type ZohoEmailConfig = {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
  attendeeEmail: string
}

export function resolveZohoEmailConfig(env: Record<string, string | undefined> = process.env): ZohoEmailConfig | null {
  const user = env.ZOHO_SMTP_USER?.trim() || env.ZOHO_USER?.trim() || "info@bonyanec.com"
  const pass = env.ZOHO_SMTP_PASSWORD?.trim() || env.ZOHO_APP_PASSWORD?.trim()
  if (!pass) return null

  const host = env.ZOHO_SMTP_HOST?.trim() || "smtppro.zoho.com"
  const port = Number(env.ZOHO_SMTP_PORT?.trim()) || 465
  const secure = env.ZOHO_SMTP_SECURE !== undefined ? env.ZOHO_SMTP_SECURE.toLowerCase() === "true" : port === 465
  const attendeeEmail = env.BOOKING_NOTIFICATION_EMAIL?.trim() || env.ZOHO_BOOKING_ATTENDEE_EMAIL?.trim() || "architecture1@bonyanec.com"

  return {
    host,
    port,
    secure,
    user,
    pass,
    from: `"Bonyan Engineering" <${user}>`,
    attendeeEmail,
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

const MODE_LABELS: Record<string, { ar: string; en: string }> = {
  office: { ar: "اجتماع حضوري في المكتب", en: "In-Office Consultation" },
  remote: { ar: "اجتماع مرئي عبر الإنترنت", en: "Online Video Consultation" },
  call_me: { ar: "طلب اتصال هاتفي", en: "Phone Call Back Request" },
}

const PROJECT_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  villa: { ar: "فيلا سكنية", en: "Residential Villa" },
  twin_villa: { ar: "توين فيلا", en: "Twin Villa" },
  commercial: { ar: "مبنى تجاري / سكني تجاري", en: "Commercial / Mixed-use" },
  chalet: { ar: "شاليه / استراحة", en: "Chalet / Farmhouse" },
  other: { ar: "مشروع آخر", en: "Other Project" },
}

const LAND_STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  owned_ready: { ar: "أرض مملوكة وجاهزة للبناء", en: "Owned & Ready" },
  owned_pending: { ar: "أرض مملوكة قيد الإجراءات", en: "Owned (Pending procedures)" },
  searching: { ar: "في مرحلة البحث عن أرض", en: "Searching for land" },
}

const TIMELINE_LABELS: Record<string, { ar: string; en: string }> = {
  immediate: { ar: "فوراً / خلال شهر", en: "Immediately / Within 1 month" },
  within_3_months: { ar: "خلال ٣ أشهر", en: "Within 3 months" },
  within_6_months: { ar: "خلال ٦ أشهر", en: "Within 6 months" },
  exploring: { ar: "استكشاف أفكار وتخطيط مبدئي", en: "Exploring & Planning" },
}

export type SendBookingEmailsResult = {
  ok: boolean
  sentToAttendee: boolean
  sentToClient: boolean
  attendeeMessageId?: string
  clientMessageId?: string
  error?: string
}

export async function sendBookingNotifications(
  details: BookingEmailDetails,
  customConfig?: ZohoEmailConfig | null,
  transportFactory?: (cfg: ZohoEmailConfig) => Transporter,
): Promise<SendBookingEmailsResult> {
  const config = customConfig ?? resolveZohoEmailConfig()
  if (!config) {
    return { ok: false, sentToAttendee: false, sentToClient: false, error: "zoho_not_configured" }
  }

  const transporter: Transporter = transportFactory
    ? transportFactory(config)
    : nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass,
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
      })

  const timeZone = details.timeZone || "Asia/Muscat"
  const isAr = details.locale !== "en"
  const formattedTime = details.startsAt ? formatMeetingTime(details.startsAt, timeZone) : null
  const modeLabel = MODE_LABELS[details.meetingMode] ?? { ar: details.meetingMode, en: details.meetingMode }
  const projectLabel = PROJECT_TYPE_LABELS[details.projectType] ?? { ar: details.projectType, en: details.projectType }
  const landLabel = LAND_STATUS_LABELS[details.landStatus] ?? { ar: details.landStatus, en: details.landStatus }
  const timelineLabel = TIMELINE_LABELS[details.startTimeline] ?? { ar: details.startTimeline, en: details.startTimeline }

  const cleanPhone = details.whatsappPhone.replace(/[^0-9]/g, "")
  const whatsappUrl = `https://wa.me/${cleanPhone}`

  const designRef = details.designCode
    ? `${details.designCode} — ${isAr ? details.designTitleAr ?? "" : details.designTitleEn ?? ""}`
    : details.path === "idea"
      ? (isAr ? "فكرة خاصة بالعميل" : "Client's Own Idea")
      : (isAr ? "تصميم من المعرض" : "Gallery Design")

  const locationText =
    details.meetingMode === "office"
      ? (isAr ? (details.officeAddressAr || "مكتب بنيان للاستشارات الهندسية - مسقط، سلطنة عُمان") : (details.officeAddressEn || "Bonyan Engineering Office - Muscat, Oman"))
      : details.meetingMode === "remote"
        ? (isAr ? "اجتماع مرئي عبر الإنترنت (سيتم إرسال رابط الاجتماع عبر الواتساب والبريد)" : "Online Video Meeting (Link will be sent via WhatsApp/Email)")
        : (isAr ? "اتصال هاتفي" : "Phone Call")

  // 1. Generate .ics string if a scheduled slot exists
  let icsString: string | null = null
  if (details.startsAt && details.endsAt) {
    const start = new Date(details.startsAt)
    const end = new Date(details.endsAt)
    const summary = isAr
      ? `استشارة تصميم: ${details.clientName}${details.designCode ? ` (${details.designCode})` : ""}`
      : `Design Consultation: ${details.clientName}${details.designCode ? ` (${details.designCode})` : ""}`

    const description = [
      `العميل: ${details.clientName}`,
      `الهاتف: +${details.whatsappPhone}`,
      details.clientEmail ? `البريد: ${details.clientEmail}` : null,
      `نوع الاجتماع: ${modeLabel.ar}`,
      `المشروع: ${projectLabel.ar}`,
      `التصميم: ${designRef}`,
      details.wilayat ? `الولاية: ${details.wilayat}` : null,
      details.landAreaSqm ? `مساحة الأرض: ${details.landAreaSqm} م²` : null,
      details.ideaText ? `ملاحظات: ${details.ideaText}` : null,
    ]
      .filter(Boolean)
      .join("\n")

    const attendees: IcalAttendee[] = [
      {
        email: config.attendeeEmail,
        name: "Ms. Al Hajri / Architecture Team",
        role: "REQ-PARTICIPANT",
        partstat: "ACCEPTED",
      },
    ]

    if (details.clientEmail) {
      attendees.push({
        email: details.clientEmail,
        name: details.clientName,
        role: "REQ-PARTICIPANT",
        partstat: "NEEDS-ACTION",
        rsvp: true,
      })
    }

    icsString = buildIcalendarEvent({
      uid: `booking-${details.requestId}@bonyanec.com`,
      start,
      end,
      summary,
      description,
      location: locationText,
      organizer: { name: "Bonyan Engineering", email: config.user },
      attendees,
      status: "CONFIRMED",
      method: "REQUEST",
    })
  }

  let sentToAttendee = false
  let sentToClient = false
  let attendeeMessageId: string | undefined
  let clientMessageId: string | undefined
  let sendError: string | undefined

  // 2. Send email to Team Calendar / Attendee (Ms. Al Hajri)
  try {
    const attendeeSubject = details.startsAt
      ? `طلب استشارة تصميم جديد — ${details.clientName} (${formattedTime})`
      : `طلب اتصال جديد — ${details.clientName}`

    const attendeeHtml = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<body style="font-family: Arial, sans-serif; background-color: #0b1320; color: #f3f4f6; margin: 0; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #111c2e; border: 1px solid #1f2e47; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #c59b27; color: #0b1320; padding: 18px 24px; font-weight: bold; font-size: 18px;">
      بنيان للاستشارات الهندسية — طلب حجز جديد
    </div>
    <div style="padding: 24px;">
      <p style="font-size: 16px; margin-top: 0;">
        تم تسجيل طلب حجز استشارة جديد من الموقع الإلكتروني:
      </p>

      <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px;">
        <tr style="border-bottom: 1px solid #1f2e47;">
          <td style="padding: 10px 0; color: #9ca3af; width: 140px;">اسم العميل:</td>
          <td style="padding: 10px 0; font-weight: bold; color: #ffffff;">${escapeHtml(details.clientName)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #1f2e47;">
          <td style="padding: 10px 0; color: #9ca3af;">رقم الواتساب:</td>
          <td style="padding: 10px 0;">
            <a href="${whatsappUrl}" style="color: #34d399; font-weight: bold; text-decoration: none;">
              +${escapeHtml(details.whatsappPhone)} 💬 فتح المحادثة
            </a>
          </td>
        </tr>
        ${
          details.clientEmail
            ? `<tr style="border-bottom: 1px solid #1f2e47;">
                <td style="padding: 10px 0; color: #9ca3af;">البريد الإلكتروني:</td>
                <td style="padding: 10px 0; color: #ffffff;">${escapeHtml(details.clientEmail)}</td>
              </tr>`
            : ""
        }
        <tr style="border-bottom: 1px solid #1f2e47;">
          <td style="padding: 10px 0; color: #9ca3af;">نوع الموعد:</td>
          <td style="padding: 10px 0; color: #fbbf24; font-weight: bold;">${escapeHtml(modeLabel.ar)}</td>
        </tr>
        ${
          formattedTime
            ? `<tr style="border-bottom: 1px solid #1f2e47;">
                <td style="padding: 10px 0; color: #9ca3af;">وقت المقابلة:</td>
                <td style="padding: 10px 0; color: #60a5fa; font-weight: bold;">${escapeHtml(formattedTime)} (${escapeHtml(timeZone)})</td>
              </tr>`
            : ""
        }
        <tr style="border-bottom: 1px solid #1f2e47;">
          <td style="padding: 10px 0; color: #9ca3af;">التصميم / الطلب:</td>
          <td style="padding: 10px 0; color: #ffffff;">${escapeHtml(designRef)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #1f2e47;">
          <td style="padding: 10px 0; color: #9ca3af;">نوع المشروع:</td>
          <td style="padding: 10px 0; color: #ffffff;">${escapeHtml(projectLabel.ar)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #1f2e47;">
          <td style="padding: 10px 0; color: #9ca3af;">حالة الأرض:</td>
          <td style="padding: 10px 0; color: #ffffff;">${escapeHtml(landLabel.ar)}</td>
        </tr>
        ${
          details.wilayat
            ? `<tr style="border-bottom: 1px solid #1f2e47;">
                <td style="padding: 10px 0; color: #9ca3af;">الولاية:</td>
                <td style="padding: 10px 0; color: #ffffff;">${escapeHtml(details.wilayat)}</td>
              </tr>`
            : ""
        }
        ${
          details.landAreaSqm
            ? `<tr style="border-bottom: 1px solid #1f2e47;">
                <td style="padding: 10px 0; color: #9ca3af;">مساحة الأرض:</td>
                <td style="padding: 10px 0; color: #ffffff;">${details.landAreaSqm} م²</td>
              </tr>`
            : ""
        }
        <tr style="border-bottom: 1px solid #1f2e47;">
          <td style="padding: 10px 0; color: #9ca3af;">موعد البدء المتوقع:</td>
          <td style="padding: 10px 0; color: #ffffff;">${escapeHtml(timelineLabel.ar)}</td>
        </tr>
        ${
          details.ideaText
            ? `<tr style="border-bottom: 1px solid #1f2e47;">
                <td style="padding: 10px 0; color: #9ca3af;">ملاحظات العميل:</td>
                <td style="padding: 10px 0; color: #ffffff; white-space: pre-wrap;">${escapeHtml(details.ideaText)}</td>
              </tr>`
            : ""
        }
      </table>

      <div style="margin-top: 24px; text-align: center;">
        <a href="https://app.bonyanec.com/design-gallery/requests" style="display: inline-block; background-color: #c59b27; color: #0b1320; font-weight: bold; padding: 12px 24px; border-radius: 4px; text-decoration: none;">
          عرض الطلب في لوحة التحكم
        </a>
      </div>
    </div>
  </div>
</body>
</html>`

    const attendeeMailOptions: nodemailer.SendMailOptions = {
      from: config.from,
      to: config.attendeeEmail,
      subject: attendeeSubject,
      html: attendeeHtml,
      text: `${attendeeSubject}\n\nClient: ${details.clientName}\nPhone: +${details.whatsappPhone}\nEmail: ${details.clientEmail ?? "N/A"}\nTime: ${formattedTime ?? "Call back"}\nDesign: ${designRef}`,
    }

    if (icsString) {
      attendeeMailOptions.icalEvent = {
        filename: "invite.ics",
        method: "REQUEST",
        content: icsString,
      }
    }

    const info = await transporter.sendMail(attendeeMailOptions)
    if (info && info.messageId) {
      sentToAttendee = true
      attendeeMessageId = String(info.messageId)
    }
  } catch (err) {
    console.error("Zoho Email: Failed to send attendee notification:", err)
    sendError = err instanceof Error ? err.message : String(err)
  }

  // 3. Send confirmation email to Client (if email provided)
  if (details.clientEmail) {
    try {
      const clientSubject = isAr
        ? (details.startsAt
            ? `تأكيد موعد استشارة التصميم — بنيان للاستشارات الهندسية`
            : `تم استلام طلبك للتواصل — بنيان للاستشارات الهندسية`)
        : (details.startsAt
            ? `Design Consultation Confirmation — Bonyan Engineering`
            : `We Received Your Request — Bonyan Engineering`)

      const clientHtml = isAr
        ? `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<body style="font-family: Arial, sans-serif; background-color: #0b1320; color: #f3f4f6; margin: 0; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #111c2e; border: 1px solid #1f2e47; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #c59b27; color: #0b1320; padding: 20px 24px; font-weight: bold; font-size: 20px; text-align: center;">
      بنيان للاستشارات الهندسية
    </div>
    <div style="padding: 24px;">
      <h2 style="color: #ffffff; font-size: 18px; margin-top: 0;">مرحباً ${escapeHtml(details.clientName)}،</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #d1d5db;">
        ${
          details.startsAt
            ? `شكراً لتواصلك مع بنيان للاستشارات الهندسية. تم تأكيد موعد استشارتك المعمارية بنجاح. ستجد تفاصيل الموعد أدناه، كما يمكنك إضافة الموعد لتقويم هاتفك عبر الدعوة المرفقة.`
            : `شكراً لتواصلك مع بنيان للاستشارات الهندسية. تم استلام طلبك بنجاح، وسيقوم فريقنا الهندسي بالتواصل معك عبر الواتساب أو الهاتف في أقرب وقت.`
        }
      </p>

      <div style="background-color: #16243b; border-radius: 6px; padding: 18px; margin: 20px 0; border: 1px solid #243654;">
        <h3 style="color: #c59b27; font-size: 16px; margin: 0 0 12px 0;">تفاصيل الاستشارة:</h3>
        <p style="margin: 6px 0; font-size: 14px;"><strong>نوع المقابلة:</strong> ${escapeHtml(modeLabel.ar)}</p>
        ${formattedTime ? `<p style="margin: 6px 0; font-size: 14px;"><strong>الوقت:</strong> ${escapeHtml(formattedTime)} (${escapeHtml(timeZone)})</p>` : ""}
        <p style="margin: 6px 0; font-size: 14px;"><strong>المكان:</strong> ${escapeHtml(locationText)}</p>
        <p style="margin: 6px 0; font-size: 14px;"><strong>المشروع:</strong> ${escapeHtml(projectLabel.ar)}</p>
        <p style="margin: 6px 0; font-size: 14px;"><strong>التصميم المرجعي:</strong> ${escapeHtml(designRef)}</p>
      </div>

      <p style="font-size: 14px; color: #9ca3af; line-height: 1.5;">
        إذا كان لديك أي استفسار أو رغبت في تعديل الموعد، يمكنك التواصل معنا مباشرة عبر واتساب بالضغط على الزر أدناه:
      </p>

      <div style="margin: 24px 0; text-align: center;">
        <a href="https://wa.me/96894114511" style="display: inline-block; background-color: #25d366; color: #ffffff; font-weight: bold; padding: 12px 28px; border-radius: 4px; text-decoration: none;">
          التواصل عبر واتساب (+968 94114511)
        </a>
      </div>

      <hr style="border: none; border-top: 1px solid #1f2e47; margin: 24px 0;" />
      <p style="font-size: 12px; color: #6b7280; text-align: center; margin: 0;">
        بنيan للاستشارات الهندسية · مسقط، سلطنة عُمان · info@bonyanec.com
      </p>
    </div>
  </div>
</body>
</html>`
        : `
<!DOCTYPE html>
<html lang="en">
<body style="font-family: Arial, sans-serif; background-color: #0b1320; color: #f3f4f6; margin: 0; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #111c2e; border: 1px solid #1f2e47; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #c59b27; color: #0b1320; padding: 20px 24px; font-weight: bold; font-size: 20px; text-align: center;">
      Bonyan Engineering
    </div>
    <div style="padding: 24px;">
      <h2 style="color: #ffffff; font-size: 18px; margin-top: 0;">Dear ${escapeHtml(details.clientName)},</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #d1d5db;">
        ${
          details.startsAt
            ? `Thank you for contacting Bonyan Engineering. Your architectural design consultation has been successfully scheduled. Details are below, and a calendar invitation has been attached.`
            : `Thank you for contacting Bonyan Engineering. We have received your request, and our engineering team will reach out to you shortly.`
        }
      </p>

      <div style="background-color: #16243b; border-radius: 6px; padding: 18px; margin: 20px 0; border: 1px solid #243654;">
        <h3 style="color: #c59b27; font-size: 16px; margin: 0 0 12px 0;">Consultation Details:</h3>
        <p style="margin: 6px 0; font-size: 14px;"><strong>Mode:</strong> ${escapeHtml(modeLabel.en)}</p>
        ${formattedTime ? `<p style="margin: 6px 0; font-size: 14px;"><strong>Time:</strong> ${escapeHtml(formattedTime)} (${escapeHtml(timeZone)})</p>` : ""}
        <p style="margin: 6px 0; font-size: 14px;"><strong>Location:</strong> ${escapeHtml(locationText)}</p>
        <p style="margin: 6px 0; font-size: 14px;"><strong>Project:</strong> ${escapeHtml(projectLabel.en)}</p>
        <p style="margin: 6px 0; font-size: 14px;"><strong>Reference:</strong> ${escapeHtml(designRef)}</p>
      </div>

      <p style="font-size: 14px; color: #9ca3af; line-height: 1.5;">
        For any questions or changes, feel free to chat with us directly on WhatsApp:
      </p>

      <div style="margin: 24px 0; text-align: center;">
        <a href="https://wa.me/96894114511" style="display: inline-block; background-color: #25d366; color: #ffffff; font-weight: bold; padding: 12px 28px; border-radius: 4px; text-decoration: none;">
          Chat on WhatsApp (+968 94114511)
        </a>
      </div>

      <hr style="border: none; border-top: 1px solid #1f2e47; margin: 24px 0;" />
      <p style="font-size: 12px; color: #6b7280; text-align: center; margin: 0;">
        Bonyan Engineering · Muscat, Sultanate of Oman · info@bonyanec.com
      </p>
    </div>
  </div>
</body>
</html>`

      const clientMailOptions: nodemailer.SendMailOptions = {
        from: config.from,
        to: details.clientEmail,
        subject: clientSubject,
        html: clientHtml,
        text: `${clientSubject}\n\nDear ${details.clientName},\nYour consultation is confirmed for ${formattedTime ?? "Call back"}.\nLocation: ${locationText}\nContact: +968 94114511`,
      }

      if (icsString) {
        clientMailOptions.icalEvent = {
          filename: "invite.ics",
          method: "REQUEST",
          content: icsString,
        }
      }

      const clientInfo = await transporter.sendMail(clientMailOptions)
      if (clientInfo && clientInfo.messageId) {
        sentToClient = true
        clientMessageId = String(clientInfo.messageId)
      }
    } catch (err) {
      console.error("Zoho Email: Failed to send client confirmation:", err)
    }
  }

  return {
    ok: sentToAttendee,
    sentToAttendee,
    sentToClient,
    attendeeMessageId,
    clientMessageId,
    error: sendError,
  }
}
