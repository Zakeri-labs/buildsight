import { NextRequest, NextResponse } from "next/server"
import { assertProjectMember, AuthzError } from "@/lib/auth/guards"
import { stripHtmlToPlainText } from "@/lib/documents/bilingual-details"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
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
        "You are an automated civil engineering document processing utility for construction site supervision.",
        "Your sole task is to translate site inspection notes (which may contain HTML tags, bullet points <ul>/<li>, or informal Persian/Arabic text) into professional, standard civil engineering English.",
        "CRITICAL REQUIREMENTS:",
        "1. Direct Execution: Always translate the input text into professional civil engineering English. Never output conversational commentary, meta-disclaimers, or refusal statements.",
        "2. PRESERVE STRUCTURE: If the input contains bullet points <ul>/<li> or list items, maintain them as <ul><li>...</li></ul> in the output. Do NOT flatten list items into a single paragraph.",
        "3. Professional Terminology: Use exact civil engineering and construction site terminology (e.g. formwork, rebar, shuttering, beam level, concrete pour, slump test, compaction, honeycomb, expansion joint, curing).",
        "4. Exact Details: Keep all numbers, dimensions, dates, axis/grid references, and factual observations EXACTLY as provided.",
        "5. Output Format: Return ONLY clean HTML (e.g., <ul><li>...</li></ul> or <p>...</p>) suitable for direct rich-text insertion.",
      ].join("\n")
    } else if (action === "translate_ar") {
      systemPrompt = [
        "You are an automated civil engineering document processing utility for official site correspondence.",
        "Your task is to translate standard construction correspondence or letter text into professional, formal Arabic appropriate for official construction site correspondence (RFI, NCR, MIR, Submittal, Transmittal, Notice, Memorandum).",
        "CRITICAL REQUIREMENTS:",
        "1. ARABIC PLAIN TEXT ONLY: Return ONLY clean Arabic plain text. ABSOLUTELY NO HTML TAGS and NO Markdown code fences (```).",
        "2. NO RTL WRAPPER TAGS: Do NOT wrap output in <div dir=\"rtl\"> or any HTML attributes. Text direction is handled by the application UI.",
        "3. PRESERVE STRUCTURE WITH LINE BREAKS: Maintain paragraph structure, section headers, and line breaks using plain newlines (\\n).",
        "4. PRESERVE PLACEHOLDERS & VALUES: Keep all bracketed placeholders, numbers, dates, grid references, standards, and codes intact.",
        "5. Output Format: Start directly with the translated Arabic plain text content.",
      ].join("\n")
    } else {
      systemPrompt = [
        "You are an automated civil engineering site inspection report assistant for construction quality management.",
        "Your task is to transform informal, draft, or voice-recorded site inspection notes into a comprehensive, highly professional, standard civil engineering inspection report.",
        "",
        "CRITICAL REQUIREMENTS:",
        "1. Direct Execution: Always process and expand the input notes into formal site inspection statements. Never output conversational responses, politeness phrases, or refusal statements.",
        "",
        "2. STRICT SAME LANGUAGE REQUIREMENT: ALWAYS output the enhanced report in the EXACT SAME LANGUAGE as the input text (e.g. if input is in Persian/Farsi, output in formal professional Persian; if input is in Arabic, output in formal Arabic; if English, output in English).",
        "",
        "3. EXPAND AND ELABORATE: Fully expand raw inspection notes into detailed technical engineering statements using precise civil engineering terminology in the SAME input language.",
        "",
        "4. SECTION DIVISION & MARKERS: Divide the report into EXACTLY TWO distinct sections wrapped in explicit HTML comments:",
        "   <!-- SECTION: OBSERVATIONS -->",
        "   <p><strong>Observations / مشاهدات و ملاحظات / الملاحظات:</strong></p>",
        "   <p>(A) ...</p>",
        "   <!-- END: OBSERVATIONS -->",
        "",
        "   <!-- SECTION: DIRECTIVES -->",
        "   <p><strong>Directives / دستورالعمل‌ها و ابلاغیه‌ها / التوجيهات:</strong></p>",
        "   <ul>",
        "     <li>...</li>",
        "   </ul>",
        "   <!-- END: DIRECTIVES -->",
        "",
        "5. SECTION 1 - OBSERVATIONS FORMATTING:",
        "   - Title: Observations header in the input language.",
        "   - List each individual observation on its own paragraph.",
        "   - Prefix each item with uppercase letter indicators in parentheses: (A), (B), (C), (D)... (or (أ), (ب), (ج), (د)... if in Arabic/Persian).",
        "",
        "6. SECTION 2 - DIRECTIVES FORMATTING:",
        "   - Title: Directives header in the input language.",
        "   - List the actionable corrective instructions as a bulleted list (<ul><li>...</li></ul> in HTML).",
        "",
        "7. ACCURACY & INTEGRITY:",
        "   - Do NOT change numbers, grid axes, or factual measurements provided in the input.",
      ].join("\n")
    }

    const resolvedModel = OPENAI_MODEL.startsWith("gpt-5") ? "gpt-4o-mini" : OPENAI_MODEL

    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `INPUT HTML / TEXT:\n${inputContent}` },
        ],
        temperature: 0.2,
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(45_000),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(payload?.error?.message || `OpenAI request failed with status ${response.status}.`)
    }

    let resultText = ""
    const messageObj = payload?.choices?.[0]?.message
    if (typeof messageObj?.content === "string") {
      resultText = messageObj.content.trim()
    } else if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
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

    if (
      messageObj?.refusal ||
      /I'm sorry, but I cannot assist/i.test(resultText) ||
      /as an AI language model, I cannot/i.test(resultText) ||
      /I cannot fulfill this request/i.test(resultText)
    ) {
      throw new Error("AI service refused processing for this input. Please provide valid site inspection notes.")
    }

    if (action === "translate_ar") {
      resultText = stripHtmlToPlainText(resultText)
    } else if (resultText.startsWith("```")) {
      resultText = resultText.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim()
    }

    let observations = ""
    let recommendations = ""

    if (action === "enhance_style") {
      const obsMatch = resultText.match(/<!-- SECTION: OBSERVATIONS -->([\s\S]*?)<!-- END: OBSERVATIONS -->/i)
      const dirMatch = resultText.match(/<!-- SECTION: DIRECTIVES -->([\s\S]*?)<!-- END: DIRECTIVES -->/i)

      if (obsMatch && obsMatch[1]) {
        observations = obsMatch[1].trim()
      }
      if (dirMatch && dirMatch[1]) {
        recommendations = dirMatch[1].trim()
      }

      if (!observations && !recommendations) {
        const splitRegex = /<p[^>]*>\s*<strong>\s*(?:Directives|التوجيهات|دستورالعمل‌ها|دستورالعمل|توجيهات|Recommendations|Directives:)\b[\s\S]*/i
        const match = resultText.match(splitRegex)
        if (match && match.index !== undefined && match.index > 0) {
          observations = resultText.slice(0, match.index).trim()
          recommendations = resultText.slice(match.index).trim()
        } else {
          observations = resultText
        }
      }
    }

    const cleanResultText = resultText.replace(/<!--[\s\S]*?-->/g, "").trim()

    return NextResponse.json({
      resultText: cleanResultText,
      observations: observations.replace(/<!--[\s\S]*?-->/g, "").trim(),
      recommendations: recommendations.replace(/<!--[\s\S]*?-->/g, "").trim(),
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof AuthzError ? error.message : error instanceof Error ? error.message : "AI processing failed." },
      { status: error instanceof AuthzError ? 403 : 500 },
    )
  }
}
