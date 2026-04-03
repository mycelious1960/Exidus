import type {
  ActionPlan,
  ArchetypeProfile,
  AssessmentAnswers,
  AssessmentSignals,
  ClarityReport,
  DestinationResearchReport,
  FitComparisonReport,
  ReadinessProfile,
  ReportRevision,
  UserProfile,
} from "../../types/exidus-schema.ts"
import type {
  GuidanceSummary,
  RouterDecision,
} from "../../types/exidus-router.ts"
import type {
  ApprovalDecision,
  DeploymentRecord,
  EvalCase,
  EvalResult,
  ImprovementFinding,
  ImprovementReviewBundle,
  ImprovementReviewContext,
  PromptRevisionProposal,
  RouterRevisionProposal,
  SchemaRevisionProposal,
} from "../../types/exidus-improvement-schema.ts"

export type ExidusAgentId =
  | "clarity-engine"
  | "guide-agent"
  | "destination-research-agent"
  | "fit-comparison-agent"
  | "action-planning-agent"
  | "report-refinement-agent"
  | "improvement-agent"
  | "router-orchestrator"

export type ExidusAgentRole =
  | "core-engine"
  | "specialist-agent"
  | "internal-improvement-agent"
  | "orchestrator"

export interface AgentManifestEntry {
  id: ExidusAgentId
  name: string
  role: ExidusAgentRole
  promptFile: string
  specFile: string
  inputs: string[]
  outputs: string[]
  downstream: ExidusAgentId[]
}

export interface AgentManifest {
  manifestVersion: string
  system: string
  description: string
  sharedObjectsDoc: string
  orchestrationDoc: string
  agents: AgentManifestEntry[]
}

export interface RuntimeArtifacts {
  userProfile?: UserProfile
  assessmentAnswers?: AssessmentAnswers
  assessmentSignals?: AssessmentSignals
  readinessProfile?: ReadinessProfile
  archetypeProfile?: ArchetypeProfile
  clarityReport?: ClarityReport
  guidanceSummary?: GuidanceSummary
  destinationResearchReports?: DestinationResearchReport[]
  fitComparisonReport?: FitComparisonReport
  actionPlan?: ActionPlan
  reportRevision?: ReportRevision
  improvementContext?: ImprovementReviewContext
  improvementReview?: ImprovementReviewBundle
  improvementFindings?: ImprovementFinding[]
  evalCase?: EvalCase
  evalResult?: EvalResult
  promptRevisionProposals?: PromptRevisionProposal[]
  routerRevisionProposals?: RouterRevisionProposal[]
  schemaRevisionProposals?: SchemaRevisionProposal[]
  approvalDecisions?: ApprovalDecision[]
  deploymentRecords?: DeploymentRecord[]
}

export interface AgentInvocation {
  agentId: ExidusAgentId
  userIntent?: string
  artifacts: RuntimeArtifacts
}

export interface AgentInvocationResult {
  agentId: ExidusAgentId
  status: "completed" | "scaffolded"
  message: string
  artifacts: RuntimeArtifacts
}

export interface RegisteredAgent {
  manifest: AgentManifestEntry
  prompt: string
  invoke: (invocation: AgentInvocation) => Promise<AgentInvocationResult>
}

export interface RouterRuntimeInput {
  userIntent?: string
  artifacts: RuntimeArtifacts
}

export interface RouterRuntimeResult {
  decision: RouterDecision
  stateBucket: string
}
