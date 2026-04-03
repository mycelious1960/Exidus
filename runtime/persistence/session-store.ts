import crypto from "node:crypto"
import path from "node:path"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"

import { SCHEMA_VERSION, getRuntimeConfig } from "../config.ts"
import type { RuntimeArtifacts } from "../core/types.ts"
import type { ExidusSessionRecord, PersistedJourneyState } from "../../types/exidus-persistence.ts"

const SESSION_ID_PREFIX = "exidus-session"
const SESSION_ID_PATTERN = /^[a-z0-9-]+$/i

export function createDefaultJourneyState(): PersistedJourneyState {
  return {
    screen: "landing",
    answers: {},
    routeLog: [],
    destinationInput: "",
    comparisonInput: "",
    refinementIntentInput: "",
    refinementPrioritiesInput: "",
    refinementDestinationInput: "",
    refinementNotesInput: "",
  }
}

export function createEmptySessionRecord(sessionId = createSessionId()): ExidusSessionRecord {
  const now = new Date().toISOString()

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    source: "session-store",
    sessionId,
    status: "active",
    artifacts: {},
    journey: createDefaultJourneyState(),
  }
}

export function createSessionId() {
  return `${SESSION_ID_PREFIX}-${crypto.randomUUID()}`
}

export async function resolveSessionRecord(sessionId?: string) {
  if (!sessionId || !isValidSessionId(sessionId)) {
    const created = createEmptySessionRecord()
    await saveSessionRecord(created)
    return created
  }

  const existing = await loadSessionRecord(sessionId)
  if (existing) {
    return existing
  }

  const created = createEmptySessionRecord(sessionId)
  await saveSessionRecord(created)
  return created
}

export async function loadSessionRecord(sessionId: string) {
  if (!isValidSessionId(sessionId)) {
    return undefined
  }

  try {
    const file = await readFile(getSessionPath(sessionId), "utf8")
    const parsed = JSON.parse(file) as ExidusSessionRecord

    return {
      ...createEmptySessionRecord(sessionId),
      ...parsed,
      sessionId,
      artifacts: parsed.artifacts ?? {},
      journey: {
        ...createDefaultJourneyState(),
        ...(parsed.journey ?? {}),
      },
    }
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined
    }

    throw error
  }
}

export async function saveSessionRecord(record: ExidusSessionRecord) {
  const { sessionsRoot } = getRuntimeConfig()
  await mkdir(sessionsRoot, { recursive: true })
  await writeFile(
    getSessionPath(record.sessionId),
    JSON.stringify(record, null, 2),
    "utf8",
  )
}

export async function updateSessionRecord(
  sessionId: string,
  update: {
    artifacts?: RuntimeArtifacts
    journey?: Partial<PersistedJourneyState>
    currentStage?: string
    status?: ExidusSessionRecord["status"]
  },
) {
  const current = await resolveSessionRecord(sessionId)
  const next: ExidusSessionRecord = {
    ...current,
    updatedAt: new Date().toISOString(),
    status: update.status ?? current.status,
    currentStage: update.currentStage ?? current.currentStage,
    artifacts: update.artifacts ?? current.artifacts,
    journey: {
      ...current.journey,
      ...(update.journey ?? {}),
    },
  }

  await saveSessionRecord(next)
  return next
}

export async function resetSessionRecord(sessionId: string) {
  if (isValidSessionId(sessionId)) {
    await rm(getSessionPath(sessionId), { force: true })
  }

  const fresh = createEmptySessionRecord()
  await saveSessionRecord(fresh)
  return fresh
}

function getSessionPath(sessionId: string) {
  const { sessionsRoot } = getRuntimeConfig()
  return path.join(sessionsRoot, `${sessionId}.json`)
}

function isValidSessionId(sessionId: string) {
  return SESSION_ID_PATTERN.test(sessionId)
}

function isMissingFile(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT",
  )
}
