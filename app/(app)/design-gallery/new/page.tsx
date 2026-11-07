import { redirect } from "next/navigation"
import { DesignEditor } from "@/components/design-gallery/design-editor"
import { getDesignGalleryAdmin, loadCategories, loadSite } from "@/lib/design-gallery/server"
import { DesignGalleryAdminOnly } from "../admin-only"

export const dynamic = "force-dynamic"

export default async function NewDesignPage() {
  const ctx = await getDesignGalleryAdmin()
  if (!ctx) return <DesignGalleryAdminOnly />

  const [site, categories] = await Promise.all([loadSite(ctx.admin, ctx.org.id), loadCategories(ctx.admin, ctx.org.id)])
  if (!site) redirect("/design-gallery")

  return <DesignEditor design={null} categories={categories} />
}
