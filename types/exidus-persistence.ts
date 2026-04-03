import type { RuntimeArtifacts } from "../runtime/core/types.ts"
import type { ImprovementRouteRecord } from "./exidus-improvement-schema.ts"

export type PersistedRouteLogEntry = ImprovementRouteRecord & {
  prerequisitesMissing?: string[]
}

export interface PersistedJourneyState {
  screen: string
  answers: Record<string, unknown>
  routeLog: PersistedRouteLogEntry[]
  destinationInput: string
  comparisonInput: string
  refinementIntentInput: string
  refinementPrioritiesInput: string
  refinementDestinationInput: string
  refinementNotesInput: string
}

export interface ExidusSessionRecord {
  schemaVersion: string
  createdAt: string
  updatedAt: string
  source: "session-store"
  sessionId: string
  status: "active" | "reset"
  currentStage?: string
  artifacts: RuntimeArtifacts
  journey: PersistedJourneyState
}
