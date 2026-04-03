import { startAppServer } from "./server.ts"
import { describeRuntimeConfig } from "../runtime/config.ts"

const config = describeRuntimeConfig()

console.log(
  `[exidus] booting runtime env=${config.runtimeEnv} host=${config.host} port=${config.port}`,
)
console.log(
  `[exidus] docsRoot=${config.docsRoot} dataRoot=${config.dataRoot} manifestPath=${config.manifestPath}`,
)

startAppServer()
