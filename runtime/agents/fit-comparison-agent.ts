import type {
  ArchetypeProfile,
  ClarityReport,
  ConfidenceLevel,
  DestinationResearchReport,
  FitComparisonReport,
  FitVerdict,
  ReadinessProfile,
  UserProfile,
} from "../../types/exidus-schema.ts"
import { SCHEMA_VERSION } from "../config.ts"
import type {
  AgentInvocation,
  AgentInvocationResult,
} from "../core/types.ts"

type NonNegotiableStatus = "clear" | "watch" | "conflict"

interface DestinationComparisonEntry {
  destination: string
  fitVerdict: FitVerdict
  practicalFit: FitVerdict
  emotionalFit: FitVerdict
  currentStageFit: FitVerdict
  practicalPoints: number
  emotionalPoints: number
  currentStagePoints: number
  nonNegotiableStatus: NonNegotiableStatus
  strengths: string[]
  tensions: string[]
  tradeoffs: string[]
  notes: string[]
  confidence: ConfidenceLevel
}

interface ComparisonScorecard {
  practicalPoints: number
  emotionalPoints: number
  currentStagePoints: number
  nonNegotiablePenalty: number
  confidencePenalty: number
  overallPoints: number
}

export async function invokeFitComparisonAgent(
  invocation: AgentInvocation,
): Promise<AgentInvocationResult> {
  const userProfile = requireArtifact(invocation.artifacts.userProfile, "userProfile")
  const clarityReport = requireArtifact(invocation.artifacts.clarityReport, "clarityReport")
  const readinessProfile = requireArtifact(
    invocation.artifacts.readinessProfile ?? clarityReport.readinessProfile,
    "readinessProfile",
  )
  const archetypeProfile = requireArtifact(
    invocation.artifacts.archetypeProfile ?? clarityReport.archetypeProfile,
    "archetypeProfile",
  )
  const reports = uniqueDestinationReports(invocation.artifacts.destinationResearchReports ?? [])

  if (reports.length < 2) {
    throw new Error("Fit Comparison Agent needs at least two destination research reports.")
  }

  const fitComparisonReport = buildFitComparisonReport({
    userIntent: invocation.userIntent,
    userProfile,
    clarityReport,
    readinessProfile,
    archetypeProfile,
    reports,
  })

  return {
    agentId: "fit-comparison-agent",
    status: "completed",
    message: `Fit Comparison Agent compared ${fitComparisonReport.comparedDestinations.join(", ")} using existing destination research artifacts.`,
    artifacts: {
      ...invocation.artifacts,
      fitComparisonReport,
    },
  }
}

function buildFitComparisonReport(input: {
  userIntent?: string
  userProfile: UserProfile
  clarityReport: ClarityReport
  readinessProfile: ReadinessProfile
  archetypeProfile: ArchetypeProfile
  reports: DestinationResearchReport[]
}): FitComparisonReport {
  const now = new Date().toISOString()
  const topPriorities = collectTopPriorities(input.userProfile, input.clarityReport)
  const nonNegotiables = input.clarityReport.nonNegotiables
  const comparisonEntries = input.reports.map((report) =>
    buildComparisonEntry({
      report,
      topPriorities,
      nonNegotiables,
      readinessProfile: input.readinessProfile,
      archetypeProfile: input.archetypeProfile,
      userProfile: input.userProfile,
    })
  )
  const scorecards = new Map(
    comparisonEntries.map((entry) => [entry.destination, scoreComparisonEntry(entry)]),
  )
  const strongestFit = pickDestination(comparisonEntries, scorecards, "overall")
  const weakestFit = pickDestination(comparisonEntries, scorecards, "weakest")
  const strongestPracticalFit = pickDestination(comparisonEntries, scorecards, "practical")
  const strongestEmotionalFit = pickDestination(comparisonEntries, scorecards, "emotional")
  const comparisonSummary = buildComparisonSummary({
    userIntent: input.userIntent,
    topPriorities,
    readinessProfile: input.readinessProfile,
    strongestFit,
    strongestPracticalFit,
    strongestEmotionalFit,
    weakestFit,
    comparisonEntries,
  })
  const keyTradeoffs = collectKeyTradeoffs(comparisonEntries)
  const needsMoreResearchOn = comparisonEntries
    .filter((entry) => requiresMoreResearch(entry))
    .map((entry) => entry.destination)
  const recommendedNextMove = buildRecommendedNextMove({
    readinessProfile: input.readinessProfile,
    strongestFit,
    strongestPracticalFit,
    strongestEmotionalFit,
    comparisonEntries,
    needsMoreResearchOn,
  })
  const emotionalPracticalSplit =
    Boolean(strongestPracticalFit) &&
    Boolean(strongestEmotionalFit) &&
    strongestPracticalFit !== strongestEmotionalFit

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    source: "fit-comparison-agent",
    comparedDestinations: comparisonEntries.map((entry) => entry.destination),
    strongestFit,
    strongestPracticalFit,
    strongestEmotionalFit,
    weakestFit,
    comparisonSummary,
    keyTradeoffs,
    destinationComparisons: comparisonEntries,
    recommendedNextMove,
    routeSignals: {
      needsMoreResearchOn,
      readyForActionPlanning:
        Boolean(strongestFit) &&
        input.readinessProfile.readinessLevel !== "early" &&
        needsMoreResearchOn.length === 0 &&
        !emotionalPracticalSplit,
    },
  }
}

function buildComparisonEntry(input: {
  report: DestinationResearchReport
  topPriorities: string[]
  nonNegotiables: string[]
  readinessProfile: ReadinessProfile
  archetypeProfile: ArchetypeProfile
  userProfile: UserProfile
}): DestinationComparisonEntry {
  const matchedPriorityEvidence = input.topPriorities
    .map((priority) => findPriorityEvidence(priority, input.report))
    .filter(Boolean) as string[]
  const practicalPoints = scorePracticalFit(input.report, input.topPriorities, input.readinessProfile, input.userProfile)
  const emotionalPoints = scoreEmotionalFit(input.report, input.topPriorities, input.archetypeProfile)
  const currentStagePoints = scoreCurrentStageFit(input.report, input.readinessProfile)
  const nonNegotiablePenalty = scoreNonNegotiables(input.nonNegotiables, input.report)
  const practicalFit = verdictFromPoints(practicalPoints)
  const emotionalFit = verdictFromPoints(emotionalPoints)
  const currentStageFit = verdictFromPoints(currentStagePoints)
  const fitVerdict = combineVerdicts(practicalFit, emotionalFit, currentStageFit, nonNegotiablePenalty, input.report.profileFitVerdict)
  const nonNegotiableStatus = resolveNonNegotiableStatus(nonNegotiablePenalty)
  const strengths = uniqueStrings([
    ...matchedPriorityEvidence.slice(0, 2),
    ...input.report.fitNotes.whyItMayFit.slice(0, 2),
  ]).slice(0, 4)
  const tensions = uniqueStrings([
    ...input.report.fitNotes.whyItMayNotFit.slice(0, 2),
    ...buildReadinessTension(input.readinessProfile, input.report),
    ...buildNonNegotiableTension(nonNegotiableStatus, input.nonNegotiables, input.report),
  ]).slice(0, 4)
  const tradeoffs = uniqueStrings(input.report.fitNotes.majorTradeoffs).slice(0, 3)
  const notes = uniqueStrings([
    `Practical fit reads as ${humanizeVerdict(practicalFit)} because ${summarizePracticalDrivers(input.report, input.topPriorities, practicalFit)}.`,
    `Emotional fit reads as ${humanizeVerdict(emotionalFit)} because ${summarizeEmotionalDrivers(input.report, input.topPriorities, emotionalFit)}.`,
    `Current-stage fit reads as ${humanizeVerdict(currentStageFit)} for ${withIndefiniteArticle(input.readinessProfile.readinessLevel)} readiness profile because ${summarizeStageDrivers(input.report, input.readinessProfile, currentStageFit)}.`,
    nonNegotiableStatus === "conflict"
      ? "One or more non-negotiables appear under pressure in the current research and should be verified before narrowing."
      : nonNegotiableStatus === "watch"
        ? "There are watch-points against the stated non-negotiables, but not enough to rule the destination out."
        : "The current research does not show a direct non-negotiable conflict, though that still needs deeper verification before acting.",
  ]).slice(0, 5)

  return {
    destination: input.report.destination,
    fitVerdict,
    practicalFit,
    emotionalFit,
    currentStageFit,
    practicalPoints,
    emotionalPoints,
    currentStagePoints,
    nonNegotiableStatus,
    strengths,
    tensions,
    tradeoffs,
    notes,
    confidence: input.report.confidence,
  }
}

function scorePracticalFit(
  report: DestinationResearchReport,
  priorities: string[],
  readinessProfile: ReadinessProfile,
  userProfile: UserProfile,
) {
  let points = startingPoints(report.profileFitVerdict)

  if (priorityMatches(priorities, ["afford", "budget", "cost"])) {
    points += sectionConfidenceBonus(report.sections.costOfLiving?.confidence)
    if (containsAny(report.sections.costOfLiving?.summary, ["strong affordability", "affordability-to-lifestyle", "moderate-cost", "better budget"])) {
      points += 1
    }
  }

  if (priorityMatches(priorities, ["health", "medical"])) {
    points += sectionConfidenceBonus(report.sections.healthcare?.confidence)
  }

  if (priorityMatches(priorities, ["safety", "stable", "system", "infrastructure"])) {
    points += sectionConfidenceBonus(report.sections.safety?.confidence)
    if (
      containsAny(report.sections.safety?.summary, ["regional variation", "petty theft", "risk"]) ||
      containsAny(report.fitNotes.majorTradeoffs.join(" "), ["infrastructure", "regional safety variance"])
    ) {
      points -= 1
    }
  }

  if (priorityMatches(priorities, ["family", "school", "education"]) || (userProfile.partySize?.children ?? 0) > 0) {
    points += report.sections.education ? sectionConfidenceBonus(report.sections.education.confidence) : -1
  }

  if (priorityMatches(priorities, ["english", "language"])) {
    if (containsAny(report.sections.cultureIntegration?.summary, ["english is workable", "english is a practical advantage"])) {
      points += 1
    } else if (containsAny(report.sections.cultureIntegration?.summary, ["language acquisition", "spanish", "portuguese"])) {
      points -= 1
    }
  }

  if (readinessProfile.readinessLevel === "early" || readinessProfile.readinessLevel === "emerging") {
    if (containsAny(report.recommendedNextStep, ["structured next pass", "shortlist", "pressure-test"])) {
      points -= 1
    }
  }

  if (readinessProfile.blockers.length > 0 && containsAny(report.fitNotes.whyItMayNotFit.join(" "), ["bureaucr", "processing", "eligibility", "housing"])) {
    points -= 1
  }

  if (report.confidence === "low") {
    points -= 2
  } else if (report.confidence === "medium") {
    points -= 1
  }

  return points
}

function scoreEmotionalFit(
  report: DestinationResearchReport,
  priorities: string[],
  archetypeProfile: ArchetypeProfile,
) {
  let points = startingPoints(report.profileFitVerdict)

  if (priorityMatches(priorities, ["belong", "community", "culture", "integration"])) {
    points += sectionConfidenceBonus(report.sections.cultureIntegration?.confidence)
  }

  if (priorityMatches(priorities, ["warm", "climate", "pace", "calm", "peace"])) {
    points += sectionConfidenceBonus(report.sections.climateEnvironment?.confidence)
  }

  if (containsAny(report.fitNotes.whyItMayFit.join(" "), ["pace", "warm", "belong", "welcoming", "community", "softer"])) {
    points += 1
  }

  if (containsAny(report.fitNotes.whyItMayNotFit.join(" "), ["language", "integration", "bureaucracy"])) {
    points -= 1
  }

  if (priorityMatches(priorities, ["english", "language"])) {
    if (
      containsAny(report.sections.cultureIntegration?.summary, ["diaspora", "belonging"]) ||
      containsAny(report.sections.cultureIntegration?.notes.join(" "), ["english is a practical advantage", "english-language comfort"])
    ) {
      points += 1
    } else if (containsAny(report.sections.cultureIntegration?.notes.join(" "), ["spanish", "portuguese"])) {
      points -= 1
    }
  }

  if (
    archetypeProfile.primaryLifeArchetype === "belongingFirst" &&
    containsAny(report.sections.cultureIntegration?.summary, ["welcoming", "socially warm", "belonging"])
  ) {
    points += 1
  }

  if (containsAny(report.sections.cultureIntegration?.summary, ["diaspora"])) {
    points += 1
  }

  if (
    archetypeProfile.primaryLifeArchetype === "peaceFirst" &&
    containsAny(report.sections.climateEnvironment?.summary, ["mild", "warm", "temperate"])
  ) {
    points += 1
  }

  if (report.confidence === "low") {
    points -= 1
  }

  return points
}

function scoreCurrentStageFit(
  report: DestinationResearchReport,
  readinessProfile: ReadinessProfile,
) {
  let points = startingPoints(report.profileFitVerdict)

  if (readinessProfile.readinessLevel === "early") {
    if (containsAny(report.recommendedNextStep, ["structured next pass", "shortlist two cities"])) {
      points -= 1
    }
    if (containsAny(report.fitNotes.whyItMayNotFit.join(" "), ["processing", "eligibility", "city-specific", "verify"])) {
      points -= 1
    }
  }

  if (readinessProfile.readinessLevel === "active" || readinessProfile.readinessLevel === "nearlyReady") {
    if (report.sections.practicalNextSteps?.confidence === "high") {
      points += 1
    }
  }

  if (readinessProfile.blockers.length > 0) {
    points -= Math.min(1, readinessProfile.blockers.length)
  }

  if (report.confidence === "low") {
    points -= 1
  }

  return points
}

function scoreNonNegotiables(nonNegotiables: string[], report: DestinationResearchReport) {
  if (nonNegotiables.length === 0) {
    return 0
  }

  const reportText = [
    report.quickFitSummary,
    report.fitNotes.whyItMayNotFit.join(" "),
    report.fitNotes.majorTradeoffs.join(" "),
    report.sections.safety?.summary,
    report.sections.healthcare?.summary,
    report.sections.costOfLiving?.summary,
    report.sections.education?.summary,
    report.sections.cultureIntegration?.summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  let penalty = 0

  for (const nonNegotiable of nonNegotiables) {
    const normalized = nonNegotiable.toLowerCase()
    if (
      containsAny(normalized, ["safety", "safe"]) &&
      containsAny(reportText, ["regional variation", "petty theft", "risk"])
    ) {
      penalty += 2
      continue
    }

    if (
      containsAny(normalized, ["health", "medical"]) &&
      containsAny(reportText, ["vary", "waiting", "private"])
    ) {
      penalty += 1
      continue
    }

    if (
      containsAny(normalized, ["afford", "budget", "cost"]) &&
      containsAny(reportText, ["housing pressure", "materially alter the budget", "premium neighborhoods"])
    ) {
      penalty += 2
      continue
    }

    if (
      containsAny(normalized, ["school", "education", "children", "family"]) &&
      containsAny(reportText, ["city-specific", "international school", "school quality"])
    ) {
      penalty += 1
    }
  }

  return penalty
}

function scoreComparisonEntry(entry: DestinationComparisonEntry): ComparisonScorecard {
  const practicalPoints = entry.practicalPoints
  const emotionalPoints = entry.emotionalPoints
  const currentStagePoints = entry.currentStagePoints
  const nonNegotiablePenalty =
    entry.nonNegotiableStatus === "conflict"
      ? 2
      : entry.nonNegotiableStatus === "watch"
        ? 1
        : 0
  const confidencePenalty =
    entry.confidence === "low"
      ? 2
      : entry.confidence === "medium"
        ? 1
        : 0

  return {
    practicalPoints,
    emotionalPoints,
    currentStagePoints,
    nonNegotiablePenalty,
    confidencePenalty,
    overallPoints:
      practicalPoints * 2 +
      emotionalPoints +
      currentStagePoints -
      nonNegotiablePenalty -
      confidencePenalty,
  }
}

function buildComparisonSummary(input: {
  userIntent?: string
  topPriorities: string[]
  readinessProfile: ReadinessProfile
  strongestFit?: string
  strongestPracticalFit?: string
  strongestEmotionalFit?: string
  weakestFit?: string
  comparisonEntries: DestinationComparisonEntry[]
}) {
  const priorityFrame = joinHuman(input.topPriorities.slice(0, 3)) || "the current profile priorities"
  const weakestFitEntry = input.comparisonEntries.find((entry) => entry.destination === input.weakestFit)
  const practicalVsEmotionalSplit =
    input.strongestPracticalFit &&
    input.strongestEmotionalFit &&
    input.strongestPracticalFit !== input.strongestEmotionalFit
      ? buildSplitSummary(
          input.strongestPracticalFit,
          input.strongestEmotionalFit,
          input.comparisonEntries,
        )
      : input.strongestFit
        ? `${input.strongestFit} is the strongest current fit across the available research, but it is still a narrowing signal rather than a final recommendation.`
        : "The current comparison is narrowing the field, but not enough to declare a single clear front-runner."

  const readinessFrame =
    input.readinessProfile.readinessLevel === "early"
      ? "Because readiness is still early, the comparison weights near-term friction more heavily than long-run appeal."
      : input.readinessProfile.readinessLevel === "emerging"
        ? "Because readiness is emerging, the comparison favors destinations that stay usable without pretending the decision is final."
        : "Because readiness is active enough to narrow, the comparison can lean more on practical next-step realism."

  const weakestFrame =
    weakestFitEntry
      ? `${weakestFitEntry.destination} currently carries the most pressure from ${joinHuman(weakestFitEntry.tensions.slice(0, 2)) || "practical friction"}, so it reads as the weakest current fit.`
      : ""

  const researchFrame = input.comparisonEntries.some((entry) => requiresMoreResearch(entry))
    ? "At least one option still has enough uncertainty that shortlist narrowing should stay provisional."
    : "The current evidence is strong enough to support a practical narrowing move rather than another fully open-ended research loop."
  const pressureFrame = buildShortlistPressureFrame(input.comparisonEntries)

  return `${practicalVsEmotionalSplit} This pass compares the shortlist through ${priorityFrame}. ${readinessFrame} ${researchFrame} ${pressureFrame} ${weakestFrame}`.trim()
}

function collectKeyTradeoffs(entries: DestinationComparisonEntry[]) {
  const emotionalVsPracticalTradeoff = findEmotionalPracticalTradeoff(entries)
  const shortlistPressureTradeoff = buildShortlistPressureFrame(entries)
  return uniqueStrings([
    emotionalVsPracticalTradeoff,
    shortlistPressureTradeoff,
    ...entries.flatMap((entry) => entry.tradeoffs),
  ]).slice(0, 6)
}

function buildRecommendedNextMove(input: {
  readinessProfile: ReadinessProfile
  strongestFit?: string
  strongestPracticalFit?: string
  strongestEmotionalFit?: string
  comparisonEntries: DestinationComparisonEntry[]
  needsMoreResearchOn: string[]
}) {
  const pressureTestFocus = buildPressureTestFocus(input.comparisonEntries)

  if (!input.strongestFit) {
    return `Do one more comparison pass focused on ${pressureTestFocus || joinHuman(input.needsMoreResearchOn.slice(0, 2)) || "the unresolved pressure points in the current shortlist"} before trying to force a winner.`
  }

  if (
    input.strongestPracticalFit &&
    input.strongestEmotionalFit &&
    input.strongestPracticalFit !== input.strongestEmotionalFit
  ) {
    return `Pressure-test ${input.strongestPracticalFit} against ${input.strongestEmotionalFit} on ${pressureTestFocus || "the exact tradeoff that matters most to you now"}, then decide whether this phase should be led by current practicality or lived belonging.`
  }

  if (input.needsMoreResearchOn.length > 0) {
    return `Keep ${input.strongestFit} as the lead option for now, but verify ${pressureTestFocus || `the highest-risk open questions on ${joinHuman(input.needsMoreResearchOn.slice(0, 2))}`} before treating the shortlist as planning-ready.`
  }

  if (input.readinessProfile.readinessLevel === "early" || input.readinessProfile.readinessLevel === "emerging") {
    return `Keep ${input.strongestFit} as the working lead, but use action planning only for provisional sequencing while the shortlist stays flexible.`
  }

  return `Use ${input.strongestFit} as the working lead and translate the comparison into a practical shortlist plan rather than another broad research loop.`
}

function findPriorityEvidence(priority: string, report: DestinationResearchReport) {
  const normalized = priority.toLowerCase()
  const candidates = [
    report.sections.costOfLiving?.summary,
    report.sections.healthcare?.summary,
    report.sections.safety?.summary,
    report.sections.climateEnvironment?.summary,
    report.sections.cultureIntegration?.summary,
    report.sections.education?.summary,
    ...report.fitNotes.whyItMayFit,
  ].filter(Boolean) as string[]

  return candidates.find((candidate) => hasPriorityMatch(normalized, candidate))
}

function hasPriorityMatch(priority: string, candidate: string) {
  const normalizedCandidate = candidate.toLowerCase()

  if (priority.includes("afford") || priority.includes("budget") || priority.includes("cost")) {
    return containsAny(normalizedCandidate, ["afford", "budget", "cost"])
  }
  if (priority.includes("health")) {
    return containsAny(normalizedCandidate, ["health", "private care", "healthcare"])
  }
  if (priority.includes("safety") || priority.includes("stable")) {
    return containsAny(normalizedCandidate, ["safe", "safety", "stable", "stability"])
  }
  if (priority.includes("belong") || priority.includes("community")) {
    return containsAny(normalizedCandidate, ["belong", "welcoming", "socially warm", "integration"])
  }
  if (priority.includes("warm") || priority.includes("climate")) {
    return containsAny(normalizedCandidate, ["warm", "climate", "mild", "temperate"])
  }
  if (priority.includes("education") || priority.includes("school")) {
    return containsAny(normalizedCandidate, ["education", "school"])
  }
  if (priority.includes("work") || priority.includes("remote")) {
    return containsAny(normalizedCandidate, ["remote", "income", "digital nomad"])
  }

  return normalizedCandidate.includes(priority)
}

function buildReadinessTension(
  readinessProfile: ReadinessProfile,
  report: DestinationResearchReport,
) {
  if (readinessProfile.readinessLevel === "active" || readinessProfile.readinessLevel === "nearlyReady") {
    return []
  }

  if (containsAny(report.recommendedNextStep, ["city", "consular", "eligibility", "housing"])) {
    return [
      `${report.destination} may fit later, but it still asks for a more organized prep pass than this readiness stage may comfortably support.`,
    ]
  }

  return []
}

function buildNonNegotiableTension(
  status: NonNegotiableStatus,
  nonNegotiables: string[],
  report: DestinationResearchReport,
) {
  if (status === "clear" || nonNegotiables.length === 0) {
    return []
  }

  return [
    `${report.destination} needs a tighter check against ${joinHuman(nonNegotiables.slice(0, 2))} before it can be treated as a clean shortlist option.`,
  ]
}

function requiresMoreResearch(entry: DestinationComparisonEntry) {
  return (
    entry.fitVerdict === "tooEarlyToJudge" ||
    entry.confidence === "low" ||
    entry.nonNegotiableStatus !== "clear" ||
    entry.currentStageFit === "tooEarlyToJudge"
  )
}

function findEmotionalPracticalTradeoff(entries: DestinationComparisonEntry[]) {
  const strongestPractical = [...entries]
    .sort((left, right) => right.practicalPoints - left.practicalPoints)[0]
  const strongestEmotional = [...entries]
    .sort((left, right) => right.emotionalPoints - left.emotionalPoints)[0]

  if (
    !strongestPractical ||
    !strongestEmotional ||
    strongestPractical.destination === strongestEmotional.destination
  ) {
    return undefined
  }

  return `${strongestPractical.destination} looks stronger on current practicality, while ${strongestEmotional.destination} carries more emotional pull.`
}

function pickDestination(
  entries: DestinationComparisonEntry[],
  scorecards: Map<string, ComparisonScorecard>,
  mode: "overall" | "practical" | "emotional" | "weakest",
) {
  if (entries.length === 0) {
    return undefined
  }

  const ranked = [...entries].sort((left, right) => {
    const leftScore = scorecards.get(left.destination)
    const rightScore = scorecards.get(right.destination)

    if (!leftScore || !rightScore) {
      return 0
    }

    if (mode === "practical") {
      return rightScore.practicalPoints - leftScore.practicalPoints
    }
    if (mode === "emotional") {
      return rightScore.emotionalPoints - leftScore.emotionalPoints
    }
    if (mode === "weakest") {
      return leftScore.overallPoints - rightScore.overallPoints
    }

    return rightScore.overallPoints - leftScore.overallPoints
  })

  if (ranked.length < 2) {
    return ranked[0]?.destination
  }

  const topScore = scorecards.get(ranked[0].destination)
  const secondScore = scorecards.get(ranked[1].destination)

  if (!topScore || !secondScore) {
    return ranked[0]?.destination
  }

  const isTie =
    mode === "practical"
      ? topScore.practicalPoints === secondScore.practicalPoints
      : mode === "emotional"
        ? topScore.emotionalPoints === secondScore.emotionalPoints
        : topScore.overallPoints === secondScore.overallPoints

  if (isTie) {
    return undefined
  }

  return ranked[0]?.destination
}

function resolveNonNegotiableStatus(nonNegotiablePenalty: number): NonNegotiableStatus {
  if (nonNegotiablePenalty >= 3) {
    return "conflict"
  }
  if (nonNegotiablePenalty >= 1) {
    return "watch"
  }

  return "clear"
}

function verdictFromPoints(points: number): FitVerdict {
  if (points >= 6) {
    return "strongFit"
  }
  if (points >= 4) {
    return "moderateFit"
  }
  if (points >= 2) {
    return "weakFit"
  }

  return "tooEarlyToJudge"
}

function combineVerdicts(
  practicalFit: FitVerdict,
  emotionalFit: FitVerdict,
  currentStageFit: FitVerdict,
  nonNegotiablePenalty: number,
  baselineVerdict: FitVerdict,
): FitVerdict {
  if (nonNegotiablePenalty >= 3) {
    return "weakFit"
  }

  const points = [
    verdictToPoints(practicalFit),
    verdictToPoints(emotionalFit),
    verdictToPoints(currentStageFit),
    verdictToPoints(baselineVerdict),
  ]
  const average = points.reduce((sum, value) => sum + value, 0) / points.length

  if (average >= 3.5) {
    return "strongFit"
  }
  if (average >= 2.75) {
    return "moderateFit"
  }
  if (average >= 1.75) {
    return "weakFit"
  }

  return "tooEarlyToJudge"
}

function summarizePracticalDrivers(
  report: DestinationResearchReport,
  priorities: string[],
  practicalFit: FitVerdict,
) {
  const signals = extractThemes([
    ...priorities,
    report.sections.costOfLiving?.summary,
    report.sections.healthcare?.summary,
    report.sections.safety?.summary,
    report.sections.education?.summary,
    report.fitNotes.majorTradeoffs.join(" "),
  ])

  if (practicalFit === "strongFit") {
    return `${joinHuman(signals.slice(0, 2)) || "budget, systems, and readiness"} are holding up better than the main friction points`
  }

  return `${joinHuman(signals.slice(0, 2)) || "the practical filters"} still has meaningful friction once confidence, budget realism, and logistics are factored in`
}

function summarizeEmotionalDrivers(
  report: DestinationResearchReport,
  priorities: string[],
  emotionalFit: FitVerdict,
) {
  const signals = extractThemes([
    ...priorities,
    report.sections.cultureIntegration?.summary,
    report.sections.climateEnvironment?.summary,
    report.fitNotes.whyItMayFit.join(" "),
  ])

  if (emotionalFit === "strongFit") {
    return `${joinHuman(signals.slice(0, 2)) || "belonging, climate, and pace"} still has genuine pull in the current research`
  }

  return `${joinHuman(signals.slice(0, 2)) || "the emotional pull"} is present, but not clean enough yet to outweigh the current friction`
}

function summarizeStageDrivers(
  report: DestinationResearchReport,
  readinessProfile: ReadinessProfile,
  currentStageFit: FitVerdict,
) {
  if (currentStageFit === "strongFit") {
    return `${report.destination} does not ask for much more structure than ${readinessProfile.readinessLevel} readiness can currently support`
  }

  return `${report.destination} still asks for enough verification, admin discipline, or city-level narrowing that the timing could outrun the current prep stage`
}

function buildSplitSummary(
  strongestPracticalFit: string,
  strongestEmotionalFit: string,
  comparisonEntries: DestinationComparisonEntry[],
) {
  const practicalEntry = comparisonEntries.find((entry) => entry.destination === strongestPracticalFit)
  const emotionalEntry = comparisonEntries.find((entry) => entry.destination === strongestEmotionalFit)
  const practicalEdge = practicalEntry ? joinHuman(extractThemes([...practicalEntry.strengths, ...practicalEntry.notes]).slice(0, 2)) : "current practicality"
  const emotionalEdge = emotionalEntry ? joinHuman(extractThemes([...emotionalEntry.strengths, ...emotionalEntry.notes]).slice(0, 2)) : "emotional pull"

  return `${strongestPracticalFit} looks strongest on current practical fit because of ${practicalEdge}, while ${strongestEmotionalFit} carries the stronger emotional pull through ${emotionalEdge}.`
}

function buildShortlistPressureFrame(entries: DestinationComparisonEntry[]) {
  const focus = buildPressureTestFocus(entries)
  return focus ? `The shortlist pressure-test is ${focus}.` : ""
}

function buildPressureTestFocus(entries: DestinationComparisonEntry[]) {
  if (entries.length === 0) {
    return ""
  }

  const sortedByPractical = [...entries].sort((left, right) => right.practicalPoints - left.practicalPoints)
  const sortedByEmotional = [...entries].sort((left, right) => right.emotionalPoints - left.emotionalPoints)
  const strongestPractical = sortedByPractical[0]
  const strongestEmotional = sortedByEmotional[0]

  if (
    strongestPractical &&
    strongestEmotional &&
    strongestPractical.destination !== strongestEmotional.destination
  ) {
    const practicalThemes = extractPracticalThemes([
      ...strongestPractical.strengths,
      ...strongestPractical.notes,
    ]).slice(0, 2)
    const emotionalThemes = extractEmotionalThemes([
      ...strongestEmotional.strengths,
      ...strongestEmotional.notes,
    ]).slice(0, 2)

    return `whether ${strongestPractical.destination}'s ${joinHuman(practicalThemes) || "practical edge"} matters more right now than ${strongestEmotional.destination}'s ${joinHuman(emotionalThemes) || "emotional pull"}`
  }

  const mostPressured = [...entries].sort((left, right) => right.tensions.length - left.tensions.length)[0]
  if (!mostPressured) {
    return ""
  }

  const pressureThemes = extractPressureThemes([
    ...mostPressured.tensions,
    ...mostPressured.tradeoffs,
  ]).slice(0, 2)

  if (pressureThemes.length === 0) {
    return ""
  }

  return `whether ${mostPressured.destination} can survive ${joinHuman(pressureThemes)} once you compare it against the rest of the shortlist on the same criteria`
}

function uniqueDestinationReports(reports: DestinationResearchReport[]) {
  const bySlug = new Map<string, DestinationResearchReport>()

  for (const report of reports) {
    bySlug.set(report.destinationSlug, report)
  }

  return [...bySlug.values()]
}

function collectTopPriorities(userProfile: UserProfile, clarityReport: ClarityReport) {
  return uniqueStrings([
    ...(userProfile.topPriorities ?? []),
    ...(clarityReport.topPriorities ?? []),
  ]).slice(0, 5)
}

function priorityMatches(priorities: string[], patterns: string[]) {
  return priorities.some((priority) => containsAny(priority, patterns))
}

function sectionConfidenceBonus(confidence?: ConfidenceLevel) {
  if (confidence === "high") {
    return 2
  }
  if (confidence === "medium") {
    return 1
  }

  return 0
}

function verdictToPoints(verdict: FitVerdict) {
  if (verdict === "strongFit") return 4
  if (verdict === "moderateFit") return 3
  if (verdict === "weakFit") return 2
  return 1
}

function startingPoints(verdict: FitVerdict) {
  if (verdict === "strongFit") return 4
  if (verdict === "moderateFit") return 3
  if (verdict === "weakFit") return 1
  return 0
}

function humanizeVerdict(verdict: FitVerdict) {
  if (verdict === "strongFit") return "strong fit"
  if (verdict === "moderateFit") return "moderate fit"
  if (verdict === "weakFit") return "weak fit"
  return "too early to judge"
}

function uniqueStrings(values: Array<string | undefined>) {
  const seen = new Set<string>()
  const results: string[] = []

  for (const value of values) {
    const cleaned = value?.trim()
    if (!cleaned || seen.has(cleaned)) {
      continue
    }
    seen.add(cleaned)
    results.push(cleaned)
  }

  return results
}

function containsAny(value: string | undefined, patterns: string[]) {
  const normalized = (value ?? "").toLowerCase()
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()))
}

function joinHuman(items: string[]) {
  if (items.length === 0) return ""
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`
}

function withIndefiniteArticle(value: string) {
  return /^[aeiou]/i.test(value) ? `an ${value}` : `a ${value}`
}

function extractThemes(values: Array<string | undefined>) {
  const text = values.filter(Boolean).join(" ").toLowerCase()
  const matches: string[] = []

  const themeMap: Array<{ label: string; patterns: string[] }> = [
    { label: "belonging", patterns: ["belong", "socially warm", "welcoming", "diaspora"] },
    { label: "english environment", patterns: ["english", "language"] },
    { label: "healthcare", patterns: ["healthcare", "health", "medical", "private care"] },
    { label: "stability", patterns: ["stability", "stable", "systems"] },
    { label: "infrastructure", patterns: ["infrastructure"] },
    { label: "affordability", patterns: ["afford", "budget", "cost"] },
    { label: "pace of life", patterns: ["pace", "calm", "peace"] },
    { label: "warm climate", patterns: ["warm", "climate", "temperate", "mild", "heat"] },
    { label: "housing pressure", patterns: ["housing pressure", "housing"] },
    { label: "regional safety variance", patterns: ["regional safety variance", "regional variation", "safety", "risk"] },
    { label: "bureaucratic inconsistency", patterns: ["bureaucratic inconsistency", "bureaucracy", "admin friction"] },
    { label: "education", patterns: ["school", "education"] },
    { label: "tax complexity", patterns: ["tax"] },
  ]

  for (const theme of themeMap) {
    if (theme.patterns.some((pattern) => text.includes(pattern))) {
      matches.push(theme.label)
    }
  }

  return uniqueStrings(matches)
}

function extractPressureThemes(values: Array<string | undefined>) {
  const specificThemes = extractThemes(values).filter((theme) =>
    [
      "housing pressure",
      "regional safety variance",
      "bureaucratic inconsistency",
      "infrastructure",
      "tax complexity",
      "education",
      "healthcare",
    ].includes(theme)
  )

  if (specificThemes.length > 0) {
    return specificThemes
  }

  return extractThemes(values)
}

function extractPracticalThemes(values: Array<string | undefined>) {
  const practicalThemes = extractThemes(values).filter((theme) =>
    [
      "healthcare",
      "stability",
      "infrastructure",
      "affordability",
      "housing pressure",
      "regional safety variance",
      "bureaucratic inconsistency",
      "education",
      "tax complexity",
    ].includes(theme)
  )

  if (practicalThemes.length > 0) {
    return practicalThemes
  }

  return extractThemes(values)
}

function extractEmotionalThemes(values: Array<string | undefined>) {
  const emotionalThemes = extractThemes(values).filter((theme) =>
    [
      "belonging",
      "english environment",
      "pace of life",
      "warm climate",
    ].includes(theme)
  )

  if (emotionalThemes.length > 0) {
    return emotionalThemes
  }

  return extractThemes(values)
}

function requireArtifact<T>(value: T | undefined, name: string): T {
  if (!value) {
    throw new Error(`Fit Comparison Agent requires '${name}'`)
  }

  return value
}
