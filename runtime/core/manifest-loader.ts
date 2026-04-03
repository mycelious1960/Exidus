import { readFile } from "node:fs/promises"

import { getRuntimeConfig } from "../config.ts"
import type { AgentManifest } from "./types.ts"

export async function loadAgentManifest(): Promise<AgentManifest> {
  const { manifestPath } = getRuntimeConfig()
  const rawManifest = await readFile(manifestPath, "utf8")
  return JSON.parse(rawManifest) as AgentManifest
}
