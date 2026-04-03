export type ImprovementSeverity = "low" | "medium" | "high"

export type ImprovementFindingCategory =
  | "vagueness"
  | "routing-error"
  | "unsupported-claim"
  | "weak-structure"
  | "prompt-drift"
  | "schema-gap"
  | "overlong-output"
  | "contradiction-miss"
  | "other"

export type ImprovementSourceType =
  | "runtime-log"
  | "eval"
  | "human-review"
  | "benchmark"
  | "mixed"

export type ProposalStatus =
  | "draft"
  | "pending-review"
  | "approved"
  | "approved-with-notes"
  | "rejected"
  | "deployed"

export type ImprovementProposalType = "prompt" | "router" | "schema"

export type ImprovementReviewStatus =
  | "no-proposals"
  | "pending-human-review"
  | "partially-reviewed"
  | "review-complete"

export interface ImprovementBaseSchema {
  schemaVersion: string
  createdAt: string
  updatedAt: string
}

export interface ImprovementFinding extends ImprovementBaseSchema {
  findingId: string
  sourceType: ImprovementSourceType
  severity: ImprovementSeverity
  category: ImprovementFindingCategory
  affectedAgentIds: string[]
  summary: string
  evidenceRefs: string[]
  notes?: string[]
  suggestedNextAction?: string
}

export interface EvalCase extends ImprovementBaseSchema {
  evalCaseId: string
  title: string
  description: string
  tags: string[]
  targetAgentIds: string[]
  inputs: Record<string, unknown>
  expectedQualities: string[]
  disallowedBehaviors: string[]
  notes?: string[]
}

export interface EvalResult extends ImprovementBaseSchema {
  evalResultId: string
  evalCaseId: string
  agentId: string
  artifactVersion: string
  outcome: "pass" | "partial" | "fail"
  scores: {
    usefulness?: number
    coherence?: number
    faithfulness?: number
    safety?: number
    routingAccuracy?: number
    nonGenericness?: number
  }
  summary: string
  findings: string[]
  evidenceRefs?: string[]
}

export interface PromptRevisionProposal extends ImprovementBaseSchema {
  proposalId: string
  sourceFindingId?: string
  agentId: string
  currentPromptFile: string
  proposedPromptFile?: string
  problemSummary: string
  evidenceRefs: string[]
  proposedChangeSummary: string
  expectedBenefit: string
  riskLevel: ImprovementSeverity
  humanApprovalRequired: boolean
  status: ProposalStatus
}

export interface RouterRevisionProposal extends ImprovementBaseSchema {
  proposalId: string
  sourceFindingId?: string
  currentRouterArtifact: string
  problemSummary: string
  evidenceRefs: string[]
  proposedChangeSummary: string
  expectedBenefit: string
  riskLevel: ImprovementSeverity
  humanApprovalRequired: boolean
  status: ProposalStatus
}

export interface SchemaRevisionProposal extends ImprovementBaseSchema {
  proposalId: string
  sourceFindingId?: string
  currentSchemaArtifact: string
  changeType: "additive" | "breaking" | "clarification"
  problemSummary: string
  evidenceRefs: string[]
  proposedChangeSummary: string
  expectedBenefit: string
  riskLevel: ImprovementSeverity
  humanApprovalRequired: boolean
  status: ProposalStatus
}

export interface ApprovalDecision extends ImprovementBaseSchema {
  decisionId: string
  reviewId?: string
  proposalId: string
  decision: "approved" | "rejected" | "approved-with-notes"
  reviewer: string
  rationale?: string
  constraints?: string[]
}

export interface ImprovementReviewProposalItem {
  proposalId: string
  proposalType: ImprovementProposalType
  title: string
  targetLabel: string
  targetArtifact: string
  riskLevel: ImprovementSeverity
  humanApprovalRequired: boolean
  status: ProposalStatus
  problemSummary: string
  proposedChangeSummary: string
  expectedBenefit: string
  evidenceRefs: string[]
  relatedFindingIds: string[]
  decision?: ApprovalDecision
}

export interface ImprovementReviewState {
  status: ImprovementReviewStatus
  totalProposals: number
  pendingCount: number
  approvedCount: number
  approvedWithNotesCount: number
  rejectedCount: number
  decidedProposalIds: string[]
  undecidedProposalIds: string[]
  lastDecisionAt?: string
}

export interface DeploymentRecord extends ImprovementBaseSchema {
  deploymentId: string
  artifactType: "prompt" | "router" | "schema" | "manifest" | "other"
  artifactName: string
  priorVersion?: string
  newVersion: string
  sourceProposalId?: string
  notes?: string[]
}

export interface ImprovementRouteRecord {
  stage: string
  target?: string
  confidence?: string
  stateBucket?: string
  reason?: string
  message?: string
  artifacts?: string[]
  createdAt?: string
}

export interface ImprovementReviewContext {
  targetAgentId?: string
  reviewer?: string
  evalCase?: EvalCase
  routeHistory?: ImprovementRouteRecord[]
}

export interface ImprovementApprovalBoundary {
  autoDeploymentEnabled: boolean
  humanReviewRequired: boolean
  blockedActions: string[]
  reviewRequiredProposalIds: string[]
  notes: string[]
}

export interface ImprovementReviewBundle extends ImprovementBaseSchema {
  reviewId: string
  targetAgentId: string
  reviewSummary: string
  evalCase: EvalCase
  evalResult: EvalResult
  findings: ImprovementFinding[]
  promptProposals: PromptRevisionProposal[]
  routerProposals: RouterRevisionProposal[]
  schemaProposals: SchemaRevisionProposal[]
  proposalQueue: ImprovementReviewProposalItem[]
  approvalDecisions: ApprovalDecision[]
  reviewState: ImprovementReviewState
  approvalBoundary: ImprovementApprovalBoundary
}
