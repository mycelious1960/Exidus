import type { AssessmentAnswers, UserProfile } from "../../types/exidus-schema.ts"
import { SCHEMA_VERSION } from "../config.ts"

const now = new Date().toISOString()

export const sampleAssessmentAnswers: AssessmentAnswers = {
  schemaVersion: SCHEMA_VERSION,
  createdAt: now,
  updatedAt: now,
  source: "assessment",
  assessmentId: "assessment-sample-001",
  userId: "user-sample-001",
  sessionId: "session-sample-001",
  answers: {
    profileType: "solo",
    nationality: "American",
    currentCountry: "United States",
    budgetMonthlyAmount: 3200,
    budgetMonthlyCurrency: "USD",
    partyAdults: 1,
    partyChildren: 0,
    timelineTargetWindow: "6-12 months",
    timelineUrgencyLevel: "high",
    timelineMonths: 8,
    openToSuggestions: true,
    destinationsConsidering: ["Portugal", "Mexico"],
    pushFactors: ["burnout", "racialStrain", "overstimulation"],
    pullFactors: ["peace", "belonging", "affordability"],
    destinationCriteriaRanked: [
      "socialFit",
      "affordability",
      "paceOfLife",
      "healthcare",
      "workCompatibility",
    ],
    nonNegotiables: ["socialFit", "affordability"],
    motivationOrientation: "balanced",
    incomePortability: 3,
    financialConfidence: 3,
    obligationsLevel: 2,
    adminReadiness: 2,
    uncertaintyTolerance: 4,
    tradeoffAffordabilityVsBelonging: "belonging",
    tradeoffInfrastructureVsPace: "peace",
    tradeoffEaseVsEmotionalFit: "idealFit",
  },
  freeText: {
    reflectionWhyNow:
      "I want a life that feels calmer and more dignified, not just cheaper.",
    reflectionBetterLife:
      "I want to feel like I can breathe, belong, and stop carrying so much ambient tension all the time.",
    reflectionConstraints:
      "I can prepare, but I do not want to rush into a move that looks easier on paper than it feels in real life.",
  },
  completedModules: [
    "why-you-want-out",
    "what-you-want-more-of",
    "destination-fit-criteria",
    "reality-readiness-check",
    "tradeoff-and-fit-logic",
  ],
  completionState: "completed",
}

export const sampleUserProfile: UserProfile = {
  schemaVersion: SCHEMA_VERSION,
  createdAt: now,
  updatedAt: now,
  source: "manual",
  userId: "user-sample-001",
  sessionId: "session-sample-001",
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
    urgencyLevel: "high",
  },
  topPriorities: ["Racial and social fit", "Affordability", "Pace of life"],
  destinationsConsidering: ["Portugal", "Mexico"],
  openToSuggestions: true,
}
