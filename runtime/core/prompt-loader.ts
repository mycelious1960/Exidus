import { readFile } from "node:fs/promises"
import path from "node:path"

import { getRuntimeConfig } from "../config.ts"
import type { AgentManifestEntry, ExidusAgentId } from "./types.ts"

const promptCache = new Map<ExidusAgentId, string>()

export async function loadPromptForAgent(
  manifestEntry: AgentManifestEntry,
): Promise<string> {
  const cached = promptCache.get(manifestEntry.id)
  if (cached) {
    return cached
  }

  const { docsRoot } = getRuntimeConfig()
  const promptPath = path.join(docsRoot, manifestEntry.promptFile)
  const prompt = await readFile(promptPath, "utf8")
  promptCache.set(manifestEntry.id, prompt)
  return prompt
}
