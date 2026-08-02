export type RichTextMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "link"; attrs: { href: string } }

export type RichTextInlineNode =
  | { type: "text"; text: string; marks?: RichTextMark[] }
  | { type: "hardBreak" }

export type TextAlignment = "left" | "center" | "right" | "justify"

export type RichTextParagraph = {
  type: "paragraph"
  attrs?: { align?: TextAlignment }
  content?: RichTextInlineNode[]
}

export type RichTextHeading = {
  type: "heading"
  attrs: { level: 1 | 2 | 3; align?: TextAlignment }
  content?: RichTextInlineNode[]
}

export type RichTextListItem = {
  type: "listItem"
  content: RichTextParagraph[]
}

export type RichTextBulletList = {
  type: "bulletList"
  content: RichTextListItem[]
}

export type RichTextOrderedList = {
  type: "orderedList"
  content: RichTextListItem[]
}

export type RichTextList = RichTextBulletList | RichTextOrderedList

export type RichTextImage = {
  type: "image"
  attrs: {
    storagePath: string
    src: string
    alt?: string
    width?: number
  }
}

export type RichTextBlock = RichTextParagraph | RichTextHeading | RichTextList | RichTextImage

export type RichTextDocument = {
  type: "doc"
  version: 1
  content: RichTextBlock[]
}

export const EMPTY_RICH_TEXT_DOCUMENT: RichTextDocument = {
  type: "doc",
  version: 1,
  content: [{ type: "paragraph", content: [] }],
}

const ALIGNMENTS = new Set<TextAlignment>(["left", "center", "right", "justify"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function hasValidAlignment(attrs: unknown): boolean {
  if (attrs === undefined) return true
  if (!isRecord(attrs)) return false
  return attrs.align === undefined || (typeof attrs.align === "string" && ALIGNMENTS.has(attrs.align as TextAlignment))
}

function isRichTextMark(value: unknown): value is RichTextMark {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (value.type === "bold" || value.type === "italic" || value.type === "underline") return true
  return value.type === "link"
    && isRecord(value.attrs)
    && typeof value.attrs.href === "string"
    && value.attrs.href.length <= 2_048
}

function isRichTextInlineNode(value: unknown): value is RichTextInlineNode {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (value.type === "hardBreak") return true
  return value.type === "text"
    && typeof value.text === "string"
    && value.text.length <= 200_000
    && (value.marks === undefined || (Array.isArray(value.marks) && value.marks.every(isRichTextMark)))
}

function isParagraph(value: unknown): value is RichTextParagraph {
  return isRecord(value)
    && value.type === "paragraph"
    && hasValidAlignment(value.attrs)
    && (value.content === undefined || (Array.isArray(value.content) && value.content.every(isRichTextInlineNode)))
}

function isHeading(value: unknown): value is RichTextHeading {
  if (!isRecord(value) || value.type !== "heading" || !isRecord(value.attrs)) return false
  const level = value.attrs.level
  return (level === 1 || level === 2 || level === 3)
    && hasValidAlignment(value.attrs)
    && (value.content === undefined || (Array.isArray(value.content) && value.content.every(isRichTextInlineNode)))
}

function isListItem(value: unknown): value is RichTextListItem {
  return isRecord(value)
    && value.type === "listItem"
    && Array.isArray(value.content)
    && value.content.every(isParagraph)
}

function isList(value: unknown): value is RichTextList {
  return isRecord(value)
    && (value.type === "bulletList" || value.type === "orderedList")
    && Array.isArray(value.content)
    && value.content.every(isListItem)
}

function isImage(value: unknown): value is RichTextImage {
  if (!isRecord(value) || value.type !== "image" || !isRecord(value.attrs)) return false
  const width = value.attrs.width
  return typeof value.attrs.storagePath === "string"
    && value.attrs.storagePath.length > 0
    && value.attrs.storagePath.length <= 1_024
    && typeof value.attrs.src === "string"
    && value.attrs.src.length <= 2_048
    && (value.attrs.alt === undefined || (typeof value.attrs.alt === "string" && value.attrs.alt.length <= 500))
    && (width === undefined || (typeof width === "number" && Number.isFinite(width) && width >= 80 && width <= 2_000))
}

function isBlock(value: unknown): value is RichTextBlock {
  if (!isRecord(value)) return false
  if (value.type === "paragraph") return isParagraph(value)
  if (value.type === "heading") return isHeading(value)
  if (value.type === "bulletList" || value.type === "orderedList") return isList(value)
  if (value.type === "image") return isImage(value)
  return false
}

export function isRichTextDocument(value: unknown): value is RichTextDocument {
  if (!isRecord(value)) return false
  return value.type === "doc"
    && value.version === 1
    && Array.isArray(value.content)
    && value.content.length <= 10_000
    && value.content.every(isBlock)
}

export function richTextHasContent(document: RichTextDocument): boolean {
  return document.content.some((block) => {
    if (block.type === "image") return Boolean(block.attrs.storagePath)
    if (block.type === "bulletList" || block.type === "orderedList") {
      return block.content.some((item) =>
        item.content.some((paragraph) =>
          paragraph.content?.some((node) => node.type === "text" && node.text.trim().length > 0),
        ),
      )
    }
    return block.content?.some((node) => node.type === "text" && node.text.trim().length > 0) ?? false
  })
}

export function getRichTextImagePaths(document: RichTextDocument): string[] {
  return document.content
    .filter((block): block is RichTextImage => block.type === "image")
    .map((block) => block.attrs.storagePath)
}
