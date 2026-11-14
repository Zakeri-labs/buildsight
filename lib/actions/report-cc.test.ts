import { beforeEach, describe, expect, test, vi } from "vitest"

const PROJECT_ID = "11111111-2222-4333-8444-555555555555"
const RESPONSE_ID = "22222222-3333-4444-8555-666666666666"
const SUPERVISING_ORG_ID = "33333333-4444-4555-8666-777777777777"
const ACTOR_ADMIN_ID = "44444444-5555-4666-8777-888888888888"
const ACTOR_SUPERVISOR_ID = "55555555-6666-4777-8888-999999999999"
const CONTRACTOR_USER_ID = "66666666-7777-4888-8999-000000000000"
const OWNER_USER_ID = "77777777-8888-4999-8000-111111111111"
const FORGED_USER_ID = "88888888-9999-4000-8111-222222222222"

let currentActorId = ACTOR_ADMIN_ID
let currentOrgRole: "org_admin" | "org_member" | "org_manager" = "org_admin"
let existingRecipientsInDb: any[] = []

// Mock supabase client and admin client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: RESPONSE_ID,
                project_id: PROJECT_ID,
                project_stage_id: "stage-1",
                project_stage_term_id: null,
                report_number: 1,
                report_title: "Inspection Report",
                status: "draft",
                created_by: currentActorId,
              },
              error: null,
            }),
          }),
          maybeSingle: async () => {
            if (table === "projects") {
              return {
                data: {
                  id: PROJECT_ID,
                  name: "Sample Project",
                  supervising_organization_id: SUPERVISING_ORG_ID,
                },
                error: null,
              }
            }
            return { data: null, error: null }
          },
        }),
      }),
    }),
  })),
}))

vi.mock("@/lib/auth/guards", () => ({
  assertProjectMember: vi.fn(async () => currentActorId),
  assertProjectAdmin: vi.fn(async () => currentActorId),
  audit: vi.fn(async () => {}),
  AuthzError: class AuthzError extends Error {},
}))

vi.mock("@/lib/report-cc/server", () => ({
  loadProjectCcCandidates: vi.fn(async () => [
    {
      id: CONTRACTOR_USER_ID,
      name: "Contractor Ali",
      email: "ali@contractor.com",
      role: "contractor",
      organizationName: "Apex Co",
    },
    {
      id: OWNER_USER_ID,
      name: "Owner Salem",
      email: "salem@owner.com",
      role: "client / owner",
      organizationName: "Client Org",
    },
  ]),
  loadProjectParticipantsOnly: vi.fn(async () => [
    {
      id: CONTRACTOR_USER_ID,
      name: "Contractor Ali",
      email: "ali@contractor.com",
      role: "contractor",
      organizationName: "Apex Co",
    },
    {
      id: OWNER_USER_ID,
      name: "Owner Salem",
      email: "salem@owner.com",
      role: "client / owner",
      organizationName: "Client Org",
    },
  ]),
  loadReportCcRecipients: vi.fn(async () => existingRecipientsInDb),
}))

vi.mock("@/lib/email/report-cc", () => ({
  sendReportCcEmails: vi.fn(async () => []),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("next/server", () => ({
  after: (cb: () => void) => cb(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "organization_memberships") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: (_col: string, val: string) => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: currentOrgRole === "org_admin" ? { id: "mem-1" } : null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === "profiles") {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => ({
              data: ids.map((id) => ({ id })),
              error: null,
            }),
          }),
        }
      }
      if (table === "report_cc_recipients") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: async () => ({
                  data: existingRecipientsInDb,
                  error: null,
                }),
              }),
            }),
          }),
          delete: () => ({
            in: async () => ({ error: null }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
          insert: (payload: any) => ({
            select: () => ({
              single: async () => ({
                data: { id: "new-rec-id", ...payload },
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    },
  }),
}))

const { saveReportCcRecipientsAction } = await import("./report-cc")

describe("saveReportCcRecipientsAction - Server-side authorization", () => {
  beforeEach(() => {
    currentActorId = ACTOR_ADMIN_ID
    currentOrgRole = "org_admin"
    existingRecipientsInDb = []
  })

  test("Organization Admin can save and modify recipients", async () => {
    currentActorId = ACTOR_ADMIN_ID
    currentOrgRole = "org_admin"

    const result = await saveReportCcRecipientsAction({
      projectId: PROJECT_ID,
      responseId: RESPONSE_ID,
      context: "report",
      internalUserIds: [CONTRACTOR_USER_ID, OWNER_USER_ID],
      externalRecipients: [],
      reportToUserIds: [CONTRACTOR_USER_ID],
      ccToUserIds: [OWNER_USER_ID],
    })

    expect(result.ok).toBe(true)
  })

  test("Supervisor cannot modify existing recipients and gets authorization error", async () => {
    currentActorId = ACTOR_SUPERVISOR_ID
    currentOrgRole = "org_member"

    // Existing recipients in DB
    existingRecipientsInDb = [
      {
        id: "rec-1",
        recipient_type: "internal",
        user_id: CONTRACTOR_USER_ID,
        external_name: null,
        external_email: null,
        external_company: null,
        external_role: null,
        recipient_group: "reportTo",
      },
    ]

    // Supervisor attempts to forge/add a new recipient (FORGED_USER_ID)
    const result = await saveReportCcRecipientsAction({
      projectId: PROJECT_ID,
      responseId: RESPONSE_ID,
      context: "report",
      internalUserIds: [CONTRACTOR_USER_ID, FORGED_USER_ID],
      externalRecipients: [],
      reportToUserIds: [CONTRACTOR_USER_ID],
      ccToUserIds: [FORGED_USER_ID],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("Only an Organization Admin can edit report recipients.")
    }
  })

  test("Supervisor submitting unchanged existing recipients succeeds safely", async () => {
    currentActorId = ACTOR_SUPERVISOR_ID
    currentOrgRole = "org_member"

    // Existing recipients in DB
    existingRecipientsInDb = [
      {
        id: "rec-1",
        recipient_type: "internal",
        user_id: CONTRACTOR_USER_ID,
        external_name: null,
        external_email: null,
        external_company: null,
        external_role: null,
        recipient_group: "reportTo",
      },
    ]

    // Supervisor submits the form without modifying recipients
    const result = await saveReportCcRecipientsAction({
      projectId: PROJECT_ID,
      responseId: RESPONSE_ID,
      context: "report",
      internalUserIds: [CONTRACTOR_USER_ID],
      externalRecipients: [],
      reportToUserIds: [CONTRACTOR_USER_ID],
      ccToUserIds: [],
    })

    expect(result.ok).toBe(true)
  })

  test("Supervisor cannot forge unauthorized recipients on brand-new report", async () => {
    currentActorId = ACTOR_SUPERVISOR_ID
    currentOrgRole = "org_member"

    // Brand new report (no recipients in DB yet)
    existingRecipientsInDb = []

    // Supervisor attempts to forge a random user not matching project defaults
    const result = await saveReportCcRecipientsAction({
      projectId: PROJECT_ID,
      responseId: RESPONSE_ID,
      context: "report",
      internalUserIds: [FORGED_USER_ID],
      externalRecipients: [],
      reportToUserIds: [FORGED_USER_ID],
      ccToUserIds: [],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("Only an Organization Admin can edit report recipients.")
    }
  })

  test("Supervisor saving default recipients on brand-new report succeeds", async () => {
    currentActorId = ACTOR_SUPERVISOR_ID
    currentOrgRole = "org_member"

    // Brand new report (no recipients in DB yet)
    existingRecipientsInDb = []

    // Supervisor submits the default project participants (Contractor as Report To, Owner as CC To)
    const result = await saveReportCcRecipientsAction({
      projectId: PROJECT_ID,
      responseId: RESPONSE_ID,
      context: "report",
      internalUserIds: [CONTRACTOR_USER_ID, OWNER_USER_ID],
      externalRecipients: [],
      reportToUserIds: [CONTRACTOR_USER_ID],
      ccToUserIds: [OWNER_USER_ID],
    })

    expect(result.ok).toBe(true)
  })

  test("Organization Manager cannot modify existing report recipients", async () => {
    currentActorId = "manager-user-id"
    currentOrgRole = "org_manager"

    existingRecipientsInDb = [
      {
        id: "rec-1",
        recipient_type: "internal",
        user_id: CONTRACTOR_USER_ID,
        external_name: null,
        external_email: null,
        external_company: null,
        external_role: null,
        recipient_group: "reportTo",
      },
    ]

    // Manager attempts to remove the recipient
    const result = await saveReportCcRecipientsAction({
      projectId: PROJECT_ID,
      responseId: RESPONSE_ID,
      context: "report",
      internalUserIds: [],
      externalRecipients: [],
      reportToUserIds: [],
      ccToUserIds: [],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("Only an Organization Admin can edit report recipients.")
    }
  })
})
