import { createServer, type IncomingMessage, type OutgoingHttpHeaders, type ServerResponse } from "node:http"
import path from "node:path"
import { readFile } from "node:fs/promises"

import { ASSESSMENT_FLOW } from "../runtime/assessment/flow.ts"
import { runAssessmentSubmission } from "../runtime/assessment/submit.ts"
import { describeRuntimeConfig, getRuntimeConfig } from "../runtime/config.ts"
import { getExidusRuntime } from "../runtime/system.ts"
import type { RuntimeArtifacts } from "../runtime/core/types.ts"
import { applyApprovalDecision, createApprovalDecision } from "../runtime/improvement/review-workflow.ts"
import {
  resolveSessionRecord,
  resetSessionRecord,
  updateSessionRecord,
} from "../runtime/persistence/session-store.ts"
import type { ApprovalDecision } from "../types/exidus-improvement-schema.ts"
import type { PersistedJourneyState, PersistedRouteLogEntry } from "../types/exidus-persistence.ts"
import type { UserProfile } from "../types/exidus-schema.ts"

const SESSION_COOKIE_NAME = "exidus.sid"

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
}

export function createAppServer() {
  return createServer(async (request, response) => {
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "localhost"}`,
    )

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        const config = describeRuntimeConfig()
        return sendJson(response, 200, {
          status: "ok",
          service: "exidus-app",
          runtimeEnv: config.runtimeEnv,
          host: config.host,
          port: config.port,
          checks: {
            docsRootConfigured: Boolean(config.docsRoot),
            manifestPathConfigured: Boolean(config.manifestPath),
            sessionsRootConfigured: Boolean(config.sessionsRoot),
          },
        })
      }

      if (request.method === "GET" && url.pathname === "/api/runtime/stack") {
        const runtime = await getExidusRuntime()
        return sendJson(response, 200, {
          runtime: describeRuntimeConfig(),
          manifest: {
            system: runtime.manifest.system,
            manifestVersion: runtime.manifest.manifestVersion,
            agents: runtime.manifest.agents.map((agent) => ({
              id: agent.id,
              name: agent.name,
              role: agent.role,
              inputs: agent.inputs,
              outputs: agent.outputs,
              downstream: agent.downstream,
            })),
          },
          apiPaths: [
            { method: "GET", path: "/api/session/current", stage: "session" },
            { method: "POST", path: "/api/session/state", stage: "session" },
            { method: "POST", path: "/api/session/reset", stage: "session" },
            { method: "GET", path: "/api/health", stage: "health" },
            { method: "GET", path: "/api/assessment/flow", stage: "assessment" },
            { method: "POST", path: "/api/assessment/submit", stage: "clarity" },
            { method: "POST", path: "/api/guide/interpret", stage: "guide" },
            { method: "POST", path: "/api/destination-research", stage: "destinationResearch" },
            { method: "POST", path: "/api/fit-comparison", stage: "fitComparison" },
            { method: "POST", path: "/api/action-plan", stage: "actionPlanning" },
            { method: "POST", path: "/api/report-refinement", stage: "reportRefinement" },
            { method: "POST", path: "/api/improvement/review", stage: "improvementReview" },
            { method: "POST", path: "/api/improvement/decision", stage: "improvementDecision" },
          ],
        })
      }

      if (request.method === "GET" && url.pathname === "/api/session/current") {
        const session = await resolveRequestSession(request, response)
        return sendJson(response, 200, {
          sessionId: session.sessionId,
          session,
        })
      }

      if (request.method === "POST" && url.pathname === "/api/session/state") {
        const session = await resolveRequestSession(request, response)
        const body = await readJsonBody(request)
        const journeyState = normalizeJourneyState(body.journeyState)
        const updated = await updateSessionRecord(session.sessionId, {
          journey: journeyState,
          currentStage: journeyState.screen,
        })

        return sendJson(response, 200, {
          sessionId: updated.sessionId,
          session: updated,
        })
      }

      if (request.method === "POST" && url.pathname === "/api/session/reset") {
        const currentSessionId = readSessionIdFromRequest(request)
        const session = await resetSessionRecord(currentSessionId ?? "")
        setSessionCookie(response, session.sessionId)
        return sendJson(response, 200, {
          sessionId: session.sessionId,
          session,
        })
      }

      if (request.method === "GET" && url.pathname === "/api/assessment/flow") {
        return sendJson(response, 200, {
          flow: ASSESSMENT_FLOW,
        })
      }

      if (request.method === "POST" && url.pathname === "/api/assessment/submit") {
        const session = await resolveRequestSession(request, response)
        const body = await readJsonBody(request)
        const answers =
          body.answers && typeof body.answers === "object"
            ? (body.answers as Record<string, unknown>)
            : {}
        const result = await runAssessmentSubmission({
          answers,
          sessionId: session.sessionId,
        })
        const runtime = await getExidusRuntime()
        const artifacts = {
          assessmentAnswers: result.assessmentAnswers,
          userProfile: result.userProfile,
          assessmentSignals: result.assessmentSignals,
          readinessProfile: result.readinessProfile,
          archetypeProfile: result.archetypeProfile,
          clarityReport: result.clarityReport,
        }
        const route = runtime.route({
          agentId: "router-orchestrator",
          userIntent: "Generate my baseline clarity report from the assessment flow.",
          artifacts: {
            assessmentAnswers: result.assessmentAnswers,
            userProfile: result.userProfile,
          },
        })
        const routeLog = appendRouteLogEntry(
          session.journey.routeLog,
          buildRouteLogEntry({
            stage: "clarity",
            route: {
              ...route.decision,
              stateBucket: route.stateBucket,
            },
            message: "Baseline clarity artifacts were created from the assessment submission.",
            artifacts,
          }),
        )
        const updated = await updateSessionRecord(session.sessionId, {
          artifacts,
          currentStage: "results",
          journey: {
            screen: "results",
            answers,
            routeLog,
            destinationInput: (result.userProfile.destinationsConsidering ?? []).join(", "),
            comparisonInput: "",
            refinementIntentInput: "",
            refinementPrioritiesInput: (result.userProfile.topPriorities ?? []).join(", "),
            refinementDestinationInput: (result.userProfile.destinationsConsidering ?? []).join(", "),
            refinementNotesInput: (result.userProfile.specialNotes ?? []).join("\n"),
          },
        })

        return sendJson(response, 200, {
          ...result,
          route: route.decision,
          sessionId: updated.sessionId,
        })
      }

      if (request.method === "POST" && url.pathname === "/api/guide/interpret") {
        const session = await resolveRequestSession(request, response)
        const body = await readJsonBody(request)
        const runtime = await getExidusRuntime()
        const artifacts = readArtifacts(body.artifacts, session.artifacts)
        const userIntent =
          typeof body.userIntent === "string"
            ? body.userIntent
            : "Help me understand my results."
        const routingResult = runtime.route({
          agentId: "router-orchestrator",
          userIntent,
          artifacts,
        })

        if (routingResult.decision.target !== "guideAgent") {
          return sendJson(response, 200, {
            route: {
              ...routingResult.decision,
              stateBucket: routingResult.stateBucket,
            },
          })
        }

        const result = await runtime.registry.invoke({
          agentId: "guide-agent",
          userIntent,
          artifacts,
        })
        const routeLog = appendRouteLogEntry(
          session.journey.routeLog,
          buildRouteLogEntry({
            stage: "guide",
            route: {
              ...routingResult.decision,
              stateBucket: routingResult.stateBucket,
            },
            message: result.artifacts.guidanceSummary?.summary,
            artifacts: result.artifacts,
          }),
        )

        await updateSessionRecord(session.sessionId, {
          artifacts: result.artifacts,
          currentStage: "results",
          journey: {
            screen: "results",
            routeLog,
          },
        })

        return sendJson(response, 200, {
          route: routingResult.decision,
          guidanceSummary: result.artifacts.guidanceSummary,
        })
      }

      if (request.method === "POST" && url.pathname === "/api/destination-research") {
        const session = await resolveRequestSession(request, response)
        const body = await readJsonBody(request)
        const runtime = await getExidusRuntime()
        const artifacts = readArtifacts(body.artifacts, session.artifacts)
        const destinations = normalizeDestinations(body.destinations)
        const userIntent = buildDestinationIntent(body.userIntent, destinations)
        const routingResult = runtime.route({
          agentId: "router-orchestrator",
          userIntent,
          artifacts,
        })

        if (routingResult.decision.target !== "destinationResearchAgent") {
          return sendJson(response, 200, {
            route: {
              ...routingResult.decision,
              stateBucket: routingResult.stateBucket,
            },
          })
        }

        const result = await runtime.registry.invoke({
          agentId: "destination-research-agent",
          userIntent,
          artifacts,
        })
        const routeLog = appendRouteLogEntry(
          session.journey.routeLog,
          buildRouteLogEntry({
            stage: "research",
            route: {
              ...routingResult.decision,
              stateBucket: routingResult.stateBucket,
            },
            message: summarizeDestinations(result.artifacts.destinationResearchReports ?? []),
            artifacts: result.artifacts,
          }),
        )

        await updateSessionRecord(session.sessionId, {
          artifacts: result.artifacts,
          currentStage: "results",
          journey: {
            screen: "results",
            routeLog,
            destinationInput: destinations.join(", "),
            comparisonInput:
              (result.artifacts.destinationResearchReports ?? []).length >= 2
                ? (result.artifacts.destinationResearchReports ?? [])
                    .map((report) => report.destination)
                    .join(", ")
                : session.journey.comparisonInput,
          },
        })

        return sendJson(response, 200, {
          route: routingResult.decision,
          destinationResearchReports: result.artifacts.destinationResearchReports ?? [],
        })
      }

      if (request.method === "POST" && url.pathname === "/api/fit-comparison") {
        const session = await resolveRequestSession(request, response)
        const body = await readJsonBody(request)
        const runtime = await getExidusRuntime()
        const artifacts = readArtifacts(body.artifacts, session.artifacts)
        const comparedDestinations = normalizeDestinations(body.destinations)
        const comparisonArtifacts =
          comparedDestinations.length >= 2
            ? {
                ...artifacts,
                destinationResearchReports: filterDestinationResearchReports(
                  artifacts.destinationResearchReports ?? [],
                  comparedDestinations,
                ),
              }
            : artifacts
        const userIntent = buildComparisonIntent(body.userIntent, comparedDestinations)
        const routingResult = runtime.route({
          agentId: "router-orchestrator",
          userIntent,
          artifacts: comparisonArtifacts,
        })

        if (routingResult.decision.target !== "fitComparisonAgent") {
          return sendJson(response, 200, {
            route: {
              ...routingResult.decision,
              stateBucket: routingResult.stateBucket,
            },
          })
        }

        const result = await runtime.registry.invoke({
          agentId: "fit-comparison-agent",
          userIntent,
          artifacts: comparisonArtifacts,
        })
        const routeLog = appendRouteLogEntry(
          session.journey.routeLog,
          buildRouteLogEntry({
            stage: "comparison",
            route: {
              ...routingResult.decision,
              stateBucket: routingResult.stateBucket,
            },
            message: result.artifacts.fitComparisonReport?.comparisonSummary,
            artifacts: result.artifacts,
          }),
        )

        await updateSessionRecord(session.sessionId, {
          artifacts: result.artifacts,
          currentStage: "results",
          journey: {
            screen: "results",
            routeLog,
            comparisonInput: comparedDestinations.join(", "),
          },
        })

        return sendJson(response, 200, {
          route: routingResult.decision,
          fitComparisonReport: result.artifacts.fitComparisonReport,
        })
      }

      if (request.method === "POST" && url.pathname === "/api/action-plan") {
        const session = await resolveRequestSession(request, response)
        const body = await readJsonBody(request)
        const runtime = await getExidusRuntime()
        const artifacts = readArtifacts(body.artifacts, session.artifacts)
        const userIntent =
          typeof body.userIntent === "string"
            ? body.userIntent
            : "What should I do next?"
        const routingResult = runtime.route({
          agentId: "router-orchestrator",
          userIntent,
          artifacts,
        })

        if (routingResult.decision.target !== "actionPlanningAgent") {
          return sendJson(response, 200, {
            route: {
              ...routingResult.decision,
              stateBucket: routingResult.stateBucket,
            },
          })
        }

        const result = await runtime.registry.invoke({
          agentId: "action-planning-agent",
          userIntent,
          artifacts,
        })
        const routeLog = appendRouteLogEntry(
          session.journey.routeLog,
          buildRouteLogEntry({
            stage: "planning",
            route: routingResult.decision,
            message: result.artifacts.actionPlan?.framingSummary,
            artifacts: result.artifacts,
          }),
        )

        await updateSessionRecord(session.sessionId, {
          artifacts: result.artifacts,
          currentStage: "results",
          journey: {
            screen: "results",
            routeLog,
          },
        })

        return sendJson(response, 200, {
          route: routingResult.decision,
          actionPlan: result.artifacts.actionPlan,
        })
      }

      if (request.method === "POST" && url.pathname === "/api/report-refinement") {
        const session = await resolveRequestSession(request, response)
        const body = await readJsonBody(request)
        const runtime = await getExidusRuntime()
        const artifacts = readArtifacts(body.artifacts, session.artifacts)
        const profileUpdates = normalizeProfileUpdates(body.profileUpdates)
        const mergedArtifacts = {
          ...artifacts,
          userProfile: mergeProfileUpdates(artifacts.userProfile, profileUpdates),
        }
        const userIntent =
          typeof body.userIntent === "string" && body.userIntent.trim().length > 0
            ? body.userIntent
            : "Update my report based on this new direction."
        const routingResult = runtime.route({
          agentId: "router-orchestrator",
          userIntent,
          artifacts: mergedArtifacts,
        })

        if (routingResult.decision.target !== "reportRefinementAgent") {
          return sendJson(response, 200, {
            route: routingResult.decision,
          })
        }

        const result = await runtime.registry.invoke({
          agentId: "report-refinement-agent",
          userIntent,
          artifacts: mergedArtifacts,
        })
        const routeLog = appendRouteLogEntry(
          session.journey.routeLog,
          buildRouteLogEntry({
            stage: "refinement",
            route: routingResult.decision,
            message: result.artifacts.reportRevision?.revisionSummary,
            artifacts: result.artifacts,
          }),
        )

        await updateSessionRecord(session.sessionId, {
          artifacts: result.artifacts,
          currentStage: "results",
          journey: {
            screen: "results",
            routeLog,
            refinementIntentInput: userIntent,
            refinementPrioritiesInput: (result.artifacts.userProfile?.topPriorities ?? []).join(", "),
            refinementDestinationInput: (result.artifacts.userProfile?.destinationsConsidering ?? []).join(", "),
            refinementNotesInput: (result.artifacts.userProfile?.specialNotes ?? []).join("\n"),
          },
        })

        return sendJson(response, 200, {
          route: routingResult.decision,
          clarityReport: result.artifacts.clarityReport,
          reportRevision: result.artifacts.reportRevision,
          userProfile: result.artifacts.userProfile,
        })
      }

      if (request.method === "POST" && url.pathname === "/api/improvement/review") {
        const session = await resolveRequestSession(request, response)
        const body = await readJsonBody(request)
        const runtime = await getExidusRuntime()
        const artifacts = readArtifacts(body.artifacts, session.artifacts)
        const routeHistory = normalizeRouteHistory(body.routeHistory)
        const targetAgentId =
          typeof body.targetAgentId === "string" && body.targetAgentId.trim().length > 0
            ? body.targetAgentId.trim()
            : undefined
        const result = await runtime.registry.invoke({
          agentId: "improvement-agent",
          userIntent:
            typeof body.userIntent === "string" && body.userIntent.trim().length > 0
              ? body.userIntent
              : "Run a bounded internal review on the current runtime chain.",
          artifacts: {
            ...artifacts,
            improvementContext: {
              targetAgentId,
              routeHistory,
            },
          },
        })

        await updateSessionRecord(session.sessionId, {
          artifacts: result.artifacts,
          currentStage: "results",
          journey: {
            screen: "results",
            routeLog: routeHistory.length > 0 ? routeHistory : session.journey.routeLog,
          },
        })

        return sendJson(response, 200, {
          improvementReview: result.artifacts.improvementReview,
        })
      }

      if (request.method === "POST" && url.pathname === "/api/improvement/decision") {
        const session = await resolveRequestSession(request, response)
        const body = await readJsonBody(request)
        const review = session.artifacts.improvementReview
        if (!review) {
          return sendJson(response, 400, {
            error: "No improvement review bundle exists for this session yet.",
          })
        }

        const proposalId =
          typeof body.proposalId === "string" && body.proposalId.trim().length > 0
            ? body.proposalId.trim()
            : ""
        const reviewer =
          typeof body.reviewer === "string" && body.reviewer.trim().length > 0
            ? body.reviewer.trim()
            : ""
        const decision = normalizeApprovalDecision(body.decision)
        if (!proposalId || !decision || !reviewer) {
          return sendJson(response, 400, {
            error: "proposalId, reviewer, and a valid decision are required.",
          })
        }

        const proposalExists = (review.proposalQueue || []).some((proposal) => proposal.proposalId === proposalId)
        if (!proposalExists) {
          return sendJson(response, 404, {
            error: "The requested proposal was not found in the current review bundle.",
          })
        }

        const approvalDecision = createApprovalDecision(review.reviewId, {
          proposalId,
          decision,
          reviewer,
          rationale:
            typeof body.rationale === "string" && body.rationale.trim().length > 0
              ? body.rationale.trim()
              : undefined,
          constraints: normalizeConstraintList(body.constraints),
        })
        const updatedReview = applyApprovalDecision(review, approvalDecision)
        const updatedArtifacts = {
          ...session.artifacts,
          improvementReview: updatedReview,
          approvalDecisions: updatedReview.approvalDecisions,
        }

        await updateSessionRecord(session.sessionId, {
          artifacts: updatedArtifacts,
          currentStage: "results",
          journey: {
            screen: "results",
          },
        })

        return sendJson(response, 200, {
          approvalDecision,
          improvementReview: updatedReview,
        })
      }

      if (request.method === "GET") {
        const filePath = resolvePublicPath(url.pathname)
        const file = await readFile(filePath)
        const extension = path.extname(filePath)
        response.writeHead(200, {
          "content-type": MIME_TYPES[extension] ?? "application/octet-stream",
        })
        response.end(file)
        return
      }

      sendJson(response, 405, {
        error: "Method not allowed",
      })
    } catch (error) {
      if (isMissingFile(error)) {
        sendJson(response, 404, {
          error: "Not found",
        })
        return
      }

      const message = error instanceof Error ? error.message : "Unknown server error"
      sendJson(response, 500, {
        error: message,
      })
    }
  })
}

export function startAppServer() {
  const config = getRuntimeConfig()
  const server = createAppServer()
  server.on("error", (error) => {
    console.error(
      `[exidus] failed to start server on ${config.host}:${config.port}: ${error.message}`,
    )
    process.exitCode = 1
  })
  server.listen(config.port, config.host, () => {
    console.log(
      `Exidus assessment app running at http://localhost:${config.port} (${config.runtimeEnv})`,
    )
  })

  return server
}

function resolvePublicPath(pathname: string) {
  const { publicDir } = getRuntimeConfig()
  const normalized = pathname === "/" ? "/index.html" : pathname
  const fullPath = path.join(publicDir, normalized)

  if (!fullPath.startsWith(publicDir)) {
    throw new Error("Invalid path")
  }

  return fullPath
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  headers: OutgoingHttpHeaders = {},
) {
  response.writeHead(statusCode, {
    "content-type": MIME_TYPES[".json"],
    ...headers,
  })
  response.end(JSON.stringify(payload))
}

function readJsonBody(request: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = []

    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk)
    })
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8")
        resolve(text ? (JSON.parse(text) as Record<string, unknown>) : {})
      } catch (error) {
        reject(error)
      }
    })
    request.on("error", reject)
  })
}

function readArtifacts(value: unknown, persistedArtifacts: RuntimeArtifacts): RuntimeArtifacts {
  if (!value || typeof value !== "object") {
    if (Object.keys(persistedArtifacts).length > 0) {
      return persistedArtifacts
    }

    throw new Error("This request requires runtime artifacts")
  }

  return {
    ...persistedArtifacts,
    ...(value as RuntimeArtifacts),
  }
}

async function resolveRequestSession(request: IncomingMessage, response: ServerResponse) {
  const session = await resolveSessionRecord(readSessionIdFromRequest(request))
  setSessionCookie(response, session.sessionId)
  return session
}

function readSessionIdFromRequest(request: IncomingMessage) {
  const cookieHeader = request.headers.cookie
  if (!cookieHeader) {
    return undefined
  }

  const cookies = cookieHeader.split(";")
  for (const rawCookie of cookies) {
    const [key, ...value] = rawCookie.trim().split("=")
    if (key === SESSION_COOKIE_NAME) {
      return decodeURIComponent(value.join("="))
    }
  }

  return undefined
}

function setSessionCookie(response: ServerResponse, sessionId: string) {
  response.setHeader(
    "set-cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax`,
  )
}

function normalizeApprovalDecision(value: unknown): ApprovalDecision["decision"] | undefined {
  if (
    value === "approved" ||
    value === "rejected" ||
    value === "approved-with-notes"
  ) {
    return value
  }

  return undefined
}

function normalizeConstraintList(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined
  }

  const items = value
    .map((item) => String(item || "").trim())
    .filter(Boolean)

  return items.length ? items : undefined
}

function isMissingFile(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT",
  )
}

function normalizeDestinations(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function buildDestinationIntent(userIntent: unknown, destinations: string[]) {
  if (typeof userIntent === "string" && userIntent.trim().length > 0) {
    return userIntent.trim()
  }

  if (destinations.length > 0) {
    return `Research ${destinations.join(" and ")} for me.`
  }

  return "Research destination fit for me."
}

function buildComparisonIntent(userIntent: unknown, destinations: string[]) {
  if (typeof userIntent === "string" && userIntent.trim().length > 0) {
    return userIntent.trim()
  }

  if (destinations.length >= 2) {
    return `Compare ${destinations.join(" and ")} for me.`
  }

  return "Compare these destinations for me."
}

function filterDestinationResearchReports(
  reports: RuntimeArtifacts["destinationResearchReports"],
  destinations: string[],
) {
  const normalized = destinations.map((destination) => normalizeDestinationToken(destination))

  return (reports ?? []).filter((report) => {
    const destinationName = normalizeDestinationToken(report.destination)
    const destinationSlug = normalizeDestinationToken(report.destinationSlug)
    return normalized.includes(destinationName) || normalized.includes(destinationSlug)
  })
}

function normalizeProfileUpdates(value: unknown) {
  if (!value || typeof value !== "object") {
    return {}
  }

  const raw = value as Record<string, unknown>

  return {
    topPriorities: normalizeStringList(raw.topPriorities),
    destinationsConsidering: normalizeStringList(raw.destinationsConsidering),
    specialNotes: normalizeStringList(raw.specialNotes),
  }
}

function mergeProfileUpdates(
  userProfile: RuntimeArtifacts["userProfile"],
  updates: {
    topPriorities?: string[]
    destinationsConsidering?: string[]
    specialNotes?: string[]
  },
): UserProfile | undefined {
  if (!userProfile) {
    return undefined
  }

  const hasUpdates = Object.values(updates).some((value) => (value?.length ?? 0) > 0)
  if (!hasUpdates) {
    return userProfile
  }

  return {
    ...userProfile,
    updatedAt: new Date().toISOString(),
    source: userProfile.source === "assessment" ? "mixed" : userProfile.source,
    topPriorities: updates.topPriorities?.length ? updates.topPriorities : userProfile.topPriorities,
    destinationsConsidering: updates.destinationsConsidering?.length
      ? updates.destinationsConsidering
      : userProfile.destinationsConsidering,
    specialNotes: updates.specialNotes?.length ? updates.specialNotes : userProfile.specialNotes,
  }
}

function normalizeStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return undefined
}

function normalizeDestinationToken(value: string) {
  return value.trim().toLowerCase()
}

function normalizeRouteHistory(value: unknown): PersistedRouteLogEntry[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map(normalizeRouteLogEntry)
}

function normalizeJourneyState(value: unknown): Partial<PersistedJourneyState> {
  if (!value || typeof value !== "object") {
    return {}
  }

  const raw = value as Record<string, unknown>

  return {
    screen: typeof raw.screen === "string" ? raw.screen : "landing",
    answers:
      raw.answers && typeof raw.answers === "object"
        ? (raw.answers as Record<string, unknown>)
        : {},
    routeLog: normalizeRouteHistory(raw.routeLog),
    destinationInput:
      typeof raw.destinationInput === "string" ? raw.destinationInput : "",
    comparisonInput:
      typeof raw.comparisonInput === "string" ? raw.comparisonInput : "",
    refinementIntentInput:
      typeof raw.refinementIntentInput === "string" ? raw.refinementIntentInput : "",
    refinementPrioritiesInput:
      typeof raw.refinementPrioritiesInput === "string" ? raw.refinementPrioritiesInput : "",
    refinementDestinationInput:
      typeof raw.refinementDestinationInput === "string" ? raw.refinementDestinationInput : "",
    refinementNotesInput:
      typeof raw.refinementNotesInput === "string" ? raw.refinementNotesInput : "",
  }
}

function normalizeRouteLogEntry(item: Record<string, unknown>): PersistedRouteLogEntry {
  return {
    stage: typeof item.stage === "string" ? item.stage : "unknown",
    target: typeof item.target === "string" ? item.target : undefined,
    confidence: typeof item.confidence === "string" ? item.confidence : undefined,
    stateBucket: typeof item.stateBucket === "string" ? item.stateBucket : undefined,
    reason: typeof item.reason === "string" ? item.reason : undefined,
    prerequisitesMissing: Array.isArray(item.prerequisitesMissing)
      ? item.prerequisitesMissing.filter((entry): entry is string => typeof entry === "string")
      : undefined,
    message: typeof item.message === "string" ? item.message : undefined,
    artifacts: Array.isArray(item.artifacts)
      ? item.artifacts.filter((entry): entry is string => typeof entry === "string")
      : undefined,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
  }
}

function buildRouteLogEntry(input: {
  stage: string
  route: {
    target: string
    reason: string
    confidence: string
    stateBucket?: string
    prerequisitesMissing?: string[]
  }
  message?: string
  artifacts: RuntimeArtifacts
}): PersistedRouteLogEntry {
  return {
    stage: input.stage,
    target: input.route.target,
    confidence: input.route.confidence,
    stateBucket: input.route.stateBucket,
    reason: input.route.reason,
    prerequisitesMissing: input.route.prerequisitesMissing,
    message: input.message,
    artifacts: buildArtifactLabels(input.artifacts),
    createdAt: new Date().toISOString(),
  }
}

function appendRouteLogEntry(
  routeLog: PersistedRouteLogEntry[],
  entry: PersistedRouteLogEntry,
) {
  return [...routeLog, entry]
}

function buildArtifactLabels(artifacts: RuntimeArtifacts) {
  return [
    artifacts.userProfile ? "UserProfile" : null,
    artifacts.assessmentAnswers ? "AssessmentAnswers" : null,
    artifacts.assessmentSignals ? "AssessmentSignals" : null,
    artifacts.readinessProfile ? "ReadinessProfile" : null,
    artifacts.archetypeProfile ? "ArchetypeProfile" : null,
    artifacts.clarityReport ? "ClarityReport" : null,
    artifacts.guidanceSummary ? "GuidanceSummary" : null,
    artifacts.destinationResearchReports?.length ? "DestinationResearchReport" : null,
    artifacts.fitComparisonReport ? "FitComparisonReport" : null,
    artifacts.actionPlan ? "ActionPlan" : null,
    artifacts.reportRevision ? "ReportRevision" : null,
    artifacts.improvementReview ? "ImprovementReview" : null,
  ].filter((item): item is string => Boolean(item))
}

function summarizeDestinations(
  reports: NonNullable<RuntimeArtifacts["destinationResearchReports"]>,
) {
  if (reports.length === 0) {
    return "No destination research artifacts yet."
  }

  if (reports.length === 1) {
    return `${reports[0].destination} has a first-pass destination report.`
  }

  return `${reports.map((report) => report.destination).join(", ")} now have destination reports.`
}
