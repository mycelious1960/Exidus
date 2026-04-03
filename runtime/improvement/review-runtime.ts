import crypto from "node:crypto"

import type {
  EvalCase,
  EvalResult,
  ImprovementFinding,
  ImprovementFindingCategory,
  ImprovementReviewBundle,
  PromptRevisionProposal,
  RouterRevisionProposal,
  SchemaRevisionProposal,
} from "../../types/exidus-improvement-schema.ts"
import { SCHEMA_VERSION } from "../config.ts"
import { buildReviewTracking } from "./review-workflow.ts"
import type {
  AgentInvocation,
  AgentInvocationResult,
  AgentManifest,
  AgentManifestEntry,
  ExidusAgentId,
  RuntimeArtifacts,
} from "../core/types.ts"
import type { AgentRegistry } from "../core/agent-registry.ts"

const GENERIC_PHRASES = [
  "placeholder",
  "scaffold",
  "no change proposed yet",
  "structural support for future",
  "automation remains placeholder-only",
  "not built yet",
]

const BLOCKED_ACTIONS = [
  "live prompt mutation",
  "router mutation without review",
  "schema-breaking auto-update",
  "automatic deployment",
  "safety-boundary rewriting",
]

type ReviewDependency = {
  manifest: AgentManifest
  registry: AgentRegistry
}

type ArtifactSignals = {
  textBlocks: string[]
  structuredSignals: string[]
  evidenceRefs: string[]
  missingStructure: string[]
  genericSignals: string[]
  nextStepSignals: string[]
  approvalSignals: string[]
}

export function createImprovementAgentInvoker(dependency: ReviewDependency) {
  return async function invokeImprovementAgent(
    invocation: AgentInvocation,
  ): Promise<AgentInvocationResult> {
    const review = await runImprovementReview(dependency, invocation)

    return {
      agentId: "improvement-agent",
      status: "completed",
      message: review.reviewSummary,
      artifacts: {
        ...invocation.artifacts,
        evalCase: review.evalCase,
        evalResult: review.evalResult,
        improvementFindings: review.findings,
        promptRevisionProposals: review.promptProposals,
        routerRevisionProposals: review.routerProposals,
        schemaRevisionProposals: review.schemaProposals,
        improvementReview: review,
      },
    }
  }
}

async function runImprovementReview(
  dependency: ReviewDependency,
  invocation: AgentInvocation,
): Promise<ImprovementReviewBundle> {
  const targetAgentId = resolveTargetAgentId(invocation.artifacts)
  const evalCase =
    invocation.artifacts.improvementContext?.evalCase ??
    buildDefaultEvalCase(targetAgentId, invocation.artifacts)
  const evalResult = await runEvalCase(dependency, targetAgentId, evalCase, invocation.artifacts)
  const findings = generateFindings({
    targetAgentId,
    artifacts: invocation.artifacts,
    evalCase,
    evalResult,
  })
  const proposals = generateProposals({
    manifest: dependency.manifest,
    targetAgentId,
    findings,
    artifacts: invocation.artifacts,
  })
  const proposalIds = [
    ...proposals.promptProposals.map((proposal) => proposal.proposalId),
    ...proposals.routerProposals.map((proposal) => proposal.proposalId),
    ...proposals.schemaProposals.map((proposal) => proposal.proposalId),
  ]
  const summary = buildReviewSummary(targetAgentId, evalResult, findings, proposalIds.length)
  const reviewId = `review-${crypto.randomUUID()}`
  const tracking = buildReviewTracking({
    promptProposals: proposals.promptProposals,
    routerProposals: proposals.routerProposals,
    schemaProposals: proposals.schemaProposals,
  })

  return {
    ...baseImprovementObject(),
    reviewId,
    targetAgentId,
    reviewSummary: summary,
    evalCase,
    evalResult,
    findings,
    promptProposals: proposals.promptProposals,
    routerProposals: proposals.routerProposals,
    schemaProposals: proposals.schemaProposals,
    proposalQueue: tracking.proposalQueue,
    approvalDecisions: tracking.approvalDecisions,
    reviewState: tracking.reviewState,
    approvalBoundary: {
      autoDeploymentEnabled: false,
      humanReviewRequired: tracking.reviewState.pendingCount > 0,
      blockedActions: BLOCKED_ACTIONS,
      reviewRequiredProposalIds: tracking.reviewState.undecidedProposalIds,
      notes: [
        "Improvement output is draft-only. No runtime artifact, prompt, router rule, or schema is mutated here.",
        "Any proposal with trust, routing, or schema implications requires explicit human approval before versioning.",
        tracking.reviewState.totalProposals > 0
          ? `Review status: ${tracking.reviewState.pendingCount} proposal(s) are waiting for an explicit human decision.`
          : "Review status: no draft proposals were generated in this pass.",
      ],
    },
  }
}

function baseImprovementObject() {
  const now = new Date().toISOString()

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
  }
}

function resolveTargetAgentId(artifacts: RuntimeArtifacts): ExidusAgentId {
  const requested = artifacts.improvementContext?.targetAgentId

  if (requested && requested !== "improvement-agent") {
    return requested as ExidusAgentId
  }

  if (artifacts.reportRevision) {
    return "report-refinement-agent"
  }
  if (artifacts.actionPlan) {
    return "action-planning-agent"
  }
  if (artifacts.fitComparisonReport) {
    return "fit-comparison-agent"
  }
  if (artifacts.destinationResearchReports?.length) {
    return "destination-research-agent"
  }
  if (artifacts.guidanceSummary) {
    return "guide-agent"
  }

  return "clarity-engine"
}

function buildDefaultEvalCase(
  targetAgentId: ExidusAgentId,
  artifacts: RuntimeArtifacts,
): EvalCase {
  const signals = extractArtifactSignals(targetAgentId, artifacts)
  const description =
    targetAgentId === "clarity-engine"
      ? "Check whether the baseline clarity layer is specific, structured, grounded in the current profile, and explicit about the next move."
      : `Check whether ${targetAgentId} produces a bounded, structured, and non-generic artifact for the current runtime state.`

  return {
    ...baseImprovementObject(),
    evalCaseId: `eval-case-${crypto.randomUUID()}`,
    title: `${humanizeAgentId(targetAgentId)} bounded review`,
    description,
    tags: [
      "bounded-review",
      "internal-improvement",
      `target:${targetAgentId}`,
    ],
    targetAgentIds: [targetAgentId],
    inputs: selectEvalInputs(targetAgentId, artifacts),
    expectedQualities: [
      "coherent",
      "structured",
      "grounded",
      "non-generic",
      "explicit next step",
    ],
    disallowedBehaviors: [
      "placeholder-language",
      "silent-mutation",
      "unsupported-claim",
      "missing-next-step",
      ...signals.genericSignals.slice(0, 1),
    ].filter(Boolean),
    notes: [
      "This eval is heuristic and bounded to current runtime artifacts.",
      "It is intended to support review, not autonomous deployment.",
    ],
  }
}

async function runEvalCase(
  dependency: ReviewDependency,
  targetAgentId: ExidusAgentId,
  evalCase: EvalCase,
  artifacts: RuntimeArtifacts,
): Promise<EvalResult> {
  if (targetAgentId === "improvement-agent") {
    throw new Error("The improvement agent cannot evaluate itself in this bounded runtime path.")
  }

  const result = await dependency.registry.invoke({
    agentId: targetAgentId,
    userIntent: `Internal bounded eval for ${targetAgentId}.`,
    artifacts: stripImprovementArtifacts(artifacts),
  })
  const signals = extractArtifactSignals(targetAgentId, result.artifacts)
  const requestedSignals = extractInputSignals(evalCase.inputs)
  const placeholderDetected = hasPlaceholderLanguage([
    result.message,
    ...signals.textBlocks,
  ])
  const structureCoverage = computeStructureCoverage(signals)
  const nextStepCoverage = clamp(
    signals.nextStepSignals.length > 0 ? 1 : 0.3,
    0,
    1,
  )
  const specificityCoverage = computeSpecificityCoverage(signals, requestedSignals)
  const safetyCoverage = computeSafetyCoverage(targetAgentId, result.artifacts)
  const faithfulnessCoverage = computeFaithfulnessCoverage(signals, requestedSignals)
  const usefulness = average([structureCoverage, nextStepCoverage, specificityCoverage])
  const coherence = average([
    structureCoverage,
    placeholderDetected ? 0.2 : 0.9,
    result.status === "completed" ? 0.9 : 0.4,
  ])
  const nonGenericness = average([
    specificityCoverage,
    placeholderDetected ? 0.15 : 0.9,
    signals.genericSignals.length ? 0.45 : 0.85,
  ])
  const safety = average([safetyCoverage, placeholderDetected ? 0.4 : 0.9])
  const faithfulness = average([faithfulnessCoverage, specificityCoverage])
  const routingAccuracy = computeRoutingAccuracy(targetAgentId, artifacts)
  const averageScore = average([
    usefulness,
    coherence,
    faithfulness,
    safety,
    nonGenericness,
    routingAccuracy ?? 0.7,
  ])
  const outcome =
    averageScore >= 0.75
      ? "pass"
      : averageScore >= 0.55
        ? "partial"
        : "fail"
  const findings = [
    placeholderDetected ? "Placeholder language detected in evaluated output." : null,
    signals.missingStructure.length
      ? `Missing or thin structure: ${signals.missingStructure.join(", ")}.`
      : null,
    signals.nextStepSignals.length === 0
      ? "No explicit next-step or recommendation signal was detected."
      : null,
    specificityCoverage < 0.55
      ? "Output appears weakly tied to concrete profile or runtime details."
      : null,
    safetyCoverage < 0.6
      ? "Boundary language is thin for this artifact type."
      : null,
  ].filter((value): value is string => Boolean(value))

  return {
    ...baseImprovementObject(),
    evalResultId: `eval-result-${crypto.randomUUID()}`,
    evalCaseId: evalCase.evalCaseId,
    agentId: targetAgentId,
    artifactVersion: SCHEMA_VERSION,
    outcome,
    scores: {
      usefulness: roundScore(usefulness),
      coherence: roundScore(coherence),
      faithfulness: roundScore(faithfulness),
      safety: roundScore(safety),
      routingAccuracy: routingAccuracy === undefined ? undefined : roundScore(routingAccuracy),
      nonGenericness: roundScore(nonGenericness),
    },
    summary: buildEvalSummary(targetAgentId, outcome, {
      usefulness,
      coherence,
      faithfulness,
      safety,
      nonGenericness,
      routingAccuracy,
    }),
    findings,
    evidenceRefs: buildEvidenceRefs(targetAgentId, artifacts, signals),
  }
}

function generateFindings(input: {
  targetAgentId: ExidusAgentId
  artifacts: RuntimeArtifacts
  evalCase: EvalCase
  evalResult: EvalResult
}): ImprovementFinding[] {
  const findings: ImprovementFinding[] = []
  const evidenceRefs = input.evalResult.evidenceRefs ?? []

  if (input.evalResult.outcome !== "pass") {
    findings.push(
      createFinding({
        sourceType: "eval",
        severity: input.evalResult.outcome === "fail" ? "high" : "medium",
        category: inferFindingCategory(input.evalResult.findings),
        affectedAgentIds: [input.targetAgentId],
        summary: input.evalResult.summary,
        evidenceRefs,
        notes: input.evalResult.findings,
        suggestedNextAction:
          "Review the evaluated artifact and tighten the instructions or structure before treating this path as stable.",
      }),
    )
  }

  if (
    input.evalResult.outcome === "pass" &&
    (input.evalResult.scores.faithfulness ?? 1) < 0.75
  ) {
    findings.push(
      createFinding({
        sourceType: "eval",
        severity: "low",
        category: "prompt-drift",
        affectedAgentIds: [input.targetAgentId],
        summary:
          "The evaluated output is usable overall, but its weakest dimension is faithfulness, so the prompt may need stricter grounding to the exact upstream changes and evidence used.",
        evidenceRefs,
        notes: [
          `Faithfulness score: ${input.evalResult.scores.faithfulness}.`,
          "This is a bounded review signal, not a production failure.",
        ],
        suggestedNextAction:
          "Tighten the prompt so it explicitly references which upstream artifact changes are allowed to drive the output.",
      }),
    )
  }

  if (
    input.artifacts.clarityReport &&
    input.artifacts.reportRevision &&
    (input.artifacts.reportRevision.whatChanged?.length ?? 0) > 0 &&
    (input.artifacts.clarityReport.contradictionFlags?.length ?? 0) === 0
  ) {
    findings.push(
      createFinding({
        sourceType: "mixed",
        severity: "medium",
        category: "contradiction-miss",
        affectedAgentIds: ["clarity-engine", "report-refinement-agent"],
        summary:
          "Downstream refinement surfaced new tensions that the baseline clarity report did not name explicitly.",
        evidenceRefs: [
          "artifact:clarityReport.contradictionFlags",
          "artifact:reportRevision.whatChanged",
        ],
        notes: input.artifacts.reportRevision.whatChanged?.slice(0, 3),
        suggestedNextAction:
          "Review whether the baseline clarity prompt should name likely tradeoffs earlier when the downstream chain later surfaces them.",
      }),
    )
  }

  if (
    input.artifacts.actionPlan &&
    input.artifacts.fitComparisonReport &&
    input.artifacts.fitComparisonReport.routeSignals?.readyForActionPlanning === false
  ) {
    findings.push(
      createFinding({
        sourceType: "runtime-log",
        severity: "low",
        category: "routing-error",
        affectedAgentIds: ["router-orchestrator", "action-planning-agent"],
        summary:
          "Planning can run even when shortlist stability is still marked as not ready, so the runtime depends on wording rather than an explicit router safeguard.",
        evidenceRefs: [
          "artifact:fitComparisonReport.routeSignals.readyForActionPlanning",
          "artifact:actionPlan.planningMode",
        ],
        notes: [
          "This is bounded as a review note, not a claim that planning should be blocked entirely.",
        ],
        suggestedNextAction:
          "Consider a router note that marks early planning as provisional preparation-first guidance whenever shortlist stability is still low.",
      }),
    )
  }

  if (
    input.artifacts.reportRevision &&
    input.artifacts.reportRevision.changes?.prioritiesChanged?.length
  ) {
    findings.push(
      createFinding({
        sourceType: "mixed",
        severity: "low",
        category: "schema-gap",
        affectedAgentIds: ["report-refinement-agent"],
        summary:
          "Priority movement is currently captured as prose strings, which makes machine review harder than it needs to be.",
        evidenceRefs: ["artifact:reportRevision.changes.prioritiesChanged"],
        notes: [
          "The revision contains a useful narrative diff, but not a normalized before/after structure for automation.",
        ],
        suggestedNextAction:
          "Consider an additive schema extension for structured priority deltas and tension provenance.",
      }),
    )
  }

  return dedupeFindings(findings)
}

function generateProposals(input: {
  manifest: AgentManifest
  targetAgentId: ExidusAgentId
  findings: ImprovementFinding[]
  artifacts: RuntimeArtifacts
}): {
  promptProposals: PromptRevisionProposal[]
  routerProposals: RouterRevisionProposal[]
  schemaProposals: SchemaRevisionProposal[]
} {
  const promptProposals: PromptRevisionProposal[] = []
  const routerProposals: RouterRevisionProposal[] = []
  const schemaProposals: SchemaRevisionProposal[] = []
  const manifestById = new Map(
    input.manifest.agents.map((entry) => [entry.id, entry] as const),
  )

  for (const finding of input.findings) {
    if (
      finding.category === "contradiction-miss" ||
      finding.category === "vagueness" ||
      finding.category === "weak-structure" ||
      finding.category === "overlong-output" ||
      finding.category === "prompt-drift"
    ) {
      const promptTarget = finding.affectedAgentIds.find((agentId) => manifestById.has(agentId))
      if (promptTarget) {
        promptProposals.push(
          createPromptProposal(manifestById.get(promptTarget)!, finding),
        )
      }
    }

    if (finding.category === "routing-error") {
      routerProposals.push(createRouterProposal(finding))
    }

    if (finding.category === "schema-gap") {
      schemaProposals.push(createSchemaProposal(finding))
    }
  }

  return {
    promptProposals: dedupeById(promptProposals, (proposal) => `${proposal.agentId}:${proposal.problemSummary}`),
    routerProposals: dedupeById(routerProposals, (proposal) => proposal.problemSummary),
    schemaProposals: dedupeById(schemaProposals, (proposal) => proposal.problemSummary),
  }
}

function createFinding(input: {
  sourceType: ImprovementFinding["sourceType"]
  severity: ImprovementFinding["severity"]
  category: ImprovementFindingCategory
  affectedAgentIds: string[]
  summary: string
  evidenceRefs: string[]
  notes?: string[]
  suggestedNextAction?: string
}): ImprovementFinding {
  return {
    ...baseImprovementObject(),
    findingId: `finding-${crypto.randomUUID()}`,
    sourceType: input.sourceType,
    severity: input.severity,
    category: input.category,
    affectedAgentIds: input.affectedAgentIds,
    summary: input.summary,
    evidenceRefs: input.evidenceRefs,
    notes: input.notes,
    suggestedNextAction: input.suggestedNextAction,
  }
}

function createPromptProposal(
  entry: AgentManifestEntry,
  finding: ImprovementFinding,
): PromptRevisionProposal {
  return {
    ...baseImprovementObject(),
    proposalId: `prompt-proposal-${crypto.randomUUID()}`,
    sourceFindingId: finding.findingId,
    agentId: entry.id,
    currentPromptFile: entry.promptFile,
    problemSummary: finding.summary,
    evidenceRefs: finding.evidenceRefs,
    proposedChangeSummary: buildPromptChangeSummary(entry.id, finding),
    expectedBenefit:
      "Tighter prompt guidance should improve specificity, structure, and earlier surfacing of decision-useful tensions without mutating production behavior automatically.",
    riskLevel: finding.severity === "high" ? "high" : "medium",
    humanApprovalRequired: true,
    status: "pending-review",
  }
}

function createRouterProposal(finding: ImprovementFinding): RouterRevisionProposal {
  return {
    ...baseImprovementObject(),
    proposalId: `router-proposal-${crypto.randomUUID()}`,
    sourceFindingId: finding.findingId,
    currentRouterArtifact: "runtime/router/router.ts",
    problemSummary: finding.summary,
    evidenceRefs: finding.evidenceRefs,
    proposedChangeSummary:
      "Add an explicit provisional-planning route note when planning is requested before shortlist stability is ready, instead of relying only on downstream wording.",
    expectedBenefit:
      "Makes router behavior easier to review and less dependent on implied planning semantics.",
    riskLevel: finding.severity,
    humanApprovalRequired: true,
    status: "pending-review",
  }
}

function createSchemaProposal(finding: ImprovementFinding): SchemaRevisionProposal {
  return {
    ...baseImprovementObject(),
    proposalId: `schema-proposal-${crypto.randomUUID()}`,
    sourceFindingId: finding.findingId,
    currentSchemaArtifact: "types/exidus-schema.ts",
    changeType: "additive",
    problemSummary: finding.summary,
    evidenceRefs: finding.evidenceRefs,
    proposedChangeSummary:
      "Add normalized revision-delta fields for priority changes and tension provenance so improvement review does not have to infer machine-meaning from prose strings alone.",
    expectedBenefit:
      "Improves auditability and eval coverage without introducing a breaking schema change.",
    riskLevel: finding.severity,
    humanApprovalRequired: true,
    status: "pending-review",
  }
}

function buildPromptChangeSummary(
  agentId: string,
  finding: ImprovementFinding,
): string {
  if (finding.category === "contradiction-miss") {
    return "Tighten instructions so the agent names likely tradeoffs and emerging tensions earlier when signals already imply them, while keeping those tensions explicitly provisional."
  }
  if (finding.category === "weak-structure") {
    return "Require a more explicit output structure with a visible next-step recommendation and fewer thin narrative sections."
  }
  if (finding.category === "vagueness") {
    return `Push ${agentId} to anchor more directly to concrete profile details, runtime artifacts, and evidence-linked wording instead of generalized synthesis.`
  }
  if (finding.category === "prompt-drift") {
    return "Require the output to cite which upstream artifacts changed, which ones stayed stable, and which exact evidence justifies the revision so the narrative stays tightly grounded."
  }

  return "Tighten the prompt around specificity, structure, and explicit next-step guidance, then rerun the bounded eval before any human review decision."
}

function extractArtifactSignals(
  targetAgentId: ExidusAgentId,
  artifacts: RuntimeArtifacts,
): ArtifactSignals {
  switch (targetAgentId) {
    case "clarity-engine":
      return extractClaritySignals(artifacts)
    case "guide-agent":
      return extractGuideSignals(artifacts)
    case "destination-research-agent":
      return extractDestinationSignals(artifacts)
    case "fit-comparison-agent":
      return extractComparisonSignals(artifacts)
    case "action-planning-agent":
      return extractPlanningSignals(artifacts)
    case "report-refinement-agent":
      return extractRefinementSignals(artifacts)
    case "router-orchestrator":
      return extractRouterSignals(artifacts)
    default:
      return emptySignals()
  }
}

function extractClaritySignals(artifacts: RuntimeArtifacts): ArtifactSignals {
  const report = artifacts.clarityReport
  if (!report) {
    return {
      ...emptySignals(),
      missingStructure: ["clarityReport"],
    }
  }

  return {
    textBlocks: [
      ...Object.values(report.summary || {}),
      ...(report.highlights || []),
      ...(report.contradictionFlags || []),
    ].filter((value): value is string => typeof value === "string" && value.length > 0),
    structuredSignals: [
      report.readinessProfile?.readinessLevel ?? "",
      report.archetypeProfile?.fitDirectionArchetype ?? "",
      ...(report.topPriorities || []),
      ...(report.nonNegotiables || []),
    ].filter(Boolean),
    evidenceRefs: [
      "artifact:clarityReport.summary",
      "artifact:clarityReport.topPriorities",
      "artifact:clarityReport.readinessProfile",
    ],
    missingStructure: [
      !report.summary?.nextStepSummary ? "summary.nextStepSummary" : "",
      !(report.highlights || []).length ? "highlights" : "",
      !report.readinessProfile ? "readinessProfile" : "",
    ].filter(Boolean),
    genericSignals: collectGenericSignals([
      ...Object.values(report.summary || {}),
      ...(report.highlights || []),
    ]),
    nextStepSignals: [report.summary?.nextStepSummary].filter(Boolean) as string[],
    approvalSignals: report.disclaimerFlags || [],
  }
}

function extractGuideSignals(artifacts: RuntimeArtifacts): ArtifactSignals {
  const guidance = artifacts.guidanceSummary
  if (!guidance) {
    return {
      ...emptySignals(),
      missingStructure: ["guidanceSummary"],
    }
  }

  return {
    textBlocks: [
      guidance.summary,
      guidance.explanation,
      ...(guidance.whatThisMeans || []),
      ...(guidance.whatMattersMostNow || []),
      ...(guidance.focusNext || []),
      ...(guidance.tensionNotes || []),
    ].filter(Boolean),
    structuredSignals: [
      guidance.mode,
      guidance.groundedIn?.readinessLevel ?? "",
      guidance.groundedIn?.fitDirectionArchetype ?? "",
      ...(guidance.groundedIn?.topPriorities || []),
    ].filter(Boolean),
    evidenceRefs: [
      "artifact:guidanceSummary.summary",
      "artifact:guidanceSummary.focusNext",
      "artifact:guidanceSummary.groundedIn",
    ],
    missingStructure: [
      !guidance.explanation ? "explanation" : "",
      !(guidance.focusNext || []).length ? "focusNext" : "",
      !guidance.suggestedNextMove ? "suggestedNextMove" : "",
    ].filter(Boolean),
    genericSignals: collectGenericSignals([
      guidance.summary,
      guidance.explanation,
      ...(guidance.keyTakeaways || []),
    ]),
    nextStepSignals: [guidance.suggestedNextMove].filter(Boolean) as string[],
    approvalSignals: [],
  }
}

function extractDestinationSignals(artifacts: RuntimeArtifacts): ArtifactSignals {
  const reports = artifacts.destinationResearchReports || []
  if (!reports.length) {
    return {
      ...emptySignals(),
      missingStructure: ["destinationResearchReports"],
    }
  }

  return {
    textBlocks: reports.flatMap((report) => [
      report.destination,
      report.quickFitSummary,
      report.recommendedNextStep,
      ...(report.recommendedNextQuestions || []),
      ...Object.values(report.sections || {}).flatMap((section) => [
        section?.summary,
        ...(section?.notes || []),
      ]),
    ].filter(Boolean)),
    structuredSignals: reports.flatMap((report) => [
      report.profileFitVerdict,
      report.confidence,
      ...(report.profileLens?.topPriorities || []),
    ].filter(Boolean)),
    evidenceRefs: reports.map((report) => `artifact:destinationResearchReport:${report.destination}`),
    missingStructure: reports.flatMap((report) => [
      !report.recommendedNextStep ? `${report.destination}.recommendedNextStep` : "",
      !(report.recommendedNextQuestions || []).length
        ? `${report.destination}.recommendedNextQuestions`
        : "",
      !report.sections?.costOfLiving ? `${report.destination}.sections.costOfLiving` : "",
    ].filter(Boolean)),
    genericSignals: collectGenericSignals(reports.flatMap((report) => [report.quickFitSummary])),
    nextStepSignals: reports.flatMap((report) => [report.recommendedNextStep].filter(Boolean)),
    approvalSignals: reports.flatMap((report) =>
      (report.sections?.taxImplications?.notes || []).filter((note) =>
        note.toLowerCase().includes("verify"),
      ),
    ),
  }
}

function extractComparisonSignals(artifacts: RuntimeArtifacts): ArtifactSignals {
  const report = artifacts.fitComparisonReport
  if (!report) {
    return {
      ...emptySignals(),
      missingStructure: ["fitComparisonReport"],
    }
  }

  return {
    textBlocks: [
      report.comparisonSummary,
      report.recommendedNextMove,
      ...(report.keyTradeoffs || []),
      ...(report.destinationComparisons || []).flatMap((entry) => [
        entry.destination,
        ...(entry.strengths || []),
        ...(entry.tensions || []),
        ...(entry.tradeoffs || []),
      ]),
    ].filter(Boolean),
    structuredSignals: [
      report.strongestFit ?? "",
      report.strongestPracticalFit ?? "",
      report.strongestEmotionalFit ?? "",
      ...(report.routeSignals?.needsMoreResearchOn || []),
    ].filter(Boolean),
    evidenceRefs: [
      "artifact:fitComparisonReport.comparisonSummary",
      "artifact:fitComparisonReport.routeSignals",
    ],
    missingStructure: [
      !report.recommendedNextMove ? "recommendedNextMove" : "",
      !(report.keyTradeoffs || []).length ? "keyTradeoffs" : "",
      !(report.destinationComparisons || []).length ? "destinationComparisons" : "",
    ].filter(Boolean),
    genericSignals: collectGenericSignals([
      report.comparisonSummary,
      ...(report.keyTradeoffs || []),
    ]),
    nextStepSignals: [report.recommendedNextMove].filter(Boolean) as string[],
    approvalSignals: [],
  }
}

function extractPlanningSignals(artifacts: RuntimeArtifacts): ArtifactSignals {
  const plan = artifacts.actionPlan
  if (!plan) {
    return {
      ...emptySignals(),
      missingStructure: ["actionPlan"],
    }
  }

  return {
    textBlocks: [
      plan.framingSummary,
      plan.stageSummary,
      ...(plan.priorities || []),
      ...(plan.notYet || []),
      ...(plan.sequencingNotes || []),
      ...(plan.actions || []).flatMap((action) => [
        action.title,
        action.description,
        action.rationale,
      ]),
    ].filter(Boolean),
    structuredSignals: [
      plan.planningMode,
      plan.destinationState,
      plan.readinessLevel,
      ...(plan.groundedIn?.topPriorities || []),
    ].filter(Boolean),
    evidenceRefs: [
      "artifact:actionPlan.framingSummary",
      "artifact:actionPlan.actions",
      "artifact:actionPlan.notYet",
    ],
    missingStructure: [
      !(plan.actions || []).length ? "actions" : "",
      !(plan.notYet || []).length ? "notYet" : "",
      !plan.suggestedNextExidusMove ? "suggestedNextExidusMove" : "",
    ].filter(Boolean),
    genericSignals: collectGenericSignals([
      plan.framingSummary,
      plan.stageSummary,
    ]),
    nextStepSignals: [plan.suggestedNextExidusMove].filter(Boolean) as string[],
    approvalSignals: plan.notYet || [],
  }
}

function extractRefinementSignals(artifacts: RuntimeArtifacts): ArtifactSignals {
  const revision = artifacts.reportRevision
  if (!revision) {
    return {
      ...emptySignals(),
      missingStructure: ["reportRevision"],
    }
  }

  return {
    textBlocks: [
      revision.revisionSummary,
      ...(revision.whatChanged || []),
      ...(revision.whatStayedTheSame || []),
      ...(revision.payAttentionNow || []),
      artifacts.clarityReport?.summary?.nextStepSummary || "",
    ].filter(Boolean),
    structuredSignals: [
      revision.revisionType,
      revision.significance,
      ...(revision.changes?.sectionsUpdated || []),
    ].filter(Boolean),
    evidenceRefs: [
      "artifact:reportRevision.revisionSummary",
      "artifact:reportRevision.whatChanged",
      "artifact:reportRevision.changes.sectionsUpdated",
    ],
    missingStructure: [
      !(revision.whatChanged || []).length ? "whatChanged" : "",
      !(revision.whatStayedTheSame || []).length ? "whatStayedTheSame" : "",
      !(revision.payAttentionNow || []).length ? "payAttentionNow" : "",
    ].filter(Boolean),
    genericSignals: collectGenericSignals([
      revision.revisionSummary,
      ...(revision.whatChanged || []),
    ]),
    nextStepSignals: revision.payAttentionNow || [],
    approvalSignals: artifacts.clarityReport?.disclaimerFlags || [],
  }
}

function extractRouterSignals(artifacts: RuntimeArtifacts): ArtifactSignals {
  const routeHistory = artifacts.improvementContext?.routeHistory || []

  return {
    textBlocks: routeHistory.flatMap((entry) => [
      entry.stage,
      entry.reason ?? "",
      entry.message ?? "",
    ]),
    structuredSignals: routeHistory.flatMap((entry) => [
      entry.target ?? "",
      entry.stateBucket ?? "",
      entry.confidence ?? "",
    ]),
    evidenceRefs: routeHistory.map((entry, index) => `route:${index}:${entry.stage}`),
    missingStructure: routeHistory.length ? [] : ["routeHistory"],
    genericSignals: collectGenericSignals(routeHistory.map((entry) => entry.reason ?? "")),
    nextStepSignals: [],
    approvalSignals: [],
  }
}

function emptySignals(): ArtifactSignals {
  return {
    textBlocks: [],
    structuredSignals: [],
    evidenceRefs: [],
    missingStructure: [],
    genericSignals: [],
    nextStepSignals: [],
    approvalSignals: [],
  }
}

function collectGenericSignals(textBlocks: string[]) {
  return textBlocks
    .filter((value) => hasPlaceholderLanguage([value]))
    .slice(0, 5)
}

function hasPlaceholderLanguage(textBlocks: string[]) {
  const combined = textBlocks.join(" ").toLowerCase()
  return GENERIC_PHRASES.some((phrase) => combined.includes(phrase))
}

function selectEvalInputs(targetAgentId: ExidusAgentId, artifacts: RuntimeArtifacts) {
  const baseArtifacts = stripImprovementArtifacts(artifacts)

  switch (targetAgentId) {
    case "clarity-engine":
      return {
        assessmentAnswers: baseArtifacts.assessmentAnswers,
        userProfile: baseArtifacts.userProfile,
      }
    case "guide-agent":
      return {
        userProfile: baseArtifacts.userProfile,
        clarityReport: baseArtifacts.clarityReport,
        readinessProfile: baseArtifacts.readinessProfile,
        archetypeProfile: baseArtifacts.archetypeProfile,
      }
    default:
      return baseArtifacts
  }
}

function stripImprovementArtifacts(artifacts: RuntimeArtifacts): RuntimeArtifacts {
  const {
    improvementContext: _improvementContext,
    improvementReview: _improvementReview,
    improvementFindings: _improvementFindings,
    evalCase: _evalCase,
    evalResult: _evalResult,
    promptRevisionProposals: _promptRevisionProposals,
    routerRevisionProposals: _routerRevisionProposals,
    schemaRevisionProposals: _schemaRevisionProposals,
    approvalDecisions: _approvalDecisions,
    deploymentRecords: _deploymentRecords,
    ...runtimeArtifacts
  } = artifacts

  return runtimeArtifacts
}

function extractInputSignals(inputs: Record<string, unknown>) {
  return flattenToStrings(inputs).map((value) => value.toLowerCase())
}

function flattenToStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value]
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)]
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenToStrings(item))
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => flattenToStrings(item))
  }

  return []
}

function computeStructureCoverage(signals: ArtifactSignals) {
  const structureSignals = signals.structuredSignals.length + signals.nextStepSignals.length
  const penalty = signals.missingStructure.length * 0.2
  return clamp((structureSignals >= 4 ? 0.9 : 0.5 + structureSignals * 0.1) - penalty, 0, 1)
}

function computeSpecificityCoverage(signals: ArtifactSignals, requestedSignals: string[]) {
  if (requestedSignals.length === 0) {
    return signals.textBlocks.length > 0 ? 0.8 : 0.4
  }

  const combined = [...signals.textBlocks, ...signals.structuredSignals]
    .join(" ")
    .toLowerCase()
  const matches = requestedSignals.filter((token) =>
    token.length >= 4 && combined.includes(token),
  )

  return clamp(
    (matches.length / Math.max(4, Math.min(requestedSignals.length, 12))) + 0.2,
    0,
    1,
  )
}

function computeFaithfulnessCoverage(signals: ArtifactSignals, requestedSignals: string[]) {
  const combined = [...signals.textBlocks, ...signals.structuredSignals]
    .join(" ")
    .toLowerCase()
  const criticalTokens = requestedSignals.filter((token) => token.length >= 6).slice(0, 10)

  if (!criticalTokens.length) {
    return 0.75
  }

  const matches = criticalTokens.filter((token) => combined.includes(token))
  return clamp(0.35 + matches.length / criticalTokens.length, 0, 1)
}

function computeSafetyCoverage(
  targetAgentId: ExidusAgentId,
  artifacts: RuntimeArtifacts,
) {
  if (targetAgentId === "destination-research-agent") {
    const notes = (artifacts.destinationResearchReports || []).flatMap((report) => [
      ...(report.sections?.taxImplications?.notes || []),
      ...(report.sections?.visaImmigration?.notes || []),
    ])
    return notes.some((note) => note.toLowerCase().includes("verify")) ? 0.9 : 0.5
  }

  if (targetAgentId === "action-planning-agent") {
    return artifacts.actionPlan?.notYet?.some((note) => note.toLowerCase().includes("not legal"))
      ? 0.95
      : 0.55
  }

  if (targetAgentId === "clarity-engine" || targetAgentId === "report-refinement-agent") {
    return (artifacts.clarityReport?.disclaimerFlags?.length ?? 0) > 0 ? 0.9 : 0.55
  }

  return 0.75
}

function computeRoutingAccuracy(
  targetAgentId: ExidusAgentId,
  artifacts: RuntimeArtifacts,
) {
  if (
    targetAgentId === "action-planning-agent" &&
    artifacts.fitComparisonReport?.routeSignals?.readyForActionPlanning === false
  ) {
    return 0.55
  }

  const routeHistory = artifacts.improvementContext?.routeHistory || []
  if (!routeHistory.length) {
    return undefined
  }

  const lastRoute = routeHistory[routeHistory.length - 1]
  return lastRoute.target?.toLowerCase().includes(targetAgentId.split("-")[0]) ? 0.9 : 0.7
}

function buildEvalSummary(
  targetAgentId: ExidusAgentId,
  outcome: EvalResult["outcome"],
  scores: {
    usefulness: number
    coherence: number
    faithfulness: number
    safety: number
    nonGenericness: number
    routingAccuracy?: number
  },
) {
  const weakest = Object.entries(scores)
    .filter(([, value]) => value !== undefined)
    .sort((left, right) => (left[1] as number) - (right[1] as number))[0]

  return `${humanizeAgentId(targetAgentId)} eval returned ${outcome}. Weakest dimension: ${humanizeMetric(weakest?.[0] ?? "unknown")} (${roundScore(weakest?.[1] ?? 0)}).`
}

function buildEvidenceRefs(
  targetAgentId: ExidusAgentId,
  artifacts: RuntimeArtifacts,
  signals: ArtifactSignals,
) {
  const refs = new Set<string>(signals.evidenceRefs)
  refs.add(`agent:${targetAgentId}`)
  if (artifacts.improvementContext?.routeHistory?.length) {
    refs.add("runtime:routeHistory")
  }

  return [...refs]
}

function buildReviewSummary(
  targetAgentId: ExidusAgentId,
  evalResult: EvalResult,
  findings: ImprovementFinding[],
  proposalCount: number,
) {
  return `${humanizeAgentId(targetAgentId)} review completed with ${evalResult.outcome} eval outcome, ${findings.length} finding${findings.length === 1 ? "" : "s"}, and ${proposalCount} draft proposal${proposalCount === 1 ? "" : "s"} awaiting human review.`
}

function inferFindingCategory(findings: string[]): ImprovementFindingCategory {
  const combined = findings.join(" ").toLowerCase()

  if (combined.includes("placeholder") || combined.includes("generic")) {
    return "vagueness"
  }
  if (combined.includes("next-step") || combined.includes("structure")) {
    return "weak-structure"
  }
  if (combined.includes("routing")) {
    return "routing-error"
  }

  return "other"
}

function dedupeFindings(findings: ImprovementFinding[]) {
  return dedupeById(findings, (finding) => `${finding.category}:${finding.summary}`)
}

function dedupeById<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>()

  return items.filter((item) => {
    const value = key(item)
    if (seen.has(value)) {
      return false
    }
    seen.add(value)
    return true
  })
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundScore(value: number) {
  return Number(value.toFixed(2))
}

function humanizeAgentId(agentId: string) {
  return agentId
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

function humanizeMetric(metric: string) {
  return metric.replace(/([a-z])([A-Z])/g, "$1 $2")
}
