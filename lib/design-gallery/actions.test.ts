import { beforeEach, describe, expect, test, vi } from "vitest"
import type { Design, DesignImage } from "./types"

const ORG = "aaaaaaaa-1111-4222-8333-444444444444"
const OTHER_ORG = "bbbbbbbb-1111-4222-8333-444444444444"
const DESIGN = "cccccccc-1111-4222-8333-444444444444"
const FILE = "dddddddd-1111-4222-8333-444444444444"
const FILE2 = "ffffffff-1111-4222-8333-444444444444"
const CATEGORY = "eeeeeeee-1111-4222-8333-444444444444"
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
const UPDATED_AT = "2026-10-21T10:00:00.123456+00:00"

// ---- a recording fake of the Supabase admin client ----
type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] }
const calls: Call[] = []
let tableResult: { data: unknown; error: unknown } = { data: [{ id: DESIGN, updated_at: UPDATED_AT }], error: null }
const storage = {
  download: vi.fn(),
  list: vi.fn(async () => ({ data: [] as { name: string }[], error: null })),
  remove: vi.fn(async () => ({ data: null, error: null as unknown })),
  createSignedUploadUrl: vi.fn(async () => ({ data: { token: "tok" }, error: null })),
}
const rpc = vi.fn(async () => ({ data: null, error: null as unknown }))

function builder(table: string) {
  const call: Call = { table, op: "select", filters: [] }
  calls.push(call)
  const chain: any = {
    insert: (payload: unknown) => ((call.op = "insert"), (call.payload = payload), chain),
    update: (payload: unknown) => ((call.op = "update"), (call.payload = payload), chain),
    delete: () => ((call.op = "delete"), chain),
    select: () => chain,
    eq: (column: string, value: unknown) => (call.filters.push([column, value]), chain),
    then: (resolve: (value: unknown) => unknown) => resolve(tableResult),
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

const image = (id: string, storagePath: string, orderIndex = 0): DesignImage => ({
  id,
  storagePath,
  url: "/u",
  altAr: null,
  altEn: null,
  orderIndex,
})

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
    updatedAt: UPDATED_AT,
    images: [],
    ...overrides,
  }
}

const validForm = { categoryId: CATEGORY, titleAr: "فيلا", titleEn: "Villa", code: "BD-1", expectedUpdatedAt: UPDATED_AT }
const writes = () => calls.filter((c) => c.op !== "select")

beforeEach(() => {
  calls.length = 0
  tableResult = { data: [{ id: DESIGN, updated_at: UPDATED_AT }], error: null }
  design = makeDesign()
  requireAdmin.mockResolvedValue({ userId: "user-1", org: { id: ORG, name: "Bonyan" }, admin })
  storage.download.mockReset()
  storage.list.mockClear()
  storage.remove.mockReset()
  storage.remove.mockResolvedValue({ data: null, error: null })
  storage.createSignedUploadUrl.mockClear()
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null })
})

describe("authorization", () => {
  test("every action answers forbidden for a non-admin and touches nothing", async () => {
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
      actions.saveBookingSettings({}),
      actions.activateDesignGallery(),
    ])
    expect(results.every((r) => !r.ok && r.error === "forbidden")).toBe(true)
    expect(writes()).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
    expect(storage.remove).not.toHaveBeenCalled()
  })

  test("a signed-out caller is redirected, not shown a generic failure", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/auth/login;307;" })
    requireAdmin.mockRejectedValue(redirect)
    await expect(actions.saveDesign(null, validForm)).rejects.toBe(redirect)
  })

  test("a design of another organization is not found, and nothing is written", async () => {
    design = makeDesign({ organizationId: OTHER_ORG })
    expect(await actions.saveDesign(DESIGN, validForm)).toEqual({ ok: false, error: "notFound" })
    expect(await actions.deleteDesign(DESIGN)).toEqual({ ok: false, error: "notFound" })
    expect(await actions.deleteDesignImage(DESIGN, FILE)).toEqual({ ok: false, error: "notFound" })
    expect(writes()).toEqual([])
  })
})

describe("saveDesign", () => {
  test("creates a draft in the caller's organization, ignoring an organization id or status sent by the client", async () => {
    const result = await actions.saveDesign(null, { ...validForm, organization_id: OTHER_ORG, status: "published" })
    expect(result).toEqual({ ok: true, data: { id: DESIGN, updatedAt: UPDATED_AT } })
    expect(writes()[0].payload).toMatchObject({ organization_id: ORG, status: "draft", slug: "villa", code: "BD-1" })
  })

  test("returns field errors without writing when the form is invalid", async () => {
    const result = await actions.saveDesign(null, { ...validForm, titleEn: "", code: "" })
    expect(result).toMatchObject({ ok: false, error: "invalid", fieldErrors: { titleEn: "required", code: "required" } })
    expect(writes()).toEqual([])
  })

  test("reports a slug already used in the organization as a field error", async () => {
    tableResult = { data: null, error: { code: "23505", message: 'unique constraint "designs_org_slug_unique"' } }
    expect(await actions.saveDesign(null, validForm)).toEqual({ ok: false, error: "invalid", fieldErrors: { slug: "taken" } })
  })

  test("updates only the version the form was loaded with, in the caller's organization", async () => {
    await actions.saveDesign(DESIGN, validForm)
    expect(writes()[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", DESIGN],
      ["updated_at", UPDATED_AT],
    ])
  })

  test("someone else saved in between: nothing is overwritten and the editor is told", async () => {
    tableResult = { data: [], error: null }
    expect(await actions.saveDesign(DESIGN, validForm)).toEqual({ ok: false, error: "stale" })
  })

  test("an update without the loaded version is refused before writing", async () => {
    const { expectedUpdatedAt: _drop, ...form } = validForm
    expect(await actions.saveDesign(DESIGN, form)).toEqual({ ok: false, error: "stale" })
    expect(writes()).toEqual([])
  })
})

describe("setDesignStatus", () => {
  test("a design without images cannot be published", async () => {
    expect(await actions.setDesignStatus(DESIGN, "published")).toEqual({ ok: false, error: "needsImage" })
    expect(writes()).toEqual([])
  })

  test("the database refusing (an image removed meanwhile) is reported as needsImage", async () => {
    design = makeDesign({ images: [image(FILE, "p")] })
    tableResult = { data: null, error: { code: "23514", message: "design_needs_image: a published design needs at least one image" } }
    expect(await actions.setDesignStatus(DESIGN, "published")).toEqual({ ok: false, error: "needsImage" })
  })

  test("publishing sets published_at once and keeps it on later publishes", async () => {
    design = makeDesign({ images: [image(FILE, "p")] })
    await actions.setDesignStatus(DESIGN, "published")
    expect((writes()[0].payload as any).published_at).toEqual(expect.any(String))

    calls.length = 0
    design = makeDesign({ publishedAt: "2026-01-01T00:00:00Z", images: design.images })
    await actions.setDesignStatus(DESIGN, "published")
    expect((writes()[0].payload as any).published_at).toBe("2026-01-01T00:00:00Z")
  })

  test("status changes and deletes are scoped to the caller's organization", async () => {
    await actions.setDesignStatus(DESIGN, "archived")
    await actions.deleteDesign(DESIGN)
    expect(writes().map((c) => c.filters)).toEqual([
      [["organization_id", ORG], ["id", DESIGN]],
      [["organization_id", ORG], ["id", DESIGN]],
    ])
  })

  test("rejects an unknown status", async () => {
    expect(await actions.setDesignStatus(DESIGN, "deleted" as never)).toEqual({ ok: false, error: "invalid" })
  })
})

describe("deleteDesign", () => {
  test("removes every upload in the design's folder (finalized or not), and nothing outside it", async () => {
    storage.list.mockResolvedValue({
      data: [{ name: `${FILE}.jpg` }, { name: `${FILE2}.png` }, { name: "notes.txt" }],
      error: null,
    })
    expect(await actions.deleteDesign(DESIGN)).toEqual({ ok: true, data: undefined })
    expect(storage.list).toHaveBeenCalledWith(`${ORG}/${DESIGN}`, { limit: 1000 })
    expect(storage.remove).toHaveBeenCalledWith([`${ORG}/${DESIGN}/${FILE}.jpg`, `${ORG}/${DESIGN}/${FILE2}.png`])
  })

  test("a storage failure after the row is deleted is logged, not reported as a failed delete", async () => {
    storage.list.mockResolvedValue({ data: [{ name: `${FILE}.jpg` }], error: null })
    storage.remove.mockResolvedValue({ data: null, error: { message: "storage down" } })
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      expect(await actions.deleteDesign(DESIGN)).toEqual({ ok: true, data: undefined })
      expect(log).toHaveBeenCalledWith("design gallery: could not remove files", [`${ORG}/${DESIGN}/${FILE}.jpg`], "storage down")
    } finally {
      log.mockRestore()
    }
  })
})

describe("image upload", () => {
  test("prepare refuses files that are not JPG/PNG/WebP, empty or too large", async () => {
    for (const file of [
      { name: "a.svg", size: 10, type: "image/svg+xml" },
      { name: "a.jpg", size: 0, type: "image/jpeg" },
      { name: "a.jpg", size: 11 * 1024 * 1024, type: "image/jpeg" },
    ]) {
      expect(await actions.prepareDesignImageUpload(DESIGN, file)).toEqual({ ok: false, error: "invalidImage" })
    }
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
    expect(rpc).not.toHaveBeenCalled()
  })

  test("finalize deletes an upload larger than 10 MB even if it starts like a JPEG", async () => {
    const big = new Blob([JPEG, new Uint8Array(10 * 1024 * 1024)])
    storage.download.mockResolvedValue({ data: big, error: null })
    const path = `${ORG}/${DESIGN}/${FILE}.jpg`
    expect(await actions.finalizeDesignImageUpload(DESIGN, path)).toEqual({ ok: false, error: "invalidImage" })
    expect(storage.remove).toHaveBeenCalledWith([path])
  })

  test("finalize appends a real image through the locking database function", async () => {
    storage.download.mockResolvedValue({ data: new Blob([JPEG]), error: null })
    const path = `${ORG}/${DESIGN}/${FILE2}.jpg`
    const result = await actions.finalizeDesignImageUpload(DESIGN, path)
    expect(result.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith("append_design_image", {
      p_organization_id: ORG,
      p_design_id: DESIGN,
      p_storage_path: path,
    })
  })

  test("finalize of a file already attached returns the images without adding it again", async () => {
    const path = `${ORG}/${DESIGN}/${FILE}.jpg`
    design = makeDesign({ images: [image(FILE, path)] })
    expect(await actions.finalizeDesignImageUpload(DESIGN, path)).toEqual({ ok: true, data: { images: design.images } })
    expect(rpc).not.toHaveBeenCalled()
  })

  test("the design was deleted before finalize: the uploaded file is removed", async () => {
    storage.download.mockResolvedValue({ data: new Blob([JPEG]), error: null })
    rpc.mockResolvedValue({ data: null, error: { message: "design not found" } })
    const path = `${ORG}/${DESIGN}/${FILE2}.jpg`
    expect(await actions.finalizeDesignImageUpload(DESIGN, path)).toEqual({ ok: false, error: "notFound" })
    expect(storage.remove).toHaveBeenCalledWith([path])
  })
})

describe("deleteDesignImage", () => {
  const uploaded = image(FILE, `${ORG}/${DESIGN}/${FILE}.jpg`)

  test("the last image of a published design cannot be removed", async () => {
    design = makeDesign({ status: "published", images: [uploaded] })
    expect(await actions.deleteDesignImage(DESIGN, FILE)).toEqual({ ok: false, error: "needsImage" })
    expect(writes()).toEqual([])
  })

  test("the database refusing (another image removed meanwhile) is reported as needsImage, and the file is kept", async () => {
    design = makeDesign({ status: "published", images: [uploaded, image(FILE2, `${ORG}/${DESIGN}/${FILE2}.jpg`, 1)] })
    tableResult = { data: null, error: { code: "23514", message: "design_needs_image: the last image" } }
    expect(await actions.deleteDesignImage(DESIGN, FILE)).toEqual({ ok: false, error: "needsImage" })
    expect(storage.remove).not.toHaveBeenCalled()
  })

  test("removes the row (scoped to the organization) and the uploaded file, but never a bundled sample", async () => {
    design = makeDesign({ images: [uploaded] })
    expect((await actions.deleteDesignImage(DESIGN, FILE)).ok).toBe(true)
    expect(writes()[0].filters).toEqual([
      ["organization_id", ORG],
      ["design_id", DESIGN],
      ["id", FILE],
    ])
    expect(storage.remove).toHaveBeenCalledWith([uploaded.storagePath])

    storage.remove.mockClear()
    design = makeDesign({ images: [image(FILE, "/design-gallery/samples/bonyan/villa.webp")] })
    expect((await actions.deleteDesignImage(DESIGN, FILE)).ok).toBe(true)
    expect(storage.remove).not.toHaveBeenCalled()
  })
})

describe("reorderDesignImages", () => {
  test("rejects ids that are not UUIDs before calling the database", async () => {
    expect(await actions.reorderDesignImages(DESIGN, ["1; drop table designs"])).toEqual({ ok: false, error: "invalid" })
    expect(rpc).not.toHaveBeenCalled()
  })

  test("a list that no longer matches the images is stale; a database failure is a failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "design image order must list every image of the design exactly once" } })
    expect(await actions.reorderDesignImages(DESIGN, [FILE])).toEqual({ ok: false, error: "stale" })

    rpc.mockResolvedValue({ data: null, error: { message: "canceling statement due to statement timeout" } })
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      expect(await actions.reorderDesignImages(DESIGN, [FILE])).toEqual({ ok: false, error: "failed" })
    } finally {
      log.mockRestore()
    }
  })
})

describe("saveDesignGallerySite", () => {
  test("updates only the caller's organization and normalizes the phone", async () => {
    tableResult = { data: [{ organization_id: ORG }], error: null }
    expect(await actions.saveDesignGallerySite({ isEnabled: "on", whatsappPhone: "+968 9411 4511" })).toEqual({
      ok: true,
      data: undefined,
    })
    expect(writes()[0]).toMatchObject({
      table: "design_gallery_sites",
      payload: { is_enabled: true, whatsapp_phone: "96894114511" },
      filters: [["organization_id", ORG]],
    })
  })
})

describe("saveBookingSettings", () => {
  const form = {
    timeZone: "Asia/Muscat",
    workDays: ["0", "1", "2", "3", "4"],
    dayStart: "09:00",
    dayEnd: "17:00",
    slotMinutes: "45",
    minNoticeHours: "12",
    daysAhead: "21",
    officeAddressAr: "المعبيلة الصناعية، مسقط",
    officeAddressEn: "",
  }

  test("saves the meeting times of the caller's organization only", async () => {
    tableResult = { data: [{ organization_id: ORG }], error: null }
    expect(await actions.saveBookingSettings({ ...form, organizationId: OTHER_ORG })).toEqual({ ok: true, data: undefined })
    expect(writes()).toHaveLength(1)
    expect(writes()[0]).toMatchObject({
      table: "design_gallery_sites",
      payload: {
        booking_timezone: "Asia/Muscat",
        booking_work_days: [0, 1, 2, 3, 4],
        booking_day_start: "09:00",
        booking_day_end: "17:00",
        booking_slot_minutes: 45,
        booking_min_notice_hours: 12,
        booking_days_ahead: 21,
        office_address_ar: "المعبيلة الصناعية، مسقط",
        office_address_en: null,
      },
      filters: [["organization_id", ORG]],
    })
  })

  test("invalid times are field errors and nothing is written", async () => {
    expect(await actions.saveBookingSettings({ ...form, dayEnd: "09:30", workDays: [], timeZone: "Mars/Base" })).toEqual({
      ok: false,
      error: "invalid",
      fieldErrors: { dayEnd: "outOfRange", workDays: "required", timeZone: "invalidTimeZone" },
    })
    expect(writes()).toEqual([])
  })
})
