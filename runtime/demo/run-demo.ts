import { getExidusRuntime } from "../system.ts"
import type {
  ActionPlan,
  ClarityReport,
  DestinationResearchReport,
  FitComparisonReport,
  ReportRevision,
} from "../../types/exidus-schema.ts"
import type { GuidanceSummary } from "../../types/exidus-router.ts"
import type { ImprovementReviewBundle } from "../../types/exidus-improvement-schema.ts"
import { sampleAssessmentAnswers, sampleUserProfile } from "./sample-assessment.ts"

async function main() {
  const runtime = await getExidusRuntime()

  const firstDecision = runtime.route({
    agentId: "router-orchestrator",
    userIntent: "I think I want out, but I need clarity first.",
    artifacts: {
      assessmentAnswers: sampleAssessmentAnswers,
      userProfile: sampleUserProfile,
    },
  })

  const clarityResult = await runtime.registry.invoke({
    agentId: "clarity-engine",
    userIntent: "Generate my baseline clarity report.",
    artifacts: {
      assessmentAnswers: sampleAssessmentAnswers,
      userProfile: sampleUserProfile,
    },
  })

  const guideResult = await runtime.registry.invoke({
    agentId: "guide-agent",
    userIntent: "Help me understand my results.",
    artifacts: clarityResult.artifacts,
  })

  const guideDecision = runtime.route({
    agentId: "router-orchestrator",
    userIntent: "Help me understand my results.",
    artifacts: clarityResult.artifacts,
  })

  const destinationResult = await runtime.registry.invoke({
    agentId: "destination-research-agent",
    userIntent: "Research Portugal and Mexico for me.",
    artifacts: guideResult.artifacts,
  })

  const destinationDecision = runtime.route({
    agentId: "router-orchestrator",
    userIntent: "Research Portugal and Mexico for me.",
    artifacts: guideResult.artifacts,
  })

  const thirdDecision = runtime.route({
    agentId: "router-orchestrator",
    userIntent: "Compare Portugal and Mexico for me now.",
    artifacts: destinationResult.artifacts,
  })

  const fitComparisonResult = await runtime.registry.invoke({
    agentId: "fit-comparison-agent",
    userIntent: "Compare Portugal and Mexico for me now.",
    artifacts: destinationResult.artifacts,
  })

  const actionPlanResult = await runtime.registry.invoke({
    agentId: "action-planning-agent",
    userIntent: "Build my next 30 days.",
    artifacts: fitComparisonResult.artifacts,
  })

  const actionPlanningDecision = runtime.route({
    agentId: "router-orchestrator",
    userIntent: "Build my next 30 days.",
    artifacts: fitComparisonResult.artifacts,
  })

  const refinementDecision = runtime.route({
    agentId: "router-orchestrator",
    userIntent: "Revise my report after comparison.",
    artifacts: actionPlanResult.artifacts,
  })

  const refinementResult = await runtime.registry.invoke({
    agentId: "report-refinement-agent",
    userIntent: "Revise my report after comparison.",
    artifacts: {
      ...actionPlanResult.artifacts,
      userProfile: {
        ...actionPlanResult.artifacts.userProfile!,
        updatedAt: new Date().toISOString(),
        source: "mixed",
        topPriorities: ["affordability", "healthcare", "belonging", "stability"],
        specialNotes: [
          ...(actionPlanResult.artifacts.userProfile?.specialNotes ?? []),
          "Schooling matters less than expected; affordability matters more than in the baseline pass.",
        ],
      },
    },
  })

  const journey = [
    makeJourneyStage({
      stage: "clarity",
      route: firstDecision,
      result: clarityResult,
      keyOutput: {
        readinessLevel: clarityResult.artifacts.readinessProfile?.readinessLevel,
        fitDirection:
          clarityResult.artifacts.archetypeProfile?.fitDirectionArchetype,
        topPriorities: clarityResult.artifacts.clarityReport?.topPriorities,
      },
    }),
    makeJourneyStage({
      stage: "guide",
      route: guideDecision,
      result: guideResult,
      keyOutput: {
        mode: guideResult.artifacts.guidanceSummary?.mode,
        summary: guideResult.artifacts.guidanceSummary?.summary,
        suggestedNextMove: guideResult.artifacts.guidanceSummary?.suggestedNextMove,
      },
    }),
    makeJourneyStage({
      stage: "destinationResearch",
      route: destinationDecision,
      result: destinationResult,
      keyOutput: {
        destinations:
          destinationResult.artifacts.destinationResearchReports?.map((report) => ({
            destination: report.destination,
            verdict: report.profileFitVerdict,
            nextStep: report.recommendedNextStep,
          })) ?? [],
      },
    }),
    makeJourneyStage({
      stage: "fitComparison",
      route: thirdDecision,
      result: fitComparisonResult,
      keyOutput: {
        strongestFit: fitComparisonResult.artifacts.fitComparisonReport?.strongestFit,
        weakestFit: fitComparisonResult.artifacts.fitComparisonReport?.weakestFit,
        recommendedNextMove:
          fitComparisonResult.artifacts.fitComparisonReport?.recommendedNextMove,
      },
    }),
    makeJourneyStage({
      stage: "actionPlanning",
      route: actionPlanningDecision,
      result: actionPlanResult,
      keyOutput: {
        planningMode: actionPlanResult.artifacts.actionPlan?.planningMode,
        destinationState: actionPlanResult.artifacts.actionPlan?.destinationState,
        priorities: actionPlanResult.artifacts.actionPlan?.priorities,
      },
    }),
    makeJourneyStage({
      stage: "reportRefinement",
      route: refinementDecision,
      result: refinementResult,
      keyOutput: {
        revisionType: refinementResult.artifacts.reportRevision?.revisionType,
        significance: refinementResult.artifacts.reportRevision?.significance,
        whatChanged: refinementResult.artifacts.reportRevision?.whatChanged,
      },
    }),
  ]

  const routeHistory = journey.map((stage) => ({
    stage: stage.stage,
    target: String(stage.route.target ?? ""),
    confidence: String(stage.route.confidence ?? ""),
    stateBucket: String(stage.route.stateBucket ?? ""),
    reason: String(stage.route.reason ?? ""),
    prerequisitesMissing: Array.isArray(stage.route.prerequisitesMissing)
      ? stage.route.prerequisitesMissing.map((item) => String(item))
      : undefined,
    message: stage.message,
    artifacts: stage.artifactsAvailable,
    createdAt: new Date().toISOString(),
  }))

  const improvementResult = await runtime.registry.invoke({
    agentId: "improvement-agent",
    userIntent: "Run a bounded internal review on the current runtime chain.",
    artifacts: {
      ...refinementResult.artifacts,
      improvementContext: {
        routeHistory,
      },
    },
  })

  console.log(
    JSON.stringify(
      {
        manifestSummary: {
          system: runtime.manifest.system,
          manifestVersion: runtime.manifest.manifestVersion,
          agentIds: runtime.manifest.agents.map((agent) => agent.id),
        },
        journey,
        outputSummary: {
          clarity: summarizeClarity(clarityResult.artifacts.clarityReport),
          guide: summarizeGuide(guideResult.artifacts.guidanceSummary),
          destinationResearch: summarizeDestinationResearch(
            destinationResult.artifacts.destinationResearchReports,
          ),
          fitComparison: summarizeFitComparison(
            fitComparisonResult.artifacts.fitComparisonReport,
          ),
          actionPlanning: summarizeActionPlan(actionPlanResult.artifacts.actionPlan),
          reportRefinement: summarizeReportRevision(
            refinementResult.artifacts.reportRevision,
            refinementResult.artifacts.clarityReport,
          ),
        },
        improvementReviewSummary: summarizeImprovementReview(
          improvementResult.artifacts.improvementReview,
        ),
      },
      null,
      2,
    ),
  )
}

function makeJourneyStage(input: {
  stage: string
  route: { decision: Record<string, unknown> }
  result: {
    status: string
    message: string
    artifacts: Record<string, unknown>
  }
  keyOutput: Record<string, unknown>
}) {
  return {
    stage: input.stage,
    route: input.route.decision,
    status: input.result.status,
    message: input.result.message,
    artifactsAvailable: summarizeArtifacts(input.result.artifacts),
    keyOutput: input.keyOutput,
  }
}

function summarizeArtifacts(artifacts: Record<string, unknown>) {
  return Object.entries(artifacts)
    .filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : Boolean(value),
    )
    .map(([key]) => key)
}

function summarizeClarity(clarityReport?: ClarityReport) {
  if (!clarityReport) {
    return null
  }

  return {
    reportId: clarityReport.reportId,
    readinessLevel: clarityReport.readinessProfile.readinessLevel,
    fitDirection: clarityReport.archetypeProfile.fitDirectionArchetype,
    topPriorities: clarityReport.topPriorities.slice(0, 3),
    contradictionFlags: clarityReport.contradictionFlags,
    nextStepSummary: clarityReport.summary.nextStepSummary,
  }
}

function summarizeGuide(guidanceSummary?: GuidanceSummary) {
  if (!guidanceSummary) {
    return null
  }

  return {
    mode: guidanceSummary.mode,
    summary: guidanceSummary.summary,
    focusNext: guidanceSummary.focusNext.slice(0, 2),
    suggestedNextMove: guidanceSummary.suggestedNextMove,
  }
}

function summarizeDestinationResearch(
  reports?: DestinationResearchReport[],
) {
  return (reports ?? []).map((report) => ({
    destination: report.destination,
    verdict: report.profileFitVerdict,
    confidence: report.confidence,
    tradeoff: report.fitNotes.majorTradeoffs[0],
    recommendedNextStep: report.recommendedNextStep,
  }))
}

function summarizeFitComparison(
  fitComparisonReport?: FitComparisonReport,
) {
  if (!fitComparisonReport) {
    return null
  }

  return {
    strongestFit: fitComparisonReport.strongestFit,
    strongestPracticalFit: fitComparisonReport.strongestPracticalFit,
    strongestEmotionalFit: fitComparisonReport.strongestEmotionalFit,
    weakestFit: fitComparisonReport.weakestFit,
    recommendedNextMove: fitComparisonReport.recommendedNextMove,
    routeSignals: fitComparisonReport.routeSignals,
  }
}

function summarizeActionPlan(actionPlan?: ActionPlan) {
  if (!actionPlan) {
    return null
  }

  return {
    horizon: actionPlan.horizon,
    planningMode: actionPlan.planningMode,
    destinationState: actionPlan.destinationState,
    priorities: actionPlan.priorities.slice(0, 3),
    nowActions: actionPlan.actions
      .filter((action) => action.phase === "now")
      .map((action) => action.title),
    suggestedNextExidusMove: actionPlan.suggestedNextExidusMove,
  }
}

function summarizeReportRevision(
  reportRevision?: ReportRevision,
  clarityReport?: ClarityReport,
) {
  if (!reportRevision || !clarityReport) {
    return null
  }

  return {
    revisionType: reportRevision.revisionType,
    significance: reportRevision.significance,
    whatChanged: reportRevision.whatChanged,
    payAttentionNow: reportRevision.payAttentionNow.slice(0, 3),
    updatedTopPriorities: clarityReport.topPriorities.slice(0, 4),
    updatedNextStepSummary: clarityReport.summary.nextStepSummary,
  }
}

function summarizeImprovementReview(
  improvementReview?: ImprovementReviewBundle,
) {
  if (!improvementReview) {
    return null
  }

  return {
    reviewSummary: improvementReview.reviewSummary,
    targetAgentId: improvementReview.targetAgentId,
    evalOutcome: improvementReview.evalResult.outcome,
    weakestDimension: findWeakestScore(improvementReview.evalResult.scores),
    reviewState: improvementReview.reviewState,
    findings: improvementReview.findings.map((finding) => ({
      severity: finding.severity,
      category: finding.category,
      summary: finding.summary,
    })),
    proposalQueue: improvementReview.proposalQueue.map((proposal) => ({
      proposalId: proposal.proposalId,
      proposalType: proposal.proposalType,
      targetLabel: proposal.targetLabel,
      status: proposal.status,
      riskLevel: proposal.riskLevel,
      proposedChangeSummary: proposal.proposedChangeSummary,
    })),
  }
}

function findWeakestScore(scores: Record<string, number | undefined>) {
  const entries = Object.entries(scores).filter((entry): entry is [string, number] =>
    typeof entry[1] === "number",
  )
  if (entries.length === 0) {
    return null
  }

  const [dimension, score] = entries.reduce((lowest, current) =>
    current[1] < lowest[1] ? current : lowest,
  )

  return {
    dimension,
    score,
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
