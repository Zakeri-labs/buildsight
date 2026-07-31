export const REVIEW_NOTIFICATION_PREFERENCE_EVENT = "buildsight:review-notification-preference"
export const REVIEW_NOTIFICATION_ENABLED_KEY = "buildsight:review-notifications-enabled"

export type BrowserNotificationPermissionState = "unsupported" | NotificationPermission

export function browserNotificationPermission(): BrowserNotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported"
  return Notification.permission
}

export function browserReviewNotificationsEnabled() {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(REVIEW_NOTIFICATION_ENABLED_KEY) === "true"
}

export async function enableBrowserReviewNotifications() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported" as const
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission
  if (permission === "granted") {
    window.localStorage.setItem(REVIEW_NOTIFICATION_ENABLED_KEY, "true")
    window.dispatchEvent(new Event(REVIEW_NOTIFICATION_PREFERENCE_EVENT))
  }
  return permission
}

export function disableBrowserReviewNotifications() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(REVIEW_NOTIFICATION_ENABLED_KEY)
  window.dispatchEvent(new Event(REVIEW_NOTIFICATION_PREFERENCE_EVENT))
}
