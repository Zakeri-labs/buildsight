import { beforeAll, describe, expect, test } from "vitest"
import type { PGlite } from "@electric-sql/pglite"
import { addMember, as, createOrg, createTestDb, createUser, readMigration } from "@/test/db/pglite"

const BASE = ["001_schema.sql", "002_rls.sql", "003_triggers.sql", "079_design_gallery.sql"]
const SEED = "080_design_gallery_seed_bonyan.sql"

type Fixture = {
  db: PGlite
  bonyan: string
  other: string
  admin: string
  manager: string
  member: string
  viewer: string
  otherAdmin: string
  outsider: string
}

async function setup(bonyanName = "Bonyan Engineering Consultancy"): Promise<Fixture> {
  const db = await createTestDb(BASE)
  const other = await createOrg(db, "Other Consultancy", "supervising")
  const bonyan = await createOrg(db, bonyanName, "supervising")
  await createOrg(db, "A Contractor LLC", "external")
  const [admin, manager, member, viewer, otherAdmin, outsider] = await Promise.all(
    ["admin", "manager", "member", "viewer", "other-admin", "outsider"].map((n) => createUser(db, `${n}@test.local`)),
  )
  await addMember(db, bonyan, admin, "org_admin")
  await addMember(db, bonyan, manager, "org_manager")
  await addMember(db, bonyan, member, "org_member")
  await addMember(db, bonyan, viewer, "viewer")
  await addMember(db, other, otherAdmin, "org_admin")
  await db.exec(readMigration(SEED))
  return { db, bonyan, other, admin, manager, member, viewer, otherAdmin, outsider }
}

const count = async (db: PGlite, sql: string, params: unknown[] = []) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from (${sql}) q`, params)).rows[0].n

async function designId(db: PGlite, slug: string) {
  return (await db.query<{ id: string }>(`select id from designs where slug = $1`, [slug])).rows[0].id
}

describe("080 seed", () => {
  test("seeds the one active Bonyan organization with an enabled gallery and 8 published designs, each with an image", async () => {
    const f = await setup()
    const site = await f.db.query(`select organization_id, slug, is_enabled, whatsapp_phone from design_gallery_sites`)
    expect(site.rows).toEqual([{ organization_id: f.bonyan, slug: "bonyan", is_enabled: true, whatsapp_phone: "96894114511" }])
    expect(await count(f.db, `select 1 from design_categories where organization_id = $1`, [f.bonyan])).toBe(7)
    expect(await count(f.db, `select 1 from designs where organization_id = $1 and status = 'published'`, [f.bonyan])).toBe(8)
    expect(await count(f.db, `select 1 from design_images where organization_id = $1`, [f.bonyan])).toBe(8)
  })

  test("matches an Arabic organization name", async () => {
    const f = await setup("بنيان للاستشارات الهندسية")
    const site = await f.db.query(`select organization_id from design_gallery_sites`)
    expect(site.rows).toEqual([{ organization_id: f.bonyan }])
  })

  test("writes nothing when no active supervising organization is called Bonyan", async () => {
    const db = await createTestDb(BASE)
    await createOrg(db, "Other Consultancy", "supervising")
    await createOrg(db, "Bonyan Old", "supervising", "suspended")
    await createOrg(db, "Bonyan Trading", "external")
    await db.exec(readMigration(SEED))
    expect(await count(db, `select 1 from design_gallery_sites`)).toBe(0)
    expect(await count(db, `select 1 from designs`)).toBe(0)
  })

  test("writes nothing when two active supervising organizations match", async () => {
    const db = await createTestDb(BASE)
    await createOrg(db, "Bonyan Muscat", "supervising")
    await createOrg(db, "Bonyan Sohar", "supervising")
    await db.exec(readMigration(SEED))
    expect(await count(db, `select 1 from design_gallery_sites`)).toBe(0)
  })

  test("a second run changes nothing: deleted designs and categories stay deleted, settings stay as the admin left them", async () => {
    const f = await setup()
    await f.db.query(`delete from designs where slug = 'saham-public-park'`)
    await f.db.query(`update designs set slug = 'villa-with-pool' where slug = 'modern-villa-pool'`)
    await f.db.query(`delete from design_categories where key = 'mosques'`)
    await f.db.query(`update design_gallery_sites set is_enabled = false, whatsapp_phone = null, slug = 'bonyan-gallery'`)
    await f.db.exec(readMigration(SEED))
    expect(await count(f.db, `select 1 from designs`)).toBe(7)
    expect(await count(f.db, `select 1 from designs where code = 'BD-101'`)).toBe(1)
    expect(await count(f.db, `select 1 from design_categories`)).toBe(6)
    const site = await f.db.query(`select is_enabled, whatsapp_phone from design_gallery_sites`)
    expect(site.rows).toEqual([{ is_enabled: false, whatsapp_phone: null }])
  })

  test("writes nothing when another organization already uses the slug bonyan", async () => {
    const db = await createTestDb(BASE)
    const trading = await createOrg(db, "Some Trading", "external")
    await db.query(`select provision_design_gallery($1, 'bonyan')`, [trading])
    const bonyan = await createOrg(db, "Bonyan", "supervising")
    await db.exec(readMigration(SEED))
    expect(await count(db, `select 1 from design_gallery_sites where organization_id = $1`, [bonyan])).toBe(0)
    expect(await count(db, `select 1 from designs`)).toBe(0)
  })
})

describe("079 reads", () => {
  let f: Fixture
  beforeAll(async () => {
    f = await setup()
    await f.db.query(`update designs set status = 'draft' where slug = 'stone-facade-villa'`)
  })

  const slugsAs = (actor: Parameters<typeof as>[1]) =>
    as(f.db, actor, async (tx) => (await tx.query<{ slug: string }>(`select slug from designs`)).rows.map((r) => r.slug))
  const imagePathsAs = (actor: Parameters<typeof as>[1]) =>
    as(f.db, actor, async (tx) =>
      (await tx.query<{ storage_path: string }>(`select storage_path from design_images`)).rows.map((r) => r.storage_path),
    )

  test("anonymous visitors see only published designs and their images", async () => {
    const slugs = await slugsAs({ role: "anon" })
    expect(slugs).toHaveLength(7)
    expect(slugs).not.toContain("stone-facade-villa")
    const paths = await imagePathsAs({ role: "anon" })
    expect(paths).toHaveLength(7)
    expect(paths.some((p) => p.includes("stone-facade-villa"))).toBe(false)
  })

  test("only the org admin sees drafts; managers, members, viewers, outsiders and other admins do not", async () => {
    expect(await slugsAs({ role: "authenticated", userId: f.admin })).toContain("stone-facade-villa")
    for (const userId of [f.manager, f.member, f.viewer, f.outsider, f.otherAdmin]) {
      const slugs = await slugsAs({ role: "authenticated", userId })
      expect(slugs).not.toContain("stone-facade-villa")
      expect(slugs).toHaveLength(7)
      expect((await imagePathsAs({ role: "authenticated", userId })).some((p) => p.includes("stone-facade-villa"))).toBe(false)
    }
  })

  test("nothing is public while the gallery is disabled, except to the org admin", async () => {
    await f.db.query(`update design_gallery_sites set is_enabled = false`)
    try {
      const anon = await as(f.db, { role: "anon" }, async (tx) => ({
        designs: (await tx.query(`select 1 from designs`)).rows.length,
        images: (await tx.query(`select 1 from design_images`)).rows.length,
        categories: (await tx.query(`select 1 from design_categories`)).rows.length,
        sites: (await tx.query(`select 1 from design_gallery_sites`)).rows.length,
      }))
      expect(anon).toEqual({ designs: 0, images: 0, categories: 0, sites: 0 })
      expect(await slugsAs({ role: "authenticated", userId: f.admin })).toHaveLength(8)
    } finally {
      await f.db.query(`update design_gallery_sites set is_enabled = true`)
    }
  })

  test("nothing is public while the organization is suspended", async () => {
    await f.db.query(`update organizations set status = 'suspended' where id = $1`, [f.bonyan])
    try {
      expect(await slugsAs({ role: "anon" })).toEqual([])
    } finally {
      await f.db.query(`update organizations set status = 'active' where id = $1`, [f.bonyan])
    }
  })
})

describe("079 writes go only through the server (service role)", () => {
  let f: Fixture
  beforeAll(async () => {
    f = await setup()
  })

  const attempts = (org: string, design: string, category: string) => [
    `insert into design_gallery_sites (organization_id, slug, custom_host, is_enabled) values ('${org}', 'x', 'designs.bonyanec.com', true)`,
    `update design_gallery_sites set custom_host = 'designs.bonyanec.com', is_enabled = true`,
    `insert into design_categories (organization_id, key, name_ar, name_en) values ('${org}', 'x', 'x', 'x')`,
    `update design_categories set name_en = 'x'`,
    `delete from design_categories`,
    `insert into designs (organization_id, category_id, slug, code, title_ar, title_en) values ('${org}', '${category}', 'x', 'X-1', 'x', 'x')`,
    `update designs set title_en = 'x'`,
    `delete from designs`,
    `insert into design_images (organization_id, design_id, storage_path) values ('${org}', '${design}', '/design-gallery/samples/bonyan/x.webp')`,
    `update design_images set order_index = 9`,
    `delete from design_images`,
  ]

  test("no role can insert, update or delete any gallery table directly, not even the org admin", async () => {
    const design = await designId(f.db, "modern-villa-pool")
    const category = (await f.db.query<{ id: string }>(`select id from design_categories limit 1`)).rows[0].id
    const actors = [
      { role: "anon" as const },
      { role: "authenticated" as const, userId: f.admin },
      { role: "authenticated" as const, userId: f.otherAdmin },
      { role: "authenticated" as const, userId: f.member },
    ]
    for (const actor of actors) {
      for (const sql of attempts(f.bonyan, design, category)) {
        await expect(as(f.db, actor, (tx) => tx.query(sql)), `${actor.role} ${sql}`).rejects.toThrow(/permission denied/)
      }
    }
  })

  test("security-definer functions cannot be called by anon or signed-in users", async () => {
    const design = await designId(f.db, "modern-villa-pool")
    const calls = [
      [`select provision_design_gallery($1, 'sneaky')`, [f.other]],
      [`select replace_design_image_order($1, $2::uuid[])`, [design, []]],
      [`select append_design_image($1, $2, '/design-gallery/samples/bonyan/x.webp')`, [f.bonyan, design]],
    ] as const
    for (const actor of [{ role: "anon" as const }, { role: "authenticated" as const, userId: f.admin }]) {
      for (const [sql, params] of calls) {
        await expect(as(f.db, actor, (tx) => tx.query(sql, [...params])), sql).rejects.toThrow(/permission denied/)
      }
    }
  })
})

describe("079 integrity rules", () => {
  let f: Fixture
  beforeAll(async () => {
    f = await setup()
  })

  test("a published design cannot lose its last image, but a draft can", async () => {
    const id = await designId(f.db, "simple-lines-villa")
    await expect(f.db.query(`delete from design_images where design_id = $1`, [id])).rejects.toThrow(/design_needs_image/)
    await f.db.query(`update designs set status = 'draft' where id = $1`, [id])
    await f.db.query(`delete from design_images where design_id = $1`, [id])
    expect(await count(f.db, `select 1 from design_images where design_id = $1`, [id])).toBe(0)
  })

  test("a design without images cannot be published or inserted as published", async () => {
    const id = await designId(f.db, "simple-lines-villa")
    await expect(f.db.query(`update designs set status = 'published' where id = $1`, [id])).rejects.toThrow(/design_needs_image/)
    const category = (await f.db.query<{ id: string }>(`select id from design_categories limit 1`)).rows[0].id
    await expect(
      f.db.query(
        `insert into designs (organization_id, category_id, slug, code, title_ar, title_en, status) values ($1, $2, 'p', 'P-1', 'x', 'x', 'published')`,
        [f.bonyan, category],
      ),
    ).rejects.toThrow(/design_needs_image/)
  })

  test("deleting a whole published design removes its images", async () => {
    const id = await designId(f.db, "stone-facade-villa")
    await f.db.query(`delete from designs where id = $1`, [id])
    expect(await count(f.db, `select 1 from design_images where design_id = $1`, [id])).toBe(0)
  })

  test("image paths must be a bundled sample or an upload in this design's own folder", async () => {
    const id = await designId(f.db, "modern-villa-pool")
    const file = "dddddddd-1111-4222-8333-444444444444"
    const insert = (path: string) =>
      f.db.query(`insert into design_images (organization_id, design_id, storage_path) values ($1, $2, $3)`, [f.bonyan, id, path])
    await expect(insert(`${f.bonyan}/${id}/${file}.webp`)).resolves.toBeDefined()
    for (const bad of [
      "https://evil.example/x.png",
      `${f.other}/${id}/${file}.webp`,
      `${f.bonyan}/${id}/../${file}.webp`,
      `${f.bonyan}/${id}/${file}.svg`,
      "/design-gallery/samples/../../x.webp",
    ]) {
      await expect(insert(bad), bad).rejects.toThrow(/design_images_storage_path_format/)
    }
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

  test("an image cannot point at another organization's design", async () => {
    const id = await designId(f.db, "modern-villa-pool")
    await expect(
      f.db.query(`insert into design_images (organization_id, design_id, storage_path) values ($1, $2, '/design-gallery/samples/bonyan/x.webp')`, [
        f.other,
        id,
      ]),
    ).rejects.toThrow(/design_images_design_same_org/)
  })

  test("slug, code, area and bedrooms are validated", async () => {
    const category = (await f.db.query<{ id: string }>(`select id from design_categories where organization_id = $1 limit 1`, [f.bonyan])).rows[0].id
    const attempt = (slug: string, code: string, area: number | null, bedrooms: number | null) =>
      f.db.query(
        `insert into designs (organization_id, category_id, slug, code, title_ar, title_en, built_area_sqm, bedrooms)
         values ($1, $2, $3, $4, 'x', 'x', $5, $6)`,
        [f.bonyan, category, slug, code, area, bedrooms],
      )
    await expect(attempt("Bad Slug", "OK-1", null, null)).rejects.toThrow(/designs_slug_format/)
    await expect(attempt("ok-slug", "bad code", null, null)).rejects.toThrow(/designs_code_format/)
    await expect(attempt("ok-slug", "OK-1", 0, null)).rejects.toThrow(/designs_area_positive/)
    await expect(attempt("ok-slug", "OK-1", null, 51)).rejects.toThrow(/designs_bedrooms_range/)
    await expect(attempt("modern-villa-pool", "OK-1", null, null)).rejects.toThrow(/designs_org_slug_unique/)
  })

  test("the bucket accepts only JPG, PNG and WebP up to 10 MB and is public", async () => {
    const { rows } = await f.db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'design-gallery'`)
    expect(rows).toEqual([{ public: true, file_size_limit: 10485760, allowed_mime_types: ["image/jpeg", "image/png", "image/webp"] }])
  })
})

describe("append_design_image and replace_design_image_order", () => {
  let f: Fixture
  let id: string

  beforeAll(async () => {
    f = await setup()
    id = await designId(f.db, "modern-villa-pool")
  })

  const upload = (n: number) => `${f.bonyan}/${id}/0000000${n}-1111-4222-8333-444444444444.png`

  test("appends after the last image and returns the same id for a repeated path", async () => {
    await f.db.query(`update design_images set order_index = 4 where design_id = $1`, [id])
    const first = (await f.db.query<{ id: string }>(`select append_design_image($1, $2, $3) as id`, [f.bonyan, id, upload(1)])).rows[0].id
    const again = (await f.db.query<{ id: string }>(`select append_design_image($1, $2, $3) as id`, [f.bonyan, id, upload(1)])).rows[0].id
    expect(again).toBe(first)
    const second = (await f.db.query<{ id: string }>(`select append_design_image($1, $2, $3) as id`, [f.bonyan, id, upload(2)])).rows[0].id
    const { rows } = await f.db.query<{ id: string; order_index: number }>(
      `select id, order_index from design_images where design_id = $1 order by order_index`,
      [id],
    )
    expect(rows.slice(1)).toEqual([
      { id: first, order_index: 5 },
      { id: second, order_index: 6 },
    ])
  })

  test("refuses a design of another organization", async () => {
    await expect(f.db.query(`select append_design_image($1, $2, $3)`, [f.other, id, upload(3)])).rejects.toThrow(/design not found/)
  })

  test("applies a full permutation and rejects a duplicate, missing or foreign image", async () => {
    const ids = (await f.db.query<{ id: string }>(`select id from design_images where design_id = $1 order by order_index`, [id])).rows.map(
      (r) => r.id,
    )
    const reversed = [...ids].reverse()
    await f.db.query(`select replace_design_image_order($1, $2::uuid[])`, [id, reversed])
    const after = (await f.db.query<{ id: string }>(`select id from design_images where design_id = $1 order by order_index`, [id])).rows.map(
      (r) => r.id,
    )
    expect(after).toEqual(reversed)

    const foreign = (await f.db.query<{ id: string }>(`select id from design_images where design_id <> $1 limit 1`, [id])).rows[0].id
    for (const bad of [[ids[0], ids[0], ids[1]], ids.slice(1), [...ids.slice(1), foreign]]) {
      await expect(f.db.query(`select replace_design_image_order($1, $2::uuid[])`, [id, bad])).rejects.toThrow(/exactly once/)
    }
  })
})

describe("provision_design_gallery", () => {
  test("gives another organization a disabled gallery with the default categories, once", async () => {
    const f = await setup()
    await f.db.query(`select provision_design_gallery($1, 'other-co', null, 'Other Co')`, [f.other])
    await f.db.query(`select provision_design_gallery($1, 'other-co', null, 'Other Co')`, [f.other])
    const { rows } = await f.db.query(
      `select s.slug, s.is_enabled,
              (select count(*)::int from design_categories c where c.organization_id = s.organization_id) as categories
       from design_gallery_sites s where s.organization_id = $1`,
      [f.other],
    )
    expect(rows).toEqual([{ slug: "other-co", is_enabled: false, categories: 7 }])
  })

  test("refuses a slug another organization already uses", async () => {
    const f = await setup()
    await expect(f.db.query(`select provision_design_gallery($1, 'bonyan')`, [f.other])).rejects.toThrow(
      /design_gallery_sites_slug_unique/,
    )
  })
})
