import crypto from "node:crypto"

import { SCHEMA_VERSION } from "../config.ts"
import type {
  ApprovalDecision,
  ImprovementProposalType,
  ImprovementReviewBundle,
  ImprovementReviewProposalItem,
  ImprovementReviewState,
  PromptRevisionProposal,
  ProposalStatus,
  RouterRevisionProposal,
  SchemaRevisionProposal,
} from "../../types/exidus-improvement-schema.ts"

type AnyProposal =
  | PromptRevisionProposal
  | RouterRevisionProposal
  | SchemaRevisionProposal

type DecisionInput = {
  proposalId: string
  decision: ApprovalDecision["decision"]
  reviewer: string
  rationale?: string
  constraints?: string[]
}

export function buildReviewTracking(input: {
  promptProposals: PromptRevisionProposal[]
  routerProposals: RouterRevisionProposal[]
  schemaProposals: SchemaRevisionProposal[]
  approvalDecisions?: ApprovalDecision[]
}): {
  proposalQueue: ImprovementReviewProposalItem[]
  approvalDecisions: ApprovalDecision[]
  reviewState: ImprovementReviewState
} {
  const approvalDecisions = dedupeDecisions(input.approvalDecisions ?? [])
  const decisionByProposalId = new Map(
    approvalDecisions.map((decision) => [decision.proposalId, decision]),
  )

  const proposalQueue = [
    ...input.promptProposals.map((proposal) =>
      buildProposalItem("prompt", proposal, decisionByProposalId.get(proposal.proposalId)),
    ),
    ...input.routerProposals.map((proposal) =>
      buildProposalItem("router", proposal, decisionByProposalId.get(proposal.proposalId)),
    ),
    ...input.schemaProposals.map((proposal) =>
      buildProposalItem("schema", proposal, decisionByProposalId.get(proposal.proposalId)),
    ),
  ]

  return {
    proposalQueue,
    approvalDecisions,
    reviewState: buildReviewState(proposalQueue),
  }
}

export function createApprovalDecision(
  reviewId: string,
  input: DecisionInput,
): ApprovalDecision {
  const now = new Date().toISOString()

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    decisionId: `approval-${crypto.randomUUID()}`,
    reviewId,
    proposalId: input.proposalId,
    decision: input.decision,
    reviewer: input.reviewer,
    rationale: input.rationale,
    constraints: input.constraints?.length ? input.constraints : undefined,
  }
}

export function applyApprovalDecision(
  review: ImprovementReviewBundle,
  decision: ApprovalDecision,
): ImprovementReviewBundle {
  const now = new Date().toISOString()
  const nextPromptProposals = review.promptProposals.map((proposal) =>
    proposal.proposalId === decision.proposalId
      ? { ...proposal, status: mapDecisionToProposalStatus(decision.decision), updatedAt: now }
      : proposal,
  )
  const nextRouterProposals = review.routerProposals.map((proposal) =>
    proposal.proposalId === decision.proposalId
      ? { ...proposal, status: mapDecisionToProposalStatus(decision.decision), updatedAt: now }
      : proposal,
  )
  const nextSchemaProposals = review.schemaProposals.map((proposal) =>
    proposal.proposalId === decision.proposalId
      ? { ...proposal, status: mapDecisionToProposalStatus(decision.decision), updatedAt: now }
      : proposal,
  )
  const tracking = buildReviewTracking({
    promptProposals: nextPromptProposals,
    routerProposals: nextRouterProposals,
    schemaProposals: nextSchemaProposals,
    approvalDecisions: [...review.approvalDecisions, { ...decision, updatedAt: now }],
  })

  return {
    ...review,
    updatedAt: now,
    promptProposals: nextPromptProposals,
    routerProposals: nextRouterProposals,
    schemaProposals: nextSchemaProposals,
    proposalQueue: tracking.proposalQueue,
    approvalDecisions: tracking.approvalDecisions,
    reviewState: tracking.reviewState,
    approvalBoundary: {
      ...review.approvalBoundary,
      humanReviewRequired: tracking.reviewState.pendingCount > 0,
      reviewRequiredProposalIds: tracking.reviewState.undecidedProposalIds,
      notes: updateBoundaryNotes(review.approvalBoundary.notes, tracking.reviewState),
    },
  }
}

function buildProposalItem(
  proposalType: ImprovementProposalType,
  proposal: AnyProposal,
  decision?: ApprovalDecision,
): ImprovementReviewProposalItem {
  return {
    proposalId: proposal.proposalId,
    proposalType,
    title: buildProposalTitle(proposalType, proposal),
    targetLabel: buildTargetLabel(proposalType, proposal),
    targetArtifact: getTargetArtifact(proposalType, proposal),
    riskLevel: proposal.riskLevel,
    humanApprovalRequired: proposal.humanApprovalRequired,
    status: proposal.status,
    problemSummary: proposal.problemSummary,
    proposedChangeSummary: proposal.proposedChangeSummary,
    expectedBenefit: proposal.expectedBenefit,
    evidenceRefs: proposal.evidenceRefs,
    relatedFindingIds: proposal.sourceFindingId ? [proposal.sourceFindingId] : [],
    decision,
  }
}

function buildProposalTitle(proposalType: ImprovementProposalType, proposal: AnyProposal) {
  switch (proposalType) {
    case "prompt":
      return "Prompt revision proposal"
    case "router":
      return "Router revision proposal"
    case "schema":
      return "Schema revision proposal"
  }
}

function buildTargetLabel(proposalType: ImprovementProposalType, proposal: AnyProposal) {
  if (proposalType === "prompt" && "agentId" in proposal) {
    return humanizeId(proposal.agentId)
  }
  if (proposalType === "router") {
    return "Router / orchestrator"
  }

  return humanizeId("currentSchemaArtifact" in proposal ? proposal.currentSchemaArtifact : "")
}

function getTargetArtifact(proposalType: ImprovementProposalType, proposal: AnyProposal) {
  if (proposalType === "prompt" && "currentPromptFile" in proposal) {
    return proposal.currentPromptFile
  }
  if (proposalType === "router" && "currentRouterArtifact" in proposal) {
    return proposal.currentRouterArtifact
  }

  return "currentSchemaArtifact" in proposal ? proposal.currentSchemaArtifact : ""
}

function buildReviewState(
  proposalQueue: ImprovementReviewProposalItem[],
): ImprovementReviewState {
  const decided = proposalQueue.filter((item) => item.status !== "pending-review")
  const pending = proposalQueue.filter((item) => item.status === "pending-review")
  const approved = proposalQueue.filter((item) => item.status === "approved")
  const approvedWithNotes = proposalQueue.filter(
    (item) => item.status === "approved-with-notes",
  )
  const rejected = proposalQueue.filter((item) => item.status === "rejected")
  const lastDecisionAt = decided
    .map((item) => item.decision?.updatedAt || item.decision?.createdAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)

  return {
    status: resolveReviewStatus(proposalQueue.length, pending.length, decided.length),
    totalProposals: proposalQueue.length,
    pendingCount: pending.length,
    approvedCount: approved.length,
    approvedWithNotesCount: approvedWithNotes.length,
    rejectedCount: rejected.length,
    decidedProposalIds: decided.map((item) => item.proposalId),
    undecidedProposalIds: pending.map((item) => item.proposalId),
    lastDecisionAt,
  }
}

function resolveReviewStatus(total: number, pending: number, decided: number) {
  if (total === 0) {
    return "no-proposals"
  }
  if (pending === total) {
    return "pending-human-review"
  }
  if (pending === 0 && decided === total) {
    return "review-complete"
  }

  return "partially-reviewed"
}

function mapDecisionToProposalStatus(
  decision: ApprovalDecision["decision"],
): ProposalStatus {
  if (decision === "approved-with-notes") {
    return "approved-with-notes"
  }

  return decision
}

function dedupeDecisions(decisions: ApprovalDecision[]) {
  const latestByProposalId = new Map<string, ApprovalDecision>()

  for (const decision of decisions) {
    latestByProposalId.set(decision.proposalId, decision)
  }

  return Array.from(latestByProposalId.values())
}

function updateBoundaryNotes(
  currentNotes: string[],
  reviewState: ImprovementReviewState,
) {
  const notes = currentNotes.filter((note) =>
    !note.startsWith("Review status:"),
  )

  notes.push(
    reviewState.totalProposals > 0
      ? `Review status: ${reviewState.pendingCount} proposal(s) still need an explicit human decision in this review.`
      : "Review status: no draft proposals were generated in this pass.",
  )

  return notes
}

function humanizeId(value: string) {
  return value
    .replace(/[-_/]+/g, " ")
    .replace(/\.ts$/i, "")
    .trim()
}
