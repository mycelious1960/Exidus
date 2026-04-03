import type { AgentInvocation, RegisteredAgent } from "./types.ts"
import type { RouterRuntimeResult } from "./types.ts"

export class AgentRegistry {
  private readonly agents = new Map<string, RegisteredAgent>()

  register(agent: RegisteredAgent) {
    this.agents.set(agent.manifest.id, agent)
  }

  get(agentId: string) {
    return this.agents.get(agentId)
  }

  list() {
    return [...this.agents.values()]
  }

  async invoke(invocation: AgentInvocation) {
    const agent = this.get(invocation.agentId)

    if (!agent) {
      throw new Error(`Agent '${invocation.agentId}' is not registered`)
    }

    return agent.invoke(invocation)
  }
}

export interface RuntimeSystem {
  registry: AgentRegistry
  router: (input: AgentInvocation) => RouterRuntimeResult
}
