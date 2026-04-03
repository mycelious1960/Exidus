import type {
  ActionPlan,
  ArchetypeProfile,
  ClarityReport,
  DestinationResearchReport,
  FitComparisonReport,
  ReadinessLevel,
  ReadinessProfile,
  UserProfile,
} from "../../types/exidus-schema.ts"
import { SCHEMA_VERSION } from "../config.ts"
import type {
  AgentInvocation,
  AgentInvocationResult,
} from "../core/types.ts"

type PlanningMode = ActionPlan["planningMode"]
type DestinationState = ActionPlan["destinationState"]
type ActionItem = ActionPlan["actions"][number]

const READINESS_STAGE_LABELS: Record<ReadinessLevel, string> = {
  early: "early clarity-building stage",
  emerging: "readiness-building stage",
  active: "active narrowing and preparation stage",
  nearlyReady: "near-ready transition stage",
}

export async function invokeActionPlanningAgent(
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
  const destinationResearchReports = uniqueDestinationReports(
    invocation.artifacts.destinationResearchReports ?? [],
  )

  const actionPlan = buildActionPlan({
    userIntent: invocation.userIntent,
    userProfile,
    clarityReport,
    readinessProfile,
    archetypeProfile,
    destinationResearchReports,
    fitComparisonReport: invocation.artifacts.fitComparisonReport,
  })

  return {
    agentId: "action-planning-agent",
    status: "completed",
    message: `Action Planning Agent generated a ${actionPlan.horizon} plan in ${actionPlan.planningMode} mode.`,
    artifacts: {
      ...invocation.artifacts,
      actionPlan,
    },
  }
}

function buildActionPlan(input: {
  userIntent?: string
  userProfile: UserProfile
  clarityReport: ClarityReport
  readinessProfile: ReadinessProfile
  archetypeProfile: ArchetypeProfile
  destinationResearchReports: DestinationResearchReport[]
  fitComparisonReport?: FitComparisonReport
}): ActionPlan {
  const now = new Date().toISOString()
  const horizon = resolveHorizon(input.userIntent)
  const destinationState = resolveDestinationState(
    input.destinationResearchReports,
    input.fitComparisonReport,
  )
  const planningMode = resolvePlanningMode(
    input.readinessProfile.readinessLevel,
    destinationState,
  )
  const priorities = buildPriorities({
    planningMode,
    destinationState,
    userProfile: input.userProfile,
    clarityReport: input.clarityReport,
    readinessProfile: input.readinessProfile,
    fitComparisonReport: input.fitComparisonReport,
    destinationResearchReports: input.destinationResearchReports,
  })
  const actions = buildActions({
    planningMode,
    destinationState,
    horizon,
    userProfile: input.userProfile,
    clarityReport: input.clarityReport,
    readinessProfile: input.readinessProfile,
    archetypeProfile: input.archetypeProfile,
    destinationResearchReports: input.destinationResearchReports,
    fitComparisonReport: input.fitComparisonReport,
  })
  const sequencingNotes = buildSequencingNotes({
    planningMode,
    destinationState,
    readinessProfile: input.readinessProfile,
    fitComparisonReport: input.fitComparisonReport,
    clarityReport: input.clarityReport,
  })
  const notYet = buildNotYet({
    planningMode,
    destinationState,
    readinessProfile: input.readinessProfile,
    fitComparisonReport: input.fitComparisonReport,
  })

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    source: "action-planning-agent",
    horizon,
    planningMode,
    destinationState,
    readinessLevel: input.readinessProfile.readinessLevel,
    framingSummary: buildFramingSummary({
      planningMode,
      destinationState,
      readinessProfile: input.readinessProfile,
      fitComparisonReport: input.fitComparisonReport,
      destinationResearchReports: input.destinationResearchReports,
    }),
    stageSummary: buildStageSummary(
      input.readinessProfile.readinessLevel,
      destinationState,
    ),
    priorities,
    notYet,
    actions,
    suggestedNextExidusMove: buildSuggestedNextMove({
      planningMode,
      destinationState,
      fitComparisonReport: input.fitComparisonReport,
      destinationResearchReports: input.destinationResearchReports,
    }),
    groundedIn: {
      topPriorities: collectTopPriorities(input.userProfile, input.clarityReport),
      nonNegotiables: input.clarityReport.nonNegotiables,
      readinessBlockers: input.readinessProfile.blockers,
      readinessStrengths: input.readinessProfile.strengths,
      researchedDestinations: input.destinationResearchReports.map((report) => report.destination),
      comparedDestinations: input.fitComparisonReport?.comparedDestinations ?? [],
      strongestFit: input.fitComparisonReport?.strongestFit,
      fitDirectionArchetype: input.archetypeProfile.fitDirectionArchetype,
    },
    sequencingNotes,
  }
}

function resolveHorizon(userIntent?: string): ActionPlan["horizon"] {
  const intent = (userIntent ?? "").toLowerCase()
  if (intent.includes("90 day") || intent.includes("90-day")) {
    return "90Days"
  }

  return "30Days"
}

function resolveDestinationState(
  reports: DestinationResearchReport[],
  fitComparisonReport?: FitComparisonReport,
): DestinationState {
  if (reports.length === 0) {
    return "noShortlist"
  }

  if (reports.length === 1 && !fitComparisonReport) {
    return "singleDestination"
  }

  if (!fitComparisonReport) {
    return "shortlistUnstable"
  }

  if (
    fitComparisonReport.routeSignals?.readyForActionPlanning &&
    fitComparisonReport.strongestFit
  ) {
    return "directionClear"
  }

  return "directionEmerging"
}

function resolvePlanningMode(
  readinessLevel: ReadinessLevel,
  destinationState: DestinationState,
): PlanningMode {
  if (destinationState === "noShortlist" && readinessLevel === "early") {
    return "clarityFirst"
  }

  if (
    destinationState === "noShortlist" ||
    destinationState === "singleDestination" ||
    destinationState === "shortlistUnstable"
  ) {
    return "researchFirst"
  }

  if (readinessLevel === "active" || readinessLevel === "nearlyReady") {
    return destinationState === "directionClear" ? "movePrep" : "preparationFirst"
  }

  return "preparationFirst"
}

function buildPriorities(input: {
  planningMode: PlanningMode
  destinationState: DestinationState
  userProfile: UserProfile
  clarityReport: ClarityReport
  readinessProfile: ReadinessProfile
  fitComparisonReport?: FitComparisonReport
  destinationResearchReports: DestinationResearchReport[]
}) {
  const topPriorities = collectTopPriorities(input.userProfile, input.clarityReport)
  const items = [
    priorityFromMode(input.planningMode, input.destinationState, input.fitComparisonReport),
    topPriorities[0]
      ? `Keep ${topPriorities[0]} as a front-of-plan decision filter.`
      : undefined,
    input.readinessProfile.blockers[0]
      ? `Reduce the most immediate blocker: ${blockerPriorityLine(input.readinessProfile.blockers[0])}.`
      : undefined,
    input.fitComparisonReport?.strongestFit
      ? `Pressure-test ${input.fitComparisonReport.strongestFit} against your real-life constraints before making it a default answer.`
      : input.destinationResearchReports[0]
        ? `Use the current destination evidence to decide what still needs to be validated before narrowing further.`
        : undefined,
    input.clarityReport.nonNegotiables[0]
      ? `Keep ${input.clarityReport.nonNegotiables[0]} in view so momentum does not come at the cost of fit.`
      : undefined,
  ]

  return uniqueStrings(items).slice(0, 5)
}

function priorityFromMode(
  planningMode: PlanningMode,
  destinationState: DestinationState,
  fitComparisonReport?: FitComparisonReport,
) {
  if (planningMode === "clarityFirst") {
    return "Reduce confusion first so later action is not built on a shaky direction."
  }

  if (planningMode === "researchFirst") {
    return destinationState === "shortlistUnstable"
      ? "Use this window to stabilize the shortlist before building execution pressure."
      : "Use this window to gather only the destination evidence needed for a cleaner next decision."
  }

  if (planningMode === "movePrep") {
    return fitComparisonReport?.strongestFit
      ? `Treat ${fitComparisonReport.strongestFit} as the lead option for planning, while keeping a short verification loop open.`
      : "Shift from abstract research into practical move preparation."
  }

  return "Use the next month to convert insight into practical preparation without pretending the move is already fully decided."
}

function buildActions(input: {
  planningMode: PlanningMode
  destinationState: DestinationState
  horizon: ActionPlan["horizon"]
  userProfile: UserProfile
  clarityReport: ClarityReport
  readinessProfile: ReadinessProfile
  archetypeProfile: ArchetypeProfile
  destinationResearchReports: DestinationResearchReport[]
  fitComparisonReport?: FitComparisonReport
}) {
  const topPriorities = collectTopPriorities(input.userProfile, input.clarityReport)
  const strongestFit = input.fitComparisonReport?.strongestFit
  const needsMoreResearchOn = input.fitComparisonReport?.routeSignals?.needsMoreResearchOn ?? []
  const reports = input.destinationResearchReports
  const reportsNeedingResearch = reports.filter((report) =>
    needsMoreResearchOn.includes(report.destination)
  )
  const actions: ActionItem[] = []

  if (input.planningMode === "clarityFirst") {
    actions.push(
      makeAction("clarity-criteria", {
        title: "Refine the criteria that matter most",
        description: `Turn your current report into a tighter top-three filter using ${joinHuman(topPriorities.slice(0, 3)) || "your current priorities"} plus any non-negotiables that still feel fuzzy.`,
        category: "clarity",
        phase: "now",
        urgency: "high",
        rationale: "The next useful move is clearer decision criteria, not a premature relocation timeline.",
      }),
      makeAction("clarity-tensions", {
        title: "Resolve the biggest tension in your report",
        description: input.clarityReport.contradictionFlags[0]
          ? `Write down what would reduce the tension around ${lowerFirst(input.clarityReport.contradictionFlags[0])}.`
          : "Translate any remaining uncertainty into one or two concrete questions you can answer this month.",
        category: "clarity",
        phase: "now",
        urgency: "medium",
        rationale: "Planning quality improves once the main contradiction is named and bounded.",
      }),
    )
  }

  if (
    input.planningMode === "researchFirst" ||
    input.destinationState === "singleDestination" ||
    input.destinationState === "shortlistUnstable"
  ) {
    actions.push(
      makeAction("research-focus", {
        title: reports.length >= 2 ? "Pressure-test the shortlist" : "Build a usable shortlist",
        description: reports.length >= 2
          ? `Compare ${joinHuman(reports.map((report) => report.destination).slice(0, 3))} against the same 3-4 criteria so the next narrowing step is evidence-based.`
          : reports.length === 1
            ? `Add one or two contrast destinations to ${reports[0].destination} so you are not treating the first researched option as the default answer.`
            : "Pick two or three plausible destinations that match your priorities well enough to deserve structured research.",
        category: "research",
        phase: "now",
        urgency: "high",
        rationale: "You need cleaner destination evidence before tactical relocation tasks become worth the energy.",
      }),
    )
  }

  if (needsMoreResearchOn.length > 0) {
    actions.push(
      makeAction("research-gaps", {
        title: "Close the highest-risk unknowns",
        description: `Verify the major open questions on ${joinHuman(needsMoreResearchOn.slice(0, 2))} before treating the shortlist as settled. Start with ${summarizeResearchQuestions(reportsNeedingResearch) || "the visa path, city-level budget, and daily-life friction that could still change the decision"}.`,
        category: "research",
        phase: reports.length >= 2 ? "soon" : "now",
        urgency: "medium",
        rationale: "The comparison layer has already identified where confidence is still too thin.",
      }),
    )
  }

  if (input.readinessProfile.blockers.length > 0) {
    actions.push(
      makeAction("prep-blockers", {
        title: "Work one readiness blocker at a time",
        description: `Choose the most concrete blocker first: ${blockerPriorityLine(input.readinessProfile.blockers[0])}. Then define the smallest useful step that would materially reduce it.`,
        category: "preparation",
        phase: input.readinessProfile.readinessLevel === "early" ? "soon" : "now",
        urgency: input.readinessProfile.readinessLevel === "nearlyReady" ? "high" : "medium",
        rationale: "Readiness improves through specific constraint reduction, not through generalized pressure.",
      }),
    )
  }

  if (strongestFit) {
    actions.push(
      makeAction("prep-lead-option", {
        title: `Validate ${strongestFit} as the working lead option`,
        description: `Use this ${input.horizon === "90Days" ? "90-day" : "30-day"} window to confirm whether ${strongestFit} still holds up on budget, timing, and any household dependencies.`,
        category: "preparation",
        phase: "now",
        urgency: input.destinationState === "directionClear" ? "high" : "medium",
        rationale: "A lead option is useful only if it survives real-life constraint checks.",
      }),
    )
  }

  if (
    input.readinessProfile.readinessLevel === "active" ||
    input.readinessProfile.readinessLevel === "nearlyReady"
  ) {
    actions.push(
      makeAction("logistics-sequence", {
        title: "Map the next practical sequence",
        description: "Outline the order of document prep, money planning, timeline assumptions, and destination verification so each step has a clear dependency.",
        category: "logistics",
        phase: strongestFit ? "soon" : "later",
        urgency: strongestFit ? "medium" : "low",
        rationale: "Sequencing matters more than detail-heavy checklists at this stage.",
      }),
    )
  }

  if (input.userProfile.partySize && (input.userProfile.partySize.children ?? 0) > 0) {
    actions.push(
      makeAction("support-household", {
        title: "Surface household dependencies early",
        description: "List the family, schooling, care, or timing dependencies that would change how realistic different destinations are.",
        category: "support",
        phase: "soon",
        urgency: "medium",
        rationale: "Household constraints are easier to plan around when they are explicit early.",
      }),
    )
  } else if (input.userProfile.profileType === "solo") {
    actions.push(
      makeAction("support-checkin", {
        title: "Decide where outside input would actually help",
        description: "Name the few areas where expert input or trusted support would reduce blind spots later, without outsourcing the whole decision.",
        category: "support",
        phase: "later",
        urgency: "low",
        rationale: "Support planning should stay targeted rather than becoming a source of new overwhelm.",
      }),
    )
  }

  if (actions.length < 4) {
    actions.push(
      makeAction("prep-financial-picture", {
        title: "Get a realistic runway picture",
        description: "Estimate what your monthly budget, move runway, and first-stage setup costs would need to look like before making big relocation promises to yourself.",
        category: "preparation",
        phase: "soon",
        urgency: "medium",
        rationale: "A grounded budget frame keeps later destination choices realistic.",
      }),
    )
  }

  return actions.slice(0, 6)
}

function buildFramingSummary(input: {
  planningMode: PlanningMode
  destinationState: DestinationState
  readinessProfile: ReadinessProfile
  fitComparisonReport?: FitComparisonReport
  destinationResearchReports: DestinationResearchReport[]
}) {
  const lead = input.fitComparisonReport?.strongestFit
  if (input.planningMode === "clarityFirst") {
    return `This plan is meant to reduce confusion first. You are in an ${READINESS_STAGE_LABELS[input.readinessProfile.readinessLevel]}, so the job is to sharpen direction before adding move pressure.`
  }

  if (input.planningMode === "researchFirst") {
    return input.destinationState === "shortlistUnstable"
      ? "This plan is built to stabilize your shortlist, not to act like the destination choice is already settled."
      : "This plan is built around targeted research and bounded preparation so the next decision gets easier without becoming overwhelming."
  }

  if (input.planningMode === "movePrep" && lead) {
    return `${lead} currently looks like the lead direction, so this plan shifts into practical preparation while keeping a short verification loop open.`
  }

  return `You have enough clarity to start practical preparation, but the plan still keeps pace with your ${input.readinessProfile.readinessLevel} readiness level and avoids fake urgency.`
}

function buildStageSummary(
  readinessLevel: ReadinessLevel,
  destinationState: DestinationState,
) {
  const destinationLabel =
    destinationState === "directionClear"
      ? "a fairly clear destination direction"
      : destinationState === "directionEmerging"
        ? "an emerging but not fully locked destination direction"
        : destinationState === "shortlistUnstable"
          ? "an active shortlist that still needs narrowing"
          : destinationState === "singleDestination"
            ? "one destination under review, but not a settled shortlist"
            : "no stable shortlist yet"

  return `You appear to be in ${withIndefiniteArticle(READINESS_STAGE_LABELS[readinessLevel])} with ${destinationLabel}.`
}

function buildSequencingNotes(input: {
  planningMode: PlanningMode
  destinationState: DestinationState
  readinessProfile: ReadinessProfile
  fitComparisonReport?: FitComparisonReport
  clarityReport: ClarityReport
}) {
  const notes = [
    "Treat 'now' actions as decision-unblocking work, 'soon' actions as structured follow-through once the first blockers move, and 'later' actions as tasks that only matter after direction is more stable.",
    "Start with the actions that reduce uncertainty or unblock readiness first; leave detail-heavy execution tasks until that work is done.",
    input.destinationState === "shortlistUnstable"
      ? "Do not treat comparison as complete until the current shortlist tradeoffs have been pressure-tested against the same criteria."
      : undefined,
    input.fitComparisonReport?.strongestFit
      ? `Use ${input.fitComparisonReport.strongestFit} as a working lead, not an irreversible commitment.`
      : undefined,
    input.clarityReport.contradictionFlags[0]
      ? `Keep the report tension around ${lowerFirst(input.clarityReport.contradictionFlags[0])} visible while sequencing next steps.`
      : undefined,
    input.readinessProfile.readinessLevel === "nearlyReady"
      ? "The plan can become more tactical, but only after major unknowns and blockers are bounded."
      : "Use the plan to create movement, not to simulate a full relocation project plan too early.",
  ]

  return uniqueStrings(notes)
}

function buildNotYet(input: {
  planningMode: PlanningMode
  destinationState: DestinationState
  readinessProfile: ReadinessProfile
  fitComparisonReport?: FitComparisonReport
}) {
  const items = [
    input.destinationState === "noShortlist" || input.destinationState === "shortlistUnstable"
      ? "Do not lock yourself into a final destination choice before the shortlist or criteria are stable."
      : undefined,
    input.readinessProfile.readinessLevel === "early" || input.readinessProfile.readinessLevel === "emerging"
      ? "Do not build an execution-heavy move timeline yet; focus on clarity, research, and readiness building first."
      : undefined,
    !input.fitComparisonReport?.routeSignals?.readyForActionPlanning
      ? "Do not interpret early planning as proof that every major unknown is resolved."
      : undefined,
    input.fitComparisonReport?.strongestFit &&
      input.fitComparisonReport.strongestPracticalFit &&
      input.fitComparisonReport.strongestEmotionalFit &&
      input.fitComparisonReport.strongestPracticalFit !== input.fitComparisonReport.strongestEmotionalFit
      ? `Do not collapse the practical-vs-emotional split between ${input.fitComparisonReport.strongestPracticalFit} and ${input.fitComparisonReport.strongestEmotionalFit} too quickly.`
      : undefined,
    "Do not treat this as legal, immigration, tax, or financial advice; use experts later where specialized guidance becomes necessary.",
  ]

  return uniqueStrings(items)
}

function buildSuggestedNextMove(input: {
  planningMode: PlanningMode
  destinationState: DestinationState
  fitComparisonReport?: FitComparisonReport
  destinationResearchReports: DestinationResearchReport[]
}) {
  if (input.destinationState === "noShortlist") {
    return "Use the Destination Research Agent once you have two or three plausible options to pressure-test."
  }

  if (input.destinationState === "shortlistUnstable") {
    return "Run Fit Comparison after the current shortlist has matching research coverage."
  }

  if (
    input.fitComparisonReport?.routeSignals?.needsMoreResearchOn?.length &&
    !input.fitComparisonReport?.routeSignals?.readyForActionPlanning
  ) {
    return `Research ${joinHuman(input.fitComparisonReport.routeSignals.needsMoreResearchOn.slice(0, 2))} more deeply before treating the shortlist as settled or turning this into an execution plan.`
  }

  if (input.planningMode === "movePrep") {
    return "Use this plan as the current sequencing layer, then revisit Exidus if your priorities, blockers, or shortlist meaningfully change."
  }

  if (input.destinationResearchReports.length > 0) {
    return "Use the next planning pass after you close the highest-risk research or readiness gaps."
  }

  return "Use the Guide or Destination Research layers again if your direction still feels too loose for practical planning."
}

function blockerPriorityLine(blocker: string) {
  const cleaned = stripTrailingPeriod(blocker)
  return lowerFirst(cleaned)
}

function summarizeResearchQuestions(reports: DestinationResearchReport[]) {
  const questions = uniqueStrings(
    reports.flatMap((report) => report.recommendedNextQuestions.slice(0, 2)),
  )

  if (questions.length === 0) {
    return ""
  }

  return questions
    .slice(0, 2)
    .map((question) => stripTrailingQuestionMark(lowerFirst(question)))
    .join(" and ")
}

function requireArtifact<T>(value: T | undefined, label: string): T {
  if (!value) {
    throw new Error(`Action Planning Agent requires ${label}.`)
  }

  return value
}

function uniqueDestinationReports(reports: DestinationResearchReport[]) {
  const bySlug = new Map<string, DestinationResearchReport>()

  for (const report of reports) {
    bySlug.set(report.destinationSlug, report)
  }

  return Array.from(bySlug.values())
}

function collectTopPriorities(userProfile: UserProfile, clarityReport: ClarityReport) {
  return uniqueStrings([
    ...(clarityReport.topPriorities ?? []),
    ...(userProfile.topPriorities ?? []),
  ]).slice(0, 5)
}

function makeAction(id: string, action: Omit<ActionItem, "id">): ActionItem {
  return {
    id,
    ...action,
  }
}

function uniqueStrings(items: Array<string | undefined>) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const item of items) {
    if (!item) {
      continue
    }
    const normalized = item.trim()
    if (!normalized) {
      continue
    }
    if (seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    output.push(normalized)
  }

  return output
}

function joinHuman(items: string[]) {
  if (items.length === 0) {
    return ""
  }
  if (items.length === 1) {
    return items[0]
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`
}

function stripTrailingQuestionMark(value: string) {
  return value.replace(/\?+$/g, "")
}

function stripTrailingPeriod(value: string) {
  return value.replace(/\.+$/g, "")
}

function withIndefiniteArticle(value: string) {
  return /^[aeiou]/i.test(value) ? `an ${value}` : `a ${value}`
}

function lowerFirst(value: string) {
  return value.charAt(0).toLowerCase() + value.slice(1)
}

function sentenceFragment(value: string) {
  return lowerFirst(value).replace(/[.]+$/g, "")
}
