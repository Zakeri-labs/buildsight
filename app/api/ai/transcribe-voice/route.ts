import { NextRequest, NextResponse } from "next/server"
import { OPENAI_CONFIG } from "@/lib/openai-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions"

export async function POST(request: NextRequest) {
  try {
    const apiKey = OPENAI_CONFIG.apiKey
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is missing." }, { status: 500 })
    }

    const formData = await request.formData()
    const audioFile = formData.get("audio") as File | null

    if (!audioFile || audioFile.size === 0) {
      return NextResponse.json({ error: "No audio file provided." }, { status: 400 })
    }

    const openAiFormData = new FormData()
    openAiFormData.append("file", audioFile, audioFile.name || "speech.webm")
    openAiFormData.append("model", OPENAI_CONFIG.transcriptionModel)
    // Prompt to guide Whisper for construction engineering context across Hindi, Persian, Arabic, English
    openAiFormData.append(
      "prompt",
      "Site inspection report, civil engineering notes, formwork, rebar, shuttering, concrete, slump, grid axis, Hindi, Persian, Arabic, English.",
    )

    const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: openAiFormData,
      signal: AbortSignal.timeout(45_000),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Whisper API failed with status ${response.status}.`)
    }

    const transcribedText = typeof payload?.text === "string" ? payload.text.trim() : ""
    if (!transcribedText) {
      throw new Error("No speech detected in recording.")
    }

    return NextResponse.json({ text: transcribedText }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice transcription failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
