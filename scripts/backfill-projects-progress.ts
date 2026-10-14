import * as fs from "fs"
import * as path from "path"

// Load environment variables before other imports
const envFiles = [".env.local", ".env"]
for (const envFile of envFiles) {
  const envPath = path.resolve(process.cwd(), envFile)
  if (fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, "utf8")
    for (const line of envText.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        const val = match[2].trim().replace(/^["']|["']$/g, "")
        if (!process.env[key]) {
          process.env[key] = val
        }
      }
    }
  }
}

import { createAdminClient } from "../lib/supabase/admin"
import { calculateProjectsProgress } from "../lib/db/domain"

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }
  return chunks
}

async function runBackfill() {
  console.log("=== BuildSight Project Progress Backfill ===")
  const admin = createAdminClient()

  console.log("Fetching all projects from database...")
  const { data: allProjects, error: fetchError } = await admin
    .from("projects")
    .select("id, name, code")
    .order("id", { ascending: true })

  if (fetchError || !allProjects) {
    console.error("Failed to load projects:", fetchError)
    process.exit(1)
  }

  const total = allProjects.length
  console.log(`Found ${total} projects to process. Processing in batches of 20...`)

  let updatedCount = 0
  let failedCount = 0
  const nonZeroProjects: Array<{ id: string; name: string; code: string | null; progress: number }> = []

  const batches = chunkArray(allProjects, 20)
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]
    const batchIds = batch.map((p) => p.id)

    try {
      const progressMap = await calculateProjectsProgress(admin, batchIds)

      for (const project of batch) {
        const calculated = progressMap.get(project.id) ?? 0
        try {
          const { error: updateError } = await admin
            .from("projects")
            .update({ progress_actual: calculated })
            .eq("id", project.id)

          if (updateError) {
            console.error(`  [FAILED] Project ${project.code || project.id}:`, updateError.message)
            failedCount++
          } else {
            updatedCount++
            if (calculated > 0) {
              nonZeroProjects.push({
                id: project.id,
                name: project.name,
                code: project.code,
                progress: calculated,
              })
            }
          }
        } catch (updateErr) {
          console.error(`  [FAILED] Project ${project.code || project.id}:`, updateErr)
          failedCount++
        }
      }

      console.log(`Batch ${b + 1}/${batches.length} done (${updatedCount}/${total} updated, ${failedCount} failed)`)
    } catch (batchErr) {
      console.error(`Batch ${b + 1} calculation failed:`, batchErr)
      failedCount += batch.length
    }
  }

  console.log("\n================ SUMMARY ================")
  console.log(`Total: ${total}`)
  console.log(`Updated: ${updatedCount}`)
  console.log(`Failed: ${failedCount}`)
  console.log(`Projects with progress > 0%: ${nonZeroProjects.length}`)
  console.log("=========================================\n")

  // Validation step: Sample verification
  console.log("=== Validating Stored vs Runtime Calculation Sample ===")
  const sampleProjectsToTest: string[] = []

  // Sample some non-zero projects
  for (const p of nonZeroProjects.slice(0, 5)) {
    sampleProjectsToTest.push(p.id)
  }
  // Sample some zero projects
  const zeroProjects = allProjects.filter((p) => !nonZeroProjects.some((nz) => nz.id === p.id))
  for (const p of zeroProjects.slice(0, 5)) {
    sampleProjectsToTest.push(p.id)
  }

  let validationMismatches = 0
  for (const testId of sampleProjectsToTest) {
    const { data: storedRow } = await admin
      .from("projects")
      .select("id, name, code, progress_actual")
      .eq("id", testId)
      .single()

    const runtimeMap = await calculateProjectsProgress(admin, [testId])
    const runtimeVal = runtimeMap.get(testId) ?? 0
    const storedVal = storedRow?.progress_actual ?? 0

    const matches = storedVal === runtimeVal
    console.log(
      `Project [${storedRow?.code || testId}] "${storedRow?.name}": stored=${storedVal}%, runtime=${runtimeVal}% -> ${matches ? "MATCH" : "MISMATCH"}`,
    )
    if (!matches) {
      validationMismatches++
    }
  }

  if (validationMismatches > 0) {
    console.error(`\nValidation FAILED with ${validationMismatches} mismatches!`)
    process.exit(1)
  } else {
    console.log("\nAll sample validations PASSED! Stored equals runtime.")
  }
}

runBackfill().catch((err) => {
  console.error("Backfill failed:", err)
  process.exit(1)
})
