import { startAppServer } from "./server.ts"
import { describeRuntimeConfig } from "../runtime/config.ts"
import { assertStartupReadiness } from "../runtime/startup.ts"

const config = describeRuntimeConfig()

console.log(
  `[exidus] booting runtime env=${config.runtimeEnv} host=${config.host} port=${config.port}`,
)
console.log(
  `[exidus] docsRoot=${config.docsRoot} dataRoot=${config.dataRoot} manifestPath=${config.manifestPath}`,
)

try {
  const readiness = await assertStartupReadiness()
  console.log(
    `[exidus] startup checks passed (${readiness.checks.length} checks)`,
  )
  startAppServer()
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown startup validation error"
  console.error(`[exidus] ${message}`)
  process.exit(1)
}
