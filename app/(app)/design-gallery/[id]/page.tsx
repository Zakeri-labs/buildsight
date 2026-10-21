import { notFound } from "next/navigation"
import { DesignEditor } from "@/components/design-gallery/design-editor"
import { getDesignGalleryAdmin, loadCategories, loadDesign } from "@/lib/design-gallery/server"
import { isUuid } from "@/lib/design-gallery/validation"
import { DesignGalleryAdminOnly } from "../admin-only"

export const dynamic = "force-dynamic"

export default async function EditDesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getDesignGalleryAdmin()
  if (!ctx) return <DesignGalleryAdminOnly />
  if (!isUuid(id)) notFound()

  const [design, categories] = await Promise.all([
    loadDesign(ctx.admin, ctx.org.id, id),
    loadCategories(ctx.admin, ctx.org.id),
  ])
  if (!design) notFound()

  return <DesignEditor design={design} categories={categories} />
}
