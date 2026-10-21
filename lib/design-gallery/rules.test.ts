import { describe, expect, test } from "vitest"
import { pickDesignGalleryAdminOrg } from "./access"
import { designImagePublicUrl, designImageStoragePath, isDesignImagePathFor } from "./images"
import { canChangeStatus, siteSlugCandidates, uniqueViolationField } from "./rules"

const ORG = "aaaaaaaa-1111-4222-8333-444444444444"
const OTHER_ORG = "bbbbbbbb-1111-4222-8333-444444444444"
const DESIGN = "cccccccc-1111-4222-8333-444444444444"
const FILE = "dddddddd-1111-4222-8333-444444444444"

describe("image paths", () => {
  test("builds organization/design/file paths with the right extension", () => {
    expect(designImageStoragePath(ORG, DESIGN, FILE, "image/webp")).toBe(`${ORG}/${DESIGN}/${FILE}.webp`)
    expect(designImageStoragePath(ORG, DESIGN, FILE, "image/jpeg")).toBe(`${ORG}/${DESIGN}/${FILE}.jpg`)
  })

  test("accepts a path only for its own organization and design", () => {
    const path = `${ORG}/${DESIGN}/${FILE}.png`
    expect(isDesignImagePathFor(path, ORG, DESIGN)).toBe(true)
    expect(isDesignImagePathFor(path, OTHER_ORG, DESIGN)).toBe(false)
    expect(isDesignImagePathFor(`${ORG}/${DESIGN}/../${FILE}.png`, ORG, DESIGN)).toBe(false)
    expect(isDesignImagePathFor(`${ORG}/${DESIGN}/${FILE}.svg`, ORG, DESIGN)).toBe(false)
    expect(isDesignImagePathFor("/design-gallery/samples/bonyan/x.webp", ORG, DESIGN)).toBe(false)
  })

  test("public URLs: bundled samples as-is, uploads from the public bucket, anything else refused", () => {
    expect(designImagePublicUrl("/design-gallery/samples/bonyan/modern-villa-pool.webp", "https://x.supabase.co")).toBe(
      "/design-gallery/samples/bonyan/modern-villa-pool.webp",
    )
    expect(designImagePublicUrl(`${ORG}/${DESIGN}/${FILE}.jpg`, "https://x.supabase.co/")).toBe(
      `https://x.supabase.co/storage/v1/object/public/design-gallery/${ORG}/${DESIGN}/${FILE}.jpg`,
    )
    expect(designImagePublicUrl("https://evil.example/x.jpg", "https://x.supabase.co")).toBeNull()
    expect(designImagePublicUrl("javascript:alert(1)", "https://x.supabase.co")).toBeNull()
    expect(designImagePublicUrl("/design-gallery/samples/../../etc/passwd", "https://x.supabase.co")).toBeNull()
    expect(designImagePublicUrl(`${ORG}/${DESIGN}/${FILE}.jpg`, undefined)).toBeNull()
  })
})

describe("rules", () => {
  test("publishing needs at least one image; other statuses do not", () => {
    expect(canChangeStatus("published", 0)).toBe("needsImage")
    expect(canChangeStatus("published", 1)).toBe("ok")
    expect(canChangeStatus("draft", 0)).toBe("ok")
    expect(canChangeStatus("archived", 0)).toBe("ok")
  })

  test("maps unique violations to the form field", () => {
    expect(uniqueViolationField({ code: "23505", message: 'duplicate key value violates unique constraint "designs_org_slug_unique"' })).toBe("slug")
    expect(uniqueViolationField({ code: "23505", message: 'violates unique constraint "designs_org_code_unique"' })).toBe("code")
    expect(uniqueViolationField({ code: "23505", message: 'violates unique constraint "something_else"' })).toBeNull()
    expect(uniqueViolationField({ code: "23503", message: "designs_org_slug_unique" })).toBeNull()
    expect(uniqueViolationField(null)).toBeNull()
  })

  test("gallery slugs come from the organization name, with numbered and id-based fallbacks", () => {
    expect(siteSlugCandidates("Bonyan Engineering Consultancy", ORG)).toEqual([
      "bonyan-engineering-consultancy",
      "bonyan-engineering-consultancy-2",
      "bonyan-engineering-consultancy-3",
      "org-aaaaaaaa",
    ])
    expect(siteSlugCandidates("بنيان", ORG)).toEqual(["org-aaaaaaaa"])
  })
})

describe("pickDesignGalleryAdminOrg", () => {
  const supervising = { id: ORG, name: "Bonyan", type: "supervising" }
  const external = { id: OTHER_ORG, name: "Contractor", type: "external" }

  test("prefers the supervising organization the user administers", () => {
    expect(
      pickDesignGalleryAdminOrg([
        { role: "org_admin", organization: external },
        { role: "org_admin", organization: supervising },
      ]),
    ).toEqual({ id: ORG, name: "Bonyan" })
  })

  test("falls back to another organization the user administers", () => {
    expect(pickDesignGalleryAdminOrg([{ role: "org_admin", organization: external }])).toEqual({
      id: OTHER_ORG,
      name: "Contractor",
    })
  })

  test("members, managers and viewers get nothing", () => {
    expect(
      pickDesignGalleryAdminOrg([
        { role: "org_member", organization: supervising },
        { role: "org_manager", organization: supervising },
        { role: "viewer", organization: supervising },
      ]),
    ).toBeNull()
    expect(pickDesignGalleryAdminOrg([])).toBeNull()
  })
})
