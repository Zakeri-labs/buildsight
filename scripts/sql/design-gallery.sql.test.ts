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

describe("081 public pages", () => {
  let f: Fixture
  beforeAll(async () => {
    f = await setup()
    await f.db.exec(readMigration("081_design_gallery_public.sql"))
    await f.db.query(
      `insert into design_gallery_events (organization_id, event_type, locale) values ($1, 'gallery_view', 'ar')`,
      [f.bonyan],
    )
  })

  test("sets Bonyan's header logo and website once, and can be run again", async () => {
    await f.db.exec(readMigration("081_design_gallery_public.sql"))
    const { rows } = await f.db.query(`select logo_url, website_url from design_gallery_sites`)
    expect(rows).toEqual([{ logo_url: "/Logow.png", website_url: "https://bonyanec.com" }])
  })

  test("only safe logo and website addresses are stored", async () => {
    for (const [column, value] of [
      ["logo_url", "javascript:alert(1)"],
      ["logo_url", 'https://x.com/"onerror=1'],
      ["website_url", "javascript:alert(1)"],
      ["website_url", "bonyanec.com"],
    ]) {
      await expect(f.db.query(`update design_gallery_sites set ${column} = $1`, [value]), `${column}=${value}`).rejects.toThrow(/_format/)
    }
  })

  test("events: only the org admin reads them; nobody writes them through the API", async () => {
    const read = (actor: Parameters<typeof as>[1]) =>
      as(f.db, actor, async (tx) => (await tx.query(`select 1 from design_gallery_events`)).rows.length)
    expect(await read({ role: "authenticated", userId: f.admin })).toBe(1)
    for (const actor of [{ role: "anon" as const }, { role: "authenticated" as const, userId: f.member }, { role: "authenticated" as const, userId: f.otherAdmin }]) {
      expect(await read(actor)).toBe(0)
    }
    for (const actor of [{ role: "anon" as const }, { role: "authenticated" as const, userId: f.admin }]) {
      await expect(
        as(f.db, actor, (tx) => tx.query(`insert into design_gallery_events (organization_id, event_type) values ($1, 'gallery_view')`, [f.bonyan])),
      ).rejects.toThrow(/permission denied/)
    }
  })

  test("events accept only known types, intents and short campaign values", async () => {
    const insert = (type: string, intent: string | null, utm: string | null = null) =>
      f.db.query(`insert into design_gallery_events (organization_id, event_type, intent, utm_source) values ($1, $2, $3, $4)`, [
        f.bonyan,
        type,
        intent,
        utm,
      ])
    await expect(insert("contact_click", "same")).resolves.toBeDefined()
    await expect(insert("purchase", null)).rejects.toThrow(/design_gallery_events_type/)
    await expect(insert("contact_click", "hack")).rejects.toThrow(/design_gallery_events_intent/)
    await expect(insert("gallery_view", null, "x".repeat(101))).rejects.toThrow(/design_gallery_events_lengths/)
  })

  test("deleting a design keeps its events for the monthly figures", async () => {
    const id = await designId(f.db, "modern-villa-pool")
    await f.db.query(`insert into design_gallery_events (organization_id, design_id, event_type) values ($1, $2, 'design_view')`, [f.bonyan, id])
    await f.db.query(`delete from designs where id = $1`, [id])
    expect(await count(f.db, `select 1 from design_gallery_events where event_type = 'design_view' and design_id is null`)).toBe(1)
  })
})

describe("082 default gallery", () => {
  test("marks Bonyan as the default gallery, once, and allows only one default", async () => {
    const f = await setup()
    await f.db.query(`select provision_design_gallery($1, 'other-co')`, [f.other])
    await f.db.exec(readMigration("082_design_gallery_default_site.sql"))
    await f.db.exec(readMigration("082_design_gallery_default_site.sql"))
    const { rows } = await f.db.query(`select slug, is_default from design_gallery_sites order by slug`)
    expect(rows).toEqual([
      { slug: "bonyan", is_default: true },
      { slug: "other-co", is_default: false },
    ])
    await expect(f.db.query(`update design_gallery_sites set is_default = true where slug = 'other-co'`)).rejects.toThrow(
      /design_gallery_sites_one_default/,
    )
  })

  test("keeps another default an admin already chose", async () => {
    const f = await setup()
    await f.db.query(`select provision_design_gallery($1, 'other-co')`, [f.other])
    await f.db.exec(`alter table design_gallery_sites add column if not exists is_default boolean not null default false`)
    await f.db.query(`update design_gallery_sites set is_default = true where slug = 'other-co'`)
    await f.db.exec(readMigration("082_design_gallery_default_site.sql"))
    const { rows } = await f.db.query(`select slug from design_gallery_sites where is_default`)
    expect(rows).toEqual([{ slug: "other-co" }])
  })
})

describe("083 first gallery is the default; demo designs on demand", () => {
  // The situation found on the live database: the organization is not called
  // Bonyan, so 080 skipped it, and the gallery was set up from the admin panel.
  async function liveLike() {
    const db = await createTestDb(BASE)
    const org = await createOrg(db, "Provision Consultancy", "supervising")
    const admin = await createUser(db, "admin@provision.test")
    await addMember(db, org, admin, "org_admin")
    await db.exec(readMigration(SEED))
    await db.exec(readMigration("081_design_gallery_public.sql"))
    await db.query(`select provision_design_gallery($1, 'provision-consultancy', null, 'Provision Consultancy')`, [org])
    await db.exec(readMigration("082_design_gallery_default_site.sql"))
    return { db, org, admin }
  }

  test("repairs a single gallery that is not the default", async () => {
    const { db } = await liveLike()
    expect((await db.query(`select is_default from design_gallery_sites`)).rows).toEqual([{ is_default: false }])
    await db.exec(readMigration("083_design_gallery_first_default_and_samples.sql"))
    expect((await db.query(`select slug, is_default from design_gallery_sites`)).rows).toEqual([
      { slug: "provision-consultancy", is_default: true },
    ])
  })

  test("demo designs are added once, published with images, and become public when the gallery is enabled", async () => {
    const { db, org } = await liveLike()
    await db.exec(readMigration("083_design_gallery_first_default_and_samples.sql"))
    expect((await db.query<{ n: number }>(`select add_design_gallery_samples($1) as n`, [org])).rows[0].n).toBe(8)
    expect((await db.query<{ n: number }>(`select add_design_gallery_samples($1) as n`, [org])).rows[0].n).toBe(0)
    expect(await count(db, `select 1 from designs where status = 'published'`)).toBe(8)
    expect(await count(db, `select 1 from design_images`)).toBe(8)
    expect(await as(db, { role: "anon" }, async (tx) => (await tx.query(`select 1 from designs`)).rows.length)).toBe(0)
    await db.query(`update design_gallery_sites set is_enabled = true`)
    expect(await as(db, { role: "anon" }, async (tx) => (await tx.query(`select 1 from designs`)).rows.length)).toBe(8)
  })

  test("after 083, the first gallery set up is the default and later ones are not", async () => {
    const db = await createTestDb([...BASE, "081_design_gallery_public.sql", "082_design_gallery_default_site.sql", "083_design_gallery_first_default_and_samples.sql"])
    const first = await createOrg(db, "First Co", "supervising")
    const second = await createOrg(db, "Second Co", "supervising")
    await db.query(`select provision_design_gallery($1, 'first-co')`, [first])
    await db.query(`select provision_design_gallery($1, 'second-co')`, [second])
    expect((await db.query(`select slug, is_default from design_gallery_sites order by slug`)).rows).toEqual([
      { slug: "first-co", is_default: true },
      { slug: "second-co", is_default: false },
    ])
  })

  test("demo designs need a gallery and cannot be added through the API", async () => {
    const { db, org, admin } = await liveLike()
    await db.exec(readMigration("083_design_gallery_first_default_and_samples.sql"))
    const stranger = await createOrg(db, "No Gallery", "external")
    await expect(db.query(`select add_design_gallery_samples($1)`, [stranger])).rejects.toThrow(/set it up first/)
    await expect(
      as(db, { role: "authenticated", userId: admin }, (tx) => tx.query(`select add_design_gallery_samples($1)`, [org])),
    ).rejects.toThrow(/permission denied/)
  })
})

describe("084 meeting requests", () => {
  let f: Fixture
  const KEY = "11111111-2222-4333-8444-555555555555"
  beforeAll(async () => {
    f = await setup()
    await f.db.exec(readMigration("084_design_meeting_requests.sql"))
  })

  const insert = (overrides: Record<string, unknown> = {}) => {
    const row: Record<string, unknown> = {
      organization_id: f.bonyan,
      request_key: crypto.randomUUID(),
      path: "idea",
      client_name: "أحمد",
      whatsapp_phone: "96891234567",
      project_type: "villa",
      land_status: "owned_ready",
      start_timeline: "within_3_months",
      idea_text: "فكرة",
      meeting_mode: "office",
      starts_at: "2026-10-25T05:00:00Z",
      ends_at: "2026-10-25T05:45:00Z",
      status: "confirmed",
      ...overrides,
    }
    const columns = Object.keys(row)
    return f.db.query<{ id: string }>(
      `insert into design_meeting_requests (${columns.join(", ")}) values (${columns.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
      columns.map((c) => row[c]),
    )
  }

  test("default booking settings: Sunday–Thursday 09:00–17:00 Muscat, 45 minutes, 12 hours notice, 3 weeks", async () => {
    const { rows } = await f.db.query(`select booking_timezone, booking_work_days, booking_day_start, booking_day_end, booking_slot_minutes, booking_min_notice_hours, booking_days_ahead from design_gallery_sites`)
    expect(rows).toEqual([{ booking_timezone: "Asia/Muscat", booking_work_days: [0, 1, 2, 3, 4], booking_day_start: "09:00:00", booking_day_end: "17:00:00", booking_slot_minutes: 45, booking_min_notice_hours: 12, booking_days_ahead: 21 }])
    await expect(f.db.query(`update design_gallery_sites set booking_day_end = '08:00'`)).rejects.toThrow(/booking_hours/)
    await expect(f.db.query(`update design_gallery_sites set booking_work_days = '{7}'`)).rejects.toThrow(/booking_hours/)
  })

  test("one active meeting per time slot; a cancelled one frees the slot", async () => {
    const first = await insert({ starts_at: "2026-10-26T05:00:00Z", ends_at: "2026-10-26T05:45:00Z" })
    await expect(insert({ starts_at: "2026-10-26T05:00:00Z", ends_at: "2026-10-26T05:45:00Z" })).rejects.toThrow(/one_per_slot/)
    await f.db.query(`update design_meeting_requests set status = 'cancelled' where id = $1`, [first.rows[0].id])
    await expect(insert({ starts_at: "2026-10-26T05:00:00Z", ends_at: "2026-10-26T05:45:00Z" })).resolves.toBeDefined()
  })

  test("the same request key is one request", async () => {
    await insert({ request_key: KEY, starts_at: "2026-10-27T05:00:00Z", ends_at: "2026-10-27T05:45:00Z" })
    await expect(insert({ request_key: KEY, starts_at: "2026-10-27T06:00:00Z", ends_at: "2026-10-27T06:45:00Z" })).rejects.toThrow(/key_unique/)
  })

  test("rules kept by the database", async () => {
    const at = (h: number) => ({ starts_at: `2026-11-0${h}T05:00:00Z`, ends_at: `2026-11-0${h}T05:45:00Z` })
    await expect(insert({ meeting_mode: "remote", ...at(1) })).rejects.toThrow(/remote_email/)
    await expect(insert({ meeting_mode: "call_me" })).rejects.toThrow(/requests_slot/)
    await expect(insert({ meeting_mode: "call_me", starts_at: null, ends_at: null, status: "new" })).resolves.toBeDefined()
    await expect(insert({ path: "same", ...at(2) })).rejects.toThrow(/design_for_path/)
    await expect(insert({ whatsapp_phone: "+968 9123", ...at(3) })).rejects.toThrow(/requests_phone/)
    await expect(insert({ meet_link: "https://evil.example/x", ...at(4) })).rejects.toThrow(/meet_link/)
    await expect(insert({ client_name: " ", ...at(5) })).rejects.toThrow(/requests_name/)
  })

  test("only the org admin reads requests and files; nobody writes through the API", async () => {
    const read = (actor: Parameters<typeof as>[1]) =>
      as(f.db, actor, async (tx) => (await tx.query(`select 1 from design_meeting_requests`)).rows.length)
    expect(await read({ role: "authenticated", userId: f.admin })).toBeGreaterThan(0)
    for (const actor of [{ role: "anon" as const }, { role: "authenticated" as const, userId: f.member }, { role: "authenticated" as const, userId: f.manager }, { role: "authenticated" as const, userId: f.otherAdmin }]) {
      expect(await read(actor)).toBe(0)
    }
    for (const actor of [{ role: "anon" as const }, { role: "authenticated" as const, userId: f.admin }]) {
      await expect(as(f.db, actor, (tx) => tx.query(`delete from design_meeting_requests`))).rejects.toThrow(/permission denied/)
      await expect(
        as(f.db, actor, (tx) => tx.query(`insert into design_meeting_requests (organization_id, request_key, path, client_name, whatsapp_phone, project_type, land_status, start_timeline, meeting_mode) values ($1, gen_random_uuid(), 'idea', 'x', '96891234567', 'villa', 'owned_ready', 'exploring', 'call_me')`, [f.bonyan])),
      ).rejects.toThrow(/permission denied/)
    }
  })

  test("files: private bucket, only the request's own folder, images and PDF up to 10 MB", async () => {
    const { rows } = await f.db.query(`select public, allowed_mime_types from storage.buckets where id = 'design-meeting-files'`)
    expect(rows).toEqual([{ public: false, allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "application/pdf"] }])
    const request = (await insert({ starts_at: "2026-11-09T05:00:00Z", ends_at: "2026-11-09T05:45:00Z" })).rows[0].id as string
    const attach = (path: string, type = "application/pdf", size = 1000) =>
      f.db.query(`insert into design_meeting_attachments (organization_id, request_id, storage_path, content_type, size_bytes) values ($1, $2, $3, $4, $5)`, [f.bonyan, request, path, type, size])
    const ok = `${f.bonyan}/${KEY}/22222222-3333-4444-8555-666666666666.pdf`
    await expect(attach(ok)).resolves.toBeDefined()
    await expect(attach(`${f.other}/${KEY}/22222222-3333-4444-8555-777777777777.pdf`)).rejects.toThrow(/attachments_path/)
    await expect(attach(`${f.bonyan}/${KEY}/22222222-3333-4444-8555-888888888888.exe`)).rejects.toThrow(/attachments_path/)
    await expect(attach(`${f.bonyan}/${KEY}/22222222-3333-4444-8555-999999999999.pdf`, "text/html")).rejects.toThrow(/attachments_type/)
    await expect(attach(`${f.bonyan}/${KEY}/22222222-3333-4444-8555-aaaaaaaaaaaa.pdf`, "application/pdf", 10485761)).rejects.toThrow(/attachments_size/)
  })
})
