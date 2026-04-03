import crypto from "node:crypto"

import type {
  ArchetypeProfile,
  AssessmentAnswers,
  AssessmentSignals,
  ConfidenceLevel,
  FitDirectionArchetype,
  LifeArchetype,
  RankedSignal,
  ReadinessLevel,
  ReadinessProfile,
  SignalScore,
  UserProfile,
} from "../../types/exidus-schema.ts"
import { SCHEMA_VERSION } from "../config.ts"
import {
  CRITERIA_DEFINITIONS,
  FIT_DIRECTION_LABELS,
  LIFE_ARCHETYPE_LABELS,
  MOTIVATION_ORIENTATION_LABELS,
  PULL_FACTOR_DEFINITIONS,
  PUSH_FACTOR_DEFINITIONS,
  READINESS_CONSTRAINT_DEFINITIONS,
  READINESS_LEVELS,
  TRADEOFF_SIGNAL_DEFINITIONS,
} from "../assessment/catalog.ts"
import type {
  AgentInvocation,
  AgentInvocationResult,
} from "../core/types.ts"

type PrimitiveAnswer = string | string[] | number | boolean | null | undefined

interface TradeoffPreferenceSummary {
  belongingWins: number
  affordabilityWins: number
  infrastructureWins: number
  peaceWins: number
  easeWins: number
  idealFitWins: number
}

export async function invokeClarityEngine(
  invocation: AgentInvocation,
): Promise<AgentInvocationResult> {
  const assessmentAnswers = requireArtifact(
    invocation.artifacts.assessmentAnswers,
    "assessmentAnswers",
  )

  const userProfile = buildUserProfile(
    assessmentAnswers,
    invocation.artifacts.userProfile,
  )
  const assessmentSignals = buildAssessmentSignals(assessmentAnswers, userProfile)
  const readinessProfile = buildReadinessProfile(assessmentAnswers)
  const archetypeProfile = buildArchetypeProfile(
    assessmentSignals,
    readinessProfile,
  )
  const clarityReport = buildClarityReport(
    assessmentAnswers,
    userProfile,
    assessmentSignals,
    readinessProfile,
    archetypeProfile,
  )

  return {
    agentId: "clarity-engine",
    status: "completed",
    message: "Clarity Engine generated baseline Exidus artifacts",
    artifacts: {
      ...invocation.artifacts,
      userProfile,
      assessmentSignals,
      readinessProfile,
      archetypeProfile,
      clarityReport,
    },
  }
}

function requireArtifact<T>(
  value: T | undefined,
  label: string,
): T {
  if (!value) {
    throw new Error(`Clarity Engine requires '${label}'`)
  }

  return value
}

function buildUserProfile(
  assessmentAnswers: AssessmentAnswers,
  baseProfile?: UserProfile,
): UserProfile {
  const now = timestamp()
  const topPriorities = normalizeStringArray(
    assessmentAnswers.answers.destinationCriteriaRanked,
  )
    .slice(0, 5)
    .map(toCriterionLabel)

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: baseProfile?.createdAt ?? now,
    updatedAt: now,
    source: baseProfile ? "mixed" : "assessment",
    userId: baseProfile?.userId ?? assessmentAnswers.userId,
    sessionId: baseProfile?.sessionId ?? assessmentAnswers.sessionId,
    profileType: asProfileType(assessmentAnswers.answers.profileType) ?? baseProfile?.profileType,
    nationality: asOptionalString(assessmentAnswers.answers.nationality) ?? baseProfile?.nationality,
    currentCountry:
      asOptionalString(assessmentAnswers.answers.currentCountry) ??
      baseProfile?.currentCountry,
    budgetMonthly: {
      amount:
        asOptionalNumber(assessmentAnswers.answers.budgetMonthlyAmount) ??
        baseProfile?.budgetMonthly?.amount,
      currency:
        asOptionalString(assessmentAnswers.answers.budgetMonthlyCurrency) ??
        baseProfile?.budgetMonthly?.currency ??
        "USD",
      note:
        asOptionalString(assessmentAnswers.answers.budgetMonthlyNote) ??
        baseProfile?.budgetMonthly?.note,
    },
    partySize: {
      adults:
        asOptionalNumber(assessmentAnswers.answers.partyAdults) ??
        baseProfile?.partySize?.adults,
      children:
        asOptionalNumber(assessmentAnswers.answers.partyChildren) ??
        baseProfile?.partySize?.children,
      dependentsNote:
        asOptionalString(assessmentAnswers.answers.dependentsNote) ??
        baseProfile?.partySize?.dependentsNote,
    },
    timeline: {
      targetWindow:
        asOptionalString(assessmentAnswers.answers.timelineTargetWindow) ??
        baseProfile?.timeline?.targetWindow,
      urgencyLevel:
        asUrgencyLevel(assessmentAnswers.answers.timelineUrgencyLevel) ??
        baseProfile?.timeline?.urgencyLevel,
    },
    specialNotes: [
      ...new Set(
        [
          ...(baseProfile?.specialNotes ?? []),
          ...extractFreeTextValues(assessmentAnswers, [
            "reflectionWhyNow",
            "reflectionBetterLife",
            "reflectionConstraints",
          ]),
        ].filter(Boolean),
      ),
    ],
    topPriorities,
    destinationsConsidering:
      normalizeStringArray(assessmentAnswers.answers.destinationsConsidering) ??
      baseProfile?.destinationsConsidering,
    openToSuggestions:
      asOptionalBoolean(assessmentAnswers.answers.openToSuggestions) ??
      baseProfile?.openToSuggestions,
  }
}

function buildAssessmentSignals(
  assessmentAnswers: AssessmentAnswers,
  userProfile: UserProfile,
): AssessmentSignals {
  const now = timestamp()
  const pushFactors = scoreSelections(
    normalizeStringArray(assessmentAnswers.answers.pushFactors),
    PUSH_FACTOR_DEFINITIONS,
  )
  const pullFactors = scoreSelections(
    normalizeStringArray(assessmentAnswers.answers.pullFactors),
    PULL_FACTOR_DEFINITIONS,
  )
  const destinationCriteria = rankSignals(
    normalizeStringArray(assessmentAnswers.answers.destinationCriteriaRanked),
    CRITERIA_DEFINITIONS,
  )
  const nonNegotiables = normalizeStringArray(
    assessmentAnswers.answers.nonNegotiables,
  ).map(toCriterionLabel)
  const readinessConstraints = buildReadinessConstraints(assessmentAnswers)
  const tradeoffSignals = buildTradeoffSignals(assessmentAnswers)
  const contradictionFlags = buildContradictionFlags(
    assessmentAnswers,
    pushFactors,
    destinationCriteria,
    readinessConstraints,
    tradeoffSignals,
  )

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    source: "clarity-engine",
    pushFactors,
    pullFactors,
    destinationCriteria,
    nonNegotiables,
    readinessConstraints,
    tradeoffSignals,
    motivationOrientation: determineMotivationOrientation(
      assessmentAnswers,
      pushFactors,
      pullFactors,
    ),
    contradictionFlags,
    signalNotes: buildSignalNotes(userProfile, destinationCriteria, contradictionFlags),
  }
}

function buildReadinessProfile(
  assessmentAnswers: AssessmentAnswers,
): ReadinessProfile {
  const now = timestamp()
  const financialFlexibility = average([
    scaledAnswer(assessmentAnswers.answers.incomePortability),
    scaledAnswer(assessmentAnswers.answers.financialConfidence),
  ])
  const logisticalReadiness = scaledAnswer(
    assessmentAnswers.answers.adminReadiness,
  )
  const obligations = scaledAnswer(assessmentAnswers.answers.obligationsLevel)
  const lifeFlexibility = clampScore(6 - obligations)
  const uncertaintyTolerance = scaledAnswer(
    assessmentAnswers.answers.uncertaintyTolerance,
  )
  const timelineProximity = scaledTimelineScore(
    assessmentAnswers.answers.timelineMonths,
  )

  const rawComposite = average([
    financialFlexibility,
    logisticalReadiness,
    lifeFlexibility,
    uncertaintyTolerance,
    timelineProximity,
  ])

  const cappedComposite = applyReadinessCap(
    rawComposite,
    financialFlexibility,
    logisticalReadiness,
    obligations,
  )
  const readinessLevel = resolveReadinessLevel(cappedComposite)
  const blockers = buildReadinessBlockers(
    financialFlexibility,
    logisticalReadiness,
    obligations,
    timelineProximity,
  )
  const strengths = buildReadinessStrengths(
    financialFlexibility,
    logisticalReadiness,
    lifeFlexibility,
    uncertaintyTolerance,
    timelineProximity,
  )

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    source: "clarity-engine",
    readinessLevel,
    compositeScore: round2(cappedComposite),
    dimensions: {
      financialFlexibility,
      logisticalReadiness,
      lifeFlexibility,
      uncertaintyTolerance,
      timelineProximity,
    },
    blockers,
    strengths,
    planningHorizon: derivePlanningHorizon(readinessLevel),
    confidence: deriveReadinessConfidence(blockers.length, strengths.length),
  }
}

function buildArchetypeProfile(
  assessmentSignals: AssessmentSignals,
  readinessProfile: ReadinessProfile,
): ArchetypeProfile {
  const now = timestamp()
  const rankedArchetypes = scoreLifeArchetypes(assessmentSignals)
  const primaryLifeArchetype = rankedArchetypes[0]?.key ?? "balanceFirst"
  const secondaryLifeArchetype =
    rankedArchetypes[1] && rankedArchetypes[1].score >= rankedArchetypes[0].score - 1
      ? rankedArchetypes[1].key
      : undefined
  const fitDirectionArchetype = determineFitDirectionArchetype(
    primaryLifeArchetype,
    assessmentSignals,
    readinessProfile.readinessLevel,
  )

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    source: "clarity-engine",
    primaryLifeArchetype,
    secondaryLifeArchetype,
    fitDirectionArchetype,
    rationale: buildArchetypeRationale(
      primaryLifeArchetype,
      fitDirectionArchetype,
      assessmentSignals,
      readinessProfile,
    ),
    confidence: deriveArchetypeConfidence(assessmentSignals),
  }
}

function buildClarityReport(
  assessmentAnswers: AssessmentAnswers,
  userProfile: UserProfile,
  assessmentSignals: AssessmentSignals,
  readinessProfile: ReadinessProfile,
  archetypeProfile: ArchetypeProfile,
) {
  const now = timestamp()
  const reportId = `clarity-${crypto.randomUUID()}`
  const topPushLabels = assessmentSignals.pushFactors.slice(0, 2).map((item) => item.label)
  const topPullLabels = assessmentSignals.pullFactors.slice(0, 2).map((item) => item.label)
  const topCriteria = assessmentSignals.destinationCriteria
    .slice(0, 3)
    .map((item) => item.label)

  const highlights = [
    `Primary life orientation: ${LIFE_ARCHETYPE_LABELS[archetypeProfile.primaryLifeArchetype]}.`,
    `Readiness is currently ${readinessProfile.readinessLevel}.`,
    `Your strongest destination filters are ${joinHuman(topCriteria)}.`,
  ]

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    source: "clarity-engine" as const,
    reportId,
    userId: userProfile.userId ?? assessmentAnswers.userId,
    sessionId: userProfile.sessionId ?? assessmentAnswers.sessionId,
    summary: {
      motivationSummary: `Your relocation energy is ${MOTIVATION_ORIENTATION_LABELS[assessmentSignals.motivationOrientation]}, with ${joinHuman(topPushLabels)} pushing change and ${joinHuman(topPullLabels)} defining what you want more of.`,
      desiredLifeSummary: `You appear to be optimizing for a ${LIFE_ARCHETYPE_LABELS[archetypeProfile.primaryLifeArchetype]} life shape, centered on ${joinHuman(topPullLabels)}.`,
      readinessSummary: `You are in the ${readinessProfile.readinessLevel} readiness stage, which suggests a ${readinessProfile.planningHorizon} planning horizon.`,
      fitDirectionSummary: `Your best-fit direction currently looks like the ${FIT_DIRECTION_LABELS[archetypeProfile.fitDirectionArchetype]}, driven by ${joinHuman(topCriteria)}.`,
      frictionSummary:
        assessmentSignals.contradictionFlags.length > 0
          ? assessmentSignals.contradictionFlags.join(" ")
          : "No major contradictions dominate the profile right now, but practical readiness should still lead the pacing.",
      nextStepSummary: buildNextStepSummary(
        readinessProfile.readinessLevel,
        assessmentSignals,
      ),
    },
    highlights,
    topPriorities: userProfile.topPriorities ?? [],
    nonNegotiables: assessmentSignals.nonNegotiables,
    contradictionFlags: assessmentSignals.contradictionFlags,
    readinessProfile,
    archetypeProfile,
    signals: assessmentSignals,
    disclaimerFlags: [
      "decision-support-not-advice",
      "no-country-certainty-in-mvp",
    ],
  }
}

function buildReadinessConstraints(
  assessmentAnswers: AssessmentAnswers,
): SignalScore[] {
  const constraints: SignalScore[] = []
  const incomePortability = scaledAnswer(assessmentAnswers.answers.incomePortability)
  const obligations = scaledAnswer(assessmentAnswers.answers.obligationsLevel)
  const adminReadiness = scaledAnswer(assessmentAnswers.answers.adminReadiness)
  const uncertaintyTolerance = scaledAnswer(
    assessmentAnswers.answers.uncertaintyTolerance,
  )
  const timelineMonths = asOptionalNumber(assessmentAnswers.answers.timelineMonths)

  if (incomePortability <= 2) {
    constraints.push(
      toSignalScore("lowIncomePortability", 6 - incomePortability, READINESS_CONSTRAINT_DEFINITIONS),
    )
  }
  if (obligations >= 4) {
    constraints.push(
      toSignalScore("highObligations", obligations, READINESS_CONSTRAINT_DEFINITIONS),
    )
  }
  if (adminReadiness <= 2) {
    constraints.push(
      toSignalScore("lowAdminReadiness", 6 - adminReadiness, READINESS_CONSTRAINT_DEFINITIONS),
    )
  }
  if (timelineMonths !== undefined && timelineMonths <= 6) {
    constraints.push(toSignalScore("shortTimeline", 4, READINESS_CONSTRAINT_DEFINITIONS))
  }
  if (uncertaintyTolerance <= 2) {
    constraints.push(
      toSignalScore("lowRiskTolerance", 6 - uncertaintyTolerance, READINESS_CONSTRAINT_DEFINITIONS),
    )
  }

  return constraints.sort((left, right) => right.score - left.score)
}

function buildTradeoffSignals(
  assessmentAnswers: AssessmentAnswers,
): SignalScore[] {
  const summary: TradeoffPreferenceSummary = {
    belongingWins: 0,
    affordabilityWins: 0,
    infrastructureWins: 0,
    peaceWins: 0,
    easeWins: 0,
    idealFitWins: 0,
  }

  const tradeoffAnswers = [
    assessmentAnswers.answers.tradeoffAffordabilityVsBelonging,
    assessmentAnswers.answers.tradeoffInfrastructureVsPace,
    assessmentAnswers.answers.tradeoffEaseVsEmotionalFit,
  ]

  for (const answer of tradeoffAnswers) {
    if (typeof answer !== "string") {
      continue
    }

    if (answer === "belonging") summary.belongingWins += 1
    if (answer === "affordability") summary.affordabilityWins += 1
    if (answer === "infrastructure") summary.infrastructureWins += 1
    if (answer === "peace") summary.peaceWins += 1
    if (answer === "ease") summary.easeWins += 1
    if (answer === "idealFit") summary.idealFitWins += 1
  }

  return Object.entries(summary)
    .filter(([, score]) => score > 0)
    .map(([key, score]) =>
      toSignalScore(
        key as keyof TradeoffPreferenceSummary,
        score,
        TRADEOFF_SIGNAL_DEFINITIONS,
      ),
    )
    .sort((left, right) => right.score - left.score)
}

function buildContradictionFlags(
  assessmentAnswers: AssessmentAnswers,
  pushFactors: SignalScore[],
  destinationCriteria: RankedSignal[],
  readinessConstraints: SignalScore[],
  tradeoffSignals: SignalScore[],
): string[] {
  const contradictions: string[] = []
  const urgency = asUrgencyLevel(assessmentAnswers.answers.timelineUrgencyLevel)
  const incomePortability = scaledAnswer(assessmentAnswers.answers.incomePortability)
  const obligations = scaledAnswer(assessmentAnswers.answers.obligationsLevel)
  const wantsPeace = hasSignal(pushFactors, "overstimulation")
  const needsInfrastructure = destinationCriteria.some(
    (criterion) => criterion.key === "infrastructure" && criterion.rank <= 2,
  )
  const choosesEase = tradeoffSignals.some((signal) => signal.key === "easeWins")
  const needsBelonging = destinationCriteria.some(
    (criterion) =>
      criterion.key === "socialFit" ||
      criterion.key === "blackCommunity",
  )

  if (urgency === "high" && readinessConstraints.length >= 2) {
    contradictions.push(
      "You feel urgency to move, but your current readiness signals suggest the timeline may need more support and preparation.",
    )
  }
  if (wantsPeace && needsInfrastructure) {
    contradictions.push(
      "You want relief and softness, while also protecting high infrastructure certainty. That tension will shape which destinations feel realistic.",
    )
  }
  if (needsBelonging && choosesEase) {
    contradictions.push(
      "Belonging appears central, but your tradeoff answers also favor the easiest path. You may need to decide whether speed or deeper fit leads.",
    )
  }
  if (incomePortability <= 2 && obligations >= 4) {
    contradictions.push(
      "Your practical constraints are heavy right now, so emotional clarity should not be mistaken for immediate move readiness.",
    )
  }

  return contradictions
}

function buildSignalNotes(
  userProfile: UserProfile,
  destinationCriteria: RankedSignal[],
  contradictionFlags: string[],
): string[] {
  const notes: string[] = []

  if ((userProfile.destinationsConsidering?.length ?? 0) > 0) {
    notes.push(
      `User already has destinations in view: ${joinHuman(
        userProfile.destinationsConsidering ?? [],
      )}.`,
    )
  }

  if (destinationCriteria.length > 0) {
    notes.push(
      `Top criteria are ${joinHuman(destinationCriteria.slice(0, 3).map((item) => item.label))}.`,
    )
  }

  if (contradictionFlags.length === 0) {
    notes.push("Profile is directionally coherent enough for downstream routing.")
  }

  return notes
}

function determineMotivationOrientation(
  assessmentAnswers: AssessmentAnswers,
  pushFactors: SignalScore[],
  pullFactors: SignalScore[],
) {
  const declared = asOptionalString(assessmentAnswers.answers.motivationOrientation)
  if (
    declared === "pushDriven" ||
    declared === "pullDriven" ||
    declared === "balanced" ||
    declared === "unclear"
  ) {
    return declared
  }

  const pushScore = pushFactors.reduce((sum, item) => sum + item.score, 0)
  const pullScore = pullFactors.reduce((sum, item) => sum + item.score, 0)

  if (pushScore === 0 && pullScore === 0) {
    return "unclear"
  }
  if (Math.abs(pushScore - pullScore) <= 1) {
    return "balanced"
  }

  return pushScore > pullScore ? "pushDriven" : "pullDriven"
}

function scoreLifeArchetypes(assessmentSignals: AssessmentSignals): Array<{
  key: LifeArchetype
  score: number
}> {
  const scoreMap: Record<LifeArchetype, number> = {
    peaceFirst: 0,
    belongingFirst: 0,
    affordabilityFirst: 0,
    stabilityFirst: 0,
    reinventionFirst: 0,
    balanceFirst: 0,
  }

  for (const signal of assessmentSignals.pullFactors) {
    if (signal.key === "peace" || signal.key === "slowerPace") {
      scoreMap.peaceFirst += signal.score
    }
    if (signal.key === "belonging" || signal.key === "dignity") {
      scoreMap.belongingFirst += signal.score
    }
    if (signal.key === "affordability") {
      scoreMap.affordabilityFirst += signal.score
    }
    if (signal.key === "stability") {
      scoreMap.stabilityFirst += signal.score
    }
    if (signal.key === "reinvention" || signal.key === "freedom") {
      scoreMap.reinventionFirst += signal.score
    }
  }

  for (const criterion of assessmentSignals.destinationCriteria.slice(0, 3)) {
    if (criterion.key === "affordability") scoreMap.affordabilityFirst += criterion.weight
    if (
      criterion.key === "socialFit" ||
      criterion.key === "blackCommunity"
    ) {
      scoreMap.belongingFirst += criterion.weight
    }
    if (
      criterion.key === "healthcare" ||
      criterion.key === "safety" ||
      criterion.key === "infrastructure"
    ) {
      scoreMap.stabilityFirst += criterion.weight
    }
    if (criterion.key === "paceOfLife") scoreMap.peaceFirst += criterion.weight
    if (criterion.key === "workCompatibility") scoreMap.reinventionFirst += criterion.weight
  }

  scoreMap.balanceFirst =
    assessmentSignals.destinationCriteria.length > 0 &&
    assessmentSignals.contradictionFlags.length === 0
      ? 3
      : 1

  return Object.entries(scoreMap)
    .map(([key, score]) => ({ key: key as LifeArchetype, score }))
    .sort((left, right) => right.score - left.score)
}

function determineFitDirectionArchetype(
  primaryLifeArchetype: LifeArchetype,
  assessmentSignals: AssessmentSignals,
  readinessLevel: ReadinessLevel,
): FitDirectionArchetype {
  const topCriteria = assessmentSignals.destinationCriteria.slice(0, 3).map((item) => item.key)

  if (
    readinessLevel === "early" ||
    assessmentSignals.contradictionFlags.length >= 2
  ) {
    return "emergingClarityPath"
  }
  if (
    primaryLifeArchetype === "belongingFirst" ||
    topCriteria.includes("socialFit") ||
    topCriteria.includes("blackCommunity")
  ) {
    return "belongingCenteredPath"
  }
  if (
    primaryLifeArchetype === "stabilityFirst" ||
    topCriteria.includes("infrastructure") ||
    topCriteria.includes("healthcare")
  ) {
    return "stabilityAndSystemsPath"
  }
  if (
    topCriteria.includes("workCompatibility") &&
    readinessLevel !== "early"
  ) {
    return "flexibleRemoteLifePath"
  }

  return "calmAffordabilityPath"
}

function buildArchetypeRationale(
  primaryLifeArchetype: LifeArchetype,
  fitDirectionArchetype: FitDirectionArchetype,
  assessmentSignals: AssessmentSignals,
  readinessProfile: ReadinessProfile,
) {
  return [
    `Primary life orientation is ${LIFE_ARCHETYPE_LABELS[primaryLifeArchetype]} based on strongest pull factors and ranked destination criteria.`,
    `Fit direction resolves to ${FIT_DIRECTION_LABELS[fitDirectionArchetype]} after accounting for readiness stage ${readinessProfile.readinessLevel}.`,
    `Tradeoff signals and contradiction flags: ${
      assessmentSignals.contradictionFlags.length > 0
        ? assessmentSignals.contradictionFlags.length
        : "no dominant conflicts"
    }.`,
  ]
}

function deriveArchetypeConfidence(
  assessmentSignals: AssessmentSignals,
): ConfidenceLevel {
  if (assessmentSignals.contradictionFlags.length >= 2) {
    return "low"
  }
  if (assessmentSignals.destinationCriteria.length < 3) {
    return "medium"
  }

  return "high"
}

function buildNextStepSummary(
  readinessLevel: ReadinessLevel,
  assessmentSignals: AssessmentSignals,
) {
  if (
    readinessLevel === "early" ||
    assessmentSignals.contradictionFlags.length >= 2
  ) {
    return "Focus on narrowing your top destination criteria, pressure-testing constraints, and reducing ambiguity before heavy destination commitment."
  }
  if (readinessLevel === "emerging") {
    return "Start light destination research around your top criteria, organize core documents, and validate the assumptions behind your non-negotiables."
  }
  if (readinessLevel === "active") {
    return "Move into focused destination validation, timeline pressure-testing, and practical preparation for the path that already looks strongest."
  }

  return "Shift into tactical planning, closing remaining uncertainty gaps while preserving the priorities that already look stable."
}

function derivePlanningHorizon(readinessLevel: ReadinessLevel) {
  switch (readinessLevel) {
    case "early":
      return "90+ day"
    case "emerging":
      return "60-90 day"
    case "active":
      return "30-60 day"
    case "nearlyReady":
      return "30 day"
  }
}

function deriveReadinessConfidence(
  blockerCount: number,
  strengthCount: number,
): ConfidenceLevel {
  if (blockerCount >= 3) {
    return "medium"
  }
  if (strengthCount >= 3) {
    return "high"
  }

  return "medium"
}

function buildReadinessBlockers(
  financialFlexibility: number,
  logisticalReadiness: number,
  obligations: number,
  timelineProximity: number,
) {
  const blockers: string[] = []

  if (financialFlexibility <= 2.5) {
    blockers.push("Financial flexibility is not strong enough yet for a clean relocation push.")
  }
  if (logisticalReadiness <= 2.5) {
    blockers.push("Administrative readiness is still light, which raises execution friction.")
  }
  if (obligations >= 4) {
    blockers.push("Current obligations reduce how quickly you can act without strain.")
  }
  if (timelineProximity >= 4 && (financialFlexibility <= 3 || logisticalReadiness <= 3)) {
    blockers.push("The timeline is ambitious relative to the practical setup in place today.")
  }

  return blockers
}

function buildReadinessStrengths(
  financialFlexibility: number,
  logisticalReadiness: number,
  lifeFlexibility: number,
  uncertaintyTolerance: number,
  timelineProximity: number,
) {
  const strengths: string[] = []

  if (financialFlexibility >= 3.5) {
    strengths.push("Financial flexibility gives you room to make decisions without immediate panic.")
  }
  if (logisticalReadiness >= 3.5) {
    strengths.push("You already have useful logistical readiness in place.")
  }
  if (lifeFlexibility >= 3.5) {
    strengths.push("Your life structure appears flexible enough to support serious exploration.")
  }
  if (uncertaintyTolerance >= 3.5) {
    strengths.push("You appear able to tolerate the ambiguity that relocation decisions often require.")
  }
  if (timelineProximity >= 3.5) {
    strengths.push("Your timeline suggests this is not purely aspirational for you anymore.")
  }

  return strengths
}

function resolveReadinessLevel(score: number): ReadinessLevel {
  return (
    READINESS_LEVELS.find((entry) => score >= entry.min && score <= entry.max)
      ?.level ?? "emerging"
  )
}

function applyReadinessCap(
  rawComposite: number,
  financialFlexibility: number,
  logisticalReadiness: number,
  obligations: number,
) {
  if (financialFlexibility <= 2 || logisticalReadiness <= 2) {
    return Math.min(rawComposite, 3.4)
  }
  if (obligations >= 4.5) {
    return Math.min(rawComposite, 3)
  }

  return rawComposite
}

function scoreSelections(
  selectedKeys: string[],
  definitions: Record<string, { key: string; label: string }>,
) {
  return selectedKeys
    .map((key, index) => toSignalScore(key, Math.max(1, 5 - index), definitions))
    .sort((left, right) => right.score - left.score)
}

function rankSignals(
  rankedKeys: string[],
  definitions: Record<string, { key: string; label: string }>,
): RankedSignal[] {
  return rankedKeys.slice(0, 5).map((key, index) => ({
    key,
    label: definitions[key]?.label ?? humanizeKey(key),
    rank: index + 1,
    weight: Math.max(1, 5 - index),
  }))
}

function toSignalScore(
  key: string,
  score: number,
  definitions: Record<string, { key: string; label: string }>,
): SignalScore {
  return {
    key,
    label: definitions[key]?.label ?? humanizeKey(key),
    score,
  }
}

function scaledTimelineScore(value: PrimitiveAnswer) {
  const months = asOptionalNumber(value)
  if (months === undefined) {
    return 3
  }
  if (months <= 3) return 5
  if (months <= 6) return 4
  if (months <= 12) return 3
  if (months <= 24) return 2
  return 1
}

function scaledAnswer(value: PrimitiveAnswer) {
  const numeric = asOptionalNumber(value)
  return clampScore(numeric ?? 3)
}

function clampScore(value: number) {
  return Math.max(1, Math.min(5, round2(value)))
}

function average(values: number[]) {
  const filtered = values.filter((value) => Number.isFinite(value))
  return round2(filtered.reduce((sum, value) => sum + value, 0) / filtered.length)
}

function extractFreeTextValues(
  assessmentAnswers: AssessmentAnswers,
  keys: string[],
) {
  return keys
    .map((key) => assessmentAnswers.freeText[key])
    .filter((value): value is string => Boolean(value))
}

function asOptionalString(value: PrimitiveAnswer) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined
}

function asOptionalNumber(value: PrimitiveAnswer) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function asOptionalBoolean(value: PrimitiveAnswer) {
  return typeof value === "boolean" ? value : undefined
}

function normalizeStringArray(value: PrimitiveAnswer) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function asProfileType(value: PrimitiveAnswer) {
  if (
    value === "solo" ||
    value === "family" ||
    value === "retiree" ||
    value === "digitalNomad" ||
    value === "investor" ||
    value === "other"
  ) {
    return value
  }

  return undefined
}

function asUrgencyLevel(value: PrimitiveAnswer) {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : undefined
}

function hasSignal(signals: SignalScore[], key: string) {
  return signals.some((signal) => signal.key === key)
}

function timestamp() {
  return new Date().toISOString()
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function joinHuman(values: string[]) {
  if (values.length === 0) {
    return "no dominant factors yet"
  }
  if (values.length === 1) {
    return values[0]
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`
}

function toCriterionLabel(value: string) {
  return CRITERIA_DEFINITIONS[value]?.label ?? humanizeKey(value)
}

function humanizeKey(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
