export type RouterTarget =
  | "clarityEngine"
  | "guideAgent"
  | "destinationResearchAgent"
  | "fitComparisonAgent"
  | "actionPlanningAgent"
  | "reportRefinementAgent"
  | "improvementAgent"

export type RouterConfidence = "high" | "medium" | "low"

export type RouterStateBucket =
  | "unassessed"
  | "assessedNotInterpreted"
  | "interpretedNotResearched"
  | "activelyResearching"
  | "comparingShortlist"
  | "planning"
  | "revising"

export interface RouterDecision {
  target: RouterTarget
  reason: string
  prerequisitesMissing?: string[]
  confidence: RouterConfidence
  stateBucket?: RouterStateBucket
}

export interface GuidanceSummary {
  schemaVersion: string
  createdAt: string
  updatedAt: string
  source: "guide-agent"
  mode: "explain" | "focus" | "tension" | "routing"
  userIntent?: string
  summary: string
  explanation: string
  whatThisMeans: string[]
  whatMattersMostNow: string[]
  keyTakeaways: string[]
  focusNext: string[]
  suggestedNextMove?: string
  tensionNotes: string[]
  groundedIn: {
    readinessLevel: string
    fitDirectionArchetype: string
    primaryLifeArchetype: string
    topPriorities: string[]
    contradictionFlags: string[]
  }
}

export interface AgentInvocationContext {
  sessionId?: string
  userId?: string
  activeAgentId?: string
  priorAgentId?: string
  availableArtifacts?: string[]
  notes?: string[]
}
