import test from "node:test"
import assert from "node:assert/strict"

import type {
  ArchetypeProfile,
  ClarityReport,
  ReadinessProfile,
  UserProfile,
} from "../../types/exidus-schema.ts"
import { SCHEMA_VERSION } from "../config.ts"
import { invokeDestinationResearchAgent } from "../agents/destination-research-agent.ts"
import { invokeFitComparisonAgent } from "../agents/fit-comparison-agent.ts"

function makeUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  const now = new Date().toISOString()

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    source: "manual",
    profileType: "solo",
    nationality: "American",
    currentCountry: "United States",
    budgetMonthly: {
      amount: 3200,
      currency: "USD",
    },
    partySize: {
      adults: 1,
      children: 0,
    },
    timeline: {
      targetWindow: "6-12 months",
      urgencyLevel: "medium",
    },
    topPriorities: ["Belonging", "Affordability", "Healthcare"],
    destinationsConsidering: [],
    openToSuggestions: false,
    specialNotes: [],
    ...overrides,
  }
}

function makeReadinessProfile(
  overrides: Partial<ReadinessProfile> = {},
): ReadinessProfile {
  const now = new Date().toISOString()

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    source: "clarity-engine",
    readinessLevel: "active",
    compositeScore: 62,
    dimensions: {
      financialFlexibility: 60,
      logisticalReadiness: 55,
      lifeFlexibility: 65,
      uncertaintyTolerance: 70,
      timelineProximity: 60,
    },
    blockers: [],
    strengths: ["clear priorities"],
    confidence: "medium",
    confidenceNotes: [],
    ...overrides,
  }
}

function makeArchetypeProfile(
  overrides: Partial<ArchetypeProfile> = {},
): ArchetypeProfile {
  const now = new Date().toISOString()

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    source: "clarity-engine",
    primaryLifeArchetype: "belongingFirst",
    secondaryLifeArchetype: "peaceFirst",
    fitDirectionArchetype: "belongingCenteredPath",
    confidence: "medium",
    confidenceNotes: [],
    summary:
      "Belonging matters more than pure convenience, but the move still needs practical stability.",
    ...overrides,
  }
}

function makeClarityReport(input: {
  topPriorities: string[]
  nonNegotiables?: string[]
  contradictionFlags?: string[]
  readinessProfile: ReadinessProfile
  archetypeProfile: ArchetypeProfile
}): ClarityReport {
  const now = new Date().toISOString()

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    source: "clarity-engine",
    reportId: "clarity-test-report",
    summary: {
      fitDirectionSummary: "Belonging and practical stability both matter.",
      frictionSummary: "The move needs grounded verification.",
      nextStepSummary: "Pressure-test the shortlist before acting.",
    },
    highlights: [],
    topPriorities: input.topPriorities,
    nonNegotiables: input.nonNegotiables ?? [],
    contradictionFlags: input.contradictionFlags ?? [],
    readinessProfile: input.readinessProfile,
    archetypeProfile: input.archetypeProfile,
    signals: {
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
      source: "clarity-engine",
      pushFactors: [],
      pullFactors: [],
      destinationCriteria: [],
      nonNegotiables: input.nonNegotiables ?? [],
      readinessConstraints: [],
      tradeoffSignals: [],
      motivationOrientation: "balanced",
      contradictionFlags: input.contradictionFlags ?? [],
      signalNotes: [],
    },
    disclaimerFlags: [],
  }
}

async function generateResearchReports(input: {
  userProfile: UserProfile
  readinessProfile?: ReadinessProfile
  archetypeProfile?: ArchetypeProfile
  contradictionFlags?: string[]
  nonNegotiables?: string[]
}) {
  const readinessProfile = input.readinessProfile ?? makeReadinessProfile()
  const archetypeProfile = input.archetypeProfile ?? makeArchetypeProfile()
  const clarityReport = makeClarityReport({
    topPriorities: input.userProfile.topPriorities ?? [],
    nonNegotiables: input.nonNegotiables,
    contradictionFlags: input.contradictionFlags,
    readinessProfile,
    archetypeProfile,
  })

  const result = await invokeDestinationResearchAgent({
    agentId: "destination-research-agent",
    userIntent: `Research ${(input.userProfile.destinationsConsidering ?? []).join(" and ")}`,
    artifacts: {
      userProfile: input.userProfile,
      clarityReport,
      readinessProfile,
      archetypeProfile,
    },
  })

  return {
    readinessProfile,
    archetypeProfile,
    clarityReport,
    reports: result.artifacts.destinationResearchReports ?? [],
  }
}

test("destination research names confidence concentration and keeps low-confidence routes provisional", async () => {
  const userProfile = makeUserProfile({
    profileType: "family",
    budgetMonthly: { amount: 4300, currency: "USD" },
    partySize: { adults: 2, children: 2 },
    topPriorities: ["Belonging", "English environment", "Safety", "Education"],
    destinationsConsidering: ["Ghana"],
    specialNotes: ["Need English-speaking environment for daily life."],
  })

  const { reports } = await generateResearchReports({
    userProfile,
    nonNegotiables: ["Safety", "Education"],
  })

  const report = reports[0]
  assert.ok(report)
  assert.equal(report.destination, "Ghana")
  assert.equal(report.confidence, "low")
  assert.match(report.quickFitSummary, /Overall confidence is low/i)
  assert.match(report.quickFitSummary, /visa and immigration/i)
  assert.match(report.recommendedNextStep ?? "", /planning-ready|commitment/i)
  assert.match(report.recommendedNextQuestions.join(" "), /school|education/i)
})

test("fit comparison makes the emotional-versus-practical split concrete", async () => {
  const userProfile = makeUserProfile({
    topPriorities: ["Belonging", "English environment", "Healthcare", "Stability", "Warm climate"],
    destinationsConsidering: ["Portugal", "Ghana"],
    specialNotes: ["Need English support early in the move."],
  })

  const { reports, clarityReport, readinessProfile, archetypeProfile } =
    await generateResearchReports({
      userProfile,
      nonNegotiables: ["Healthcare", "Stability"],
    })

  const result = await invokeFitComparisonAgent({
    agentId: "fit-comparison-agent",
    userIntent: "Compare Portugal and Ghana for fit",
    artifacts: {
      userProfile,
      clarityReport,
      readinessProfile,
      archetypeProfile,
      destinationResearchReports: reports,
    },
  })

  const report = result.artifacts.fitComparisonReport
  assert.ok(report)
  assert.equal(report.strongestPracticalFit, "Portugal")
  assert.equal(report.strongestEmotionalFit, "Ghana")
  assert.match(report.recommendedNextMove ?? "", /Portugal/)
  assert.match(report.recommendedNextMove ?? "", /Ghana/)
  assert.match(report.recommendedNextMove ?? "", /belonging|english/i)
  assert.match(report.recommendedNextMove ?? "", /healthcare|infrastructure|stability/i)
})

test("fit comparison pressure-tests unstable shortlists with named friction instead of generic retry language", async () => {
  const userProfile = makeUserProfile({
    topPriorities: ["Affordability", "Pace of life", "Belonging"],
    destinationsConsidering: ["Portugal", "Mexico"],
  })

  const { reports, clarityReport, readinessProfile, archetypeProfile } =
    await generateResearchReports({
      userProfile,
      nonNegotiables: ["Affordability"],
    })

  const result = await invokeFitComparisonAgent({
    agentId: "fit-comparison-agent",
    userIntent: "Compare Portugal and Mexico",
    artifacts: {
      userProfile,
      clarityReport,
      readinessProfile,
      archetypeProfile,
      destinationResearchReports: reports,
    },
  })

  const report = result.artifacts.fitComparisonReport
  assert.ok(report)
  assert.equal(report.strongestFit, undefined)
  assert.match(report.comparisonSummary, /housing pressure|regional safety variance/i)
  assert.match(report.recommendedNextMove ?? "", /housing pressure|regional safety variance|bureaucratic inconsistency/i)
})
