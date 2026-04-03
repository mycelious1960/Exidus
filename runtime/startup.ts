import { access, mkdir, readFile } from "node:fs/promises"
import { constants } from "node:fs"
import path from "node:path"

import { describeRuntimeConfig, getRuntimeConfig } from "./config.ts"
import type { AgentManifest } from "./core/types.ts"

export interface StartupCheck {
  name: string
  status: "pass" | "fail"
  detail: string
}

export interface StartupReadinessReport {
  ok: boolean
  config: ReturnType<typeof describeRuntimeConfig>
  checks: StartupCheck[]
}

export async function inspectStartupReadiness(): Promise<StartupReadinessReport> {
  const config = describeRuntimeConfig()
  const checks: StartupCheck[] = []

  await pushDirectoryCheck(checks, "publicDir", config.publicDir)
  await pushDirectoryCheck(checks, "docsRoot", config.docsRoot)
  await pushSessionsRootCheck(checks, config.sessionsRoot)

  const manifest = await loadManifestCheck(checks, config.manifestPath)
  if (manifest) {
    await pushPromptChecks(checks, config.docsRoot, manifest)
  }

  return {
    ok: checks.every((check) => check.status === "pass"),
    config,
    checks,
  }
}

export async function assertStartupReadiness() {
  const report = await inspectStartupReadiness()
  if (!report.ok) {
    const failures = report.checks
      .filter((check) => check.status === "fail")
      .map((check) => `${check.name}: ${check.detail}`)
      .join("; ")
    throw new Error(`Startup validation failed. ${failures}`)
  }

  return report
}

async function pushDirectoryCheck(
  checks: StartupCheck[],
  name: string,
  targetPath: string,
) {
  try {
    await access(targetPath, constants.R_OK)
    checks.push({
      name,
      status: "pass",
      detail: `${name} is readable at ${targetPath}`,
    })
  } catch (error) {
    checks.push({
      name,
      status: "fail",
      detail: formatPathError(targetPath, error),
    })
  }
}

async function pushSessionsRootCheck(checks: StartupCheck[], sessionsRoot: string) {
  try {
    await mkdir(sessionsRoot, { recursive: true })
    await access(sessionsRoot, constants.R_OK | constants.W_OK)
    checks.push({
      name: "sessionsRoot",
      status: "pass",
      detail: `sessionsRoot is writable at ${sessionsRoot}`,
    })
  } catch (error) {
    checks.push({
      name: "sessionsRoot",
      status: "fail",
      detail: formatPathError(sessionsRoot, error),
    })
  }
}

async function loadManifestCheck(
  checks: StartupCheck[],
  manifestPath: string,
): Promise<AgentManifest | undefined> {
  try {
    const rawManifest = await readFile(manifestPath, "utf8")
    const manifest = JSON.parse(rawManifest) as AgentManifest
    checks.push({
      name: "manifestPath",
      status: "pass",
      detail: `manifest loaded from ${manifestPath}`,
    })
    return manifest
  } catch (error) {
    checks.push({
      name: "manifestPath",
      status: "fail",
      detail: formatPathError(manifestPath, error),
    })
    return undefined
  }
}

async function pushPromptChecks(
  checks: StartupCheck[],
  docsRoot: string,
  manifest: AgentManifest,
) {
  const missingPromptPaths: string[] = []

  for (const agent of manifest.agents) {
    const promptPath = path.join(docsRoot, agent.promptFile)

    try {
      await access(promptPath, constants.R_OK)
    } catch {
      missingPromptPaths.push(promptPath)
    }
  }

  if (missingPromptPaths.length === 0) {
    checks.push({
      name: "agentPrompts",
      status: "pass",
      detail: `all ${manifest.agents.length} agent prompt files are readable`,
    })
    return
  }

  checks.push({
    name: "agentPrompts",
    status: "fail",
    detail: `missing prompt files: ${missingPromptPaths.join(", ")}`,
  })
}

function formatPathError(targetPath: string, error: unknown) {
  const message = error instanceof Error ? error.message : "unknown filesystem error"
  return `${targetPath}: ${message}`
}
