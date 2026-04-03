import { routeInvocation } from "../router/router.ts"
import type { AgentInvocation, AgentInvocationResult } from "../core/types.ts"

export async function invokeRouterOrchestrator(
  invocation: AgentInvocation,
): Promise<AgentInvocationResult> {
  const routingResult = routeInvocation(invocation)

  return {
    agentId: "router-orchestrator",
    status: "completed",
    message: routingResult.decision.reason,
    artifacts: invocation.artifacts,
  }
}
