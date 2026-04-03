import crypto from "node:crypto"

import type {
  ArchetypeProfile,
  ClarityReport,
  ConfidenceLevel,
  DestinationResearchReport,
  FitVerdict,
  ProfileType,
  ReadinessProfile,
  ResearchSection,
  UserProfile,
} from "../../types/exidus-schema.ts"
import { SCHEMA_VERSION } from "../config.ts"
import type {
  AgentInvocation,
  AgentInvocationResult,
} from "../core/types.ts"
import {
  findDestinationKnowledge,
  normalizeDestinationName,
  type DestinationKnowledge,
} from "./destination-research-data.ts"

const DESTINATION_REQUEST_STOP_WORDS = new Set([
  "research",
  "compare",
  "destination",
  "destinations",
  "country",
  "countries",
  "for",
  "me",
  "my",
  "profile",
  "looks",
  "like",
  "go",
  "deeper",
  "on",
  "fit",
  "move",
  "moving",
  "relocate",
  "relocating",
  "live",
  "living",
  "to",
  "in",
  "what",
  "does",
  "this",
  "and",
  "or",
  "vs",
  "versus",
  "now",
])

const PRIORITY_KEYWORDS: Array<{ key: string; tokens: string[] }> = [
  { key: "affordability", tokens: ["afford", "budget", "cost"] },
  { key: "pace of life", tokens: ["pace", "calm", "peace", "slow"] },
  { key: "healthcare", tokens: ["health", "medical"] },
  { key: "safety", tokens: ["safety", "safe", "crime", "stability"] },
  { key: "belonging", tokens: ["belong", "social fit", "diaspora", "community"] },
  { key: "warm climate", tokens: ["warm", "climate", "weather"] },
  { key: "stability", tokens: ["stability", "systems", "infrastructure"] },
  { key: "education", tokens: ["school", "education", "children"] },
  { key: "english environment", tokens: ["english", "language"] },
  { key: "work compatibility", tokens: ["remote", "work", "internet"] },
]

export async function invokeDestinationResearchAgent(
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
  const requestedDestinations = resolveRequestedDestinations(
    invocation.userIntent,
    userProfile,
  )

  if (requestedDestinations.length === 0) {
    throw new Error(
      "Destination Research Agent needs at least one destination in the request or user profile.",
    )
  }

  const reports = requestedDestinations.map((destination) =>
    buildDestinationResearchReport({
      destination,
      userIntent: invocation.userIntent,
      userProfile,
      clarityReport,
      readinessProfile,
      archetypeProfile,
    })
  )

  return {
    agentId: "destination-research-agent",
    status: "completed",
    message:
      reports.length === 1
        ? `Destination Research Agent generated a profile-grounded first-pass report for ${reports[0].destination}.`
        : `Destination Research Agent generated ${reports.length} profile-grounded destination reports.`,
    artifacts: {
      ...invocation.artifacts,
      destinationResearchReports: mergeDestinationReports(
        invocation.artifacts.destinationResearchReports ?? [],
        reports,
      ),
    },
  }
}

function buildDestinationResearchReport(input: {
  destination: string
  userIntent?: string
  userProfile: UserProfile
  clarityReport: ClarityReport
  readinessProfile: ReadinessProfile
  archetypeProfile: ArchetypeProfile
}): DestinationResearchReport {
  const now = new Date().toISOString()
  const knowledge = findDestinationKnowledge(input.destination)
  const destinationName = knowledge?.name ?? toDisplayDestination(input.destination)
  const priorities = collectTopPriorities(input.userProfile, input.clarityReport)
  const specialNotes = input.userProfile.specialNotes ?? []
  const budgetAssessment = assessBudgetFit(input.userProfile, knowledge)
  const fitScore = scoreDestinationFit({
    knowledge,
    priorities,
    readinessProfile: input.readinessProfile,
    userProfile: input.userProfile,
    budgetAssessment,
  })
  const profileFitVerdict = resolveVerdict(fitScore, knowledge, input.readinessProfile)
  const whyItMayFit = buildWhyItMayFit({
    destinationName,
    knowledge,
    priorities,
    budgetAssessment,
    archetypeProfile: input.archetypeProfile,
    userProfile: input.userProfile,
  })
  const whyItMayNotFit = buildWhyItMayNotFit({
    knowledge,
    budgetAssessment,
    readinessProfile: input.readinessProfile,
    priorities,
    userProfile: input.userProfile,
    clarityReport: input.clarityReport,
  })
  const majorTradeoffs = buildTradeoffs({
    knowledge,
    budgetAssessment,
    readinessProfile: input.readinessProfile,
    userProfile: input.userProfile,
  })
  const sections = buildSections({
    destinationName,
    knowledge,
    budgetAssessment,
    priorities,
    userProfile: input.userProfile,
    readinessProfile: input.readinessProfile,
  })
  const confidence = combineConfidence(Object.values(sections).map((section) => section?.confidence))
  const quickFitSummary = buildQuickFitSummary({
    destinationName,
    profileFitVerdict,
    priorities,
    budgetAssessment,
    readinessProfile: input.readinessProfile,
    knowledge,
  })
  const recommendedNextQuestions = buildNextQuestions({
    destinationName,
    knowledge,
    userProfile: input.userProfile,
    priorities,
    budgetAssessment,
  })
  const recommendedNextStep = buildRecommendedNextStep(
    destinationName,
    input.readinessProfile,
    knowledge,
  )

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    source: "destination-research-agent",
    reportId: `destination-${crypto.randomUUID()}`,
    destination: destinationName,
    destinationSlug: knowledge?.slug ?? slugify(destinationName),
    quickFitSummary,
    profileFitVerdict,
    confidence,
    profileLens: {
      profileType: input.userProfile.profileType,
      readinessLevel: input.readinessProfile.readinessLevel,
      budgetMonthly: {
        amount: input.userProfile.budgetMonthly?.amount,
        currency: input.userProfile.budgetMonthly?.currency,
      },
      topPriorities: priorities,
      specialNotes,
    },
    sections,
    fitNotes: {
      whyItMayFit,
      whyItMayNotFit,
      majorTradeoffs,
    },
    recommendedNextStep,
    recommendedNextQuestions,
    sources: knowledge?.sources ?? [
      {
        label: `${destinationName} official immigration and residency sources should be verified directly before acting.`,
        type: "official-source-needed",
      },
    ],
  }
}

function buildSections(input: {
  destinationName: string
  knowledge?: DestinationKnowledge
  budgetAssessment: BudgetAssessment
  priorities: string[]
  userProfile: UserProfile
  readinessProfile: ReadinessProfile
}) {
  const knowledge = input.knowledge
  const partyIncludesChildren = (input.userProfile.partySize?.children ?? 0) > 0

  return {
    visaImmigration: makeSection(
      knowledge?.sections.visaImmigration,
      knowledge
        ? [
            `For this profile, the main visa question is whether ${joinHuman(knowledge.immigrationFocus.slice(0, 2))} actually matches how your income and timeline work.`,
            readinessNote(input.readinessProfile, "visa"),
          ]
        : [
            `This first pass does not yet have a destination-specific visa brief for ${input.destinationName}.`,
            "Verify with official source or local immigration lawyer.",
          ],
      "low",
    ),
    costOfLiving: makeSection(
      knowledge?.sections.costOfLiving,
      [
        input.budgetAssessment.summary,
        budgetActionNote(input.budgetAssessment),
      ],
      knowledge ? "medium" : "low",
    ),
    healthcare: makeSection(
      knowledge?.sections.healthcare,
      [
        input.priorities.some((item) => includesAny(item, ["health", "care"]))
          ? "Healthcare is one of your named priorities, so this section should be verified earlier rather than later."
          : "Healthcare may not be the lead filter for you, but it can still change long-term sustainability.",
      ],
      knowledge ? "medium" : "low",
    ),
    safety: makeSection(
      knowledge?.sections.safety,
      [
        input.userProfile.profileType === "family"
          ? "Because this is a family profile, city-level safety and daily routine friction matter more than broad national reputation."
          : "Safety fit should be checked at the city and neighborhood level, not assumed from country-level branding.",
      ],
      knowledge ? "medium" : "low",
    ),
    climateEnvironment: makeSection(
      knowledge?.sections.climateEnvironment,
      [
        climatePriorityNote(input.priorities, knowledge),
      ],
      knowledge ? "medium" : "low",
    ),
    taxImplications: makeSection(
      knowledge?.sections.taxImplications,
      [
        knowledge?.taxCaution ?? "Tax treatment is not clear enough in this first-pass runtime and needs specialist verification.",
        "Verify with official source or local immigration lawyer.",
      ],
      "low",
    ),
    cultureIntegration: makeSection(
      knowledge?.sections.cultureIntegration,
      [
        integrationNote(input.userProfile, knowledge),
      ],
      knowledge ? "medium" : "low",
    ),
    education: partyIncludesChildren
      ? makeSection(
          knowledge?.sections.education,
          [
            "Because children are part of this profile, school availability and family routines should be treated as first-order research items.",
          ],
          knowledge?.sections.education?.confidence ?? "low",
        )
      : undefined,
    practicalNextSteps: makeSection(
      knowledge?.sections.practicalNextSteps,
      [
        `Use ${joinHuman(input.priorities.slice(0, 3)) || "your top priorities"} as the filter for the next research pass rather than broad destination hype.`,
      ],
      knowledge?.sections.practicalNextSteps?.confidence ?? "medium",
    ),
  }
}

function buildQuickFitSummary(input: {
  destinationName: string
  profileFitVerdict: FitVerdict
  priorities: string[]
  budgetAssessment: BudgetAssessment
  readinessProfile: ReadinessProfile
  knowledge?: DestinationKnowledge
}) {
  const verdictLabel = humanizeVerdict(input.profileFitVerdict)
  const matchedPriority =
    input.knowledge &&
    input.priorities.find((priority) =>
      matchesDestinationPriority(priority, input.knowledge!.priorityFits)
    )
  const pressurePoint =
    input.knowledge &&
    input.priorities.find((priority) =>
      matchesDestinationPriority(priority, input.knowledge!.priorityTensions)
    )
  const budgetLine =
    input.budgetAssessment.status === "comfortable"
      ? "The stated budget looks broadly workable for a serious first-pass shortlist."
      : input.budgetAssessment.status === "stretch"
        ? "The stated budget looks possible but only if city choice, housing expectations, and setup costs stay disciplined."
        : input.budgetAssessment.status === "unknown"
          ? "Budget fit is still too under-specified to treat as settled."
          : "The stated budget looks misaligned unless your expectations or city choice change."
  const fitFrame = matchedPriority
    ? `${input.destinationName} reads as a ${verdictLabel} largely because it supports ${matchedPriority} for this profile.`
    : `${input.destinationName} reads as a ${verdictLabel} based on the current profile filters rather than generic popularity.`
  const cautionLine = pressurePoint
    ? `The main pressure point is ${pressurePoint}, so this should stay a research verdict rather than a commitment verdict.`
    : "The main question is whether the strongest apparent fit still holds once the practical details are verified."

  return `${fitFrame} ${budgetLine} ${cautionLine} Readiness is currently ${input.readinessProfile.readinessLevel}, so this should be used for narrowing and pressure-testing, not false certainty.`
}

function buildWhyItMayFit(input: {
  destinationName: string
  knowledge?: DestinationKnowledge
  priorities: string[]
  budgetAssessment: BudgetAssessment
  archetypeProfile: ArchetypeProfile
  userProfile: UserProfile
}) {
  const items: string[] = []

  if (input.knowledge) {
    const matchedPriorities = input.priorities.filter((priority) =>
      matchesDestinationPriority(priority, input.knowledge!.priorityFits)
    )
    if (matchedPriorities.length > 0) {
      items.push(
        `${input.destinationName} aligns reasonably well with ${joinHuman(matchedPriorities.slice(0, 3))}, which are central to this profile.`,
      )
    }

    if (
      input.userProfile.profileType &&
      input.knowledge.profileBoosts.includes(input.userProfile.profileType)
    ) {
      items.push(
        `${input.destinationName} tends to make more sense for ${humanizeProfileType(input.userProfile.profileType)} profiles than for every profile equally.`,
      )
    }
  }

  if (input.budgetAssessment.status === "comfortable") {
    items.push("The current monthly budget looks capable of supporting a serious first-pass exploration without every decision needing to be made from a scarcity position.")
  }

  if (input.budgetAssessment.status === "stretch") {
    items.push("The current budget can still keep the destination in play, but only if the eventual city and housing standard are chosen carefully.")
  }

  items.push(
    `Your fit direction is ${humanizeEnum(input.archetypeProfile.fitDirectionArchetype)}, so the destination only stays credible if it supports the life shape you are actually moving toward.`,
  )

  return items.slice(0, 3)
}

function buildWhyItMayNotFit(input: {
  knowledge?: DestinationKnowledge
  budgetAssessment: BudgetAssessment
  readinessProfile: ReadinessProfile
  priorities: string[]
  userProfile: UserProfile
  clarityReport: ClarityReport
}) {
  const items: string[] = []

  if (input.budgetAssessment.status === "tight") {
    items.push("The current budget looks tight enough that city choice and housing quality could distort the experience quickly.")
  }

  if (input.budgetAssessment.status === "unknown") {
    items.push("Budget realism is still unclear because the profile does not yet specify enough detail.")
  }

  if (input.knowledge?.priorityTensions.length) {
    const relevantTensions = input.knowledge.priorityTensions.filter((tension) =>
      input.priorities.some((priority) => matchesDestinationPriority(priority, [tension]))
    )
    if (relevantTensions.length > 0) {
      items.push(
        `This destination still carries tension around ${joinHuman(relevantTensions.slice(0, 2))}, which overlaps with your priorities.`,
      )
    }
  }

  if (input.userProfile.profileType && input.knowledge?.profileCautions[input.userProfile.profileType]) {
    items.push(input.knowledge.profileCautions[input.userProfile.profileType]!)
  }

  const lowConfidenceSections = Object.entries(input.knowledge?.sections ?? {})
    .filter(([, section]) => section?.confidence === "low")
    .map(([key]) => humanizeSectionKey(key))
  if (lowConfidenceSections.length > 0) {
    items.push(
      `The thinnest parts of the current evidence are ${joinHuman(lowConfidenceSections.slice(0, 2))}, so those areas should not be treated as settled.`,
    )
  }

  if (input.readinessProfile.readinessLevel === "early") {
    items.push("Your readiness is still early, so destination enthusiasm could outpace practical preparation.")
  }

  if (input.clarityReport.contradictionFlags.length > 0) {
    items.push(
      `One unresolved profile tension is still active: ${input.clarityReport.contradictionFlags[0]}`,
    )
  }

  return items.slice(0, 3)
}

function buildTradeoffs(input: {
  knowledge?: DestinationKnowledge
  budgetAssessment: BudgetAssessment
  readinessProfile: ReadinessProfile
  userProfile: UserProfile
}) {
  const items: string[] = []

  if (input.knowledge?.priorityTensions.length) {
    const matchedFits = input.knowledge.priorityFits.slice(0, 2)
    const matchedTensions = input.knowledge.priorityTensions.slice(0, 2)
    items.push(
      `The likely tradeoff is between ${joinHuman(matchedFits)} and ${joinHuman(matchedTensions)}.`,
    )
  }

  if (input.budgetAssessment.status === "stretch" || input.budgetAssessment.status === "tight") {
    items.push("Budget fit may depend on accepting a less popular city, smaller housing footprint, or a slower setup timeline.")
  }

  if (input.userProfile.profileType === "family") {
    items.push("Family fit is likely to hinge on school-and-neighborhood reality rather than country-level appeal.")
  } else if (input.userProfile.profileType === "digitalNomad") {
    items.push("Remote-work viability may look attractive on paper while visa structure, tax exposure, and admin friction still need a separate reality check.")
  }

  if (input.readinessProfile.readinessLevel === "nearlyReady") {
    items.push("Because readiness is relatively advanced, the cost of bad assumptions is higher now than it was during earlier exploration.")
  }

  return items.slice(0, 3)
}

function buildNextQuestions(input: {
  destinationName: string
  knowledge?: DestinationKnowledge
  userProfile: UserProfile
  priorities: string[]
  budgetAssessment: BudgetAssessment
}) {
  const items = [
    `Which city or region in ${input.destinationName} actually fits ${joinHuman(input.priorities.slice(0, 3)) || "this profile"} best once you compare daily life, housing, and admin friction together?`,
    `Which official residency route looks most realistic for a ${humanizeProfileType(input.userProfile.profileType)} profile with this income pattern and timeline?`,
    `What housing budget should be assumed if you prioritize ${joinHuman(input.priorities.slice(0, 2)) || "your top criteria"} rather than bargain-hunting edge cases?`,
  ]

  if (input.priorities.some((priority) => includesAny(priority, ["belong", "racial", "social", "community"]))) {
    items.push(`Which neighborhoods or cities in ${input.destinationName} are most likely to feel socially sustainable rather than just affordable or scenic?`)
  }

  if (input.priorities.some((priority) => includesAny(priority, ["safety", "stable", "infrastructure"]))) {
    items.push(`Which city-level safety and infrastructure differences matter enough in ${input.destinationName} to change the shortlist outcome?`)
  }

  if ((input.userProfile.partySize?.children ?? 0) > 0) {
    items.push(`Which school options keep the family budget realistic in your likely target cities?`)
  }

  if (input.budgetAssessment.status !== "comfortable") {
    items.push(`What would need to change for ${input.destinationName} to feel financially stable rather than merely possible?`)
  }

  if (includesAny(input.userProfile.specialNotes?.join(" ") ?? "", ["pet"])) {
    items.push(`What import, housing, and veterinary logistics would apply if you relocate with a pet?`)
  }

  return items.slice(0, 5)
}

function buildRecommendedNextStep(
  destinationName: string,
  readinessProfile: ReadinessProfile,
  knowledge?: DestinationKnowledge,
) {
  if (!knowledge) {
    return `Treat ${destinationName} as a manual-research candidate next. Verify immigration, cost, and city-level fit from official sources before using it in comparison.`
  }

  if (readinessProfile.readinessLevel === "early") {
    return `Use ${destinationName} as a pressure-test destination for your criteria, not as a commitment decision yet.`
  }

  if (readinessProfile.readinessLevel === "emerging") {
    return `Use a second-pass review on ${destinationName} to narrow the big unknowns first: visa route fit, realistic city-level cost, and whether the strongest profile match survives closer inspection.`
  }

  return `Run a second-pass review on ${destinationName} that verifies residency eligibility, realistic city-level budget, and the top one or two profile priorities driving this move.`
}

function scoreDestinationFit(input: {
  knowledge?: DestinationKnowledge
  priorities: string[]
  readinessProfile: ReadinessProfile
  userProfile: UserProfile
  budgetAssessment: BudgetAssessment
}) {
  let score = 0

  if (!input.knowledge) {
    return score
  }

  for (const priority of input.priorities.slice(0, 4)) {
    if (matchesDestinationPriority(priority, input.knowledge.priorityFits)) {
      score += 2
    }
    if (matchesDestinationPriority(priority, input.knowledge.priorityTensions)) {
      score -= 1
    }
  }

  if (
    input.userProfile.profileType &&
    input.knowledge.profileBoosts.includes(input.userProfile.profileType)
  ) {
    score += 2
  }

  if (input.userProfile.profileType && input.knowledge.profileCautions[input.userProfile.profileType]) {
    score -= 1
  }

  if (input.budgetAssessment.status === "comfortable") score += 2
  if (input.budgetAssessment.status === "stretch") score += 1
  if (input.budgetAssessment.status === "tight") score -= 2

  if (input.readinessProfile.readinessLevel === "active" || input.readinessProfile.readinessLevel === "nearlyReady") {
    score += 1
  }

  return score
}

function resolveVerdict(
  score: number,
  knowledge: DestinationKnowledge | undefined,
  readinessProfile: ReadinessProfile,
): FitVerdict {
  if (!knowledge && readinessProfile.readinessLevel === "early") {
    return "tooEarlyToJudge"
  }
  if (!knowledge) {
    return "moderateFit"
  }
  if (score >= 6) return "strongFit"
  if (score >= 2) return "moderateFit"
  if (score <= -1) return "weakFit"
  return readinessProfile.readinessLevel === "early" ? "tooEarlyToJudge" : "moderateFit"
}

interface BudgetAssessment {
  status: "comfortable" | "stretch" | "tight" | "unknown"
  summary: string
}

function assessBudgetFit(
  userProfile: UserProfile,
  knowledge?: DestinationKnowledge,
): BudgetAssessment {
  const amount = userProfile.budgetMonthly?.amount
  if (!amount || !knowledge) {
    return {
      status: amount ? "unknown" : "unknown",
      summary: amount
        ? "The profile has a budget, but this destination is not yet mapped to a reliable first-pass budget model in the runtime."
        : "Monthly budget is not specific enough yet to judge destination affordability with confidence.",
    }
  }

  const householdType =
    (userProfile.partySize?.children ?? 0) > 0 || (userProfile.partySize?.adults ?? 1) > 1
      ? "family"
      : "solo"
  const band = knowledge.budgetBandsUsd[householdType]

  if (amount >= band.comfortable) {
    return {
      status: "comfortable",
      summary: `At about ${formatCurrency(amount, userProfile.budgetMonthly?.currency)} per month, this profile looks broadly viable for a ${householdType} setup if city choice stays disciplined.`,
    }
  }

  if (amount >= band.stretch) {
    return {
      status: "stretch",
      summary: `At about ${formatCurrency(amount, userProfile.budgetMonthly?.currency)} per month, this destination looks possible but not comfortably forgiving for a ${householdType} setup.`,
    }
  }

  return {
    status: "tight",
    summary: `At about ${formatCurrency(amount, userProfile.budgetMonthly?.currency)} per month, this destination looks financially tight for the likely housing, healthcare, and setup expectations of this profile.`,
  }
}

function resolveRequestedDestinations(
  userIntent: string | undefined,
  userProfile: UserProfile,
) {
  const fromIntent = extractDestinationsFromIntent(userIntent)
  if (fromIntent.length > 0) {
    return fromIntent
  }

  const fromProfile = userProfile.destinationsConsidering ?? []
  return uniqueStrings(fromProfile.map(toDisplayDestination))
}

function extractDestinationsFromIntent(userIntent?: string) {
  if (!userIntent) {
    return []
  }

  const matches = new Set<string>()
  const normalized = normalizeDestinationName(userIntent)

  for (const segment of normalized.split(/[,\n]/g)) {
    const trimmed = segment.trim()
    const knowledge = findDestinationKnowledge(trimmed)
    if (knowledge) {
      matches.add(knowledge.name)
    }
  }

  for (const token of normalized.split(/\s+/g)) {
    if (DESTINATION_REQUEST_STOP_WORDS.has(token)) {
      continue
    }
    const knowledge = findDestinationKnowledge(token)
    if (knowledge) {
      matches.add(knowledge.name)
    }
  }

  const phrases = normalized.match(/[a-z-]+(?:\s+[a-z-]+)?/g) ?? []
  for (const phrase of phrases) {
    if (DESTINATION_REQUEST_STOP_WORDS.has(phrase)) {
      continue
    }
    const knowledge = findDestinationKnowledge(phrase)
    if (knowledge) {
      matches.add(knowledge.name)
    }
  }

  return [...matches]
}

function mergeDestinationReports(
  existing: DestinationResearchReport[],
  incoming: DestinationResearchReport[],
) {
  const bySlug = new Map(existing.map((report) => [report.destinationSlug, report]))
  for (const report of incoming) {
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

function makeSection(
  base: { summary: string; confidence: ConfidenceLevel; notes: string[] } | undefined,
  appendedNotes: string[],
  fallbackConfidence: ConfidenceLevel,
): ResearchSection {
  return {
    summary: base?.summary ?? "This dimension needs a deeper destination-specific pass before it should guide a major decision.",
    confidence: base?.confidence ?? fallbackConfidence,
    notes: uniqueStrings([...(base?.notes ?? []), ...appendedNotes.filter(Boolean)]).slice(0, 4),
  }
}

function readinessNote(readinessProfile: ReadinessProfile, category: "visa" | "research") {
  if (readinessProfile.readinessLevel === "early") {
    return `Because readiness is ${readinessProfile.readinessLevel}, treat ${category} work as scoping rather than assuming near-term execution.`
  }
  if (readinessProfile.readinessLevel === "nearlyReady") {
    return `Because readiness is ${readinessProfile.readinessLevel}, verify ${category} details early so late-stage surprises do not derail the move.`
  }
  return `Because readiness is ${readinessProfile.readinessLevel}, this category should be used to narrow and sequence the next pass.`
}

function budgetActionNote(assessment: BudgetAssessment) {
  switch (assessment.status) {
    case "comfortable":
      return "Budget does not remove the need for city-level research, but it gives the profile more margin."
    case "stretch":
      return "The budget likely works only if housing and city choice stay disciplined."
    case "tight":
      return "This needs a sharper cost reality check before it should be treated as a likely fit."
    default:
      return "Clarify budget range and expected housing standard before relying on affordability claims."
  }
}

function climatePriorityNote(priorities: string[], knowledge?: DestinationKnowledge) {
  if (!knowledge) {
    return "Climate fit remains too generic in this first-pass runtime."
  }
  const climatePriority = priorities.find((priority) => includesAny(priority, ["warm", "climate", "weather"]))
  if (climatePriority) {
    return `Climate is one of your priorities, and ${knowledge.name} only stays attractive if ${joinHuman(knowledge.climateTags.slice(0, 2))} is genuinely the kind of environment you want to live in.`
  }
  return `Climate may not be the lead filter for you, but ${knowledge.name} still carries a distinct environment profile: ${joinHuman(knowledge.climateTags.slice(0, 3))}.`
}

function integrationNote(userProfile: UserProfile, knowledge?: DestinationKnowledge) {
  if (!knowledge) {
    return "Cultural fit is still too thinly specified for this destination."
  }
  const notes: string[] = [knowledge.languageContext]
  if (includesAny(userProfile.specialNotes?.join(" ") ?? "", ["english"])) {
    notes.push("English-language comfort is explicitly part of this profile, so daily bureaucracy and healthcare language needs should be checked earlier.")
  }
  return joinHuman(notes.slice(0, 2))
}

function combineConfidence(levels: Array<ConfidenceLevel | undefined>): ConfidenceLevel {
  const ranked = levels.filter(Boolean)
  const lowCount = ranked.filter((level) => level === "low").length
  const mediumCount = ranked.filter((level) => level === "medium").length

  if (lowCount >= 2) return "low"
  if (lowCount >= 1 || mediumCount >= 1) return "medium"
  return "high"
}

function humanizeSectionKey(key: string) {
  if (key === "visaImmigration") return "visa and immigration"
  if (key === "costOfLiving") return "cost of living"
  if (key === "climateEnvironment") return "climate and environment"
  if (key === "taxImplications") return "tax implications"
  if (key === "cultureIntegration") return "culture and integration"
  if (key === "practicalNextSteps") return "practical next steps"
  return key
}

function matchesDestinationPriority(priority: string, candidateKeywords: string[]) {
  const normalized = priority.toLowerCase()
  return candidateKeywords.some((candidate) => includesAny(normalized, [candidate.toLowerCase()]) || priorityKeywordMatch(normalized, candidate.toLowerCase()))
}

function priorityKeywordMatch(priority: string, candidate: string) {
  const matchedPriority = PRIORITY_KEYWORDS.find(({ key, tokens }) =>
    priority.includes(key) || tokens.some((token) => priority.includes(token))
  )
  if (!matchedPriority) {
    return false
  }
  return matchedPriority.tokens.some((token) => candidate.includes(token)) || candidate.includes(matchedPriority.key)
}

function requireArtifact<T>(value: T | undefined, label: string): T {
  if (!value) {
    throw new Error(`Destination Research Agent requires '${label}'`)
  }

  return value
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function joinHuman(values: string[]) {
  if (values.length === 0) return ""
  if (values.length === 1) return values[0]
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`
}

function includesAny(value: string, candidates: string[]) {
  const normalized = value.toLowerCase()
  return candidates.some((candidate) => normalized.includes(candidate.toLowerCase()))
}

function humanizeVerdict(verdict: FitVerdict) {
  switch (verdict) {
    case "strongFit":
      return "strong first-pass fit"
    case "moderateFit":
      return "moderate first-pass fit"
    case "weakFit":
      return "weak first-pass fit"
    default:
      return "too-early-to-judge fit"
  }
}

function humanizeProfileType(profileType?: ProfileType) {
  if (!profileType) return "current"
  if (profileType === "digitalNomad") return "digital nomad"
  return profileType
}

function humanizeEnum(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
}

function formatCurrency(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

function toDisplayDestination(value: string) {
  return value
    .trim()
    .split(/\s+/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
}

function slugify(value: string) {
  return normalizeDestinationName(value).replace(/\s+/g, "-")
}
