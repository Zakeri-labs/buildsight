"use server"

// Public server actions behind the booking form (/designs/book). Anyone can
// call them; each one resolves the gallery from the request host and
// validates everything itself (see ./server.ts).
import { getAvailability, prepareIdeaUpload, submitMeetingRequest } from "./server"

export async function loadBookingAvailability() {
  return getAvailability()
}

export async function prepareBookingFileUpload(input: { requestKey: string; name: string; size: number; type: string }) {
  return prepareIdeaUpload(input)
}

export async function sendMeetingRequest(raw: Record<string, unknown>) {
  return submitMeetingRequest(raw && typeof raw === "object" ? raw : {})
}
