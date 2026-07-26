"use client"

import type {
  RichTextBlock,
  RichTextDocument,
  RichTextInlineNode,
  RichTextList,
  RichTextMark,
} from "@/lib/documents/rich-text"

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "UL", "OL", "FIGURE"])

function normalizeAlign(value: string | null): "left" | "center" | "right" | "justify" | undefined {
  if (value === "left" || value === "center" || value === "right" || value === "justify") return value
  return undefined
}

function marksForElement(element: HTMLElement, inherited: RichTextMark[]): RichTextMark[] {
  const next = [...inherited]
  const tag = element.tagName
  const style = element.style

  if ((tag === "B" || tag === "STRONG" || style.fontWeight === "bold" || Number(style.fontWeight) >= 600) && !next.some((mark) => mark.type === "bold")) {
    next.push({ type: "bold" })
  }
  if ((tag === "I" || tag === "EM" || style.fontStyle === "italic") && !next.some((mark) => mark.type === "italic")) {
    next.push({ type: "italic" })
  }
  if ((tag === "U" || style.textDecorationLine.includes("underline")) && !next.some((mark) => mark.type === "underline")) {
    next.push({ type: "underline" })
  }
  if (tag === "A") {
    const href = element.getAttribute("href")?.trim()
    if (href) next.push({ type: "link", attrs: { href } })
  }

  return next
}

function serializeInlineNodes(node: Node, inheritedMarks: RichTextMark[] = []): RichTextInlineNode[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ""
    if (!text) return []
    return [{ type: "text", text, ...(inheritedMarks.length ? { marks: inheritedMarks } : {}) }]
  }

  if (!(node instanceof HTMLElement)) return []
  if (node.tagName === "BR") return [{ type: "hardBreak" }]
  if (BLOCK_TAGS.has(node.tagName) && node.tagName !== "DIV") return []

  const marks = marksForElement(node, inheritedMarks)
  return Array.from(node.childNodes).flatMap((child) => serializeInlineNodes(child, marks))
}

function inlineFromElement(element: HTMLElement): RichTextInlineNode[] {
  return Array.from(element.childNodes).flatMap((child) => serializeInlineNodes(child))
}

function paragraphFromElement(element: HTMLElement): RichTextBlock {
  const align = normalizeAlign(element.style.textAlign || element.getAttribute("align"))
  const content = inlineFromElement(element)
  if (/^H[1-3]$/.test(element.tagName)) {
    return {
      type: "heading",
      attrs: { level: Number(element.tagName.slice(1)) as 1 | 2 | 3, ...(align ? { align } : {}) },
      content,
    }
  }
  return { type: "paragraph", ...(align ? { attrs: { align } } : {}), content }
}

function listFromElement(element: HTMLUListElement | HTMLOListElement): RichTextList {
  return {
    type: element.tagName === "OL" ? "orderedList" : "bulletList",
    content: Array.from(element.children)
      .filter((child): child is HTMLLIElement => child instanceof HTMLLIElement)
      .map((item) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: inlineFromElement(item) }],
      })),
  }
}

function imageFromElement(element: HTMLElement): RichTextBlock | null {
  const image = element.querySelector("img")
  const storagePath = element.dataset.storagePath?.trim()
  if (!image || !storagePath) return null
  const measured = Math.round(element.getBoundingClientRect().width)
  const storedWidth = Number(element.dataset.width)
  const width = Number.isFinite(measured) && measured > 0 ? measured : Number.isFinite(storedWidth) ? storedWidth : 640
  return {
    type: "image",
    attrs: {
      storagePath,
      src: image.getAttribute("src") ?? `/api/document-images?path=${encodeURIComponent(storagePath)}`,
      alt: image.getAttribute("alt") ?? "",
      width,
    },
  }
}

export function serializeRichText(root: HTMLElement): RichTextDocument {
  const content: RichTextBlock[] = []

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? ""
      if (text.trim()) content.push({ type: "paragraph", content: [{ type: "text", text }] })
      continue
    }
    if (!(child instanceof HTMLElement)) continue

    if (child.matches("figure[data-document-image]")) {
      const image = imageFromElement(child)
      if (image) content.push(image)
      continue
    }
    if (child instanceof HTMLUListElement || child instanceof HTMLOListElement) {
      content.push(listFromElement(child))
      continue
    }
    if (["P", "DIV", "H1", "H2", "H3"].includes(child.tagName)) {
      content.push(paragraphFromElement(child))
      continue
    }

    const inline = inlineFromElement(child)
    if (inline.length) content.push({ type: "paragraph", content: inline })
  }

  return {
    type: "doc",
    version: 1,
    content: content.length ? content : [{ type: "paragraph", content: [] }],
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function safeHref(value: string): string {
  const trimmed = value.trim()
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed
  return "#"
}

function renderInline(nodes: RichTextInlineNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "hardBreak") return "<br>"
      let value = escapeHtml(node.text)
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") value = `<strong>${value}</strong>`
        if (mark.type === "italic") value = `<em>${value}</em>`
        if (mark.type === "underline") value = `<u>${value}</u>`
        if (mark.type === "link") value = `<a href="${escapeHtml(safeHref(mark.attrs.href))}" target="_blank" rel="noopener noreferrer">${value}</a>`
      }
      return value
    })
    .join("")
}

function alignStyle(align?: string): string {
  return align ? ` style="text-align:${align}"` : ""
}

export function richTextToEditorHtml(document: RichTextDocument): string {
  return document.content
    .map((block) => {
      if (block.type === "paragraph") return `<p${alignStyle(block.attrs?.align)}>${renderInline(block.content) || "<br>"}</p>`
      if (block.type === "heading") return `<h${block.attrs.level}${alignStyle(block.attrs.align)}>${renderInline(block.content) || "<br>"}</h${block.attrs.level}>`
      if (block.type === "bulletList" || block.type === "orderedList") {
        const tag = block.type === "orderedList" ? "ol" : "ul"
        const items = block.content
          .map((item) => `<li>${item.content.map((paragraph) => renderInline(paragraph.content)).join("<br>") || "<br>"}</li>`)
          .join("")
        return `<${tag}>${items}</${tag}>`
      }
      if (block.type === "image") {
        const width = Math.max(160, Math.min(960, block.attrs.width ?? 640))
        const src = `/api/document-images?path=${encodeURIComponent(block.attrs.storagePath)}`
        return `<figure data-document-image data-storage-path="${escapeHtml(block.attrs.storagePath)}" data-width="${width}" contenteditable="false" style="width:${width}px"><img src="${escapeHtml(src)}" alt="${escapeHtml(block.attrs.alt ?? "")}" draggable="false"><button type="button" data-remove-image aria-label="Remove image">×</button></figure>`
      }
      return ""
    })
    .join("")
}
