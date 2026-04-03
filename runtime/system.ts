import { loadAgentManifest } from "./core/manifest-loader.ts"
import { loadPromptForAgent } from "./core/prompt-loader.ts"
import { AgentRegistry } from "./core/agent-registry.ts"
import type { RegisteredAgent } from "./core/types.ts"
import { invokeActionPlanningAgent } from "./agents/action-planning-agent.ts"
import { invokeClarityEngine } from "./agents/clarity-engine.ts"
import { invokeDestinationResearchAgent } from "./agents/destination-research-agent.ts"
import { invokeFitComparisonAgent } from "./agents/fit-comparison-agent.ts"
import { invokeGuideAgent } from "./agents/guide-agent.ts"
import { invokeReportRefinementAgent } from "./agents/report-refinement-agent.ts"
import { invokeRouterOrchestrator } from "./agents/router-orchestrator.ts"
import { invokeStubAgent } from "./agents/stub-agent.ts"
import { createImprovementAgentInvoker } from "./improvement/review-runtime.ts"
import { routeInvocation } from "./router/router.ts"

export interface ExidusRuntime {
  manifest: Awaited<ReturnType<typeof loadAgentManifest>>
  registry: AgentRegistry
  route: typeof routeInvocation
}

let runtimePromise: Promise<ExidusRuntime> | undefined

export async function createExidusRuntime() {
  const manifest = await loadAgentManifest()
  const registry = new AgentRegistry()

  for (const entry of manifest.agents) {
    const prompt = await loadPromptForAgent(entry)
    const agent: RegisteredAgent = {
      manifest: entry,
      prompt,
      invoke:
        entry.id === "clarity-engine"
          ? invokeClarityEngine
          : entry.id === "guide-agent"
          ? invokeGuideAgent
          : entry.id === "destination-research-agent"
            ? invokeDestinationResearchAgent
          : entry.id === "fit-comparison-agent"
            ? invokeFitComparisonAgent
          : entry.id === "action-planning-agent"
          ? invokeActionPlanningAgent
          : entry.id === "report-refinement-agent"
            ? invokeReportRefinementAgent
          : entry.id === "improvement-agent"
            ? createImprovementAgentInvoker({
                manifest,
                registry,
              })
          : entry.id === "router-orchestrator"
            ? invokeRouterOrchestrator
          : async (invocation) => invokeStubAgent(entry.id, invocation),
    }

    registry.register(agent)
  }

  return {
    manifest,
    registry,
    route: routeInvocation,
  }
}

export function getExidusRuntime() {
  runtimePromise ??= createExidusRuntime()
  return runtimePromise
}
