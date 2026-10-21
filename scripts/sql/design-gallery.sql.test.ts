import { beforeAll, describe, expect, test } from "vitest"
import type { PGlite } from "@electric-sql/pglite"
import { addMember, as, createOrg, createTestDb, createUser, readMigration } from "@/test/db/pglite"

const BASE = ["001_schema.sql", "002_rls.sql", "003_triggers.sql", "079_design_gallery.sql"]

type Fixture = {
  db: PGlite
  bonyan: string
  other: string
  admin: string
  member: string
  otherAdmin: string
  outsider: string
}

async function categoryId(db: PGlite, org: string, key: string) {
  const { rows } = await db.query<{ id: string }>(
    `select id from design_categories where organization_id = $1 and key = $2`,
    [org, key],
  )
  return rows[0].id
}

async function setup(): Promise<Fixture> {
  const db = await createTestDb(BASE)
  // An older supervising organization exists, so the seed must pick Bonyan by name, not by age.
  const other = await createOrg(db, "Other Consultancy", "supervising", "2020-01-01T00:00:00Z")
  const bonyan = await createOrg(db, "Bonyan Engineering Consultancy", "supervising", "2024-01-01T00:00:00Z")
  await createOrg(db, "A Contractor LLC", "external")
  const admin = await createUser(db, "admin@bonyan.test")
  const member = await createUser(db, "member@bonyan.test")
  const otherAdmin = await createUser(db, "admin@other.test")
  const outsider = await createUser(db, "someone@else.test")
  await addMember(db, bonyan, admin, "org_admin")
  await addMember(db, bonyan, member, "org_member")
  await addMember(db, other, otherAdmin, "org_admin")
  await db.exec(readMigration("080_design_gallery_seed_bonyan.sql"))
  return { db, bonyan, other, admin, member, otherAdmin, outsider }
}

describe("080 seed", () => {
  let f: Fixture
  beforeAll(async () => {
    f = await setup()
  })

  test("seeds Bonyan (matched by name) with an enabled site, 7 categories and 8 published designs with a cover", async () => {
    const site = await f.db.query<{ organization_id: string; slug: string; is_enabled: boolean }>(
      `select organization_id, slug, is_enabled from design_gallery_sites`,
    )
    expect(site.rows).toEqual([{ organization_id: f.bonyan, slug: "bonyan", is_enabled: true }])

    const counts = await f.db.query<{ categories: number; designs: number; images: number; published: number }>(`
      select
        (select count(*)::int from design_categories where organization_id = $1) as categories,
        (select count(*)::int from designs where organization_id = $1) as designs,
        (select count(*)::int from design_images where organization_id = $1) as images,
        (select count(*)::int from designs where organization_id = $1 and status = 'published') as published
    `, [f.bonyan])
    expect(counts.rows[0]).toEqual({ categories: 7, designs: 8, images: 8, published: 8 })
  })

  test("public and educational samples are reference-only; villas are bookable", async () => {
    const { rows } = await f.db.query<{ slug: string; is_bookable: boolean }>(
      `select slug, is_bookable from designs order by slug`,
    )
    const bookable = Object.fromEntries(rows.map((r) => [r.slug, r.is_bookable]))
    expect(bookable["modern-villa-pool"]).toBe(true)
    expect(bookable["saham-public-park"]).toBe(false)
    expect(bookable["university-office-building"]).toBe(false)
  })

  test("running the seed again changes nothing and keeps admin edits", async () => {
    await f.db.query(`update designs set title_en = 'Edited by admin' where slug = 'modern-villa-pool'`)
    await f.db.exec(readMigration("080_design_gallery_seed_bonyan.sql"))
    const { rows } = await f.db.query<{ designs: number; images: number; title: string }>(`
      select (select count(*)::int from designs) as designs,
             (select count(*)::int from design_images) as images,
             (select title_en from designs where slug = 'modern-villa-pool') as title
    `)
    expect(rows[0]).toEqual({ designs: 8, images: 8, title: "Edited by admin" })
  })

  test("running the seed again does not switch a gallery back on that an admin turned off", async () => {
    await f.db.query(`update design_gallery_sites set is_enabled = false, whatsapp_phone = '96890000000'`)
    await f.db.exec(readMigration("080_design_gallery_seed_bonyan.sql"))
    const { rows } = await f.db.query(`select is_enabled, whatsapp_phone from design_gallery_sites`)
    expect(rows).toEqual([{ is_enabled: false, whatsapp_phone: "96890000000" }])
  })
})

describe("provision_design_gallery", () => {
  let f: Fixture
  beforeAll(async () => {
    f = await setup()
  })

  test("gives another organization a disabled site and the default categories, once", async () => {
    await f.db.query(`select provision_design_gallery($1, 'other-co', null, 'Other Co')`, [f.other])
    await f.db.query(`select provision_design_gallery($1, 'other-co', null, 'Other Co')`, [f.other])
    const { rows } = await f.db.query<{ slug: string; is_enabled: boolean; categories: number }>(
      `select s.slug, s.is_enabled,
              (select count(*)::int from design_categories c where c.organization_id = s.organization_id) as categories
       from design_gallery_sites s where s.organization_id = $1`,
      [f.other],
    )
    expect(rows).toEqual([{ slug: "other-co", is_enabled: false, categories: 7 }])
  })

  test("refuses a slug that another organization already uses", async () => {
    await expect(f.db.query(`select provision_design_gallery($1, 'bonyan')`, [f.other])).resolves.toBeDefined()
    const third = await f.db.query<{ id: string }>(`insert into organizations (name, type) values ('Third', 'supervising') returning id`)
    await expect(f.db.query(`select provision_design_gallery($1, 'bonyan')`, [third.rows[0].id])).rejects.toThrow(
      /design_gallery_sites_slug_unique/,
    )
  })

  test("cannot be called by signed-in users directly", async () => {
    await expect(
      as(f.db, { role: "authenticated", userId: f.otherAdmin }, (tx) =>
        tx.query(`select provision_design_gallery($1, 'sneaky')`, [f.other]),
      ),
    ).rejects.toThrow(/permission denied/)
  })
})

describe("079 row level security", () => {
  let f: Fixture
  beforeAll(async () => {
    f = await setup()
    await f.db.query(`update designs set status = 'draft' where slug = 'stone-facade-villa'`)
  })

  test("anonymous visitors see only published designs of an enabled site", async () => {
    const slugs = await as(f.db, { role: "anon" }, async (tx) =>
      (await tx.query<{ slug: string }>(`select slug from designs order by slug`)).rows.map((r) => r.slug),
    )
    expect(slugs).toHaveLength(7)
    expect(slugs).not.toContain("stone-facade-villa")
  })

  test("anonymous visitors see nothing once the site is disabled", async () => {
    await f.db.query(`update design_gallery_sites set is_enabled = false`)
    try {
      const counts = await as(f.db, { role: "anon" }, async (tx) => ({
        designs: (await tx.query(`select 1 from designs`)).rows.length,
        images: (await tx.query(`select 1 from design_images`)).rows.length,
        categories: (await tx.query(`select 1 from design_categories`)).rows.length,
        sites: (await tx.query(`select 1 from design_gallery_sites`)).rows.length,
      }))
      expect(counts).toEqual({ designs: 0, images: 0, categories: 0, sites: 0 })
    } finally {
      await f.db.query(`update design_gallery_sites set is_enabled = true`)
    }
  })

  test("images of a draft design are hidden from anonymous visitors", async () => {
    const paths = await as(f.db, { role: "anon" }, async (tx) =>
      (await tx.query<{ storage_path: string }>(`select storage_path from design_images`)).rows.map((r) => r.storage_path),
    )
    expect(paths).toHaveLength(7)
    expect(paths.some((p) => p.includes("stone-facade-villa"))).toBe(false)
  })

  test("an organization member reads drafts but cannot write", async () => {
    const actor = { role: "authenticated" as const, userId: f.member }
    const count = await as(f.db, actor, async (tx) => (await tx.query(`select 1 from designs`)).rows.length)
    expect(count).toBe(8)

    const updated = await as(f.db, actor, async (tx) =>
      (await tx.query(`update designs set title_en = 'x' returning id`)).rows.length,
    )
    expect(updated).toBe(0)
  })

  test("anonymous visitors cannot insert designs", async () => {
    const cat = await categoryId(f.db, f.bonyan, "villas")
    await expect(
      as(f.db, { role: "anon" }, (tx) =>
        tx.query(
          `insert into designs (organization_id, category_id, slug, code, title_ar, title_en) values ($1, $2, 'x', 'X-1', 'x', 'x')`,
          [f.bonyan, cat],
        ),
      ),
    ).rejects.toThrow(/row-level security/)
  })

  test("an org admin writes in their own organization only", async () => {
    const cat = await categoryId(f.db, f.bonyan, "villas")
    const insert = `insert into designs (organization_id, category_id, slug, code, title_ar, title_en)
                    values ($1, $2, 'new-villa', 'BD-999', 'فيلا', 'Villa') returning id`

    const own = await as(f.db, { role: "authenticated", userId: f.admin }, async (tx) =>
      (await tx.query(insert, [f.bonyan, cat])).rows.length,
    )
    expect(own).toBe(1)

    await expect(
      as(f.db, { role: "authenticated", userId: f.otherAdmin }, (tx) => tx.query(insert, [f.bonyan, cat])),
    ).rejects.toThrow(/row-level security/)
  })

  test("a signed-in user from another organization cannot read Bonyan drafts", async () => {
    const slugs = await as(f.db, { role: "authenticated", userId: f.outsider }, async (tx) =>
      (await tx.query<{ slug: string }>(`select slug from designs`)).rows.map((r) => r.slug),
    )
    expect(slugs).not.toContain("stone-facade-villa")
  })

  test("a design cannot use another organization's category", async () => {
    const { rows } = await f.db.query<{ id: string }>(
      `insert into design_categories (organization_id, key, name_ar, name_en) values ($1, 'villas', 'فلل', 'Villas') returning id`,
      [f.other],
    )
    await expect(
      f.db.query(
        `insert into designs (organization_id, category_id, slug, code, title_ar, title_en) values ($1, $2, 'cross', 'X-2', 'x', 'x')`,
        [f.bonyan, rows[0].id],
      ),
    ).rejects.toThrow(/designs_category_same_org/)
  })

  test("slug, code, area and bedrooms are validated by the database", async () => {
    const cat = await categoryId(f.db, f.bonyan, "villas")
    const attempt = (slug: string, code: string, area: number | null, bedrooms: number | null) =>
      f.db.query(
        `insert into designs (organization_id, category_id, slug, code, title_ar, title_en, built_area_sqm, bedrooms)
         values ($1, $2, $3, $4, 'x', 'x', $5, $6)`,
        [f.bonyan, cat, slug, code, area, bedrooms],
      )
    await expect(attempt("Bad Slug", "OK-1", null, null)).rejects.toThrow(/designs_slug_format/)
    await expect(attempt("ok-slug", "bad code", null, null)).rejects.toThrow(/designs_code_format/)
    await expect(attempt("ok-slug", "OK-1", 0, null)).rejects.toThrow(/designs_area_positive/)
    await expect(attempt("ok-slug", "OK-1", null, 51)).rejects.toThrow(/designs_bedrooms_range/)
    await expect(attempt("modern-villa-pool", "OK-1", null, null)).rejects.toThrow(/designs_org_slug_unique/)
  })
})

describe("replace_design_image_order", () => {
  let f: Fixture
  let designId: string
  let imageIds: string[]

  beforeAll(async () => {
    f = await setup()
    const { rows } = await f.db.query<{ id: string }>(`select id from designs where slug = 'modern-villa-pool'`)
    designId = rows[0].id
    await f.db.query(
      `insert into design_images (organization_id, design_id, storage_path, order_index)
       values ($1, $2, 'b.webp', 1), ($1, $2, 'c.webp', 2)`,
      [f.bonyan, designId],
    )
    imageIds = (
      await f.db.query<{ id: string }>(`select id from design_images where design_id = $1 order by order_index`, [designId])
    ).rows.map((r) => r.id)
  })

  test("applies a full permutation", async () => {
    const reversed = [...imageIds].reverse()
    await f.db.query(`select replace_design_image_order($1, $2::uuid[])`, [designId, reversed])
    const { rows } = await f.db.query<{ id: string }>(
      `select id from design_images where design_id = $1 order by order_index`,
      [designId],
    )
    expect(rows.map((r) => r.id)).toEqual(reversed)
  })

  test("rejects a list with a duplicate, a missing or a foreign image", async () => {
    const [a, b] = imageIds
    await expect(f.db.query(`select replace_design_image_order($1, $2::uuid[])`, [designId, [a, a, b]])).rejects.toThrow(
      /exactly once/,
    )
    await expect(f.db.query(`select replace_design_image_order($1, $2::uuid[])`, [designId, [a, b]])).rejects.toThrow(
      /exactly once/,
    )
    const foreign = (await f.db.query<{ id: string }>(`select id from design_images where design_id <> $1 limit 1`, [designId]))
      .rows[0].id
    await expect(
      f.db.query(`select replace_design_image_order($1, $2::uuid[])`, [designId, [imageIds[0], imageIds[1], foreign]]),
    ).rejects.toThrow(/exactly once/)
  })

  test("cannot be called by signed-in users directly", async () => {
    await expect(
      as(f.db, { role: "authenticated", userId: f.admin }, (tx) =>
        tx.query(`select replace_design_image_order($1, $2::uuid[])`, [designId, imageIds]),
      ),
    ).rejects.toThrow(/permission denied/)
  })
})
