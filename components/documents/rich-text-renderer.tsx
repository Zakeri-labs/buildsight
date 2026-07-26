import type { ReactNode } from "react"
import type {
  RichTextBlock,
  RichTextDocument,
  RichTextInlineNode,
  RichTextMark,
} from "@/lib/documents/rich-text"

export function RichTextRenderer({ document }: { document: RichTextDocument }) {
  return (
    <div className="document-rich-text">
      {document.content.map((block, index) => <BlockRenderer key={`${block.type}-${index}`} block={block} />)}
    </div>
  )
}

function BlockRenderer({ block }: { block: RichTextBlock }) {
  if (block.type === "image") {
    const width = Math.max(160, Math.min(960, block.attrs.width ?? 640))
    return (
      <figure className="my-6" style={{ width: `min(${width}px, 100%)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/document-images?path=${encodeURIComponent(block.attrs.storagePath)}`}
          alt={block.attrs.alt ?? ""}
          className="h-auto w-full rounded-xl border bg-muted object-contain shadow-sm"
        />
      </figure>
    )
  }

  if (block.type === "bulletList" || block.type === "orderedList") {
    const ListTag = block.type === "orderedList" ? "ol" : "ul"
    return (
      <ListTag>
        {block.content.map((item, index) => (
          <li key={index}>
            {item.content.map((paragraph, paragraphIndex) => (
              <span key={paragraphIndex}><InlineRenderer nodes={paragraph.content ?? []} /></span>
            ))}
          </li>
        ))}
      </ListTag>
    )
  }

  const style = block.attrs?.align ? { textAlign: block.attrs.align } : undefined
  if (block.type === "heading") {
    const content = <InlineRenderer nodes={block.content ?? []} />
    if (block.attrs.level === 1) return <h1 style={style}>{content}</h1>
    if (block.attrs.level === 2) return <h2 style={style}>{content}</h2>
    return <h3 style={style}>{content}</h3>
  }

  return <p style={style}><InlineRenderer nodes={block.content ?? []} /></p>
}

function InlineRenderer({ nodes }: { nodes: RichTextInlineNode[] }) {
  return nodes.map((node, index) => {
    if (node.type === "hardBreak") return <br key={index} />
    let content: ReactNode = node.text
    for (const mark of node.marks ?? []) content = applyMark(content, mark, `${index}-${mark.type}`)
    return <span key={index}>{content}</span>
  })
}

function applyMark(content: ReactNode, mark: RichTextMark, key: string): ReactNode {
  if (mark.type === "bold") return <strong key={key}>{content}</strong>
  if (mark.type === "italic") return <em key={key}>{content}</em>
  if (mark.type === "underline") return <u key={key}>{content}</u>
  const href = safeHref(mark.attrs.href)
  return <a key={key} href={href} target="_blank" rel="noopener noreferrer">{content}</a>
}

function safeHref(value: string) {
  const href = value.trim()
  return /^(https?:|mailto:|tel:)/i.test(href) ? href : "#"
}
