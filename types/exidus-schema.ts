export type SchemaSource =
  | "assessment"
  | "manual"
  | "agent-derived"
  | "mixed"
  | "clarity-engine"
  | "destination-research-agent"
  | "fit-comparison-agent"
  | "action-planning-agent"
  | "report-refinement-agent"

export type ConfidenceLevel = "high" | "medium" | "low"
export type ReadinessLevel = "early" | "emerging" | "active" | "nearlyReady"

export type ProfileType =
  | "solo"
  | "family"
  | "retiree"
  | "digitalNomad"
  | "investor"
  | "other"

export type MotivationOrientation =
  | "pushDriven"
  | "pullDriven"
  | "balanced"
  | "unclear"

export type LifeArchetype =
  | "peaceFirst"
  | "belongingFirst"
  | "affordabilityFirst"
  | "stabilityFirst"
  | "reinventionFirst"
  | "balanceFirst"

export type FitDirectionArchetype =
  | "calmAffordabilityPath"
  | "belongingCenteredPath"
  | "stabilityAndSystemsPath"
  | "flexibleRemoteLifePath"
  | "emergingClarityPath"

export type FitVerdict =
  | "strongFit"
  | "moderateFit"
  | "weakFit"
  | "tooEarlyToJudge"

export interface BaseSchema {
  schemaVersion: string
  createdAt: string
  updatedAt: string
  source: SchemaSource
}

export interface UserProfile extends BaseSchema {
  userId?: string
  sessionId?: string
  profileType?: ProfileType
  nationality?: string
  currentCountry?: string
  budgetMonthly?: {
    amount?: number
    currency?: string
    note?: string
  }
  partySize?: {
    adults?: number
    children?: number
    dependentsNote?: string
  }
  timeline?: {
    targetWindow?: string
    urgencyLevel?: "low" | "medium" | "high"
  }
  specialNotes?: string[]
  topPriorities?: string[]
  destinationsConsidering?: string[]
  openToSuggestions?: boolean
}

export interface AssessmentAnswers extends BaseSchema {
  assessmentId: string
  userId?: string
  sessionId?: string
  answers: Record<string, string | string[] | number | boolean | null>
  freeText: Record<string, string>
  completedModules: string[]
  completionState: "inProgress" | "completed" | "abandoned"
}

export interface SignalScore {
  key: string
  label: string
  score: number
}

export interface RankedSignal {
  key: string
  label: string
  rank: number
  weight: number
}

export interface AssessmentSignals extends BaseSchema {
  pushFactors: SignalScore[]
  pullFactors: SignalScore[]
  destinationCriteria: RankedSignal[]
  nonNegotiables: string[]
  readinessConstraints: SignalScore[]
  tradeoffSignals: SignalScore[]
  motivationOrientation: MotivationOrientation
  contradictionFlags: string[]
  signalNotes?: string[]
}

export interface ReadinessProfile extends BaseSchema {
  readinessLevel: ReadinessLevel
  compositeScore: number
  dimensions: {
    financialFlexibility: number
    logisticalReadiness: number
    lifeFlexibility: number
    uncertaintyTolerance: number
    timelineProximity: number
  }
  blockers: string[]
  strengths: string[]
  planningHorizon?: string
  confidence: ConfidenceLevel
}

export interface ArchetypeProfile extends BaseSchema {
  primaryLifeArchetype: LifeArchetype
  secondaryLifeArchetype?: LifeArchetype
  fitDirectionArchetype: FitDirectionArchetype
  rationale: string[]
  confidence: ConfidenceLevel
}

export interface ClarityReport extends BaseSchema {
  reportId: string
  userId?: string
  sessionId?: string
  summary: {
    motivationSummary: string
    desiredLifeSummary: string
    readinessSummary: string
    fitDirectionSummary: string
    frictionSummary: string
    nextStepSummary: string
  }
  highlights: string[]
  topPriorities: string[]
  nonNegotiables: string[]
  contradictionFlags: string[]
  readinessProfile: ReadinessProfile
  archetypeProfile: ArchetypeProfile
  signals: AssessmentSignals
  disclaimerFlags: string[]
}

export interface ResearchSection {
  summary: string
  confidence: ConfidenceLevel
  notes: string[]
}

export interface SourceRef {
  label: string
  url?: string
  type?: string
}

export interface DestinationResearchReport extends BaseSchema {
  reportId: string
  destination: string
  destinationSlug: string
  quickFitSummary: string
  profileFitVerdict: FitVerdict
  confidence: ConfidenceLevel
  profileLens: {
    profileType?: ProfileType
    readinessLevel?: ReadinessLevel
    budgetMonthly?: {
      amount?: number
      currency?: string
    }
    topPriorities: string[]
    specialNotes: string[]
  }
  sections: {
    visaImmigration?: ResearchSection
    costOfLiving?: ResearchSection
    healthcare?: ResearchSection
    safety?: ResearchSection
    climateEnvironment?: ResearchSection
    taxImplications?: ResearchSection
    cultureIntegration?: ResearchSection
    education?: ResearchSection
    practicalNextSteps?: ResearchSection
  }
  fitNotes: {
    whyItMayFit: string[]
    whyItMayNotFit: string[]
    majorTradeoffs: string[]
  }
  recommendedNextStep?: string
  recommendedNextQuestions: string[]
  sources?: SourceRef[]
}

export interface FitComparisonReport extends BaseSchema {
  comparedDestinations: string[]
  strongestFit?: string
  strongestPracticalFit?: string
  strongestEmotionalFit?: string
  weakestFit?: string
  comparisonSummary: string
  keyTradeoffs: string[]
  destinationComparisons: Array<{
    destination: string
    fitVerdict: FitVerdict
    practicalFit: FitVerdict
    emotionalFit: FitVerdict
    currentStageFit: FitVerdict
    nonNegotiableStatus: "clear" | "watch" | "conflict"
    strengths: string[]
    tensions: string[]
    tradeoffs: string[]
    notes: string[]
    confidence: ConfidenceLevel
  }>
  recommendedNextMove?: string
  routeSignals?: {
    needsMoreResearchOn: string[]
    readyForActionPlanning: boolean
  }
}

export interface ActionPlan extends BaseSchema {
  horizon: "30Days" | "90Days" | "custom"
  planningMode: "clarityFirst" | "researchFirst" | "preparationFirst" | "movePrep"
  destinationState:
    | "noShortlist"
    | "singleDestination"
    | "shortlistUnstable"
    | "directionEmerging"
    | "directionClear"
  readinessLevel: ReadinessLevel
  framingSummary: string
  stageSummary: string
  priorities: string[]
  notYet: string[]
  actions: Array<{
    id: string
    title: string
    description: string
    category: "clarity" | "research" | "preparation" | "logistics" | "support"
    phase: "now" | "soon" | "later"
    urgency: "low" | "medium" | "high"
    rationale: string
    dependsOn?: string[]
  }>
  suggestedNextExidusMove?: string
  groundedIn: {
    topPriorities: string[]
    nonNegotiables: string[]
    readinessBlockers: string[]
    readinessStrengths: string[]
    researchedDestinations: string[]
    comparedDestinations: string[]
    strongestFit?: string
    fitDirectionArchetype: FitDirectionArchetype
  }
  sequencingNotes?: string[]
}

export interface ReportRevision extends BaseSchema {
  revisionId: string
  priorReportId: string
  newReportId: string
  revisionType:
    | "priorityRevision"
    | "readinessRevision"
    | "destinationRevision"
    | "shortlistRevision"
    | "planningRevision"
    | "mixedRevision"
  significance: "small" | "moderate" | "major"
  changes: {
    prioritiesChanged?: string[]
    readinessChanged?: string[]
    destinationsChanged?: string[]
    tensionsChanged?: string[]
    sectionsUpdated?: Array<
      | "summary.motivationSummary"
      | "summary.desiredLifeSummary"
      | "summary.readinessSummary"
      | "summary.fitDirectionSummary"
      | "summary.frictionSummary"
      | "summary.nextStepSummary"
      | "highlights"
      | "topPriorities"
      | "nonNegotiables"
      | "contradictionFlags"
    >
  }
  revisionSummary: string
  whatChanged: string[]
  whatStayedTheSame: string[]
  payAttentionNow: string[]
  groundedIn: {
    usedUpdatedProfile: boolean
    usedAssessmentSignals: boolean
    usedReadinessProfile: boolean
    usedArchetypeProfile: boolean
    usedDestinationResearch: string[]
    usedFitComparison: boolean
    usedActionPlan: boolean
  }
}
