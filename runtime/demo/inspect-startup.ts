import { inspectStartupReadiness } from "../startup.ts"

const report = await inspectStartupReadiness()

console.log(JSON.stringify(report, null, 2))

if (!report.ok) {
  process.exitCode = 1
}
