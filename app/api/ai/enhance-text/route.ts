import { NextRequest, NextResponse } from "next/server"
import { assertProjectMember, AuthzError } from "@/lib/auth/guards"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
const OPENAI_MODEL = process.env.OPENAI_TRANSLATION_MODEL?.trim() || "gpt-4o-mini"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const text = typeof body.text === "string" ? body.text.trim() : ""
    const action = typeof body.action === "string" ? body.action : "translate_en"
    const projectId = typeof body.projectId === "string" ? body.projectId : null

    if (!text) {
      return NextResponse.json({ error: "No text provided for AI processing." }, { status: 400 })
    }

    if (projectId) {
      await assertProjectMember(projectId).catch(() => undefined)
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
      return NextResponse.json({ error: "AI service is not configured. OPENAI_API_KEY is missing." }, { status: 500 })
    }

    let systemPrompt = ""
    if (action === "translate_en") {
      systemPrompt = [
        "You are a senior civil engineer and site inspection consultant.",
        "Your task is to translate the user's site inspection notes (which may be in Persian, Arabic, or informal engineering notes) into professional, standard civil engineering English.",
        "CRITICAL RULES:",
        "1. Use exact civil engineering and construction site terminology (e.g. formwork, rebar, shuttering, beam level, concrete pour, slump test, compaction, honeycomb, expansion joint, curing).",
        "2. Keep all numbers, dimensions, dates, axis/grid references, and factual observations EXACTLY as provided in the input.",
        "3. DO NOT invent any extra facts, observations, or numbers that are not in the source text.",
        "4. Return clean, well-formatted HTML with simple <p>, <ul>, <li>, or <strong> tags suitable for a site inspection report.",
      ].join("\n")
    } else {
      systemPrompt = [
        "You are a senior construction quality control manager.",
        "Your task is to enhance the style, grammar, structure, and readability of the user's site inspection notes.",
        "CRITICAL RULES:",
        "1. Improve the tone, clarity, and formatting to look like a professional site inspection report.",
        "2. Keep all numbers, dimensions, grid lines, and technical details EXACTLY unchanged.",
        "3. DO NOT invent any new facts, findings, or observations that were not in the original text.",
        "4. DO NOT change the core meaning.",
        "5. Return clean, well-formatted HTML with simple <p>, <ul>, <li>, or <strong> tags.",
      ].join("\n")
    }

    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        store: false,
        max_output_tokens: 4000,
        input: [
          { role: "developer", content: [{ type: "input_text", text: systemPrompt }] },
          { role: "user", content: [{ type: "input_text", text: `INPUT TEXT:\n${text}` }] },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(payload?.error?.message || `OpenAI request failed with status ${response.status}.`)
    }

    let resultText = ""
    if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
      resultText = payload.output_text.trim()
    } else for (const item of payload?.output ?? []) {
      for (const content of item?.content ?? []) {
        if ((content?.type === "output_text" || content?.type === "text") && typeof content.text === "string") {
          resultText += content.text
        }
      }
    }

    resultText = resultText.trim()
    if (!resultText) {
      throw new Error("AI service returned empty result.")
    }

    // Strip ```html markdown wrappers if present
    if (resultText.startsWith("```")) {
      resultText = resultText.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim()
    }

    return NextResponse.json({ resultText }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof AuthzError ? error.message : error instanceof Error ? error.message : "AI processing failed." },
      { status: error instanceof AuthzError ? 403 : 500 },
    )
  }
}
