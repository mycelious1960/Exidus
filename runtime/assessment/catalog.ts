import type {
  FitDirectionArchetype,
  LifeArchetype,
  MotivationOrientation,
  ReadinessLevel,
} from "../../types/exidus-schema.ts"

export interface SignalDefinition {
  key: string
  label: string
}

export const PUSH_FACTOR_DEFINITIONS: Record<string, SignalDefinition> = {
  burnout: { key: "burnout", label: "Burnout and exhaustion" },
  racialStrain: { key: "racialStrain", label: "Racial and social strain" },
  economicPressure: {
    key: "economicPressure",
    label: "Economic pressure",
  },
  overstimulation: {
    key: "overstimulation",
    label: "Overstimulation and lack of peace",
  },
  belongingDeficit: {
    key: "belongingDeficit",
    label: "Lack of belonging",
  },
  safetyConcern: { key: "safetyConcern", label: "Safety concern" },
  futurePessimism: {
    key: "futurePessimism",
    label: "Future pessimism",
  },
}

export const PULL_FACTOR_DEFINITIONS: Record<string, SignalDefinition> = {
  peace: { key: "peace", label: "Peace" },
  belonging: { key: "belonging", label: "Belonging" },
  affordability: { key: "affordability", label: "Affordability" },
  dignity: { key: "dignity", label: "Dignity" },
  slowerPace: { key: "slowerPace", label: "Slower pace" },
  stability: { key: "stability", label: "Stability" },
  freedom: { key: "freedom", label: "Freedom" },
  reinvention: { key: "reinvention", label: "Reinvention" },
}

export const CRITERIA_DEFINITIONS: Record<string, SignalDefinition> = {
  affordability: { key: "affordability", label: "Affordability" },
  safety: { key: "safety", label: "Safety" },
  socialFit: { key: "socialFit", label: "Racial and social fit" },
  blackCommunity: { key: "blackCommunity", label: "Black community" },
  healthcare: { key: "healthcare", label: "Healthcare" },
  infrastructure: { key: "infrastructure", label: "Infrastructure" },
  climate: { key: "climate", label: "Climate" },
  paceOfLife: { key: "paceOfLife", label: "Pace of life" },
  workCompatibility: {
    key: "workCompatibility",
    label: "Work compatibility",
  },
  visaFeasibility: {
    key: "visaFeasibility",
    label: "Visa feasibility",
  },
}

export const READINESS_CONSTRAINT_DEFINITIONS: Record<string, SignalDefinition> = {
  lowIncomePortability: {
    key: "lowIncomePortability",
    label: "Income portability is weak",
  },
  highObligations: { key: "highObligations", label: "Obligations are heavy" },
  lowAdminReadiness: {
    key: "lowAdminReadiness",
    label: "Administrative readiness is low",
  },
  shortTimeline: { key: "shortTimeline", label: "Timeline is compressed" },
  lowRiskTolerance: {
    key: "lowRiskTolerance",
    label: "Uncertainty tolerance is low",
  },
}

export const TRADEOFF_SIGNAL_DEFINITIONS: Record<string, SignalDefinition> = {
  belongingWins: {
    key: "belongingWins",
    label: "Belonging wins over pure cost savings",
  },
  affordabilityWins: {
    key: "affordabilityWins",
    label: "Affordability leads under pressure",
  },
  infrastructureWins: {
    key: "infrastructureWins",
    label: "Infrastructure beats softness",
  },
  peaceWins: {
    key: "peaceWins",
    label: "Peace beats high-performance infrastructure",
  },
  easeWins: {
    key: "easeWins",
    label: "Ease of move matters strongly",
  },
 idealFitWins: {
    key: "idealFitWins",
    label: "Emotional fit is protected strongly",
  },
}

export const READINESS_LEVELS: Array<{
  min: number
  max: number
  level: ReadinessLevel
}> = [
  { min: 0, max: 2, level: "early" },
  { min: 2.01, max: 3, level: "emerging" },
  { min: 3.01, max: 4, level: "active" },
  { min: 4.01, max: 5, level: "nearlyReady" },
]

export const LIFE_ARCHETYPE_LABELS: Record<LifeArchetype, string> = {
  peaceFirst: "Peace-First",
  belongingFirst: "Belonging-First",
  affordabilityFirst: "Affordability-First",
  stabilityFirst: "Stability-First",
  reinventionFirst: "Reinvention-First",
  balanceFirst: "Balance-First",
}

export const FIT_DIRECTION_LABELS: Record<FitDirectionArchetype, string> = {
  calmAffordabilityPath: "Calm Affordability Path",
  belongingCenteredPath: "Belonging-Centered Path",
  stabilityAndSystemsPath: "Stability and Systems Path",
  flexibleRemoteLifePath: "Flexible Remote-Life Path",
  emergingClarityPath: "Emerging Clarity Path",
}

export const MOTIVATION_ORIENTATION_LABELS: Record<
  MotivationOrientation,
  string
> = {
  pushDriven: "push-driven",
  pullDriven: "pull-driven",
  balanced: "balanced",
  unclear: "unclear",
}
