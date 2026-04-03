import path from "node:path"
import { fileURLToPath } from "node:url"
import { existsSync } from "node:fs"

const CURRENT_FILE = fileURLToPath(import.meta.url)
const CURRENT_DIR = path.dirname(CURRENT_FILE)

export const SCHEMA_VERSION = "1.0"

export interface ExidusRuntimeConfig {
  repoRoot: string
  dataRoot: string
  sessionsRoot: string
  docsRoot: string
  agenticDocsRoot: string
  manifestPath: string
  publicDir: string
  host: string
  port: number
  runtimeEnv: string
}

let cachedConfig: ExidusRuntimeConfig | undefined

export function getRuntimeConfig(): ExidusRuntimeConfig {
  if (cachedConfig) {
    return cachedConfig
  }

  const repoRoot = path.resolve(CURRENT_DIR, "..")
  const docsRoot = resolveDocsRoot(repoRoot)
  const agenticDocsRoot = path.join(docsRoot, "Agentic")
  const dataRoot = resolvePathFromEnv("EXIDUS_DATA_ROOT", path.join(repoRoot, ".data"))

  cachedConfig = {
    repoRoot,
    dataRoot,
    sessionsRoot: path.join(dataRoot, "sessions"),
    docsRoot,
    agenticDocsRoot,
    manifestPath: resolvePathFromEnv(
      "EXIDUS_MANIFEST_PATH",
      path.join(agenticDocsRoot, "Exidus Agent Manifest v1.json"),
    ),
    publicDir: resolvePathFromEnv("EXIDUS_PUBLIC_DIR", path.join(repoRoot, "app", "public")),
    host: process.env.HOST?.trim() || "127.0.0.1",
    port: parsePort(process.env.PORT),
    runtimeEnv: process.env.EXIDUS_RUNTIME_ENV?.trim() || process.env.NODE_ENV?.trim() || "development",
  }

  return cachedConfig
}

export function describeRuntimeConfig() {
  const config = getRuntimeConfig()

  return {
    runtimeEnv: config.runtimeEnv,
    host: config.host,
    port: config.port,
    repoRoot: config.repoRoot,
    dataRoot: config.dataRoot,
    sessionsRoot: config.sessionsRoot,
    docsRoot: config.docsRoot,
    manifestPath: config.manifestPath,
    publicDir: config.publicDir,
  }
}

function resolveDocsRoot(repoRoot: string) {
  const override = process.env.EXIDUS_DOCS_ROOT?.trim()
  if (override) {
    return resolveConfiguredPath(override, repoRoot)
  }

  const siblingDocsRoot = path.resolve(repoRoot, "..", "obsidian-exidus")
  if (existsSync(siblingDocsRoot)) {
    return siblingDocsRoot
  }

  return siblingDocsRoot
}

function resolvePathFromEnv(name: string, fallback: string, baseDir = CURRENT_DIR) {
  const value = process.env[name]?.trim()
  if (!value) {
    return fallback
  }

  return resolveConfiguredPath(value, baseDir)
}

function parsePort(rawPort: string | undefined) {
  if (!rawPort || rawPort.trim().length === 0) {
    return 3000
  }

  const candidate = Number(rawPort)
  if (Number.isInteger(candidate) && candidate > 0 && candidate <= 65535) {
    return candidate
  }

  throw new Error(
    `Invalid PORT value "${rawPort}". Set PORT to an integer between 1 and 65535.`,
  )
}

function resolveConfiguredPath(value: string, baseDir: string) {
  if (path.isAbsolute(value)) {
    return path.normalize(value)
  }

  return path.resolve(baseDir, value)
}
