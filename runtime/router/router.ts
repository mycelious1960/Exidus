import { DESTINATION_ALIASES } from "../agents/destination-research-data.ts"
import type { RouterDecision } from "../../types/exidus-router.ts"
import type { AgentInvocation, RouterRuntimeInput, RouterRuntimeResult } from "../core/types.ts"

const DESTINATION_RESEARCH_INTENTS = [
  "country",
  "countries",
  "destination",
  "destinations",
  "research",
  "move to",
  "relocate to",
  "live in",
  "go deeper on destination fit",
  "destination fit",
]
const COMPARISON_INTENTS = [
  "compare",
  "comparison",
  "which is better",
  "which fits best",
  "fits me better",
  "tradeoff",
  "tradeoffs",
  "shortlist",
  "narrow",
  "strongest fit",
  "weakest fit",
]
const PLANNING_INTENTS = [
  "next step",
  "next steps",
  "what should i do next",
  "what do i do next",
  "30 day",
  "30-day",
  "90 day",
  "90-day",
  "build my next 30 days",
  "build my next 90 days",
  "action plan",
  "plan",
  "what should i not worry about yet",
  "not worry about yet",
]
const REVISION_INTENTS = [
  "update my report",
  "revise my report",
  "revise the report",
  "refine my report",
  "report update",
  "report revision",
  "update based on",
  "after comparison",
  "after action plan",
  "what changed",
  "changed priorities",
  "priorities changed",
  "my priorities changed",
  "changed a lot",
]
const INTERPRETATION_INTENTS = [
  "what does my report mean",
  "what does this mean",
  "understand my results",
  "help me understand my results",
  "interpret",
  "explain this fit direction",
  "explain this result",
  "why did i get this",
  "what should i focus on next",
]

export function routeExidusRequest(input: RouterRuntimeInput): RouterRuntimeResult {
  const stateBucket = determineStateBucket(input)
  const decision = decideRoute(input, stateBucket)

  return {
    decision,
    stateBucket,
  }
}

export function routeInvocation(invocation: AgentInvocation): RouterRuntimeResult {
  return routeExidusRequest({
    userIntent: invocation.userIntent,
    artifacts: invocation.artifacts,
  })
}

function determineStateBucket(input: RouterRuntimeInput) {
  const artifacts = input.artifacts

  if (!artifacts.clarityReport) {
    return "unassessed"
  }
  if (!artifacts.guidanceSummary) {
    return "assessedNotInterpreted"
  }
  if ((artifacts.destinationResearchReports?.length ?? 0) === 0) {
    return "interpretedNotResearched"
  }
  if ((artifacts.destinationResearchReports?.length ?? 0) === 1) {
    return "activelyResearching"
  }
  if ((artifacts.destinationResearchReports?.length ?? 0) >= 2 && !artifacts.fitComparisonReport) {
    return "comparingShortlist"
  }
  if (artifacts.fitComparisonReport && !artifacts.actionPlan) {
    return "planning"
  }

  return "revising"
}

function decideRoute(
  input: RouterRuntimeInput,
  stateBucket: string,
): RouterDecision {
  const intent = (input.userIntent ?? "").toLowerCase()
  const artifacts = input.artifacts
  const researchedCount = artifacts.destinationResearchReports?.length ?? 0
  const contradictions = artifacts.clarityReport?.contradictionFlags.length ?? 0
  const hasDownstreamContext = Boolean(
    artifacts.actionPlan ||
      artifacts.fitComparisonReport ||
      researchedCount > 0 ||
      artifacts.reportRevision,
  )

  if (!artifacts.clarityReport) {
    return makeDecision(
      "clarityEngine",
      "No baseline ClarityReport exists yet, so the system should start with the Clarity Engine.",
      "high",
      stateBucket,
    )
  }

  if (matchesIntent(intent, REVISION_INTENTS)) {
    return makeDecision(
      "reportRefinementAgent",
      "The user is asking to update or revise an existing report.",
      "high",
      stateBucket,
    )
  }

  if (
    hasDownstreamContext &&
    (intent.includes("update") || intent.includes("changed") || intent.includes("revise"))
  ) {
    return makeDecision(
      "reportRefinementAgent",
      "The request points to changed context after downstream work, so the report refinement layer is the best fit.",
      "medium",
      stateBucket,
    )
  }

  if (matchesIntent(intent, COMPARISON_INTENTS)) {
    if (researchedCount < 2) {
      return makeDecision(
        "destinationResearchAgent",
        "Comparison was requested, but there are not yet two solid destination research artifacts to compare.",
        "high",
        stateBucket,
        ["At least two DestinationResearchReport objects"],
      )
    }

    return makeDecision(
      "fitComparisonAgent",
      "The user needs narrowing across multiple researched destinations.",
      "high",
      stateBucket,
    )
  }

  if (researchedCount >= 2 && mentionsTwoResearchedDestinations(intent, artifacts.destinationResearchReports ?? [])) {
    return makeDecision(
      "fitComparisonAgent",
      "The request is pointing at multiple already-researched destinations, so comparison is the right synthesis layer.",
      "medium",
      stateBucket,
    )
  }

  if (matchesIntent(intent, PLANNING_INTENTS)) {
    if (!artifacts.guidanceSummary) {
      return makeDecision(
        "guideAgent",
        "The user wants next-step support, but the current report has not been interpreted yet, so the Guide Agent should clarify the result before planning.",
        "medium",
        stateBucket,
        ["Guide interpretation grounded in the current ClarityReport"],
      )
    }

    if (contradictions >= 2) {
      return makeDecision(
        "guideAgent",
        "The user wants action guidance, but the current clarity profile still contains unresolved contradictions.",
        "medium",
        stateBucket,
        ["A more stable interpretation of current tensions"],
      )
    }

    if (researchedCount >= 2 && !artifacts.fitComparisonReport) {
      return makeDecision(
        "fitComparisonAgent",
        "The user wants planning, but multiple researched destinations are still in contention and should be narrowed first.",
        "medium",
        stateBucket,
      )
    }

    if (
      artifacts.fitComparisonReport &&
      artifacts.fitComparisonReport.routeSignals?.readyForActionPlanning === false
    ) {
      return makeDecision(
        "actionPlanningAgent",
        "The user wants sequencing support, but the shortlist is not fully stable yet, so planning should stay provisional and preparation-first rather than final.",
        "medium",
        stateBucket,
        ["Shortlist stability for final planning"],
      )
    }

    return makeDecision(
      "actionPlanningAgent",
      "The user is explicitly asking for sequencing and next-step support.",
      "high",
      stateBucket,
    )
  }

  if (matchesIntent(intent, DESTINATION_RESEARCH_INTENTS)) {
    const missingProfileFields = missingDestinationProfileFields(artifacts)
    if (missingProfileFields.length > 0) {
      return makeDecision(
        "destinationResearchAgent",
        "Destination research is the right target, but profile context is still incomplete.",
        "medium",
        stateBucket,
        missingProfileFields,
      )
    }

    return makeDecision(
      "destinationResearchAgent",
      "The user is asking for destination-level analysis.",
      "high",
      stateBucket,
    )
  }

  if (matchesIntent(intent, INTERPRETATION_INTENTS)) {
    return makeDecision(
      "guideAgent",
      "The user is asking to understand existing report outputs.",
      "high",
      stateBucket,
    )
  }

  if (mentionsKnownDestination(intent)) {
    return makeDecision(
      "destinationResearchAgent",
      "The request names a destination directly, which is the strongest signal for destination-level analysis.",
      "medium",
      stateBucket,
    )
  }

  return makeDecision(
    "guideAgent",
    "A baseline report already exists, so interpretation is the safest default route before deeper specialization.",
    "medium",
    stateBucket,
  )
}

function missingDestinationProfileFields(input: RouterRuntimeInput["artifacts"]) {
  const profile = input.userProfile
  const missing: string[] = []

  if (!profile?.nationality) missing.push("nationality")
  if (!profile?.budgetMonthly?.amount) missing.push("budgetMonthly.amount")
  if (!profile?.partySize?.adults) missing.push("partySize.adults")
  if ((profile?.topPriorities?.length ?? 0) === 0) missing.push("topPriorities")

  return missing
}

function matchesIntent(intent: string, patterns: string[]) {
  return patterns.some((pattern) => intent.includes(pattern))
}

function mentionsKnownDestination(intent: string) {
  const tokens = intent.match(/[a-z]+/g) ?? []

  return DESTINATION_ALIASES.some((alias) =>
    alias.length <= 2 ? tokens.includes(alias) : intent.includes(alias),
  )
}

function mentionsTwoResearchedDestinations(
  intent: string,
  reports: NonNullable<RouterRuntimeInput["artifacts"]["destinationResearchReports"]>,
) {
  const matched = reports.filter((report) =>
    intent.includes(report.destination.toLowerCase()) ||
    intent.includes(report.destinationSlug.toLowerCase())
  )

  return matched.length >= 2
}

function makeDecision(
  target: RouterDecision["target"],
  reason: string,
  confidence: RouterDecision["confidence"],
  stateBucket: string,
  prerequisitesMissing?: string[],
): RouterDecision {
  return {
    target,
    reason,
    confidence,
    prerequisitesMissing,
    stateBucket: stateBucket as RouterDecision["stateBucket"],
  }
}
