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
    const html = typeof body.html === "string" ? body.html.trim() : ""
    const action = typeof body.action === "string" ? body.action : "translate_en"
    const projectId = typeof body.projectId === "string" ? body.projectId : null

    const inputContent = html || text
    if (!inputContent) {
      return NextResponse.json({ error: "No content provided for AI processing." }, { status: 400 })
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
        "Your task is to translate site inspection notes (which may contain HTML tags, bullet points <ul>/<li>, or informal Persian/Arabic text) into professional, standard civil engineering English.",
        "CRITICAL REQUIREMENTS:",
        "1. PRESERVE STRUCTURE: If the input contains bullet points <ul>/<li> or list items, maintain them as <ul><li>...</li></ul> in the output. Do NOT flatten list items into a single paragraph.",
        "2. Professional Terminology: Use exact civil engineering and construction site terminology (e.g. formwork, rebar, shuttering, beam level, concrete pour, slump test, compaction, honeycomb, expansion joint, curing).",
        "3. Exact Details: Keep all numbers, dimensions, dates, axis/grid references, and factual observations EXACTLY as provided.",
        "4. DO NOT invent any extra facts, observations, or numbers that are not in the source text.",
        "5. Output Format: Return ONLY clean HTML (e.g., <ul><li>...</li></ul> or <p>...</p>) suitable for a rich-text report editor.",
      ].join("\n")
    } else if (action === "translate_ar") {
      systemPrompt = [
        "You are a senior civil engineer and construction correspondence consultant.",
        "Your task is to translate standard construction correspondence or letter text into professional, formal Arabic appropriate for official construction site correspondence (RFI, NCR, MIR, Submittal, Transmittal, Notice, Memorandum).",
        "CRITICAL REQUIREMENTS:",
        "1. ARABIC PLAIN TEXT ONLY: Return ONLY clean Arabic plain text. ABSOLUTELY NO HTML TAGS (do NOT use <div>, <p>, <h2>, <h1>, <br>, <span>, <strong>, etc.) and NO Markdown code fences (```).",
        "2. NO RTL WRAPPER TAGS: Do NOT wrap output in <div dir=\"rtl\"> or any HTML attributes. Text direction is handled by the application UI.",
        "3. PRESERVE STRUCTURE WITH LINE BREAKS: Maintain paragraph structure, section headers, and line breaks using plain newlines (\\n). Use double line breaks between paragraphs or sections.",
        "4. PRESERVE PLACEHOLDERS & VALUES: Keep all bracketed placeholders (e.g. [Enter project or site name] -> [أدخل اسم المشروع أو الموقع]), numbers, dates, grid references, standards, and codes intact with their original bracket formatting.",
        "5. Output Format: Start directly with the translated Arabic plain text content.",
      ].join("\n")
    } else {
      systemPrompt = [
        "You are a senior construction quality control manager.",
        "Your task is to enhance the professional tone, engineering clarity, and formatting of site inspection notes.",
        "CRITICAL REQUIREMENTS:",
        "1. PRESERVE STRUCTURE: If the input contains bullet points <ul>/<li> or multiple items, PRESERVE them as bullet points <ul><li>...</li></ul>. If the text lists multiple observations or actions, structure them as bullet points (<ul><li>...</li></ul>) to look clean and executive.",
        "2. DO NOT REMOVE BULLET POINTS: Under no circumstances should you flatten bullet points or list items into plain block paragraphs.",
        "3. Tone & Grammar: Improve the tone, technical vocabulary, and clarity without adding fake facts or changing numbers/grid dimensions.",
        "4. Exact Details: Keep all numbers, measurements, dates, and grid references EXACTLY unchanged.",
        "5. Output Format: Return ONLY clean HTML (e.g., <ul><li>...</li></ul> or <p>...</p>).",
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
          { role: "user", content: [{ type: "input_text", text: `INPUT HTML / TEXT:\n${inputContent}` }] },
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

    if (action === "translate_ar") {
      resultText = stripHtmlToPlainText(resultText)
    } else if (resultText.startsWith("```")) {
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
