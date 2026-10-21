import { beforeEach, describe, expect, test, vi } from "vitest"
import type { Design } from "./types"

const ORG = "aaaaaaaa-1111-4222-8333-444444444444"
const OTHER_ORG = "bbbbbbbb-1111-4222-8333-444444444444"
const DESIGN = "cccccccc-1111-4222-8333-444444444444"
const FILE = "dddddddd-1111-4222-8333-444444444444"
const CATEGORY = "eeeeeeee-1111-4222-8333-444444444444"
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])

// ---- a recording fake of the Supabase admin client ----
type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] }
const calls: Call[] = []
let nextResult: { data: unknown; error: unknown } = { data: [{ id: DESIGN, organization_id: ORG }], error: null }
const storage = {
  download: vi.fn(),
  remove: vi.fn(async () => ({ data: null, error: null })),
  createSignedUploadUrl: vi.fn(async () => ({ data: { token: "tok" }, error: null })),
}
const rpc = vi.fn(async () => ({ data: null, error: null }))

function builder(table: string) {
  const call: Call = { table, op: "select", filters: [] }
  calls.push(call)
  const chain: any = {
    insert: (payload: unknown) => ((call.op = "insert"), (call.payload = payload), chain),
    update: (payload: unknown) => ((call.op = "update"), (call.payload = payload), chain),
    delete: () => ((call.op = "delete"), chain),
    select: () => chain,
    eq: (column: string, value: unknown) => (call.filters.push([column, value]), chain),
    single: () => chain,
    then: (resolve: (value: unknown) => unknown) => resolve(nextResult),
  }
  return chain
}

const admin = { from: builder, rpc, storage: { from: () => storage } }

// ---- module mocks ----
const requireAdmin = vi.fn()
let design: Design | null = null

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/guards", () => {
  class AuthzError extends Error {}
  return { AuthzError, audit: vi.fn(async () => undefined) }
})
vi.mock("./server", () => ({
  requireDesignGalleryAdmin: () => requireAdmin(),
  loadDesign: vi.fn(async (_admin: unknown, org: string, id: string) =>
    design && design.organizationId === org && design.id === id ? design : null,
  ),
  loadCategories: vi.fn(async () => [{ id: CATEGORY }]),
  loadSite: vi.fn(async () => null),
}))

const actions = await import("./actions")
const { AuthzError } = await import("@/lib/auth/guards")

function makeDesign(overrides: Partial<Design> = {}): Design {
  return {
    id: DESIGN,
    organizationId: ORG,
    categoryId: CATEGORY,
    slug: "villa",
    code: "BD-1",
    titleAr: "فيلا",
    titleEn: "Villa",
    summaryAr: null,
    summaryEn: null,
    descriptionAr: null,
    descriptionEn: null,
    floorsAr: null,
    floorsEn: null,
    builtAreaSqm: null,
    bedrooms: null,
    serviceAr: null,
    serviceEn: null,
    isBookable: true,
    status: "draft",
    sortOrder: 0,
    publishedAt: null,
    updatedAt: "2026-10-21T00:00:00Z",
    images: [],
    ...overrides,
  }
}

const validForm = { categoryId: CATEGORY, titleAr: "فيلا", titleEn: "Villa", code: "BD-1" }

beforeEach(() => {
  calls.length = 0
  nextResult = { data: { id: DESIGN }, error: null }
  design = makeDesign()
  requireAdmin.mockResolvedValue({ userId: "user-1", org: { id: ORG, name: "Bonyan" }, admin })
  storage.download.mockReset()
  storage.remove.mockClear()
  rpc.mockClear()
})

describe("authorization", () => {
  test("every action answers forbidden for a non-admin and writes nothing", async () => {
    requireAdmin.mockRejectedValue(new AuthzError("no"))
    const results = await Promise.all([
      actions.saveDesign(null, validForm),
      actions.setDesignStatus(DESIGN, "published"),
      actions.deleteDesign(DESIGN),
      actions.prepareDesignImageUpload(DESIGN, { name: "a.jpg", size: 10, type: "image/jpeg" }),
      actions.finalizeDesignImageUpload(DESIGN, `${ORG}/${DESIGN}/${FILE}.jpg`),
      actions.deleteDesignImage(DESIGN, FILE),
      actions.reorderDesignImages(DESIGN, []),
      actions.saveDesignGallerySite({}),
      actions.activateDesignGallery(),
    ])
    expect(results.every((r) => !r.ok && r.error === "forbidden")).toBe(true)
    expect(calls.filter((c) => c.op !== "select")).toEqual([])
  })

  test("a design of another organization is not found, and nothing is written", async () => {
    design = makeDesign({ organizationId: OTHER_ORG })
    expect(await actions.saveDesign(DESIGN, validForm)).toEqual({ ok: false, error: "notFound" })
    expect(await actions.deleteDesign(DESIGN)).toEqual({ ok: false, error: "notFound" })
    expect(calls.filter((c) => c.op !== "select")).toEqual([])
  })
})

describe("saveDesign", () => {
  test("creates a draft in the caller's organization, ignoring an organization id sent by the client", async () => {
    const result = await actions.saveDesign(null, { ...validForm, organization_id: OTHER_ORG, status: "published" })
    expect(result).toEqual({ ok: true, data: { id: DESIGN } })
    const insert = calls.find((c) => c.op === "insert")
    expect(insert?.payload).toMatchObject({ organization_id: ORG, status: "draft", slug: "villa", code: "BD-1" })
  })

  test("returns field errors without writing when the form is invalid", async () => {
    const result = await actions.saveDesign(null, { ...validForm, titleEn: "" , code: "" })
    expect(result).toMatchObject({ ok: false, error: "invalid", fieldErrors: { titleEn: "required", code: "required" } })
    expect(calls.some((c) => c.op === "insert")).toBe(false)
  })

  test("reports a slug already used in the organization as a field error", async () => {
    nextResult = { data: null, error: { code: "23505", message: 'unique constraint "designs_org_slug_unique"' } }
    const result = await actions.saveDesign(null, validForm)
    expect(result).toEqual({ ok: false, error: "invalid", fieldErrors: { slug: "taken" } })
  })

  test("updates are scoped to the caller's organization", async () => {
    await actions.saveDesign(DESIGN, validForm)
    const update = calls.find((c) => c.op === "update")
    expect(update?.filters).toEqual([
      ["organization_id", ORG],
      ["id", DESIGN],
    ])
  })
})

describe("setDesignStatus", () => {
  test("a design without images cannot be published", async () => {
    expect(await actions.setDesignStatus(DESIGN, "published")).toEqual({ ok: false, error: "needsImage" })
    expect(calls.some((c) => c.op === "update")).toBe(false)
  })

  test("publishing sets published_at once and keeps it on later publishes", async () => {
    design = makeDesign({ images: [{ id: FILE, storagePath: "p", url: "/u", altAr: null, altEn: null, orderIndex: 0 }] })
    await actions.setDesignStatus(DESIGN, "published")
    expect((calls.find((c) => c.op === "update")?.payload as any).published_at).toEqual(expect.any(String))

    calls.length = 0
    design = makeDesign({ publishedAt: "2026-01-01T00:00:00Z", images: design.images })
    await actions.setDesignStatus(DESIGN, "published")
    expect((calls.find((c) => c.op === "update")?.payload as any).published_at).toBe("2026-01-01T00:00:00Z")
  })

  test("status changes and deletes are scoped to the caller's organization", async () => {
    await actions.setDesignStatus(DESIGN, "archived")
    await actions.deleteDesign(DESIGN)
    const writes = calls.filter((c) => c.op === "update" || c.op === "delete")
    expect(writes.map((c) => c.filters)).toEqual([
      [["organization_id", ORG], ["id", DESIGN]],
      [["organization_id", ORG], ["id", DESIGN]],
    ])
  })

  test("rejects an unknown status", async () => {
    expect(await actions.setDesignStatus(DESIGN, "deleted" as never)).toEqual({ ok: false, error: "invalid" })
  })
})

describe("image upload", () => {
  test("prepare refuses files that are not JPG/PNG/WebP or are too large", async () => {
    expect(await actions.prepareDesignImageUpload(DESIGN, { name: "a.svg", size: 10, type: "image/svg+xml" })).toEqual({
      ok: false,
      error: "invalidImage",
    })
    expect(
      await actions.prepareDesignImageUpload(DESIGN, { name: "a.jpg", size: 11 * 1024 * 1024, type: "image/jpeg" }),
    ).toEqual({ ok: false, error: "invalidImage" })
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled()
  })

  test("prepare signs a path inside the caller's organization and design", async () => {
    const result = await actions.prepareDesignImageUpload(DESIGN, { name: "a.png", size: 10, type: "image/png" })
    expect(result.ok && result.data.storagePath).toMatch(new RegExp(`^${ORG}/${DESIGN}/[0-9a-f-]{36}\\.png$`))
  })

  test("finalize refuses a path of another organization or design", async () => {
    expect(await actions.finalizeDesignImageUpload(DESIGN, `${OTHER_ORG}/${DESIGN}/${FILE}.jpg`)).toEqual({
      ok: false,
      error: "invalidImage",
    })
    expect(storage.download).not.toHaveBeenCalled()
  })

  test("finalize deletes an upload whose bytes are not an image", async () => {
    storage.download.mockResolvedValue({ data: new Blob([new TextEncoder().encode("<svg onload=x>")]), error: null })
    const path = `${ORG}/${DESIGN}/${FILE}.jpg`
    expect(await actions.finalizeDesignImageUpload(DESIGN, path)).toEqual({ ok: false, error: "invalidImage" })
    expect(storage.remove).toHaveBeenCalledWith([path])
    expect(calls.some((c) => c.op === "insert")).toBe(false)
  })

  test("finalize appends a real image after the existing ones", async () => {
    design = makeDesign({ images: [{ id: FILE, storagePath: "x", url: "/u", altAr: null, altEn: null, orderIndex: 3 }] })
    storage.download.mockResolvedValue({ data: new Blob([JPEG]), error: null })
    const path = `${ORG}/${DESIGN}/ffffffff-1111-4222-8333-444444444444.jpg`
    expect(await actions.finalizeDesignImageUpload(DESIGN, path)).toEqual({ ok: true, data: undefined })
    expect(calls.find((c) => c.op === "insert")?.payload).toEqual({
      organization_id: ORG,
      design_id: DESIGN,
      storage_path: path,
      order_index: 4,
    })
  })

  test("a repeated finalize of the same file succeeds without a second row or deleting the file", async () => {
    storage.download.mockResolvedValue({ data: new Blob([JPEG]), error: null })
    nextResult = { data: null, error: { code: "23505", message: "design_images_storage_path_unique" } }
    const path = `${ORG}/${DESIGN}/${FILE}.jpg`
    expect(await actions.finalizeDesignImageUpload(DESIGN, path)).toEqual({ ok: true, data: undefined })
    expect(storage.remove).not.toHaveBeenCalled()
  })
})

describe("deleteDesignImage", () => {
  const image = { id: FILE, storagePath: `${ORG}/${DESIGN}/${FILE}.jpg`, url: "/u", altAr: null, altEn: null, orderIndex: 0 }

  test("the last image of a published design cannot be removed", async () => {
    design = makeDesign({ status: "published", images: [image] })
    expect(await actions.deleteDesignImage(DESIGN, FILE)).toEqual({ ok: false, error: "needsImage" })
  })

  test("removes the row and the uploaded file, but never a bundled sample file", async () => {
    design = makeDesign({ images: [image] })
    expect(await actions.deleteDesignImage(DESIGN, FILE)).toEqual({ ok: true, data: undefined })
    expect(storage.remove).toHaveBeenCalledWith([image.storagePath])

    storage.remove.mockClear()
    design = makeDesign({ images: [{ ...image, storagePath: "/design-gallery/samples/bonyan/villa.webp" }] })
    expect(await actions.deleteDesignImage(DESIGN, FILE)).toEqual({ ok: true, data: undefined })
    expect(storage.remove).not.toHaveBeenCalled()
  })
})

describe("reorderDesignImages", () => {
  test("rejects ids that are not UUIDs before calling the database", async () => {
    expect(await actions.reorderDesignImages(DESIGN, ["1; drop table designs"])).toEqual({ ok: false, error: "invalid" })
    expect(rpc).not.toHaveBeenCalled()
  })
})
