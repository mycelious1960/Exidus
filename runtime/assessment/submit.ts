import crypto from "node:crypto"

import type {
  AssessmentAnswers,
  ArchetypeProfile,
  AssessmentSignals,
  ClarityReport,
  ReadinessProfile,
  UserProfile,
} from "../../types/exidus-schema.ts"
import { SCHEMA_VERSION } from "../config.ts"
import { getExidusRuntime } from "../system.ts"
import { ASSESSMENT_FLOW } from "./flow.ts"

type UiPrimitive = string | string[] | number | boolean | null | undefined

export interface AssessmentSubmissionInput {
  answers: Record<string, UiPrimitive>
  sessionId?: string
}

export interface AssessmentSubmissionResult {
  assessmentAnswers: AssessmentAnswers
  userProfile: UserProfile
  assessmentSignals: AssessmentSignals
  archetypeProfile: ArchetypeProfile
  clarityReport: ClarityReport
  readinessProfile: ReadinessProfile
}

export async function runAssessmentSubmission(
  input: AssessmentSubmissionInput,
): Promise<AssessmentSubmissionResult> {
  const assessmentAnswers = mapSubmissionToAssessmentAnswers(input.answers, input.sessionId)
  const runtime = await getExidusRuntime()
  const result = await runtime.registry.invoke({
    agentId: "clarity-engine",
    userIntent: "Generate my baseline clarity report from the assessment flow.",
    artifacts: {
      assessmentAnswers,
    },
  })

  if (
    !result.artifacts.userProfile ||
    !result.artifacts.assessmentSignals ||
    !result.artifacts.archetypeProfile ||
    !result.artifacts.clarityReport ||
    !result.artifacts.readinessProfile
  ) {
    throw new Error("Clarity Engine did not return a baseline report")
  }

  return {
    assessmentAnswers,
    userProfile: result.artifacts.userProfile,
    assessmentSignals: result.artifacts.assessmentSignals,
    archetypeProfile: result.artifacts.archetypeProfile,
    clarityReport: result.artifacts.clarityReport,
    readinessProfile: result.artifacts.readinessProfile,
  }
}

export function mapSubmissionToAssessmentAnswers(
  answers: Record<string, UiPrimitive>,
  sessionId?: string,
): AssessmentAnswers {
  const now = new Date().toISOString()
  const resolvedSessionId = sessionId ?? `session-${crypto.randomUUID()}`

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    source: "assessment",
    assessmentId: `assessment-${crypto.randomUUID()}`,
    sessionId: resolvedSessionId,
    answers: {
      profileType: "solo",
      nationality: "American",
      currentCountry: "United States",
      budgetMonthlyCurrency: "USD",
      openToSuggestions: true,
      pushFactors: asStringArray(answers.pushFactors),
      pullFactors: asStringArray(answers.pullFactors),
      destinationCriteriaRanked: asStringArray(answers.destinationCriteriaRanked),
      nonNegotiables: asStringArray(answers.nonNegotiables),
      destinationsConsidering: parseDestinations(answers.destinationsConsidering),
      motivationOrientation: asOptionalString(answers.motivationOrientation),
      incomePortability: mapIncomeSituation(answers.incomeSituation),
      financialConfidence: asScale(answers.financialConfidence),
      obligationsLevel: mapObligations(asStringArray(answers.obligations)),
      adminReadiness: mapAdminReadiness(answers.adminReadiness),
      timelineTargetWindow: mapTimelineLabel(answers.timeline),
      timelineUrgencyLevel: mapTimelineUrgency(answers.timeline),
      timelineMonths: mapTimelineMonths(answers.timeline),
      uncertaintyTolerance: asScale(answers.uncertaintyTolerance),
      tradeoffAffordabilityVsBelonging: asOptionalString(
        answers.tradeoffAffordabilityVsBelonging,
      ),
      tradeoffInfrastructureVsPace: asOptionalString(
        answers.tradeoffInfrastructureVsPace,
      ),
      tradeoffEaseVsEmotionalFit: asOptionalString(
        answers.tradeoffEaseVsEmotionalFit,
      ),
    },
    freeText: {
      reflectionWhyNow: asOptionalString(answers.reflectionWhyNow) ?? "",
      reflectionBetterLife: asOptionalString(answers.reflectionBetterLife) ?? "",
      reflectionConstraints: asOptionalString(answers.reflectionConstraints) ?? "",
      biggestQuestion: asOptionalString(answers.biggestQuestion) ?? "",
      lifeVision: asOptionalString(answers.lifeVision) ?? "",
      nextStepFocus: asOptionalString(answers.nextStepFocus) ?? "",
    },
    completedModules: ASSESSMENT_FLOW.map((module) => module.id),
    completionState: "completed",
  }
}

function mapIncomeSituation(value: UiPrimitive) {
  switch (value) {
    case "portableStable":
      return 5
    case "portableInconsistent":
      return 4
    case "uncertain":
      return 2
    case "tiedToLocation":
      return 1
    default:
      return 3
  }
}

function mapObligations(values: string[]) {
  if (values.length === 0 || values.includes("none")) {
    return 1
  }
  if (values.length === 1) {
    return 2
  }
  if (values.length === 2) {
    return 3
  }
  if (values.length === 3) {
    return 4
  }

  return 5
}

function mapAdminReadiness(value: UiPrimitive) {
  switch (value) {
    case "veryEarly":
      return 1
    case "awareNotOrganized":
      return 2
    case "moderatelyPrepared":
      return 3
    case "highlyPrepared":
      return 5
    default:
      return 3
  }
}

function mapTimelineLabel(value: UiPrimitive) {
  switch (value) {
    case "within6Months":
      return "within 6 months"
    case "6to12Months":
      return "6-12 months"
    case "1to2Years":
      return "1-2 years"
    case "2PlusYears":
      return "2+ years"
    default:
      return "exploring"
  }
}

function mapTimelineMonths(value: UiPrimitive) {
  switch (value) {
    case "within6Months":
      return 4
    case "6to12Months":
      return 9
    case "1to2Years":
      return 18
    case "2PlusYears":
      return 30
    default:
      return 24
  }
}

function mapTimelineUrgency(value: UiPrimitive) {
  switch (value) {
    case "within6Months":
      return "high" as const
    case "6to12Months":
      return "medium" as const
    case "1to2Years":
      return "medium" as const
    default:
      return "low" as const
  }
}

function parseDestinations(value: UiPrimitive) {
  const text = asOptionalString(value)
  if (!text) {
    return []
  }

  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function asStringArray(value: UiPrimitive) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function asOptionalString(value: UiPrimitive) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined
}

function asScale(value: UiPrimitive) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(5, Math.max(1, value))
    : 3
}
