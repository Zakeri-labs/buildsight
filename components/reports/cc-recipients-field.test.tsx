import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { CcRecipientsField } from "./cc-recipients-field"
import type { ProjectCcCandidate, ReportCcSelection } from "@/lib/report-cc/types"

const candidate1: ProjectCcCandidate = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Ali Al-Harthy",
  email: "ali@contractor.com",
  role: "Contractor",
  organizationName: "Apex Contracting",
  phone: "+96891112222",
  avatarUrl: null,
}

const candidate2: ProjectCcCandidate = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Salem Al-Busaidi",
  email: "salem@client.com",
  role: "Client / Owner",
  organizationName: "Private Client",
  phone: "+96893334444",
  avatarUrl: null,
}

const candidates = [candidate1, candidate2]

const sampleSelection: ReportCcSelection = {
  internalUserIds: [candidate1.id, candidate2.id],
  externalRecipients: [],
  reportToUserIds: [candidate1.id],
  ccToUserIds: [candidate2.id],
}

describe("CcRecipientsField - Role-based permissions and UI", () => {
  test("Organization Admin view retains full editing controls and no restriction warning", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <CcRecipientsField
          candidates={candidates}
          value={sampleSelection}
          onChange={() => {}}
          disabled={false}
          isOrgAdmin={true}
        />
      </I18nProvider>,
    )

    // Section title and recipient names are visible
    expect(html).toContain("Report Recipients &amp; Copies")
    expect(html).toContain("Ali Al-Harthy")
    expect(html).toContain("Salem Al-Busaidi")

    // Admin should NOT see the admin-only restriction message
    expect(html).not.toContain("Only an Admin can edit report recipients.")

    // Dropdown triggers should NOT be disabled
    expect(html).not.toContain('aria-disabled="true"')

    // Remove buttons (X) should be rendered
    expect(html).toContain('aria-label="Remove recipient"')
    expect(html).toContain('aria-label="Remove CC recipient"')
  })

  test("Supervisor / Member view renders read-only fields with informational banner", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <CcRecipientsField
          candidates={candidates}
          value={sampleSelection}
          onChange={() => {}}
          disabled={false}
          isOrgAdmin={false}
        />
      </I18nProvider>,
    )

    // Section title and all recipient names/roles are clearly readable
    expect(html).toContain("Report Recipients &amp; Copies")
    expect(html).toContain("Ali Al-Harthy")
    expect(html).toContain("Salem Al-Busaidi")
    expect(html).toContain("Contractor")
    expect(html).toContain("Client / Owner")

    // Informational message is clearly shown
    expect(html).toContain("Only an Admin can edit report recipients.")

    // Dropdown triggers are disabled
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain("cursor-not-allowed")

    // Remove buttons (X) are NOT rendered
    expect(html).not.toContain('aria-label="Remove recipient"')
    expect(html).not.toContain('aria-label="Remove CC recipient"')
  })
})
