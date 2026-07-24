import pg from "pg"

const cleanUrl = process.env.POSTGRES_URL_NON_POOLING.split("?")[0]
const client = new pg.Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } })
await client.connect()

const DISCIPLINES = ["Structural", "MEP", "Architectural", "Civil", "Electrical", "Mechanical"]
const cycle = (arr, i) => arr[i % arr.length]

// --- project definitions (canonical portfolio) ---
const PROJECTS = [
  {
    name: "Sunset Residential Tower", code: "PRJ-001", location: "Dubai, UAE", our_role: "Consultant",
    contractor: "Atlas Contracting", consultant: "Provision Consultancy", client: "Sunset Developments",
    start_date: "2024-01-10", target_handover: "2026-12-18", contract_value: "AED 420M",
    planned: 66, actual: 62, delay: 4, ncr: 8, insp: 4, rfi: 6, vo: 2, image: "/projects/al-noor-tower.png",
  },
  {
    name: "Greenfield Office Complex", code: "PRJ-002", location: "Abu Dhabi, UAE", our_role: "Consultant",
    contractor: "Gulf Builders", consultant: "Provision Consultancy", client: "Greenfield Holdings",
    start_date: "2024-03-05", target_handover: "2026-06-30", contract_value: "AED 280M",
    planned: 48, actual: 45, delay: 3, ncr: 5, insp: 3, rfi: 4, vo: 1, image: "/site/facade-installation.png",
  },
  {
    name: "Harbor View Hotel", code: "PRJ-003", location: "Ras Al Khaimah, UAE", our_role: "Contractor",
    contractor: "Coastal Developers", consultant: "Provision Consultancy", client: "Harbor Hospitality",
    start_date: "2024-02-12", target_handover: "2026-08-28", contract_value: "AED 340M",
    planned: 60, actual: 58, delay: 2, ncr: 6, insp: 3, rfi: 5, vo: 2, image: "/site/structural-works.png",
  },
  {
    name: "City Center Mall", code: "PRJ-004", location: "Dubai, UAE", our_role: "Consultant",
    contractor: "Skyline Contracting", consultant: "Provision Consultancy", client: "City Center Group",
    start_date: "2023-09-01", target_handover: "2027-11-15", contract_value: "AED 510M",
    planned: 73, actual: 71, delay: 2, ncr: 4, insp: 2, rfi: 3, vo: 2, image: "/site/mep-works.png",
  },
  {
    name: "Airport Road Bridge", code: "PRJ-005", location: "Sharjah, UAE", our_role: "Client",
    contractor: "Emirates Construct", consultant: "Provision Consultancy", client: "Roads & Transport Authority",
    start_date: "2024-08-20", target_handover: "2027-03-12", contract_value: "AED 155M",
    planned: 40, actual: 35, delay: 5, ncr: 3, insp: 2, rfi: 2, vo: 1, image: "/site/structural-works.png",
  },
]

const NCR_SEV = ["major", "critical", "major", "minor", "minor", "major", "minor", "critical"]
const NCR_STAT = ["open", "in-review", "open", "closed", "closed", "open", "closed", "in-review"]
const INSP_STAT = ["pending", "in-progress", "approved", "rejected"]
const INSP_PRIO = ["high", "high", "medium", "medium", "low"]
const RFI_STAT = ["open", "answered", "open", "closed", "answered"]
const VO_STAT = ["submitted", "approved", "submitted", "rejected"]
const PEOPLE = [
  ["Ahmed Khalid", "AK"], ["Fatima Ali", "FA"], ["Mohammed Yusuf", "MY"], ["Sara Al Mulla", "SM"], ["Omar Hassan", "OH"],
]
const day = (n) => {
  const d = new Date("2025-05-20")
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

try {
  await client.query("begin")

  // Supervising org + a creator profile
  const org = (await client.query("select id, created_by from organizations where type='supervising' order by created_at limit 1")).rows[0]
  if (!org) throw new Error("No supervising organization found. Complete onboarding first.")
  const creator =
    org.created_by ||
    (await client.query("select user_id from organization_memberships where organization_id=$1 and role='org_admin' limit 1", [org.id])).rows[0]?.user_id ||
    null

  // Clean previous seed (domain rows + our named projects) for idempotency
  await client.query("delete from public.ncrs")
  await client.query("delete from public.inspections")
  await client.query("delete from public.rfis")
  await client.query("delete from public.variation_orders")
  await client.query("delete from public.tasks")
  await client.query("delete from public.activity_log")
  await client.query(
    "delete from public.projects where supervising_organization_id=$1 and name = any($2)",
    [org.id, PROJECTS.map((p) => p.name)],
  )

  const projectIds = {}
  let sort = 0
  for (const p of PROJECTS) {
    const res = await client.query(
      `insert into public.projects
        (name, code, location, status, supervising_organization_id, created_by, image, our_role,
         contractor, consultant, client, start_date, target_handover, contract_value,
         progress_planned, progress_actual, progress_delay, sort_order)
       values ($1,$2,$3,'active',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       returning id`,
      [p.name, p.code, p.location, org.id, creator, p.image, p.our_role, p.contractor, p.consultant,
       p.client, p.start_date, p.target_handover, p.contract_value, p.planned, p.actual, p.delay, sort++],
    )
    const pid = res.rows[0].id
    projectIds[p.name] = pid
    const short = p.code.replace("PRJ-", "")

    // NCRs
    for (let i = 0; i < p.ncr; i++) {
      const [who, ini] = cycle(PEOPLE, i)
      await client.query(
        `insert into public.ncrs
          (project_id, code, title, discipline, location, severity, status, raised_by, raised_on,
           assigned_to, assigned_initials, due_date, description, root_cause, corrective_action)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [pid, `NCR-${short}-${String(i + 1).padStart(3, "0")}`,
         cycle(["Honeycombing at column", "Incorrect rebar spacing", "Water ingress at wall",
                "Fire-stopping missing at riser", "Blockwork alignment deviation", "Cracking in slab soffit",
                "Non-approved material used", "Insufficient concrete cover"], i),
         cycle(DISCIPLINES, i), cycle(["Level 12 - Slab", "Level 10 - Column", "Basement 2 - Wall", "Level 9 - Riser", "Level 8 - Partition"], i),
         cycle(NCR_SEV, i), cycle(NCR_STAT, i), who, day(30 - i * 2),
         p.contractor, "AC", day(20 - i * 2),
         "Non-conformance identified during site inspection and raised for corrective action.",
         "Workmanship and coordination gap between trades.",
         "Rectify affected works to approved specification and re-inspect before proceeding."],
      )
    }

    // Inspections
    for (let i = 0; i < p.insp; i++) {
      const [who, ini] = cycle(PEOPLE, i)
      await client.query(
        `insert into public.inspections
          (project_id, code, title, discipline, location, requested_by, assigned_to, assigned_initials,
           scheduled, due_date, overdue, priority, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [pid, `INSP-${short}-${String(i + 1).padStart(3, "0")}`,
         cycle(["Rebar Inspection", "MEP Rough-in", "Blockwork", "Waterproofing", "Slab Concreting", "Electrical Containment"], i),
         cycle(DISCIPLINES, i), cycle(["Level 12", "Level 10", "Level 8", "Podium Deck", "Level 9"], i),
         p.contractor, who, ini, `${day(4 - i)}, 10:00 AM`, day(4 - i), i === 0, cycle(INSP_PRIO, i), cycle(INSP_STAT, i)],
      )
    }

    // RFIs
    for (let i = 0; i < p.rfi; i++) {
      const [who] = cycle(PEOPLE, i)
      const st = cycle(RFI_STAT, i)
      await client.query(
        `insert into public.rfis
          (project_id, code, subject, discipline, status, priority, submitted_by, submitted_on, due_date, question, response)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [pid, `RFI-${short}-${String(i + 1).padStart(3, "0")}`,
         cycle(["Clarification on beam detail", "Approved paint finish", "Duct routing coordination",
                "Waterproofing spec", "Door schedule confirmation", "Structural connection detail"], i),
         cycle(DISCIPLINES, i), st, cycle(["high", "medium", "low"], i), who, day(25 - i * 2), day(10 - i),
         "Contractor requests clarification on the referenced design detail before proceeding.",
         st === "open" ? null : "Design team has issued the requested clarification; proceed as advised."],
      )
    }

    // Variation Orders
    for (let i = 0; i < p.vo; i++) {
      await client.query(
        `insert into public.variation_orders
          (project_id, code, title, status, amount, currency, submitted_by, submitted_on, description)
         values ($1,$2,$3,$4,$5,'AED',$6,$7,$8)`,
        [pid, `VO-${short}-${String(i + 1).padStart(3, "0")}`,
         cycle(["Additional basement waterproofing", "Facade specification upgrade", "Extra MEP provisions", "Landscaping scope change"], i),
         cycle(VO_STAT, i), (i + 1) * 125000, cycle(PEOPLE, i)[0], day(18 - i * 3),
         "Variation to the original scope of works agreed with the client."],
      )
    }
  }

  // --- My Tasks (portfolio) ---
  const tasks = [
    ["Review NCR", "NCR", "NCR-001-001", "Sunset Residential Tower", "Due today", "danger"],
    ["Inspection", "Inspection", "INSP-002-001", "Greenfield Office Complex", "Due tomorrow", "warning"],
    ["Answer RFI", "RFI", "RFI-003-001", "Harbor View Hotel", "May 20", "muted"],
    ["Approve VO", "VO", "VO-004-001", "City Center Mall", "May 22", "muted"],
  ]
  let ts = 0
  for (const [action, type, reference, project, due, tone] of tasks) {
    await client.query(
      `insert into public.tasks (project_id, action, type, reference, due_label, due_tone, assignee_id, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [projectIds[project], action, type, reference, due, tone, creator, ts++],
    )
  }

  // --- Activity feed (portfolio) ---
  const activity = [
    ["ncr", "created", "NCR-001-001", "Sunset Residential Tower", 0],
    ["inspection", "completed", "INSP-002-001", "Greenfield Office Complex", 1],
    ["rfi", "answered", "RFI-003-001", "Harbor View Hotel", 2],
    ["vo", "approved", "VO-004-001", "City Center Mall", 3],
    ["document", "Document uploaded", null, "Airport Road Bridge", 5],
  ]
  for (const [type, verb, reference, project, hoursAgo] of activity) {
    const created = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString()
    await client.query(
      `insert into public.activity_log (project_id, type, verb, reference, created_at)
       values ($1,$2,$3,$4,$5)`,
      [projectIds[project], type, verb, reference, created],
    )
  }

  await client.query("commit")

  const counts = await client.query(
    `select
       (select count(*) from projects where supervising_organization_id=$1) projects,
       (select count(*) from ncrs) ncrs,
       (select count(*) from inspections) inspections,
       (select count(*) from rfis) rfis,
       (select count(*) from variation_orders) vos,
       (select count(*) from tasks) tasks,
       (select count(*) from activity_log) activity`,
    [org.id],
  )
  console.log("SEED_OK", JSON.stringify(counts.rows[0]))
} catch (err) {
  await client.query("rollback")
  console.error("SEED_ERR", err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
