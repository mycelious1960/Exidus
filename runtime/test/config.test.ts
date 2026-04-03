import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { getRuntimeConfig, resetRuntimeConfigCache } from "../config.ts"

const TEST_FILE = fileURLToPath(import.meta.url)
const TEST_DIR = path.dirname(TEST_FILE)
const REPO_ROOT = path.resolve(TEST_DIR, "..", "..")
const TRACKED_ENV_KEYS = [
  "EXIDUS_DATA_ROOT",
  "EXIDUS_DOCS_ROOT",
  "EXIDUS_MANIFEST_PATH",
  "EXIDUS_PUBLIC_DIR",
  "EXIDUS_RUNTIME_ENV",
  "HOST",
  "NODE_ENV",
  "PORT",
] as const

function withEnv(
  overrides: Partial<Record<(typeof TRACKED_ENV_KEYS)[number], string | undefined>>,
  callback: () => void,
) {
  const previous = new Map<string, string | undefined>()

  for (const key of TRACKED_ENV_KEYS) {
    previous.set(key, process.env[key])
    const nextValue = overrides[key]
    if (typeof nextValue === "string") {
      process.env[key] = nextValue
      continue
    }

    delete process.env[key]
  }

  resetRuntimeConfigCache()

  try {
    callback()
  } finally {
    for (const key of TRACKED_ENV_KEYS) {
      const value = previous.get(key)
      if (typeof value === "string") {
        process.env[key] = value
        continue
      }

      delete process.env[key]
    }

    resetRuntimeConfigCache()
  }
}

test("relative runtime path overrides resolve from the repo root", () => {
  withEnv(
    {
      EXIDUS_DATA_ROOT: ".data",
      EXIDUS_DOCS_ROOT: "../obsidian-exidus",
      EXIDUS_MANIFEST_PATH: "../obsidian-exidus/Agentic/Exidus Agent Manifest v1.json",
      EXIDUS_PUBLIC_DIR: "app/public",
    },
    () => {
      const config = getRuntimeConfig()

      assert.equal(config.repoRoot, REPO_ROOT)
      assert.equal(config.dataRoot, path.join(REPO_ROOT, ".data"))
      assert.equal(config.docsRoot, path.resolve(REPO_ROOT, "../obsidian-exidus"))
      assert.equal(
        config.manifestPath,
        path.resolve(REPO_ROOT, "../obsidian-exidus/Agentic/Exidus Agent Manifest v1.json"),
      )
      assert.equal(config.publicDir, path.join(REPO_ROOT, "app", "public"))
    },
  )
})

test("config cache can be reset between env changes", () => {
  withEnv({ EXIDUS_PUBLIC_DIR: "app/public" }, () => {
    assert.equal(getRuntimeConfig().publicDir, path.join(REPO_ROOT, "app", "public"))
  })

  withEnv({ EXIDUS_PUBLIC_DIR: ".data" }, () => {
    assert.equal(getRuntimeConfig().publicDir, path.join(REPO_ROOT, ".data"))
  })
})

test("invalid PORT values fail loudly", () => {
  withEnv({ PORT: "abc" }, () => {
    assert.throws(
      () => getRuntimeConfig(),
      /Invalid PORT value "abc"\. Set PORT to an integer between 1 and 65535\./,
    )
  })
})
