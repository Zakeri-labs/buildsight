import { DesignGalleryAdmin } from "@/components/design-gallery/design-gallery-admin"
import { getDesignGalleryAdmin, loadCategories, loadDesigns, loadSite } from "@/lib/design-gallery/server"
import { DesignGalleryAdminOnly } from "./admin-only"

export const dynamic = "force-dynamic"

export default async function DesignGalleryPage() {
  const ctx = await getDesignGalleryAdmin()
  if (!ctx) return <DesignGalleryAdminOnly />

  const [site, categories, designs] = await Promise.all([
    loadSite(ctx.admin, ctx.org.id),
    loadCategories(ctx.admin, ctx.org.id),
    loadDesigns(ctx.admin, ctx.org.id),
  ])

  return <DesignGalleryAdmin site={site} categories={categories} designs={designs} />
}
