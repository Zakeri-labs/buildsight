import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"

export type OrganizationReportCredits = {
  totalReportCredits: number
  usedReportCredits: number
  remainingReportCredits: number
  expiresAt: string | null
}

const DEFAULT_TOTAL_CREDITS = 300

/**
 * Fetch subscription and report credit details for an organization.
 * Fallback to default values (300 total, 0 used) if no row exists or table is unavailable.
 */
export async function getOrganizationReportCredits(
  organizationId: string | null,
  client?: ReturnType<typeof createAdminClient>,
): Promise<OrganizationReportCredits> {
  if (!organizationId) {
    return {
      totalReportCredits: DEFAULT_TOTAL_CREDITS,
      usedReportCredits: 0,
      remainingReportCredits: DEFAULT_TOTAL_CREDITS,
      expiresAt: null,
    }
  }

  const admin = client ?? createAdminClient()

  try {
    const { data: sub, error } = await admin
      .from("organization_subscriptions")
      .select("id, total_report_credits, used_report_credits, expires_at")
      .eq("organization_id", organizationId)
      .maybeSingle()

    if (error) {
      console.warn("getOrganizationReportCredits query error:", error.message)
      return {
        totalReportCredits: DEFAULT_TOTAL_CREDITS,
        usedReportCredits: 0,
        remainingReportCredits: DEFAULT_TOTAL_CREDITS,
        expiresAt: null,
      }
    }

    if (!sub) {
      return {
        totalReportCredits: DEFAULT_TOTAL_CREDITS,
        usedReportCredits: 0,
        remainingReportCredits: DEFAULT_TOTAL_CREDITS,
        expiresAt: null,
      }
    }

    const total = sub.total_report_credits ?? DEFAULT_TOTAL_CREDITS
    const used = sub.used_report_credits ?? 0
    const remaining = Math.max(0, total - used)

    return {
      totalReportCredits: total,
      usedReportCredits: used,
      remainingReportCredits: remaining,
      expiresAt: sub.expires_at ?? null,
    }
  } catch (err) {
    console.error("Failed to resolve organization report credits:", err)
    return {
      totalReportCredits: DEFAULT_TOTAL_CREDITS,
      usedReportCredits: 0,
      remainingReportCredits: DEFAULT_TOTAL_CREDITS,
      expiresAt: null,
    }
  }
}

/**
 * Record credit consumption for a report if it has not been recorded yet.
 * Idempotent: If reportId is already present in report_credit_usage, no credit is deducted.
 */
export async function consumeReportCreditForReport(
  reportId: string,
  organizationId: string,
  client?: ReturnType<typeof createAdminClient>,
): Promise<{ ok: boolean; alreadyConsumed: boolean }> {
  if (!reportId || !organizationId) {
    return { ok: false, alreadyConsumed: false }
  }

  const admin = client ?? createAdminClient()

  try {
    // 1. Check if report_id has already consumed a credit
    const { data: existingUsage, error: checkError } = await admin
      .from("report_credit_usage")
      .select("id")
      .eq("report_id", reportId)
      .maybeSingle()

    if (!checkError && existingUsage) {
      return { ok: true, alreadyConsumed: true }
    }

    // 2. Fetch or create organization_subscription row
    let { data: sub, error: subError } = await admin
      .from("organization_subscriptions")
      .select("id, used_report_credits")
      .eq("organization_id", organizationId)
      .maybeSingle()

    if (subError && subError.code !== "PGRST116") {
      console.warn("consumeReportCreditForReport subscription lookup warning:", subError.message)
    }

    if (!sub) {
      const { data: newSub, error: createSubError } = await admin
        .from("organization_subscriptions")
        .insert({
          organization_id: organizationId,
          total_report_credits: DEFAULT_TOTAL_CREDITS,
          used_report_credits: 0,
        })
        .select("id, used_report_credits")
        .single()

      if (createSubError) {
        if (createSubError.code === "23505") {
          // Concurrent creation race condition, fetch again
          const { data: refetchedSub } = await admin
            .from("organization_subscriptions")
            .select("id, used_report_credits")
            .eq("organization_id", organizationId)
            .maybeSingle()
          sub = refetchedSub
        } else {
          console.error("Failed to auto-create organization_subscriptions record:", createSubError)
          return { ok: false, alreadyConsumed: false }
        }
      } else {
        sub = newSub
      }
    }

    if (!sub?.id) {
      return { ok: false, alreadyConsumed: false }
    }

    // 3. Insert usage record
    const { error: insertUsageError } = await admin
      .from("report_credit_usage")
      .insert({
        organization_id: organizationId,
        subscription_id: sub.id,
        report_id: reportId,
      })

    if (insertUsageError) {
      if (insertUsageError.code === "23505") {
        // Unique constraint violation on report_id -> already consumed!
        return { ok: true, alreadyConsumed: true }
      }
      console.error("Failed to insert report_credit_usage record:", insertUsageError)
      return { ok: false, alreadyConsumed: false }
    }

    // 4. Increment used_report_credits on organization_subscriptions
    const currentUsed = sub.used_report_credits ?? 0
    const { error: updateSubError } = await admin
      .from("organization_subscriptions")
      .update({
        used_report_credits: currentUsed + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id)

    if (updateSubError) {
      console.error("Failed to increment used_report_credits:", updateSubError)
    }

    return { ok: true, alreadyConsumed: false }
  } catch (err) {
    console.error("consumeReportCreditForReport error:", err)
    return { ok: false, alreadyConsumed: false }
  }
}
