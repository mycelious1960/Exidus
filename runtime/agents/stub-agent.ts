import type { AgentInvocation, AgentInvocationResult, ExidusAgentId } from "../core/types.ts"

const STUB_MESSAGES: Record<Exclude<ExidusAgentId, "clarity-engine" | "router-orchestrator">, string> = {
  "guide-agent":
    "Guide Agent scaffold is registered and callable. It currently returns a structural placeholder for interpretation workflows.",
  "destination-research-agent":
    "Destination Research Agent scaffold is registered and callable. Research intelligence is intentionally deferred in this first runtime slice.",
  "fit-comparison-agent":
    "Fit Comparison Agent scaffold is registered and callable. Comparative synthesis logic is still placeholder-only.",
  "action-planning-agent":
    "Action Planning Agent scaffold is registered and callable. Action sequencing logic is still placeholder-only.",
  "report-refinement-agent":
    "Report Refinement Agent scaffold is registered and callable. Revision logic remains deferred.",
  "improvement-agent":
    "Improvement Agent scaffold is registered and callable. Improvement loop automation remains placeholder-only.",
}

export async function invokeStubAgent(
  agentId: ExidusAgentId,
  invocation: AgentInvocation,
): Promise<AgentInvocationResult> {
  if (agentId === "clarity-engine" || agentId === "router-orchestrator") {
    throw new Error(`Stub handler cannot service '${agentId}'`)
  }

  return {
    agentId,
    status: "scaffolded",
    message: STUB_MESSAGES[agentId],
    artifacts: invocation.artifacts,
  }
}
