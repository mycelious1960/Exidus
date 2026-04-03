import crypto from "node:crypto"

import type {
  ApprovalDecision,
  DeploymentRecord,
  EvalCase,
  EvalResult,
  ImprovementFinding,
  PromptRevisionProposal,
  RouterRevisionProposal,
  SchemaRevisionProposal,
} from "../../types/exidus-improvement-schema.ts"
import { SCHEMA_VERSION } from "../config.ts"

function baseImprovementObject() {
  const now = new Date().toISOString()

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
  }
}

export function createImprovementFinding(summary: string): ImprovementFinding {
  return {
    ...baseImprovementObject(),
    findingId: `finding-${crypto.randomUUID()}`,
    sourceType: "runtime-log",
    severity: "medium",
    category: "other",
    affectedAgentIds: [],
    summary,
    evidenceRefs: [],
  }
}

export function createEvalCase(title: string, inputs: Record<string, unknown>): EvalCase {
  return {
    ...baseImprovementObject(),
    evalCaseId: `eval-case-${crypto.randomUUID()}`,
    title,
    description: "Placeholder eval case for future runtime verification.",
    tags: ["placeholder"],
    targetAgentIds: ["clarity-engine"],
    inputs,
    expectedQualities: ["coherent", "structured", "grounded"],
    disallowedBehaviors: ["unsupported-claim", "prompt-only reasoning"],
  }
}

export function createEvalResult(evalCaseId: string, agentId: string): EvalResult {
  return {
    ...baseImprovementObject(),
    evalResultId: `eval-result-${crypto.randomUUID()}`,
    evalCaseId,
    agentId,
    artifactVersion: SCHEMA_VERSION,
    outcome: "partial",
    scores: {},
    summary: "Placeholder eval result. Automated scoring is not built yet.",
    findings: [],
  }
}

export function createPromptRevisionProposal(agentId: string): PromptRevisionProposal {
  return {
    ...baseImprovementObject(),
    proposalId: `prompt-proposal-${crypto.randomUUID()}`,
    agentId,
    currentPromptFile: "",
    problemSummary: "Placeholder prompt revision proposal.",
    evidenceRefs: [],
    proposedChangeSummary: "No proposed change yet.",
    expectedBenefit: "Structural support for future improvement loop.",
    riskLevel: "low",
    humanApprovalRequired: true,
    status: "draft",
  }
}

export function createRouterRevisionProposal(): RouterRevisionProposal {
  return {
    ...baseImprovementObject(),
    proposalId: `router-proposal-${crypto.randomUUID()}`,
    currentRouterArtifact: "runtime/router/router.ts",
    problemSummary: "Placeholder router revision proposal.",
    evidenceRefs: [],
    proposedChangeSummary: "No change proposed yet.",
    expectedBenefit: "Enables structured router revision records later.",
    riskLevel: "low",
    humanApprovalRequired: true,
    status: "draft",
  }
}

export function createSchemaRevisionProposal(): SchemaRevisionProposal {
  return {
    ...baseImprovementObject(),
    proposalId: `schema-proposal-${crypto.randomUUID()}`,
    currentSchemaArtifact: "types/exidus-schema.ts",
    changeType: "clarification",
    problemSummary: "Placeholder schema revision proposal.",
    evidenceRefs: [],
    proposedChangeSummary: "No change proposed yet.",
    expectedBenefit: "Enables structured schema revision records later.",
    riskLevel: "low",
    humanApprovalRequired: true,
    status: "draft",
  }
}

export function createApprovalDecision(proposalId: string): ApprovalDecision {
  return {
    ...baseImprovementObject(),
    decisionId: `approval-${crypto.randomUUID()}`,
    proposalId,
    decision: "approved-with-notes",
    reviewer: "human-required",
    rationale: "Placeholder approval path.",
  }
}

export function createDeploymentRecord(artifactName: string): DeploymentRecord {
  return {
    ...baseImprovementObject(),
    deploymentId: `deployment-${crypto.randomUUID()}`,
    artifactType: "other",
    artifactName,
    newVersion: SCHEMA_VERSION,
    notes: ["Placeholder deployment record."],
  }
}
