import crypto from "node:crypto"

import type {
  ActionPlan,
  ArchetypeProfile,
  ClarityReport,
  DestinationResearchReport,
  FitComparisonReport,
  ReadinessProfile,
  ReportRevision,
  UserProfile,
} from "../../types/exidus-schema.ts"
import { SCHEMA_VERSION } from "../config.ts"
import type {
  AgentInvocation,
  AgentInvocationResult,
} from "../core/types.ts"

type RevisionType = ReportRevision["revisionType"]
type RevisionSignificance = ReportRevision["significance"]
type UpdatableSection = NonNullable<ReportRevision["changes"]["sectionsUpdated"]>[number]

const READINESS_STAGE_LABELS: Record<ReadinessProfile["readinessLevel"], string> = {
  early: "clarity-building stage",
  emerging: "readiness-building stage",
  active: "active preparation stage",
  nearlyReady: "near-ready transition stage",
}

const LIFE_ARCHETYPE_LABELS: Record<ArchetypeProfile["primaryLifeArchetype"], string> = {
  peaceFirst: "peace-first",
  belongingFirst: "belonging-first",
  affordabilityFirst: "affordability-first",
  stabilityFirst: "stability-first",
  reinventionFirst: "reinvention-first",
  balanceFirst: "balance-first",
}

const FIT_DIRECTION_LABELS: Record<ArchetypeProfile["fitDirectionArchetype"], string> = {
  calmAffordabilityPath: "calm affordability path",
  belongingCenteredPath: "belonging-centered path",
  stabilityAndSystemsPath: "stability and systems path",
  flexibleRemoteLifePath: "flexible remote life path",
  emergingClarityPath: "emerging clarity path",
}

export async function invokeReportRefinementAgent(
  invocation: AgentInvocation,
): Promise<AgentInvocationResult> {
  const priorReport = requireArtifact(invocation.artifacts.clarityReport, "clarityReport")
  const nextReadiness = invocation.artifacts.readinessProfile ?? priorReport.readinessProfile
  const nextArchetype = invocation.artifacts.archetypeProfile ?? priorReport.archetypeProfile
  const nextSignals = invocation.artifacts.assessmentSignals ?? priorReport.signals
  const destinationResearchReports = uniqueDestinationReports(
    invocation.artifacts.destinationResearchReports ?? [],
  )

  const result = refineReport({
    userIntent: invocation.userIntent,
    priorReport,
    userProfile: invocation.artifacts.userProfile,
    readinessProfile: nextReadiness,
    archetypeProfile: nextArchetype,
    destinationResearchReports,
    fitComparisonReport: invocation.artifacts.fitComparisonReport,
    actionPlan: invocation.artifacts.actionPlan,
    assessmentSignals: nextSignals,
  })

  return {
    agentId: "report-refinement-agent",
    status: "completed",
    message: `Report Refinement Agent produced a ${result.reportRevision.significance} ${humanizeRevisionType(result.reportRevision.revisionType)}.`,
    artifacts: {
      ...invocation.artifacts,
      clarityReport: result.clarityReport,
      readinessProfile: nextReadiness,
      archetypeProfile: nextArchetype,
      assessmentSignals: nextSignals,
      reportRevision: result.reportRevision,
    },
  }
}

function refineReport(input: {
  userIntent?: string
  priorReport: ClarityReport
  userProfile?: UserProfile
  assessmentSignals: ClarityReport["signals"]
  readinessProfile: ReadinessProfile
  archetypeProfile: ArchetypeProfile
  destinationResearchReports: DestinationResearchReport[]
  fitComparisonReport?: FitComparisonReport
  actionPlan?: ActionPlan
}) {
  const now = new Date().toISOString()
  const topPriorities = deriveTopPriorities(input.priorReport, input.userProfile, input.actionPlan)
  const nonNegotiables = deriveNonNegotiables(input.priorReport, input.assessmentSignals)
  const contradictionFlags = deriveContradictionFlags(
    input.priorReport,
    input.assessmentSignals.contradictionFlags,
    input.fitComparisonReport,
    input.readinessProfile,
  )
  const latestDestinations = input.destinationResearchReports.map((report) => report.destination)
  const revisionType = determineRevisionType({
    priorReport: input.priorReport,
    userProfile: input.userProfile,
    readinessProfile: input.readinessProfile,
    destinationResearchReports: input.destinationResearchReports,
    fitComparisonReport: input.fitComparisonReport,
    actionPlan: input.actionPlan,
    topPriorities,
  })
  const changes = buildChanges({
    priorReport: input.priorReport,
    userProfile: input.userProfile,
    readinessProfile: input.readinessProfile,
    topPriorities,
    nonNegotiables,
    contradictionFlags,
    destinationResearchReports: input.destinationResearchReports,
    fitComparisonReport: input.fitComparisonReport,
    actionPlan: input.actionPlan,
  })
  const significance = determineSignificance(changes)
  const whatStayedTheSame = buildStabilityNotes({
    priorReport: input.priorReport,
    topPriorities,
    nonNegotiables,
    readinessProfile: input.readinessProfile,
    archetypeProfile: input.archetypeProfile,
    contradictionFlags,
    fitComparisonReport: input.fitComparisonReport,
  })
  const summary = buildUpdatedSummary({
    priorReport: input.priorReport,
    readinessProfile: input.readinessProfile,
    archetypeProfile: input.archetypeProfile,
    fitComparisonReport: input.fitComparisonReport,
    destinationResearchReports: input.destinationResearchReports,
    actionPlan: input.actionPlan,
    topPriorities,
    contradictionFlags,
  })
  const highlights = buildHighlights({
    priorReport: input.priorReport,
    readinessProfile: input.readinessProfile,
    archetypeProfile: input.archetypeProfile,
    topPriorities,
    fitComparisonReport: input.fitComparisonReport,
    destinationResearchReports: input.destinationResearchReports,
    actionPlan: input.actionPlan,
  })
  const reportId = `clarity-${crypto.randomUUID()}`
  const disclaimerFlags = uniqueStrings([
    ...input.priorReport.disclaimerFlags,
    input.destinationResearchReports.length > 0
      ? "Destination research remains a decision-support layer, not legal, immigration, tax, medical, or financial advice."
      : undefined,
    input.fitComparisonReport
      ? "Shortlist signals reflect current downstream artifacts and may need another revision if your constraints materially change."
      : undefined,
  ])

  const clarityReport: ClarityReport = {
    ...input.priorReport,
    reportId,
    updatedAt: now,
    source: "report-refinement-agent",
    summary,
    highlights,
    topPriorities,
    nonNegotiables,
    contradictionFlags,
    readinessProfile: input.readinessProfile,
    archetypeProfile: input.archetypeProfile,
    signals: input.assessmentSignals,
    disclaimerFlags,
  }

  const reportRevision: ReportRevision = {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    source: "report-refinement-agent",
    revisionId: `revision-${crypto.randomUUID()}`,
    priorReportId: input.priorReport.reportId,
    newReportId: reportId,
    revisionType,
    significance,
    changes,
    revisionSummary: buildRevisionSummary({
      significance,
      revisionType,
      changes,
      fitComparisonReport: input.fitComparisonReport,
      actionPlan: input.actionPlan,
      latestDestinations,
    }),
    whatChanged: buildWhatChanged({
      changes,
      fitComparisonReport: input.fitComparisonReport,
      actionPlan: input.actionPlan,
      readinessProfile: input.readinessProfile,
    }),
    whatStayedTheSame,
    payAttentionNow: buildPayAttentionNow({
      actionPlan: input.actionPlan,
      fitComparisonReport: input.fitComparisonReport,
      readinessProfile: input.readinessProfile,
      contradictionFlags,
      destinationResearchReports: input.destinationResearchReports,
      topPriorities,
    }),
    groundedIn: {
      usedUpdatedProfile: Boolean(input.userProfile),
      usedAssessmentSignals: input.assessmentSignals.updatedAt !== input.priorReport.signals.updatedAt,
      usedReadinessProfile:
        input.readinessProfile.updatedAt !== input.priorReport.readinessProfile.updatedAt,
      usedArchetypeProfile:
        input.archetypeProfile.updatedAt !== input.priorReport.archetypeProfile.updatedAt,
      usedDestinationResearch: latestDestinations,
      usedFitComparison: Boolean(input.fitComparisonReport),
      usedActionPlan: Boolean(input.actionPlan),
    },
  }

  return {
    clarityReport,
    reportRevision,
  }
}

function deriveTopPriorities(
  priorReport: ClarityReport,
  userProfile?: UserProfile,
  actionPlan?: ActionPlan,
) {
  const profilePriorities = normalizePhraseList(userProfile?.topPriorities)
  if (profilePriorities.length > 0 && !sameOrderedList(profilePriorities, priorReport.topPriorities)) {
    return profilePriorities.slice(0, 5)
  }

  return uniqueStrings([
    ...priorReport.topPriorities,
    ...(actionPlan?.groundedIn.topPriorities ?? []),
  ]).slice(0, 5)
}

function deriveNonNegotiables(
  priorReport: ClarityReport,
  assessmentSignals: ClarityReport["signals"],
) {
  const signalNonNegotiables = normalizePhraseList(assessmentSignals.nonNegotiables)
  if (signalNonNegotiables.length > 0) {
    return signalNonNegotiables.slice(0, 5)
  }

  return priorReport.nonNegotiables
}

function deriveContradictionFlags(
  priorReport: ClarityReport,
  assessmentContradictions: string[],
  fitComparisonReport: FitComparisonReport | undefined,
  readinessProfile: ReadinessProfile,
) {
  const fitTension = fitComparisonReport?.keyTradeoffs[0]
    ? `Shortlist tension to watch: ${fitComparisonReport.keyTradeoffs[0]}`
    : undefined
  const readinessTension = readinessProfile.blockers[0]
    ? `Readiness still depends on reducing friction around ${sentenceFragment(readinessProfile.blockers[0])}.`
    : undefined

  return uniqueStrings([
    ...assessmentContradictions,
    fitTension,
    assessmentContradictions.length === 0 ? readinessTension : undefined,
    ...priorReport.contradictionFlags,
  ]).slice(0, 4)
}

function buildChanges(input: {
  priorReport: ClarityReport
  userProfile?: UserProfile
  readinessProfile: ReadinessProfile
  topPriorities: string[]
  nonNegotiables: string[]
  contradictionFlags: string[]
  destinationResearchReports: DestinationResearchReport[]
  fitComparisonReport?: FitComparisonReport
  actionPlan?: ActionPlan
}): ReportRevision["changes"] {
  const prioritiesChanged = describeListChanges(
    input.priorReport.topPriorities,
    input.topPriorities,
    "Priority now more central",
    "Priority no longer leading",
  )
  const readinessChanged = describeReadinessChanges(
    input.priorReport.readinessProfile,
    input.readinessProfile,
  )
  const destinationsChanged = describeDestinationChanges(
    input.userProfile?.destinationsConsidering ?? [],
    input.destinationResearchReports,
    input.fitComparisonReport,
  )
  const tensionsChanged = describeListChanges(
    input.priorReport.contradictionFlags,
    input.contradictionFlags,
    "New tension",
    "Tension reduced",
  )
  const sectionsUpdated = collectUpdatedSections({
    priorReport: input.priorReport,
    prioritiesChanged,
    readinessChanged,
    destinationsChanged,
    tensionsChanged,
    nonNegotiablesChanged: !sameOrderedList(input.priorReport.nonNegotiables, input.nonNegotiables),
    fitComparisonReport: input.fitComparisonReport,
    actionPlan: input.actionPlan,
  })

  return {
    prioritiesChanged: prioritiesChanged.length > 0 ? prioritiesChanged : undefined,
    readinessChanged: readinessChanged.length > 0 ? readinessChanged : undefined,
    destinationsChanged: destinationsChanged.length > 0 ? destinationsChanged : undefined,
    tensionsChanged: tensionsChanged.length > 0 ? tensionsChanged : undefined,
    sectionsUpdated: sectionsUpdated.length > 0 ? sectionsUpdated : undefined,
  }
}

function collectUpdatedSections(input: {
  priorReport: ClarityReport
  prioritiesChanged: string[]
  readinessChanged: string[]
  destinationsChanged: string[]
  tensionsChanged: string[]
  nonNegotiablesChanged: boolean
  fitComparisonReport?: FitComparisonReport
  actionPlan?: ActionPlan
}) {
  const sections = new Set<UpdatableSection>()

  if (input.prioritiesChanged.length > 0) {
    sections.add("summary.desiredLifeSummary")
    sections.add("topPriorities")
    sections.add("highlights")
  }
  if (input.readinessChanged.length > 0) {
    sections.add("summary.readinessSummary")
    sections.add("summary.nextStepSummary")
  }
  if (input.destinationsChanged.length > 0) {
    sections.add("summary.fitDirectionSummary")
    sections.add("summary.nextStepSummary")
    sections.add("highlights")
  }
  if (input.tensionsChanged.length > 0) {
    sections.add("summary.frictionSummary")
    sections.add("contradictionFlags")
  }
  if (input.nonNegotiablesChanged) {
    sections.add("nonNegotiables")
  }
  if (input.fitComparisonReport) {
    sections.add("summary.fitDirectionSummary")
  }
  if (input.actionPlan) {
    sections.add("summary.nextStepSummary")
  }

  if (sections.size === 0) {
    sections.add("summary.nextStepSummary")
  }

  return [...sections]
}

function determineRevisionType(input: {
  priorReport: ClarityReport
  userProfile?: UserProfile
  readinessProfile: ReadinessProfile
  destinationResearchReports: DestinationResearchReport[]
  fitComparisonReport?: FitComparisonReport
  actionPlan?: ActionPlan
  topPriorities: string[]
}): RevisionType {
  const prioritiesChanged = Boolean(
    input.userProfile?.topPriorities?.length &&
      !sameOrderedList(input.topPriorities, input.priorReport.topPriorities),
  )
  const readinessChanged =
    input.readinessProfile.readinessLevel !== input.priorReport.readinessProfile.readinessLevel ||
    Math.abs(
      input.readinessProfile.compositeScore - input.priorReport.readinessProfile.compositeScore,
    ) >= 0.5
  const shortlistChanged = Boolean(input.fitComparisonReport)
  const planningChanged = Boolean(input.actionPlan)
  const destinationChanged = input.destinationResearchReports.length > 0

  const activeFlags = [
    prioritiesChanged,
    readinessChanged,
    destinationChanged,
    shortlistChanged,
    planningChanged,
  ].filter(Boolean).length

  if (activeFlags >= 2) {
    return "mixedRevision"
  }
  if (prioritiesChanged) {
    return "priorityRevision"
  }
  if (readinessChanged) {
    return "readinessRevision"
  }
  if (shortlistChanged) {
    return "shortlistRevision"
  }
  if (planningChanged) {
    return "planningRevision"
  }

  return "destinationRevision"
}

function determineSignificance(changes: ReportRevision["changes"]): RevisionSignificance {
  const counts = [
    changes.prioritiesChanged?.length ?? 0,
    changes.readinessChanged?.length ?? 0,
    changes.destinationsChanged?.length ?? 0,
    changes.tensionsChanged?.length ?? 0,
  ]
  const total = counts.reduce((sum, count) => sum + count, 0)

  if ((changes.prioritiesChanged?.length ?? 0) >= 3 || (changes.readinessChanged?.length ?? 0) >= 2 || total >= 8) {
    return "major"
  }
  if (total >= 3) {
    return "moderate"
  }

  return "small"
}

function buildUpdatedSummary(input: {
  priorReport: ClarityReport
  readinessProfile: ReadinessProfile
  archetypeProfile: ArchetypeProfile
  fitComparisonReport?: FitComparisonReport
  destinationResearchReports: DestinationResearchReport[]
  actionPlan?: ActionPlan
  topPriorities: string[]
  contradictionFlags: string[]
}): ClarityReport["summary"] {
  return {
    motivationSummary: buildMotivationSummary(input.priorReport, input.topPriorities),
    desiredLifeSummary: buildDesiredLifeSummary(
      input.priorReport,
      input.archetypeProfile,
      input.topPriorities,
    ),
    readinessSummary: buildReadinessSummary(input.readinessProfile),
    fitDirectionSummary: buildFitDirectionSummary({
      priorReport: input.priorReport,
      archetypeProfile: input.archetypeProfile,
      fitComparisonReport: input.fitComparisonReport,
      destinationResearchReports: input.destinationResearchReports,
      topPriorities: input.topPriorities,
    }),
    frictionSummary: buildFrictionSummary(input.readinessProfile, input.contradictionFlags),
    nextStepSummary: buildNextStepSummary({
      priorReport: input.priorReport,
      actionPlan: input.actionPlan,
      fitComparisonReport: input.fitComparisonReport,
      destinationResearchReports: input.destinationResearchReports,
      readinessProfile: input.readinessProfile,
    }),
  }
}

function buildMotivationSummary(priorReport: ClarityReport, topPriorities: string[]) {
  if (sameOrderedList(priorReport.topPriorities, topPriorities)) {
    return priorReport.summary.motivationSummary
  }

  return `Your core relocation motive still reads as continuity-seeking rather than novelty-seeking, but the report now gives more weight to ${joinHuman(topPriorities.slice(0, 3)) || "your updated priorities"} as the practical filter.`
}

function buildDesiredLifeSummary(
  priorReport: ClarityReport,
  archetypeProfile: ArchetypeProfile,
  topPriorities: string[],
) {
  const archetypeLabel = LIFE_ARCHETYPE_LABELS[archetypeProfile.primaryLifeArchetype]
  const fitDirection = FIT_DIRECTION_LABELS[archetypeProfile.fitDirectionArchetype]

  if (
    archetypeProfile.primaryLifeArchetype === priorReport.archetypeProfile.primaryLifeArchetype &&
    sameOrderedList(priorReport.topPriorities, topPriorities)
  ) {
    return priorReport.summary.desiredLifeSummary
  }

  return `The report still points toward a ${archetypeLabel} life shape, now filtered more explicitly through ${joinHuman(topPriorities.slice(0, 3)) || "your leading criteria"}. That keeps the direction coherent while tightening what fit should mean in practice along the ${fitDirection}.`
}

function buildReadinessSummary(readinessProfile: ReadinessProfile) {
  return `You are now in the ${readinessProfile.readinessLevel} readiness stage (${READINESS_STAGE_LABELS[readinessProfile.readinessLevel]}), with a composite readiness score of ${readinessProfile.compositeScore.toFixed(1)}.`
}

function buildFitDirectionSummary(input: {
  priorReport: ClarityReport
  archetypeProfile: ArchetypeProfile
  fitComparisonReport?: FitComparisonReport
  destinationResearchReports: DestinationResearchReport[]
  topPriorities: string[]
}) {
  const fitDirectionLabel = FIT_DIRECTION_LABELS[input.archetypeProfile.fitDirectionArchetype]

  if (input.fitComparisonReport?.strongestFit) {
    return `Your broader fit direction still reads as ${fitDirectionLabel}, and the current shortlist now leans toward ${input.fitComparisonReport.strongestFit} as the strongest working fit. That is a directional update, not a claim that every other option has stopped mattering.`
  }

  const strongResearchLead = input.destinationResearchReports.find((report) => report.profileFitVerdict === "strongFit")
  if (strongResearchLead) {
    return `The report still centers ${fitDirectionLabel}, with ${strongResearchLead.destination} currently looking like the clearest destination expression of ${joinHuman(input.topPriorities.slice(0, 3)) || "your main criteria"}.`
  }

  return input.priorReport.summary.fitDirectionSummary
}

function buildFrictionSummary(
  readinessProfile: ReadinessProfile,
  contradictionFlags: string[],
) {
  const mainContradiction = contradictionFlags[0]
  const blocker = readinessProfile.blockers[0]

  if (mainContradiction && blocker) {
    return `${mainContradiction} The practical friction still clusters around ${sentenceFragment(blocker)}.`
  }
  if (mainContradiction) {
    return mainContradiction
  }
  if (blocker) {
    return `The main friction is still practical rather than identity-level, especially around ${sentenceFragment(blocker)}.`
  }

  return "No major new friction was introduced in this revision, but the report still assumes the current direction should be pressure-tested before acting on it."
}

function buildNextStepSummary(input: {
  priorReport: ClarityReport
  actionPlan?: ActionPlan
  fitComparisonReport?: FitComparisonReport
  destinationResearchReports: DestinationResearchReport[]
  readinessProfile: ReadinessProfile
}) {
  if (input.actionPlan) {
    return input.actionPlan.stageSummary
  }

  if (input.fitComparisonReport?.recommendedNextMove) {
    return input.fitComparisonReport.recommendedNextMove
  }

  const firstResearchStep = input.destinationResearchReports[0]?.recommendedNextStep
  if (firstResearchStep) {
    return firstResearchStep
  }

  if (input.readinessProfile.blockers[0]) {
    return `The next step is still to reduce the blocker around ${sentenceFragment(input.readinessProfile.blockers[0])} before assuming the whole direction has changed.`
  }

  return input.priorReport.summary.nextStepSummary
}

function buildHighlights(input: {
  priorReport: ClarityReport
  readinessProfile: ReadinessProfile
  archetypeProfile: ArchetypeProfile
  topPriorities: string[]
  fitComparisonReport?: FitComparisonReport
  destinationResearchReports: DestinationResearchReport[]
  actionPlan?: ActionPlan
}) {
  return uniqueStrings([
    `Primary life orientation still reads as ${LIFE_ARCHETYPE_LABELS[input.archetypeProfile.primaryLifeArchetype]}.`,
    `Readiness is now ${input.readinessProfile.readinessLevel}.`,
    input.fitComparisonReport?.strongestFit
      ? `Current shortlist lead: ${input.fitComparisonReport.strongestFit}.`
      : input.destinationResearchReports[0]
        ? `Current researched destinations: ${joinHuman(input.destinationResearchReports.map((report) => report.destination).slice(0, 3))}.`
        : undefined,
    `Your strongest active filters are ${joinHuman(input.topPriorities.slice(0, 3))}.`,
    input.actionPlan?.planningMode
      ? `Planning mode now reads as ${input.actionPlan.planningMode}.`
      : undefined,
    ...input.priorReport.highlights,
  ]).slice(0, 5)
}

function buildRevisionSummary(input: {
  significance: RevisionSignificance
  revisionType: RevisionType
  changes: ReportRevision["changes"]
  fitComparisonReport?: FitComparisonReport
  actionPlan?: ActionPlan
  latestDestinations: string[]
}) {
  const changeBits = [
    input.changes.prioritiesChanged?.[0],
    input.changes.readinessChanged?.[0],
    input.fitComparisonReport?.strongestFit
      ? `Shortlist now leans toward ${input.fitComparisonReport.strongestFit}.`
      : input.latestDestinations[0]
        ? `Revision grounded in updated destination work on ${joinHuman(input.latestDestinations.slice(0, 3))}.`
        : undefined,
    input.actionPlan?.planningMode
      ? `Current action framing uses ${input.actionPlan.planningMode}.`
      : undefined,
  ].filter(Boolean)

  return `This ${input.significance} ${humanizeRevisionType(input.revisionType)} preserves the prior report's core direction while updating the sections affected by new context. ${changeBits.join(" ")}`
}

function buildWhatChanged(input: {
  changes: ReportRevision["changes"]
  fitComparisonReport?: FitComparisonReport
  actionPlan?: ActionPlan
  readinessProfile: ReadinessProfile
}) {
  return uniqueStrings([
    ...(input.changes.prioritiesChanged ?? []),
    ...(input.changes.readinessChanged ?? []),
    ...(input.changes.destinationsChanged ?? []),
    ...(input.changes.tensionsChanged ?? []),
    input.fitComparisonReport?.strongestFit
      ? `${input.fitComparisonReport.strongestFit} is the current lead option, based on the existing comparison artifact.`
      : undefined,
    input.actionPlan?.framingSummary,
    input.actionPlan?.stageSummary,
    input.changes.readinessChanged?.length === 0
      ? `Readiness remains ${input.readinessProfile.readinessLevel}, so the revision stays pace-aware instead of pretending the move is suddenly immediate.`
      : undefined,
  ]).slice(0, 6)
}

function buildStabilityNotes(input: {
  priorReport: ClarityReport
  topPriorities: string[]
  nonNegotiables: string[]
  readinessProfile: ReadinessProfile
  archetypeProfile: ArchetypeProfile
  contradictionFlags: string[]
  fitComparisonReport?: FitComparisonReport
}) {
  return uniqueStrings([
    sameOrderedList(input.priorReport.topPriorities, input.topPriorities)
      ? `Your leading priorities still center ${joinHuman(input.topPriorities.slice(0, 3))}.`
      : undefined,
    sameOrderedList(input.priorReport.nonNegotiables, input.nonNegotiables)
      ? `Your non-negotiables remain materially the same.`
      : undefined,
    input.priorReport.archetypeProfile.primaryLifeArchetype ===
        input.archetypeProfile.primaryLifeArchetype
      ? `The report still understands you through the same broad life-archetype logic.`
      : undefined,
    input.priorReport.readinessProfile.readinessLevel === input.readinessProfile.readinessLevel
      ? `Your readiness stage remains ${input.readinessProfile.readinessLevel}, so the report pace has not been reset.`
      : undefined,
    input.fitComparisonReport?.strongestFit
      ? `The report still treats shortlist evidence as directional, not final certainty.`
      : `No downstream artifact here is being treated as a full identity rewrite.`,
    input.contradictionFlags.length === 0
      ? `No new contradiction layer was introduced in this revision.`
      : undefined,
  ]).slice(0, 5)
}

function buildPayAttentionNow(input: {
  actionPlan?: ActionPlan
  fitComparisonReport?: FitComparisonReport
  readinessProfile: ReadinessProfile
  contradictionFlags: string[]
  destinationResearchReports: DestinationResearchReport[]
  topPriorities: string[]
}) {
  return uniqueStrings([
    input.actionPlan?.actions[0]
      ? `${input.actionPlan.actions[0].title}: ${input.actionPlan.actions[0].description}`
      : undefined,
    input.fitComparisonReport?.recommendedNextMove,
    input.destinationResearchReports[0]?.recommendedNextStep,
    input.readinessProfile.blockers[0]
      ? `Keep reducing friction around ${sentenceFragment(input.readinessProfile.blockers[0])}.`
      : undefined,
    input.contradictionFlags[0],
    `Use ${joinHuman(input.topPriorities.slice(0, 3)) || "your top priorities"} as the filter for any next research or planning pass.`,
  ]).slice(0, 4)
}

function describeReadinessChanges(
  priorReadiness: ReadinessProfile,
  nextReadiness: ReadinessProfile,
) {
  const changes: string[] = []

  if (priorReadiness.readinessLevel !== nextReadiness.readinessLevel) {
    changes.push(
      `Readiness moved from ${priorReadiness.readinessLevel} to ${nextReadiness.readinessLevel}.`,
    )
  }

  const scoreDelta = roundToOne(nextReadiness.compositeScore - priorReadiness.compositeScore)
  if (Math.abs(scoreDelta) >= 0.5) {
    changes.push(
      `Composite readiness ${scoreDelta > 0 ? "improved" : "dropped"} by ${Math.abs(scoreDelta).toFixed(1)} points.`,
    )
  }

  const blockerDelta = describeListChanges(
    priorReadiness.blockers,
    nextReadiness.blockers,
    "New blocker",
    "Blocker reduced",
  )
  changes.push(...blockerDelta.slice(0, 2))

  return changes
}

function describeDestinationChanges(
  destinationsConsidering: string[],
  destinationResearchReports: DestinationResearchReport[],
  fitComparisonReport?: FitComparisonReport,
) {
  const knownDestinations = normalizePhraseList(destinationsConsidering)
  const researchedDestinations = destinationResearchReports.map((report) => report.destination)
  const changes = describeListChanges(
    knownDestinations,
    researchedDestinations,
    "New researched destination",
    "Destination no longer active",
  )

  if (fitComparisonReport?.strongestFit) {
    changes.unshift(`Comparison now points to ${fitComparisonReport.strongestFit} as the strongest working fit.`)
  }

  return changes.slice(0, 4)
}

function describeListChanges(
  previous: string[],
  next: string[],
  addedLabel: string,
  removedLabel: string,
) {
  const previousNormalized = normalizePhraseList(previous)
  const nextNormalized = normalizePhraseList(next)
  const previousKeys = new Set(previousNormalized.map(toComparisonKey))
  const nextKeys = new Set(nextNormalized.map(toComparisonKey))
  const added = nextNormalized.filter((item) => !previousKeys.has(toComparisonKey(item)))
  const removed = previousNormalized.filter((item) => !nextKeys.has(toComparisonKey(item)))

  return [
    ...added.map((item) => `${addedLabel}: ${stripTrailingPeriod(item)}.`),
    ...removed.map((item) => `${removedLabel}: ${stripTrailingPeriod(item)}.`),
  ]
}

function requireArtifact<T>(value: T | undefined, label: string): T {
  if (!value) {
    throw new Error(`Report Refinement Agent requires '${label}'`)
  }

  return value
}

function uniqueDestinationReports(reports: DestinationResearchReport[]) {
  const deduped = new Map<string, DestinationResearchReport>()

  for (const report of reports) {
    deduped.set(report.destinationSlug, report)
  }

  return [...deduped.values()]
}

function normalizePhraseList(values: string[] | undefined) {
  return uniqueStrings(
    (values ?? [])
      .map((value) => value.trim())
      .filter(Boolean),
  )
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function sameOrderedList(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) =>
    toComparisonKey(value) === toComparisonKey(right[index])
  )
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

function sentenceFragment(value: string) {
  return value.replace(/\.$/, "").replace(/^[A-Z]/, (char) => char.toLowerCase())
}

function humanizeRevisionType(value: RevisionType) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
}

function roundToOne(value: number) {
  return Math.round(value * 10) / 10
}

function toComparisonKey(value: string) {
  return value.trim().toLowerCase()
}

function stripTrailingPeriod(value: string) {
  return value.replace(/\.$/, "")
}
