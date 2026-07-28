"use client"

import { forwardRef, Fragment, type ReactNode } from "react"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

type SummaryLanguage = "en" | "ar"

type SummaryReportProps = {
  language: SummaryLanguage
  markdown: string
  projectName: string
  projectReference: string | null
  generatedAt: string
}

const LABELS = {
  en: {
    languageTitle: "English Summary",
    reportTitle: "AI Project Summary",
    project: "Project Name",
    reference: "Project Reference",
    generated: "Generated Date",
  },
  ar: {
    languageTitle: "ملخص المشروع بالعربية",
    reportTitle: "ملخص المشروع بالذكاء الاصطناعي",
    project: "اسم المشروع",
    reference: "مرجع المشروع",
    generated: "تاريخ الإنشاء",
  },
} as const

function safeLink(value: string, image = false) {
  const url = value.trim()
  if (!url) return null
  if (url.startsWith("/") || url.startsWith("#")) return url
  if (/^https?:\/\//i.test(url)) return url
  if (!image && /^(mailto:|tel:)/i.test(url)) return url
  if (image && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(url)) return url
  return null
}

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const tokenPattern = /(!?\[[^\]]*\]\([^\n)]+\)|\*\*[^\n*]+\*\*|__[^\n_]+__|`[^\n`]+`|\*[^\n*]+\*|_[^\n_]+_)/g
  let cursor = 0
  let match: RegExpExecArray | null
  let index = 0

  while ((match = tokenPattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${index++}`

    const imageMatch = token.match(/^!\[([^\]]*)\]\(([^\s)]+)(?:\s+["'][^"']*["'])?\)$/)
    if (imageMatch) {
      const src = safeLink(imageMatch[2], true)
      nodes.push(src ? (
        <span key={key} className="ai-summary-no-break my-5 block overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={imageMatch[1] || "Report evidence"} className="mx-auto block max-h-[520px] w-auto max-w-full rounded-lg object-contain" crossOrigin="anonymous" />
          {imageMatch[1] ? <span className="mt-2 block text-center text-xs text-slate-500">{imageMatch[1]}</span> : null}
        </span>
      ) : token)
      cursor = match.index + token.length
      continue
    }

    const linkMatch = token.match(/^\[([^\]]+)\]\(([^\s)]+)(?:\s+["'][^"']*["'])?\)$/)
    if (linkMatch) {
      const href = safeLink(linkMatch[2])
      nodes.push(href ? (
        <a key={key} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined} className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-2">
          {parseInline(linkMatch[1], `${key}-link`)}
        </a>
      ) : linkMatch[1])
      cursor = match.index + token.length
      continue
    }

    if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
      nodes.push(<strong key={key} className="font-bold text-slate-950">{parseInline(token.slice(2, -2), `${key}-strong`)}</strong>)
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={key} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-800">{token.slice(1, -1)}</code>)
    } else if ((token.startsWith("*") && token.endsWith("*")) || (token.startsWith("_") && token.endsWith("_"))) {
      nodes.push(<em key={key}>{parseInline(token.slice(1, -1), `${key}-em`)}</em>)
    } else {
      nodes.push(token)
    }
    cursor = match.index + token.length
  }

  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
}

function isTableDivider(line: string) {
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replaceAll(" ", "")))
}

function isHeading(line: string) {
  return /^#{1,6}\s+/.test(line)
}

function isList(line: string) {
  return /^\s*(?:[-*+•]\s+|[\d\u0660-\u0669\u06F0-\u06F9]+[.)]\s+)/.test(line)
}

function isHorizontalRule(line: string) {
  return /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)
}

function MarkdownBlocks({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n")
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const rawLine = lines[index]
    const line = rawLine.trimEnd()
    if (!line.trim()) {
      index += 1
      continue
    }

    if (/^```/.test(line.trim())) {
      const language = line.trim().slice(3).trim()
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^```/.test(lines[index].trim())) code.push(lines[index++])
      if (index < lines.length) index += 1
      blocks.push(
        <pre key={`code-${index}`} className="ai-summary-no-break my-5 overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs leading-6 text-slate-100" data-language={language || undefined}>
          <code>{code.join("\n")}</code>
        </pre>,
      )
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = Math.min(heading[1].length, 4)
      const headingClass = level === 1
        ? "mt-1 text-2xl font-bold tracking-tight text-slate-950"
        : level === 2
          ? "mt-7 border-b border-slate-200 pb-2 text-xl font-bold text-slate-950"
          : level === 3
            ? "mt-6 text-lg font-bold text-slate-900"
            : "mt-5 text-base font-bold text-slate-900"
      const content = parseInline(heading[2].replace(/^#+\s*/, ""), `heading-${index}`)
      const HeadingTag = `h${level}` as "h1" | "h2" | "h3" | "h4"
      blocks.push(<HeadingTag key={`heading-${index}`} className={cn("ai-summary-no-break mb-3 leading-tight", headingClass)}>{content}</HeadingTag>)
      index += 1
      continue
    }

    if (isHorizontalRule(line)) {
      blocks.push(<hr key={`rule-${index}`} className="my-6 border-slate-200" />)
      index += 1
      continue
    }

    if (line.trimStart().startsWith(">")) {
      const quote: string[] = []
      while (index < lines.length && lines[index].trimStart().startsWith(">")) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""))
        index += 1
      }
      blocks.push(<blockquote key={`quote-${index}`} className="ai-summary-no-break my-5 border-s-4 border-blue-500 bg-blue-50 px-4 py-3 text-slate-700">{parseInline(quote.join(" "), `quote-${index}`)}</blockquote>)
      continue
    }

    if (line.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = splitTableRow(line)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]))
        index += 1
      }
      blocks.push(
        <div key={`table-${index}`} className="ai-summary-no-break my-5 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead className="bg-slate-100">
              <tr>{headers.map((cell, cellIndex) => <th key={cellIndex} className="border-b border-slate-200 px-3 py-2.5 text-start font-bold text-slate-900">{parseInline(cell, `th-${index}-${cellIndex}`)}</th>)}</tr>
            </thead>
            <tbody>{rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-slate-100 last:border-0">
                {headers.map((_, cellIndex) => <td key={cellIndex} className="px-3 py-2.5 align-top text-slate-700">{parseInline(row[cellIndex] ?? "", `td-${index}-${rowIndex}-${cellIndex}`)}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>,
      )
      continue
    }

    const unordered = line.match(/^\s*[-*+•]\s+(.+)$/)
    const ordered = line.match(/^\s*[\d\u0660-\u0669\u06F0-\u06F9]+[.)]\s+(.+)$/)
    if (unordered || ordered) {
      const isOrdered = Boolean(ordered)
      const items: string[] = []
      while (index < lines.length) {
        const itemMatch = isOrdered
          ? lines[index].match(/^\s*[\d\u0660-\u0669\u06F0-\u06F9]+[.)]\s+(.+)$/)
          : lines[index].match(/^\s*[-*+•]\s+(.+)$/)
        if (!itemMatch) break
        items.push(itemMatch[1])
        index += 1
      }
      const ListTag = isOrdered ? "ol" : "ul"
      blocks.push(
        <ListTag key={`list-${index}`} className={cn("my-4 space-y-2 ps-6 text-slate-700", isOrdered ? "list-decimal" : "list-disc")}>
          {items.map((item, itemIndex) => <li key={itemIndex} className="ps-1 leading-7 marker:font-semibold marker:text-blue-600">{parseInline(item, `li-${index}-${itemIndex}`)}</li>)}
        </ListTag>,
      )
      continue
    }

    const paragraph: string[] = [line.trim()]
    index += 1
    while (index < lines.length) {
      const candidate = lines[index]
      if (!candidate.trim()) break
      if (isHeading(candidate) || isList(candidate) || isHorizontalRule(candidate) || candidate.trimStart().startsWith(">") || /^```/.test(candidate.trim())) break
      if (candidate.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) break
      paragraph.push(candidate.trim())
      index += 1
    }
    blocks.push(<p key={`paragraph-${index}`} className="mb-4 text-[15px] leading-7 text-slate-700">{parseInline(paragraph.join(" "), `paragraph-${index}`)}</p>)
  }

  return <>{blocks.map((block, blockIndex) => <Fragment key={blockIndex}>{block}</Fragment>)}</>
}

function formattedDate(value: string, language: SummaryLanguage) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat(language === "ar" ? "ar" : "en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export const SummaryReport = forwardRef<HTMLElement, SummaryReportProps>(function SummaryReport(
  { language, markdown, projectName, projectReference, generatedAt },
  ref,
) {
  const labels = LABELS[language]
  const isArabic = language === "ar"

  return (
    <article
      ref={ref}
      lang={language}
      dir={isArabic ? "rtl" : "ltr"}
      className={cn(
        "ai-summary-report min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-sm",
        isArabic && "font-arabic",
      )}
    >
      <div className="h-2 bg-blue-700" />
      <header className="ai-summary-no-break border-b border-slate-200 bg-slate-50 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
              <Sparkles className="size-4" />
              {labels.languageTitle}
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">{labels.reportTitle}</h2>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">AI</div>
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <MetaItem label={labels.project} value={projectName} />
          <MetaItem label={labels.reference} value={projectReference || "—"} />
          <MetaItem label={labels.generated} value={formattedDate(generatedAt, language)} className="sm:col-span-2" />
        </dl>
      </header>
      <div className="px-5 py-6 sm:px-7 sm:py-8">
        <MarkdownBlocks markdown={markdown} />
      </div>
      <footer className="ai-summary-no-break border-t border-slate-200 bg-slate-50 px-5 py-3 text-center text-[11px] text-slate-500 sm:px-7">
        {projectName} · {labels.reportTitle}
      </footer>
    </article>
  )
})

function MetaItem({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white px-3.5 py-3", className)}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-slate-900">{value}</dd>
    </div>
  )
}
