import type {
  ArchetypeProfile,
  AssessmentSignals,
  ClarityReport,
  LifeArchetype,
  ReadinessLevel,
  ReadinessProfile,
  UserProfile,
} from "../../types/exidus-schema.ts"
import type { GuidanceSummary } from "../../types/exidus-router.ts"
import { SCHEMA_VERSION } from "../config.ts"
import type {
  AgentInvocation,
  AgentInvocationResult,
} from "../core/types.ts"

type GuideMode = GuidanceSummary["mode"]

const READINESS_GUIDANCE: Record<ReadinessLevel, string> = {
  early:
    "treat this as a clarity-and-foundation stage rather than a move-fast stage",
  emerging:
    "treat this as a preparation stage where structure matters more than speed",
  active:
    "treat this as a narrowing-and-preparation stage where options can become concrete",
  nearlyReady:
    "treat this as an execution stage where decision quality and timing need to stay aligned",
}

const FIT_DIRECTION_LABELS: Record<ArchetypeProfile["fitDirectionArchetype"], string> = {
  calmAffordabilityPath: "calm affordability path",
  belongingCenteredPath: "belonging-centered path",
  stabilityAndSystemsPath: "stability and systems path",
  flexibleRemoteLifePath: "flexible remote life path",
  emergingClarityPath: "emerging clarity path",
}

const LIFE_ARCHETYPE_LABELS: Record<LifeArchetype, string> = {
  peaceFirst: "peace-first",
  belongingFirst: "belonging-first",
  affordabilityFirst: "affordability-first",
  stabilityFirst: "stability-first",
  reinventionFirst: "reinvention-first",
  balanceFirst: "balance-first",
}

export async function invokeGuideAgent(
  invocation: AgentInvocation,
): Promise<AgentInvocationResult> {
  const clarityReport = requireArtifact(invocation.artifacts.clarityReport, "clarityReport")
  const readinessProfile = requireArtifact(
    invocation.artifacts.readinessProfile ?? clarityReport.readinessProfile,
    "readinessProfile",
  )
  const archetypeProfile = requireArtifact(
    invocation.artifacts.archetypeProfile ?? clarityReport.archetypeProfile,
    "archetypeProfile",
  )
  const assessmentSignals = requireArtifact(
    invocation.artifacts.assessmentSignals ?? clarityReport.signals,
    "assessmentSignals",
  )
  const guidanceSummary = buildGuidanceSummary({
    userIntent: invocation.userIntent,
    userProfile: invocation.artifacts.userProfile,
    clarityReport,
    readinessProfile,
    archetypeProfile,
    assessmentSignals,
  })

  return {
    agentId: "guide-agent",
    status: "completed",
    message: "Guide Agent generated an interpretation grounded in current Clarity artifacts",
    artifacts: {
      ...invocation.artifacts,
      guidanceSummary,
    },
  }
}

function buildGuidanceSummary(input: {
  userIntent?: string
  userProfile?: UserProfile
  clarityReport: ClarityReport
  readinessProfile: ReadinessProfile
  archetypeProfile: ArchetypeProfile
  assessmentSignals: AssessmentSignals
}): GuidanceSummary {
  const now = new Date().toISOString()
  const mode = resolveGuideMode(input.userIntent, input.clarityReport, input.assessmentSignals)
  const topPriorityLabels = input.clarityReport.topPriorities.slice(0, 3)
  const topCriteria = joinHuman(topPriorityLabels)
  const readinessFrame = READINESS_GUIDANCE[input.readinessProfile.readinessLevel]
  const fitDirectionLabel = FIT_DIRECTION_LABELS[input.archetypeProfile.fitDirectionArchetype]
  const archetypeLabel = LIFE_ARCHETYPE_LABELS[input.archetypeProfile.primaryLifeArchetype]
  const namedDestinations = input.userProfile?.destinationsConsidering?.length
    ? ` You already have ${joinHuman(input.userProfile.destinationsConsidering)} in view, so use this interpretation to pressure-test those options rather than treating them as automatic fits.`
    : ""

  const summary = buildSummary(mode, input.clarityReport, fitDirectionLabel, readinessFrame)
  const explanation = `${input.clarityReport.summary.fitDirectionSummary} ${input.clarityReport.summary.readinessSummary} This reads less like a generic desire to leave and more like a ${archetypeLabel} profile using ${topCriteria || "your top criteria"} to shape the move.${namedDestinations}`
  const whatThisMeans = buildWhatThisMeans(
    mode,
    input.clarityReport,
    input.readinessProfile,
    fitDirectionLabel,
    archetypeLabel,
  )
  const whatMattersMostNow = buildWhatMattersMostNow(
    mode,
    input.clarityReport,
    input.readinessProfile,
    input.assessmentSignals,
  )
  const tensionNotes = buildTensionNotes(
    input.clarityReport,
    input.readinessProfile,
    input.assessmentSignals,
  )
  const focusNext = buildFocusNext(
    mode,
    input.clarityReport,
    input.readinessProfile,
    input.assessmentSignals,
  )
  const suggestedNextMove = suggestNextMove(
    mode,
    input.readinessProfile,
    input.clarityReport.contradictionFlags,
    topPriorityLabels,
  )

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    source: "guide-agent",
    mode,
    userIntent: input.userIntent,
    summary,
    explanation,
    whatThisMeans,
    whatMattersMostNow,
    keyTakeaways: [...whatThisMeans.slice(0, 2), ...whatMattersMostNow.slice(0, 2)].slice(0, 4),
    focusNext,
    suggestedNextMove,
    tensionNotes,
    groundedIn: {
      readinessLevel: input.readinessProfile.readinessLevel,
      fitDirectionArchetype: input.archetypeProfile.fitDirectionArchetype,
      primaryLifeArchetype: input.archetypeProfile.primaryLifeArchetype,
      topPriorities: input.clarityReport.topPriorities,
      contradictionFlags: input.clarityReport.contradictionFlags,
    },
  }
}

function buildSummary(
  mode: GuideMode,
  clarityReport: ClarityReport,
  fitDirectionLabel: string,
  readinessFrame: string,
) {
  if (mode === "focus") {
    return `Your report is pointing you toward ${fitDirectionLabel}, but the immediate job is to ${readinessFrame}.`
  }

  if (mode === "tension") {
    return clarityReport.contradictionFlags[0]
      ?? `The main tension in your report is that your desired direction is clearer than your current execution path.`
  }

  if (mode === "routing") {
    return `Your results are interpretable now, and the next useful move is to use that clarity to decide which Exidus layer should come next.`
  }

  return `Your results suggest a ${fitDirectionLabel} because your report combines clear life priorities with a readiness picture that needs to set the pace.`
}

function buildWhatThisMeans(
  mode: GuideMode,
  clarityReport: ClarityReport,
  readinessProfile: ReadinessProfile,
  fitDirectionLabel: string,
  archetypeLabel: string,
) {
  const items = [
    `Your strongest direction is ${fitDirectionLabel}, which means destinations should be judged against the life shape you want, not just against surface convenience.`,
    `Your primary profile reads as ${archetypeLabel}, so the report is emphasizing what kind of life would feel more sustainable, not just what would be technically possible.`,
    `Your readiness level is ${readinessProfile.readinessLevel}, which means the system is separating genuine desire from how prepared the move is today.`,
  ]

  if (mode === "routing") {
    items.push(
      `The Clarity report is strong enough to guide the next specialist step without pretending it already answers destination-level questions.`,
    )
  }

  if (clarityReport.nonNegotiables.length > 0) {
    items.push(
      `Your non-negotiables are already narrowing the field, especially around ${joinHuman(clarityReport.nonNegotiables.slice(0, 3))}.`,
    )
  }

  return items.slice(0, 4)
}

function buildWhatMattersMostNow(
  mode: GuideMode,
  clarityReport: ClarityReport,
  readinessProfile: ReadinessProfile,
  assessmentSignals: AssessmentSignals,
) {
  const items = [
    `Keep your top criteria in front: ${joinHuman(clarityReport.topPriorities.slice(0, 3)) || "you need a clearer top criteria set before deeper comparison"}.`,
    `Let your ${readinessProfile.readinessLevel} readiness stage determine pace, because forcing a faster move than your profile supports will distort the decision.`,
  ]

  if (assessmentSignals.contradictionFlags.length > 0) {
    items.push(
      `The most decision-relevant tension is ${assessmentSignals.contradictionFlags[0]}`,
    )
  } else {
    items.push(
      `There is no dominant contradiction flag right now, so practical narrowing can become the main focus.`,
    )
  }

  if (mode === "focus") {
    items.unshift(
      `Do not solve every part of the relocation decision at once. Solve the next bottleneck first.`,
    )
  }

  return items.slice(0, 4)
}

function buildFocusNext(
  mode: GuideMode,
  clarityReport: ClarityReport,
  readinessProfile: ReadinessProfile,
  assessmentSignals: AssessmentSignals,
) {
  const items: string[] = []

  if (readinessProfile.blockers.length > 0) {
    items.push(
      `Reduce the main readiness blocker first: ${cleanSentence(readinessProfile.blockers[0])}.`,
    )
  }

  items.push(
    `Use ${joinHuman(clarityReport.topPriorities.slice(0, 3)) || "your top priorities"} as the filter for any destination research you do next.`,
  )

  if (assessmentSignals.contradictionFlags.length > 0) {
    items.push(
      `Pressure-test the leading tension directly before making bigger plans: ${assessmentSignals.contradictionFlags[0]}`,
    )
  }

  if (mode === "routing") {
    items.push("Move into destination research only after the interpretation feels stable enough to use as a filter.")
  } else if (mode === "focus") {
    items.push("Keep the next move narrow enough that it reduces confusion instead of creating new research sprawl.")
  } else {
    items.push("Use the current report as a filter, not as a substitute for future comparison or planning work.")
  }

  return items.slice(0, 4)
}

function buildTensionNotes(
  clarityReport: ClarityReport,
  readinessProfile: ReadinessProfile,
  assessmentSignals: AssessmentSignals,
) {
  const notes = [...clarityReport.contradictionFlags]

  if (notes.length === 0 && readinessProfile.blockers.length > 0) {
    notes.push(
      `Your profile does not show a major internal contradiction, but readiness friction still matters, especially around ${joinHuman(readinessProfile.blockers.slice(0, 2).map(cleanSentence))}.`,
    )
  }

  if (
    notes.length === 0 &&
    assessmentSignals.tradeoffSignals.length > 0
  ) {
    notes.push(
      `Your tradeoff answers suggest that some destination choices will need to balance ${assessmentSignals.tradeoffSignals[0].label.toLowerCase()} against other priorities.`,
    )
  }

  return notes.slice(0, 3)
}

function suggestNextMove(
  mode: GuideMode,
  readinessProfile: ReadinessProfile,
  contradictionFlags: string[],
  topPriorities: string[],
) {
  if (mode === "routing" && readinessProfile.readinessLevel !== "early") {
    return `Move into destination research next using ${joinHuman(topPriorities.slice(0, 3)) || "your current criteria"} as the filter.`
  }

  if (mode === "tension" || contradictionFlags.length > 0) {
    return "Stay with interpretation long enough to resolve the main tension before switching into planning."
  }

  if (readinessProfile.readinessLevel === "early") {
    return "Clarify readiness and constraints first, then move into destination research once the path feels more stable."
  }

  return "Use this interpretation as the baseline for destination research or a more concrete next-step plan."
}

function resolveGuideMode(
  userIntent: string | undefined,
  clarityReport: ClarityReport,
  assessmentSignals: AssessmentSignals,
): GuideMode {
  const intent = (userIntent ?? "").toLowerCase()

  if (
    intent.includes("focus") ||
    intent.includes("where should i start") ||
    intent.includes("what matters most")
  ) {
    return "focus"
  }

  if (
    intent.includes("tension") ||
    intent.includes("contradiction") ||
    intent.includes("why am i") ||
    assessmentSignals.contradictionFlags.length > 0
  ) {
    if (
      intent.includes("why") ||
      intent.includes("tension") ||
      intent.includes("contradiction")
    ) {
      return "tension"
    }
  }

  if (
    intent.includes("what next") ||
    intent.includes("next move") ||
    intent.includes("which exidus") ||
    intent.includes("route")
  ) {
    return "routing"
  }

  if (clarityReport.contradictionFlags.length >= 2 && intent.includes("next")) {
    return "tension"
  }

  return "explain"
}

function requireArtifact<T>(value: T | undefined, label: string): T {
  if (!value) {
    throw new Error(`Guide Agent requires '${label}'`)
  }

  return value
}

function joinHuman(values: string[]) {
  if (values.length === 0) {
    return ""
  }

  if (values.length === 1) {
    return values[0]
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`
  }

  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`
}

function cleanSentence(value: string) {
  return value.trim().replace(/[.]+$/g, "")
}
