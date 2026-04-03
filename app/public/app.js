const appNode = document.querySelector("#app")

const state = {
  sessionId: null,
  screen: "landing",
  flow: [],
  runtimeStack: null,
  answers: {},
  submission: null,
  routeLog: [],
  loading: false,
  guidanceLoading: false,
  destinationLoading: false,
  comparisonLoading: false,
  planningLoading: false,
  refinementLoading: false,
  improvementLoading: false,
  reviewDecisionLoadingId: "",
  destinationInput: "",
  comparisonInput: "",
  refinementIntentInput: "",
  refinementPrioritiesInput: "",
  refinementDestinationInput: "",
  refinementNotesInput: "",
  reviewReviewerInput: "Human reviewer",
  reviewDraftNotes: {},
  error: "",
}

let sessionHydrated = false
let sessionSyncTimer = null
let lastSessionSnapshot = ""
let sessionSyncInFlight = false

const GENERIC_REFINEMENT_INTENTS = [
  "update my report based on this new direction.",
  "revise my report after comparison.",
  "what changed now that my priorities are clearer?",
]

init().catch((error) => {
  renderError(error instanceof Error ? error.message : "Failed to load the app.")
})

async function init() {
  const [flowResponse, runtimeResponse, sessionResponse] = await Promise.all([
    fetch("/api/assessment/flow"),
    fetch("/api/runtime/stack"),
    fetch("/api/session/current"),
  ])
  const flowPayload = await flowResponse.json()
  const runtimePayload = await runtimeResponse.json()
  const sessionPayload = await sessionResponse.json()
  state.flow = flowPayload.flow
  state.runtimeStack = runtimePayload
  hydrateSessionState(sessionPayload.session)
  sessionHydrated = true
  render()
}

function hydrateSessionState(session) {
  if (!session) {
    return
  }

  state.sessionId = session.sessionId || null

  const journey = session.journey || {}
  state.answers = journey.answers && typeof journey.answers === "object" ? journey.answers : {}
  state.routeLog = Array.isArray(journey.routeLog) ? journey.routeLog : []
  state.destinationInput = journey.destinationInput || ""
  state.comparisonInput = journey.comparisonInput || ""
  state.refinementIntentInput = journey.refinementIntentInput || ""
  state.refinementPrioritiesInput = journey.refinementPrioritiesInput || ""
  state.refinementDestinationInput = journey.refinementDestinationInput || ""
  state.refinementNotesInput = journey.refinementNotesInput || ""

  const artifacts = session.artifacts && typeof session.artifacts === "object" ? session.artifacts : null
  state.submission = artifacts && Object.keys(artifacts).length ? { ...artifacts } : null

  if (state.submission?.clarityReport) {
    state.submission.baselineClarityReport = state.submission.clarityReport
    state.screen = journey.screen || "results"
    lastSessionSnapshot = JSON.stringify(buildPersistedJourneyState())
    return
  }

  state.screen = journey.screen || "landing"
  lastSessionSnapshot = JSON.stringify(buildPersistedJourneyState())
}

function scheduleSessionSync() {
  if (!sessionHydrated) {
    return
  }

  const snapshot = JSON.stringify(buildPersistedJourneyState())
  if (snapshot === lastSessionSnapshot) {
    return
  }

  if (sessionSyncTimer) {
    clearTimeout(sessionSyncTimer)
  }

  sessionSyncTimer = setTimeout(() => {
    persistSessionState().catch(() => {})
  }, 250)
}

async function persistSessionState() {
  if (sessionSyncInFlight) {
    sessionSyncTimer = setTimeout(() => {
      persistSessionState().catch(() => {})
    }, 150)
    return
  }

  const journeyState = buildPersistedJourneyState()
  const snapshot = JSON.stringify(journeyState)
  if (snapshot === lastSessionSnapshot) {
    return
  }

  sessionSyncInFlight = true

  try {
    const response = await fetch("/api/session/state", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        journeyState,
      }),
    })

    if (!response.ok) {
      return
    }

    const payload = await response.json()
    state.sessionId = payload.sessionId || state.sessionId
    lastSessionSnapshot = snapshot
  } finally {
    sessionSyncInFlight = false
  }
}

function buildPersistedJourneyState() {
  return {
    screen: state.submission?.clarityReport ? "results" : state.screen,
    answers: state.answers,
    routeLog: state.routeLog,
    destinationInput: state.destinationInput,
    comparisonInput: state.comparisonInput,
    refinementIntentInput: state.refinementIntentInput,
    refinementPrioritiesInput: state.refinementPrioritiesInput,
    refinementDestinationInput: state.refinementDestinationInput,
    refinementNotesInput: state.refinementNotesInput,
  }
}

async function resetPersistedSession() {
  const response = await fetch("/api/session/reset", {
    method: "POST",
  })
  const payload = await response.json()

  state.sessionId = payload.sessionId || null
  state.screen = "landing"
  state.answers = {}
  state.submission = null
  state.routeLog = []
  state.loading = false
  state.guidanceLoading = false
  state.destinationLoading = false
  state.comparisonLoading = false
  state.planningLoading = false
  state.refinementLoading = false
  state.improvementLoading = false
  state.reviewDecisionLoadingId = ""
  state.destinationInput = ""
  state.comparisonInput = ""
  state.refinementIntentInput = ""
  state.refinementPrioritiesInput = ""
  state.refinementDestinationInput = ""
  state.refinementNotesInput = ""
  state.reviewReviewerInput = "Human reviewer"
  state.reviewDraftNotes = {}
  state.error = ""
  lastSessionSnapshot = ""
}

function render() {
  if (!appNode) {
    return
  }

  scheduleSessionSync()

  if (state.loading) {
    appNode.innerHTML = `
      <section class="screen state-message">
        <h2>Generating your baseline clarity report</h2>
        <p class="lede">The assessment answers are being mapped into the Exidus runtime and passed through the Clarity Engine now.</p>
      </section>
    `
    return
  }

  if (state.screen === "landing") {
    appNode.innerHTML = `
      <section class="screen">
        <p class="eyebrow">Mission 2</p>
        <h2>Move from “I want out” to “here’s what actually fits.”</h2>
        <p class="lede">The Exidus Relocation Clarity Assessment helps Black Americans think more clearly about life abroad by identifying what matters most, what their real life allows, and what kind of direction fits best.</p>
        <div class="screen-actions">
          <button class="button button-primary" data-action="next" data-target="what-this-is">Start the Assessment</button>
        </div>
      </section>
    `
    bindScreenButtons()
    return
  }

  if (state.screen === "what-this-is") {
    appNode.innerHTML = `
      <section class="screen">
        <h2>What this assessment is</h2>
        <p class="lede">This is a guided decision-support experience for Black Americans seriously considering life abroad.</p>
        <p class="helper">It is designed to help you clarify why you want to leave, define what matters most in a destination, assess what your real life makes possible right now, and identify a more grounded next direction.</p>
        <p class="helper">It is not legal, tax, immigration, or financial advice. And it is not a magic country-picker.</p>
        <div class="screen-actions">
          <button class="button button-secondary" data-action="next" data-target="landing">Back</button>
          <button class="button button-primary" data-action="next" data-target="how-it-works">Continue</button>
        </div>
      </section>
    `
    bindScreenButtons()
    return
  }

  if (state.screen === "how-it-works") {
    appNode.innerHTML = `
      <section class="screen">
        <h2>How it works</h2>
        <p class="lede">You will move through five guided modules covering why you want out, what you want more of, what matters most in a destination, what your current life allows, and what kind of next direction makes the most sense.</p>
        <p class="helper">At the end, you will receive a baseline clarity report with your motivation profile, fit priorities, readiness summary, fit direction, and immediate next-step guidance.</p>
        <div class="screen-actions">
          <button class="button button-secondary" data-action="next" data-target="what-this-is">Back</button>
          <button class="button button-primary" data-action="start-modules">Begin</button>
        </div>
      </section>
    `
    bindScreenButtons()
    return
  }

  if (state.screen === "review") {
    renderReview()
    return
  }

  if (state.screen === "results") {
    renderResults()
    return
  }

  renderModule()
}

function bindScreenButtons() {
  document.querySelectorAll("[data-action='next']").forEach((button) => {
    button.addEventListener("click", () => {
      state.screen = button.getAttribute("data-target")
      render()
    })
  })

  const startButton = document.querySelector("[data-action='start-modules']")
  if (startButton) {
    startButton.addEventListener("click", () => {
      state.screen = state.flow[0].id
      render()
    })
  }
}

function renderModule() {
  const moduleIndex = state.flow.findIndex((item) => item.id === state.screen)
  const module = state.flow[moduleIndex]
  if (!module) {
    state.screen = "landing"
    render()
    return
  }

  const progress = ((moduleIndex + 1) / state.flow.length) * 100
  appNode.innerHTML = `
    <section class="screen">
      <div class="progress">
        <div class="progress-label">
          <span>Step ${module.step} of ${state.flow.length}</span>
          <span>You’re building a clearer picture of what actually fits.</span>
        </div>
        <div class="progress-track">
          <div class="progress-bar" style="width: ${progress}%"></div>
        </div>
      </div>
      <div class="module-intro">
        <h2>${escapeHtml(module.title)}</h2>
        <p class="lede">${escapeHtml(module.intro)}</p>
      </div>
      <div class="question-list">
        ${module.questions.map(renderQuestion).join("")}
      </div>
      ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
      <div class="module-actions">
        <button class="button button-secondary" data-action="module-back">Back</button>
        <button class="button button-primary" data-action="module-next">${moduleIndex === state.flow.length - 1 ? "Review answers" : "Continue"}</button>
      </div>
    </section>
  `

  bindQuestionInputs(module)
  document
    .querySelector("[data-action='module-back']")
    .addEventListener("click", () => {
      state.error = ""
      state.screen = moduleIndex === 0 ? "how-it-works" : state.flow[moduleIndex - 1].id
      render()
    })

  document
    .querySelector("[data-action='module-next']")
    .addEventListener("click", () => {
      const validation = validateModule(module)
      if (validation) {
        state.error = validation
        render()
        return
      }

      state.error = ""
      state.screen = moduleIndex === state.flow.length - 1 ? "review" : state.flow[moduleIndex + 1].id
      render()
    })
}

function renderQuestion(question) {
  const value = state.answers[question.id]
  const helper = question.helper ? `<p class="helper">${escapeHtml(question.helper)}</p>` : ""

  if (question.type === "singleSelect") {
    return `
      <section class="question-card">
        <h3>${escapeHtml(question.prompt)}</h3>
        ${helper}
        <div class="options-grid">
          ${question.options.map((option) => `
            <button
              type="button"
              class="option-button ${value === option.value ? "is-selected" : ""}"
              data-question="${question.id}"
              data-kind="single"
              data-value="${option.value}"
            >
              ${escapeHtml(option.label)}
            </button>
          `).join("")}
        </div>
      </section>
    `
  }

  if (question.type === "multiSelect" || question.type === "rankedSelect") {
    const selected = Array.isArray(value) ? value : []
    return `
      <section class="question-card">
        <h3>${escapeHtml(question.prompt)}</h3>
        ${helper}
        <div class="options-grid">
          ${question.options.map((option) => {
            const selectedIndex = selected.indexOf(option.value)
            const selectedBadge = selectedIndex >= 0
              ? `<span class="selected-rank">${selectedIndex + 1}</span>`
              : ""
            return `
              <button
                type="button"
                class="option-button ${selectedIndex >= 0 ? "is-selected" : ""}"
                data-question="${question.id}"
                data-kind="${question.type}"
                data-value="${option.value}"
              >
                ${selectedBadge}${escapeHtml(option.label)}
              </button>
            `
          }).join("")}
        </div>
      </section>
    `
  }

  if (question.type === "scale") {
    return `
      <section class="question-card">
        <h3>${escapeHtml(question.prompt)}</h3>
        ${helper}
        <div class="scale-grid">
          ${Array.from({ length: question.scale.max - question.scale.min + 1 }, (_, index) => {
            const score = index + question.scale.min
            return `
              <button
                type="button"
                class="scale-button ${value === score ? "is-selected" : ""}"
                data-question="${question.id}"
                data-kind="scale"
                data-value="${score}"
              >
                ${score}
              </button>
            `
          }).join("")}
        </div>
        <div class="scale-meta">
          <span>${escapeHtml(question.scale.minLabel)}</span>
          <span>${escapeHtml(question.scale.maxLabel)}</span>
        </div>
      </section>
    `
  }

  return `
    <section class="question-card">
      <h3>${escapeHtml(question.prompt)}</h3>
      ${helper}
      <textarea
        class="textarea"
        data-question="${question.id}"
        placeholder="${escapeHtml(question.placeholder || "")}"
      >${typeof value === "string" ? escapeHtml(value) : ""}</textarea>
    </section>
  `
}

function bindQuestionInputs(module) {
  document.querySelectorAll("[data-kind='single']").forEach((button) => {
    button.addEventListener("click", () => {
      state.answers[button.dataset.question] = button.dataset.value
      render()
    })
  })

  document.querySelectorAll("[data-kind='multiSelect']").forEach((button) => {
    button.addEventListener("click", () => {
      const question = findQuestion(module, button.dataset.question)
      const current = Array.isArray(state.answers[question.id]) ? [...state.answers[question.id]] : []
      const value = button.dataset.value
      const index = current.indexOf(value)
      if (index >= 0) {
        current.splice(index, 1)
      } else if (!question.maxSelections || current.length < question.maxSelections) {
        if (value === "none") {
          state.answers[question.id] = ["none"]
          render()
          return
        }
        const cleaned = current.filter((item) => item !== "none")
        cleaned.push(value)
        state.answers[question.id] = cleaned
        render()
        return
      }
      state.answers[question.id] = current
      render()
    })
  })

  document.querySelectorAll("[data-kind='rankedSelect']").forEach((button) => {
    button.addEventListener("click", () => {
      const question = findQuestion(module, button.dataset.question)
      const current = Array.isArray(state.answers[question.id]) ? [...state.answers[question.id]] : []
      const value = button.dataset.value
      const index = current.indexOf(value)
      if (index >= 0) {
        current.splice(index, 1)
      } else if (!question.maxSelections || current.length < question.maxSelections) {
        current.push(value)
      }
      state.answers[question.id] = current
      render()
    })
  })

  document.querySelectorAll("[data-kind='scale']").forEach((button) => {
    button.addEventListener("click", () => {
      state.answers[button.dataset.question] = Number(button.dataset.value)
      render()
    })
  })

  document.querySelectorAll("textarea[data-question]").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      state.answers[textarea.dataset.question] = textarea.value
    })
  })
}

function renderReview() {
  appNode.innerHTML = `
    <section class="screen">
      <h2>Review your baseline assessment</h2>
      <p class="lede">This is the last pass before the Clarity Engine turns your answers into a baseline report.</p>
      <div class="review-grid">
        ${state.flow.map((module) => {
          const list = module.questions
            .map((question) => {
              const summary = summarizeAnswer(question)
              return summary ? `<li>${escapeHtml(summary)}</li>` : ""
            })
            .filter(Boolean)
            .join("")

          return `
            <section class="review-card">
              <h3>${escapeHtml(module.title)}</h3>
              <ul class="priority-list">${list || "<li>No answers yet.</li>"}</ul>
            </section>
          `
        }).join("")}
      </div>
      ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
      <div class="review-actions">
        <button class="button button-secondary" data-action="review-back">Back</button>
        <button class="button button-primary" data-action="submit">Generate baseline result</button>
      </div>
    </section>
  `

  document.querySelector("[data-action='review-back']").addEventListener("click", () => {
    state.screen = state.flow[state.flow.length - 1].id
    state.error = ""
    render()
  })

  document.querySelector("[data-action='submit']").addEventListener("click", submitAssessment)
}

async function submitAssessment() {
  state.error = ""
  state.loading = true
  render()

  try {
    const response = await fetch("/api/assessment/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answers: state.answers,
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload.error || "Failed to generate clarity report.")
    }
    state.sessionId = payload.sessionId || state.sessionId
    state.submission = payload
    state.submission.baselineClarityReport = payload.clarityReport
    state.submission.reportRevision = null
    state.destinationInput = (payload.userProfile?.destinationsConsidering || []).join(", ")
    state.comparisonInput = ""
    state.refinementPrioritiesInput = (payload.userProfile?.topPriorities || []).join(", ")
    state.refinementDestinationInput = (payload.userProfile?.destinationsConsidering || []).join(", ")
    state.refinementNotesInput = (payload.userProfile?.specialNotes || []).join("\n")
    state.refinementIntentInput = ""
    state.submission.actionPlan = null
    state.submission.improvementReview = null
    state.routeLog = [
      createRouteLogEntry({
        stage: "clarity",
        route: payload.route,
        message: "Baseline clarity artifacts were created from the assessment submission.",
        submission: payload,
      }),
    ]
    state.screen = "results"
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unexpected submission failure."
    state.screen = "review"
  } finally {
    state.loading = false
    render()
  }
}

function renderResults() {
  const report = state.submission?.clarityReport
  const reportRevision = state.submission?.reportRevision
  if (!report) {
    state.screen = "review"
    render()
    return
  }

  const flowContext = deriveFlowContext()

  appNode.innerHTML = `
    <section class="result-hero">
      <p class="eyebrow">${escapeHtml(reportRevision ? "Refined Clarity Result" : "Baseline Clarity Result")}</p>
      <h2>${escapeHtml(report.summary.fitDirectionSummary)}</h2>
      <p class="lede">${escapeHtml(report.summary.motivationSummary)}</p>
      <div class="hero-grid">
        <div class="metric">
          <span class="metric-label">Readiness level</span>
          <strong>${escapeHtml(humanizeEnum(report.readinessProfile.readinessLevel))}</strong>
        </div>
        <div class="metric">
          <span class="metric-label">Primary archetype</span>
          <strong>${escapeHtml(humanizeEnum(report.archetypeProfile.primaryLifeArchetype))}</strong>
        </div>
        <div class="metric">
          <span class="metric-label">Fit direction</span>
          <strong>${escapeHtml(humanizeEnum(report.archetypeProfile.fitDirectionArchetype))}</strong>
        </div>
      </div>
      ${reportRevision ? `<p class="muted">${escapeHtml(reportRevision.revisionSummary)}</p>` : ""}
    </section>
    ${renderFlowOverview(flowContext)}
    ${state.error ? renderStageNotice({
      tone: "error",
      title: "Something needs attention",
      body: state.error,
    }) : ""}
    ${renderJourneySection(flowContext)}
    ${renderInspectSection()}
    ${renderImprovementSection()}
    <div class="result-grid">
      <section>
        <h3>Top priorities</h3>
        <ul class="token-list">
          ${report.topPriorities.map((item) => `<li class="token">${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>
      <section>
        <h3>Non-negotiables</h3>
        <ul class="token-list">
          ${(report.nonNegotiables.length > 0 ? report.nonNegotiables : ["None named yet"])
            .map((item) => `<li class="token">${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>
      <section>
        <h3>Contradiction flags</h3>
        <ul class="priority-list">
          ${(report.contradictionFlags.length > 0 ? report.contradictionFlags : ["No major contradiction flags were raised in this baseline pass."])
            .map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>
      <section>
        <h3>Readiness profile</h3>
        <p>${escapeHtml(report.summary.readinessSummary)}</p>
        <p class="muted">${escapeHtml(report.summary.nextStepSummary)}</p>
      </section>
      <section>
        <h3>Motivation and life profile</h3>
        <p>${escapeHtml(report.summary.desiredLifeSummary)}</p>
        <p class="muted">${escapeHtml(report.summary.frictionSummary)}</p>
      </section>
      <section>
        <h3>Highlights</h3>
        <ul class="priority-list">
          ${report.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>
    </div>
    <section class="guide-panel">
      <div class="guide-panel-header">
        <div>
          <p class="eyebrow">Guide Agent</p>
          <h3>Interpret this result</h3>
        </div>
        <p class="muted">Use the Clarity artifacts to understand what this result means before moving into deeper research or planning.</p>
      </div>
      <div class="screen-actions guide-actions">
        <button class="button button-secondary" data-action="guide-intent" data-intent="Help me understand my results.">Help me understand my results</button>
        <button class="button button-secondary" data-action="guide-intent" data-intent="What should I focus on next?">What should I focus on next?</button>
        <button class="button button-secondary" data-action="guide-intent" data-intent="Explain this fit direction.">Explain this fit direction</button>
      </div>
      ${renderGuidanceSection()}
    </section>
    <section class="guide-panel destination-panel">
      <div class="guide-panel-header">
        <div>
          <p class="eyebrow">Destination Research Agent</p>
          <h3>Turn your Clarity profile into destination research</h3>
        </div>
        <p class="muted">This first pass stays grounded in your profile, readiness, and top priorities. It does not pretend to settle legal or tax certainty.</p>
      </div>
      ${renderDestinationSection()}
    </section>
    <section class="guide-panel comparison-panel">
      <div class="guide-panel-header">
        <div>
          <p class="eyebrow">Fit Comparison Agent</p>
          <h3>Narrow a real shortlist after research exists</h3>
        </div>
        <p class="muted">This compares researched destinations through your profile, readiness, non-negotiables, and visible tradeoffs. It does not flatten everything into one magic score.</p>
      </div>
      ${renderComparisonSection()}
    </section>
    <section class="guide-panel planning-panel">
      <div class="guide-panel-header">
        <div>
          <p class="eyebrow">Action Planning Agent</p>
          <h3>Turn clarity and shortlist thinking into a practical next-step plan</h3>
        </div>
        <p class="muted">This layer stays pacing-aware. It can plan after comparison, or earlier when the real need is a clarity-first or research-first next month.</p>
      </div>
      ${renderPlanningSection()}
    </section>
    <section class="guide-panel refinement-panel">
      <div class="guide-panel-header">
        <div>
          <p class="eyebrow">Report Refinement Agent</p>
          <h3>Update the working report without losing continuity</h3>
        </div>
        <p class="muted">Use this after priorities shift or downstream findings clarify the direction. The update path revises only the parts that should move and makes the delta explicit.</p>
      </div>
      ${renderRefinementSection()}
    </section>
    <div class="screen-actions">
      <button class="button button-secondary" data-action="restart">Start over</button>
    </div>
  `

  document.querySelectorAll("[data-action='guide-intent']").forEach((button) => {
    button.addEventListener("click", () => {
      requestGuidance(button.dataset.intent)
    })
  })

  bindJourneyActions()
  bindDestinationActions()
  bindComparisonActions()
  bindPlanningActions()
  bindRefinementActions()
  bindImprovementActions()

  document.querySelector("[data-action='restart']").addEventListener("click", async () => {
    try {
      await resetPersistedSession()
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Failed to reset the session."
    }
    render()
  })
}

function renderJourneySection(flowContext = deriveFlowContext()) {
  const stages = flowContext.stages

  return `
    <section class="guide-panel journey-panel">
      <div class="guide-panel-header">
        <div>
          <p class="eyebrow">Product Path</p>
          <h3>Track the current product path</h3>
        </div>
        <p class="muted">Each stage shows whether it is complete, ready, provisional, or blocked, plus the clearest next move from here.</p>
      </div>
      <div class="guide-grid journey-grid">
        ${stages.map((stage) => `
          <article class="guide-card journey-card journey-card-${escapeHtml(stage.status)}">
            <p class="eyebrow">${escapeHtml(stage.label)}</p>
            <h4>${escapeHtml(stage.headline)}</h4>
            <div class="stage-pill-row">
              ${renderStatusPill(stage.status, stage.statusLabel)}
              ${stage.supportingLabel ? renderStatusPill("neutral", stage.supportingLabel) : ""}
            </div>
            <p>${escapeHtml(stage.summary)}</p>
            ${stage.blocker ? `<p class="muted">${escapeHtml(stage.blocker)}</p>` : ""}
            ${stage.meta.length ? `
              <ul class="priority-list">
                ${stage.meta.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            ` : ""}
            ${stage.action ? `
              <div class="screen-actions">
                <button
                  class="button ${stage.status === "complete" ? "button-secondary" : "button-primary"}"
                  data-action="journey-trigger"
                  data-stage="${escapeHtml(stage.key)}"
                >
                  ${escapeHtml(stage.action)}
                </button>
              </div>
            ` : ""}
          </article>
        `).join("")}
      </div>
    </section>
  `
}

function renderInspectSection() {
  const artifactInventory = buildArtifactInventory()
  const routeLog = state.routeLog || []
  const manifestAgents = state.runtimeStack?.manifest?.agents || []
  const apiPaths = state.runtimeStack?.apiPaths || []

  return `
    <section class="guide-panel inspect-panel">
      <div class="guide-panel-header">
        <div>
          <p class="eyebrow">Inspect</p>
          <h3>Runtime stack, routes, and artifacts</h3>
        </div>
        <p class="muted">This is the current runtime surface behind the demo path, including the implemented stack, API paths, and the artifact chain built in this session.</p>
      </div>
      <div class="guide-grid inspect-grid">
        <article class="guide-card">
          <p class="eyebrow">Artifact chain</p>
          <h4>Current runtime objects</h4>
          <ul class="priority-list">
            ${artifactInventory.map((artifact) => `<li>${escapeHtml(artifact)}</li>`).join("")}
          </ul>
        </article>
        <article class="guide-card">
          <p class="eyebrow">Route history</p>
          <h4>Triggered stages in this session</h4>
          <ul class="priority-list">
            ${routeLog.length
              ? routeLog.map((entry) => `<li>${escapeHtml(formatRouteEntry(entry))}</li>`).join("")
              : "<li>No routed stages have been triggered yet.</li>"}
          </ul>
        </article>
        <article class="guide-card">
          <p class="eyebrow">Implemented stack</p>
          <h4>${escapeHtml(state.runtimeStack?.manifest?.system || "Exidus runtime")}</h4>
          <ul class="priority-list">
            ${manifestAgents.map((agent) => `<li>${escapeHtml(`${agent.name} (${agent.id}) -> ${agent.outputs.join(", ")}`)}</li>`).join("")}
          </ul>
        </article>
        <article class="guide-card">
          <p class="eyebrow">App/API paths</p>
          <h4>Surface currently wired endpoints</h4>
          <ul class="priority-list">
            ${apiPaths.map((path) => `<li>${escapeHtml(`${path.method} ${path.path} -> ${path.stage}`)}</li>`).join("")}
          </ul>
        </article>
      </div>
    </section>
  `
}

function renderImprovementSection() {
  const review = state.submission?.improvementReview
  const reviewState = review?.reviewState
  const proposalQueue = review?.proposalQueue || []
  const reviewCount = reviewState?.totalProposals || proposalQueue.length

  return `
    <section class="guide-panel inspect-panel">
      <div class="guide-panel-header">
        <div>
          <p class="eyebrow">Improvement Layer</p>
          <h3>Run the internal bounded review path</h3>
        </div>
        <p class="muted">This is a proposal-only internal pass. It can run a basic eval, generate findings, and draft revisions, but it cannot mutate prompts, router logic, or schemas live.</p>
      </div>
      <div class="screen-actions guide-actions">
        <button class="button button-primary" data-action="improvement-review">
          ${state.improvementLoading ? "Review running..." : "Run internal review"}
        </button>
      </div>
      ${state.improvementLoading ? `
        <div class="guide-card">
          <p class="lede">The Improvement Agent is evaluating the current runtime chain and drafting review artifacts now.</p>
        </div>
      ` : review ? `
        <div class="guide-grid inspect-grid">
          <article class="guide-card">
            <p class="eyebrow">Review summary</p>
            <h4>${escapeHtml(review.reviewSummary)}</h4>
            <ul class="priority-list">
              <li>Target agent: ${escapeHtml(humanizeEnum(review.targetAgentId))}</li>
              <li>Eval outcome: ${escapeHtml(humanizeEnum(review.evalResult.outcome))}</li>
              <li>Findings: ${escapeHtml(String(review.findings.length))}</li>
              <li>Draft proposals: ${escapeHtml(String(reviewCount))}</li>
              <li>Review state: ${escapeHtml(humanizeEnum(reviewState?.status || "pending-human-review"))}</li>
            </ul>
          </article>
          <article class="guide-card">
            <p class="eyebrow">Eval scores</p>
            <h4>${escapeHtml(review.evalCase.title)}</h4>
            <ul class="priority-list">
              ${Object.entries(review.evalResult.scores || {})
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => `<li>${escapeHtml(`${humanizeEnum(key)}: ${value}`)}</li>`)
                .join("")}
            </ul>
            <p class="muted">${escapeHtml(review.evalResult.summary)}</p>
          </article>
          <article class="guide-card">
            <p class="eyebrow">Approval boundary</p>
            <h4>Human review remains required</h4>
            <ul class="priority-list">
              ${review.approvalBoundary.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
              ${review.approvalBoundary.blockedActions.map((item) => `<li>Blocked: ${escapeHtml(item)}</li>`).join("")}
            </ul>
          </article>
          <article class="guide-card">
            <p class="eyebrow">Proposal queue</p>
            <h4>${escapeHtml(review.approvalBoundary.reviewRequiredProposalIds.length ? "Pending human review" : "No proposals queued")}</h4>
            <ul class="priority-list">
              ${(review.approvalBoundary.reviewRequiredProposalIds.length
                ? review.approvalBoundary.reviewRequiredProposalIds
                : ["No draft proposals require review right now."])
                .map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </article>
          <article class="guide-card">
            <p class="eyebrow">Decision counts</p>
            <h4>First-pass review progress</h4>
            <ul class="priority-list">
              <li>Pending: ${escapeHtml(String(reviewState?.pendingCount || 0))}</li>
              <li>Approved: ${escapeHtml(String(reviewState?.approvedCount || 0))}</li>
              <li>Approved with notes: ${escapeHtml(String(reviewState?.approvedWithNotesCount || 0))}</li>
              <li>Rejected: ${escapeHtml(String(reviewState?.rejectedCount || 0))}</li>
            </ul>
          </article>
        </div>
        <div class="guide-grid inspect-grid">
          <article class="guide-card">
            <p class="eyebrow">Findings</p>
            <h4>${escapeHtml(review.findings.length ? "Observed issues" : "No review findings")}</h4>
            <ul class="priority-list">
              ${(review.findings.length
                ? review.findings.map((finding) =>
                    `${humanizeEnum(finding.severity)} ${humanizeEnum(finding.category)}: ${finding.summary}${finding.evidenceRefs?.length ? ` [${finding.evidenceRefs.join(", ")}]` : ""}`,
                  )
                : ["No concrete findings were generated in this pass."])
                .map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </article>
        </div>
        <div class="guide-card review-decision-card">
          <p class="eyebrow">Reviewer</p>
          <h4>Record explicit human decisions</h4>
          <p class="muted">Approvals and rejections are persisted as review records only. They do not deploy or mutate runtime artifacts.</p>
          <label class="field-label" for="reviewer-input">Reviewer name</label>
          <input id="reviewer-input" class="text-input" data-role="reviewer-input" value="${escapeAttribute(state.reviewReviewerInput)}" placeholder="Human reviewer" />
        </div>
        <div class="proposal-card-grid">
          ${proposalQueue.length
            ? proposalQueue.map((proposal) => renderProposalReviewCard(proposal)).join("")
            : `
              <article class="guide-card guide-card-empty">
                <p class="muted">This review pass generated no draft proposals, so there is nothing to approve or reject.</p>
              </article>
            `}
        </div>
      ` : `
        <div class="guide-card guide-card-empty">
          <p class="muted">Run the bounded review after generating some runtime artifacts. The output will stay draft-only and human-review gated.</p>
        </div>
      `}
    </section>
  `
}

function bindJourneyActions() {
  document.querySelectorAll("[data-action='journey-trigger']").forEach((button) => {
    button.addEventListener("click", () => {
      const stage = button.dataset.stage
      if (stage === "guide") {
        requestGuidance("Help me understand my results.")
        return
      }
      if (stage === "research") {
        requestDestinationResearch(
          `Research ${state.destinationInput || "my destination options"} for me.`,
          state.destinationInput,
        )
        return
      }
      if (stage === "comparison") {
        requestFitComparison(
          `Compare ${state.comparisonInput || "my researched destinations"} for me.`,
          state.comparisonInput,
        )
        return
      }
      if (stage === "planning") {
        requestActionPlan("Build my next 30 days.")
        return
      }
      if (stage === "refinement") {
        requestReportRefinement(
          state.refinementIntentInput || "Update my report based on this new direction.",
        )
      }
    })
  })
}

function bindImprovementActions() {
  const button = document.querySelector("[data-action='improvement-review']")
  if (!button) {
    return
  }

  button.addEventListener("click", () => {
    requestImprovementReview()
  })

  const reviewerInput = document.querySelector("[data-role='reviewer-input']")
  if (reviewerInput) {
    reviewerInput.addEventListener("input", () => {
      state.reviewReviewerInput = reviewerInput.value
    })
  }

  document.querySelectorAll("[data-role='proposal-review-notes']").forEach((node) => {
    node.addEventListener("input", () => {
      state.reviewDraftNotes[node.dataset.proposalId] = node.value
    })
  })

  document.querySelectorAll("[data-action='record-review-decision']").forEach((buttonNode) => {
    buttonNode.addEventListener("click", () => {
      requestImprovementDecision(
        buttonNode.dataset.proposalId,
        buttonNode.dataset.decision,
      )
    })
  })
}

function bindDestinationActions() {
  const destinationInput = document.querySelector("[data-role='destination-input']")
  if (destinationInput) {
    destinationInput.addEventListener("input", () => {
      state.destinationInput = destinationInput.value
    })
  }

  document.querySelectorAll("[data-action='destination-intent']").forEach((button) => {
    button.addEventListener("click", () => {
      requestDestinationResearch(button.dataset.intent, button.dataset.destinations)
    })
  })

  const submitButton = document.querySelector("[data-action='destination-submit']")
  if (submitButton) {
    submitButton.addEventListener("click", () => {
      requestDestinationResearch(
        `Research ${state.destinationInput || "my destination options"} for me.`,
        state.destinationInput,
      )
    })
  }
}

function renderGuidanceSection() {
  if (state.guidanceLoading) {
    return `
      ${renderStageNotice({
        tone: "loading",
        title: "Guide read in progress",
        body: "The Guide Agent is interpreting the current Clarity artifacts now.",
      })}
    `
  }

  const guidance = state.submission?.guidanceSummary
  if (!guidance) {
    return `
      ${renderStageNotice({
        tone: "ready",
        title: "Guide is the next coherent step",
        body: "Choose one of the interpretation prompts to generate a first-pass Guide read grounded in your Clarity report.",
        detail: "This stage explains the baseline result before destination research, comparison, or planning pull the product into a deeper path.",
      })}
    `
  }

  return `
    <div class="guide-card">
      <p class="eyebrow">Guide Read</p>
      <h4>${escapeHtml(guidance.summary)}</h4>
      <p>${escapeHtml(guidance.explanation)}</p>
      ${renderArtifactMeta([
        `Mode: ${humanizeEnum(guidance.mode)}`,
        `Readiness: ${humanizeEnum(guidance.groundedIn.readinessLevel)}`,
        `Fit direction: ${humanizeEnum(guidance.groundedIn.fitDirectionArchetype)}`,
      ])}
      <div class="guide-grid">
        <section>
          <h5>What this means</h5>
          <ul class="priority-list">
            ${guidance.whatThisMeans.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
        <section>
          <h5>What matters most now</h5>
          <ul class="priority-list">
            ${guidance.whatMattersMostNow.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
        <section>
          <h5>Focus next</h5>
          <ul class="priority-list">
            ${guidance.focusNext.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
        <section>
          <h5>Tension notes</h5>
          <ul class="priority-list">
            ${guidance.tensionNotes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
      </div>
      ${guidance.suggestedNextMove ? `<p class="guide-next"><strong>Suggested next move:</strong> ${escapeHtml(guidance.suggestedNextMove)}</p>` : ""}
    </div>
  `
}

function renderDestinationSection() {
  if (!state.submission?.guidanceSummary) {
    return `
      ${renderStageNotice({
        tone: "blocked",
        title: "Destination research is waiting on Guide",
        body: "Run a Guide interpretation first so research starts from an interpreted result instead of a raw report.",
        detail: "That keeps the next destination pass grounded in what the baseline result actually means.",
      })}
    `
  }

  if (state.destinationLoading) {
    return `
      ${renderStageNotice({
        tone: "loading",
        title: "Destination research in progress",
        body: "The Destination Research Agent is building a structured first-pass report now.",
      })}
    `
  }

  const destinationsFromProfile = state.submission.userProfile?.destinationsConsidering || []
  const reports = state.submission.destinationResearchReports || []

  if (!state.comparisonInput && reports.length >= 2) {
    state.comparisonInput = reports.map((report) => report.destination).join(", ")
  }

  return `
    <div class="guide-card">
      <p class="muted">Research one or more destinations from your current profile. Use commas for multiple countries.</p>
      <div class="screen-actions guide-actions">
        ${destinationsFromProfile.map((destination) => `
          <button class="button button-secondary" data-action="destination-intent" data-intent="Research ${escapeHtml(destination)} for me." data-destinations="${escapeHtml(destination)}">Research ${escapeHtml(destination)}</button>
        `).join("")}
        <button class="button button-secondary" data-action="destination-intent" data-intent="Go deeper on destination fit." data-destinations="${escapeHtml(state.destinationInput || destinationsFromProfile.join(", "))}">Go deeper on destination fit</button>
      </div>
      <label class="helper" for="destination-input">Destinations to research</label>
      <textarea id="destination-input" class="textarea" data-role="destination-input" placeholder="Portugal, Mexico">${escapeHtml(state.destinationInput || "")}</textarea>
      <div class="screen-actions">
        <button class="button button-primary" data-action="destination-submit">Generate destination research</button>
      </div>
      ${reports.length > 0
        ? renderDestinationReports(reports)
        : renderStageNotice({
            tone: "ready",
            title: "No destination research yet",
            body: "Start with one or more countries you are seriously considering.",
            detail: "The first pass should narrow and pressure-test, not settle the move.",
          })}
    </div>
  `
}

function renderComparisonSection() {
  const reports = state.submission?.destinationResearchReports || []
  if (reports.length < 2) {
    return `
      ${renderStageNotice({
        tone: "blocked",
        title: "Comparison needs a real shortlist",
        body: "Generate at least two destination research reports first. Comparison activates after the shortlist has real artifacts behind it.",
      })}
    `
  }

  if (state.comparisonLoading) {
    return `
      ${renderStageNotice({
        tone: "loading",
        title: "Comparison in progress",
        body: "The Fit Comparison Agent is synthesizing the current shortlist now.",
      })}
    `
  }

  const comparedNames = reports.map((report) => report.destination)
  const comparisonReport = state.submission?.fitComparisonReport

  return `
    <div class="guide-card">
      <p class="muted">Compare the researched shortlist you already have. Use commas for the destinations you want included.</p>
      <div class="screen-actions guide-actions">
        <button class="button button-secondary" data-action="comparison-intent" data-intent="Compare ${escapeHtml(comparedNames.join(" and "))} for me.">Compare current shortlist</button>
        <button class="button button-secondary" data-action="comparison-intent" data-intent="Show me the tradeoffs across my shortlist.">Show shortlist tradeoffs</button>
        <button class="button button-secondary" data-action="comparison-intent" data-intent="Which of these fits me better right now?">Which fits me better right now?</button>
      </div>
      <label class="helper" for="comparison-input">Destinations to compare</label>
      <textarea id="comparison-input" class="textarea" data-role="comparison-input" placeholder="Portugal, Mexico">${escapeHtml(state.comparisonInput || comparedNames.join(", "))}</textarea>
      <div class="screen-actions">
        <button class="button button-primary" data-action="comparison-submit">Generate fit comparison</button>
      </div>
      ${comparisonReport
        ? renderComparisonReport(comparisonReport)
        : renderStageNotice({
            tone: "ready",
            title: "No comparison artifact yet",
            body: "Your shortlist is ready to compare now.",
            detail: "Use comparison to surface tradeoffs before treating any destination as the answer.",
          })}
    </div>
  `
}

function renderDestinationReports(reports) {
  return `
    <div class="guide-grid destination-report-grid">
      ${reports.map((report) => `
        <article class="guide-card destination-report-card">
          <p class="eyebrow">${escapeHtml(report.destination)}</p>
          <h4>${escapeHtml(report.quickFitSummary)}</h4>
          ${renderArtifactMeta([
            `Verdict: ${humanizeEnum(report.profileFitVerdict)}`,
            `Confidence: ${humanizeEnum(report.confidence)}`,
            `Lens: ${(report.profileLens.topPriorities || []).slice(0, 3).join(", ") || "No priorities available"}`,
          ])}
          <div class="guide-grid">
            ${renderDestinationSectionCard("Visa & immigration", report.sections.visaImmigration)}
            ${renderDestinationSectionCard("Cost of living", report.sections.costOfLiving)}
            ${renderDestinationSectionCard("Healthcare", report.sections.healthcare)}
            ${renderDestinationSectionCard("Safety", report.sections.safety)}
            ${renderDestinationSectionCard("Climate & environment", report.sections.climateEnvironment)}
            ${renderDestinationSectionCard("Tax implications", report.sections.taxImplications)}
            ${renderDestinationSectionCard("Culture & integration", report.sections.cultureIntegration)}
            ${report.sections.education ? renderDestinationSectionCard("Education", report.sections.education) : ""}
          </div>
          <section>
            <h5>Why it may fit</h5>
            <ul class="priority-list">
              ${report.fitNotes.whyItMayFit.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </section>
          <section>
            <h5>Tradeoffs and cautions</h5>
            <ul class="priority-list">
              ${[...report.fitNotes.whyItMayNotFit, ...report.fitNotes.majorTradeoffs].map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </section>
          <section>
            <h5>Next questions</h5>
            <ul class="priority-list">
              ${report.recommendedNextQuestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </section>
          ${report.sources?.length ? `
            <section>
              <h5>Sources</h5>
              <ul class="priority-list">
                ${report.sources.map((source) => `<li>${escapeHtml(source.label)}${source.type ? ` (${escapeHtml(source.type)})` : ""}</li>`).join("")}
              </ul>
            </section>
          ` : ""}
          ${report.recommendedNextStep ? `<p class="guide-next"><strong>Recommended next step:</strong> ${escapeHtml(report.recommendedNextStep)}</p>` : ""}
        </article>
      `).join("")}
    </div>
  `
}

function renderDestinationSectionCard(title, section) {
  if (!section) {
    return ""
  }

  return `
    <section>
      <h5>${escapeHtml(title)}</h5>
      <p>${escapeHtml(section.summary)}</p>
      <p class="muted">Confidence: ${escapeHtml(section.confidence)}</p>
      <ul class="priority-list">
        ${section.notes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>
  `
}

function renderComparisonReport(report) {
  const readyForPlanning = report.routeSignals?.readyForActionPlanning

  return `
    <div class="comparison-report">
      <article class="guide-card comparison-summary-card">
        <p class="eyebrow">Comparison summary</p>
        <h4>${escapeHtml(report.comparisonSummary)}</h4>
        ${renderArtifactMeta([
          `Compared: ${report.comparedDestinations.length} destinations`,
          `Planning readiness: ${readyForPlanning ? "Stable enough" : "Still provisional"}`,
          `Needs more research: ${(report.routeSignals?.needsMoreResearchOn || []).join(", ") || "No named gaps"}`,
        ])}
        <div class="hero-grid comparison-metrics">
          <div class="metric">
            <span class="metric-label">Strongest current fit</span>
            <strong>${escapeHtml(report.strongestFit || "No clear lead yet")}</strong>
          </div>
          <div class="metric">
            <span class="metric-label">Strongest practical fit</span>
            <strong>${escapeHtml(report.strongestPracticalFit || "Not separated yet")}</strong>
          </div>
          <div class="metric">
            <span class="metric-label">Strongest emotional fit</span>
            <strong>${escapeHtml(report.strongestEmotionalFit || "Not separated yet")}</strong>
          </div>
          <div class="metric">
            <span class="metric-label">Weakest current fit</span>
            <strong>${escapeHtml(report.weakestFit || "None named")}</strong>
          </div>
        </div>
        <section>
          <h5>Key tradeoffs</h5>
          <ul class="priority-list">
            ${report.keyTradeoffs.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
        <section>
          <h5>Route signal</h5>
          <p>${escapeHtml(
            readyForPlanning
              ? "This shortlist is stable enough for Action Planning to sequence the next move."
              : "This shortlist still needs more pressure-testing before planning should feel final.",
          )}</p>
          ${(report.routeSignals?.needsMoreResearchOn || []).length
            ? `<p class="muted">Needs more research on: ${escapeHtml(report.routeSignals.needsMoreResearchOn.join(", "))}</p>`
            : ""}
        </section>
        ${report.recommendedNextMove ? `<p class="guide-next"><strong>Recommended next move:</strong> ${escapeHtml(report.recommendedNextMove)}</p>` : ""}
        <div class="screen-actions">
          <button class="button button-primary" data-action="planning-intent" data-intent="Build my next 30 days.">Turn this into a plan</button>
          <button class="button button-secondary" data-action="refinement-intent" data-intent="Revise my report after comparison.">Revise report from this comparison</button>
        </div>
      </article>
      <div class="guide-grid destination-report-grid comparison-entry-grid">
        ${report.destinationComparisons.map((entry) => `
          <article class="guide-card destination-report-card comparison-entry-card">
            <p class="eyebrow">${escapeHtml(entry.destination)}</p>
            <h4>${escapeHtml(humanizeEnum(entry.fitVerdict))}</h4>
            <div class="comparison-chip-row">
              <span class="comparison-chip">Practical: ${escapeHtml(humanizeEnum(entry.practicalFit))}</span>
              <span class="comparison-chip">Emotional: ${escapeHtml(humanizeEnum(entry.emotionalFit))}</span>
              <span class="comparison-chip">Current stage: ${escapeHtml(humanizeEnum(entry.currentStageFit))}</span>
              <span class="comparison-chip">Non-negotiables: ${escapeHtml(humanizeEnum(entry.nonNegotiableStatus))}</span>
              <span class="comparison-chip">Confidence: ${escapeHtml(humanizeEnum(entry.confidence))}</span>
            </div>
            <section>
              <h5>Strengths</h5>
              <ul class="priority-list">
                ${entry.strengths.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </section>
            <section>
              <h5>Tensions</h5>
              <ul class="priority-list">
                ${entry.tensions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </section>
            <section>
              <h5>Tradeoffs</h5>
              <ul class="priority-list">
                ${entry.tradeoffs.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </section>
            <section>
              <h5>Notes</h5>
              <ul class="priority-list">
                ${entry.notes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </section>
          </article>
        `).join("")}
      </div>
    </div>
  `
}

async function requestGuidance(userIntent) {
  if (!state.submission) {
    return
  }

  state.guidanceLoading = true
  state.error = ""
  render()

  try {
    const response = await fetch("/api/guide/interpret", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        userIntent,
        artifacts: {
          userProfile: state.submission.userProfile,
          assessmentSignals: state.submission.assessmentSignals,
          readinessProfile: state.submission.readinessProfile,
          archetypeProfile: state.submission.archetypeProfile,
          clarityReport: state.submission.clarityReport,
        },
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload.error || "Failed to generate Guide interpretation.")
    }
    if (!payload.guidanceSummary) {
      throw new Error(payload.route?.reason || "The Guide path was not available for this request.")
    }
    state.submission.guidanceSummary = payload.guidanceSummary
    invalidateImprovementReview()
    appendRouteLog("guide", payload.route, payload.guidanceSummary.summary)
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unexpected Guide failure."
  } finally {
    state.guidanceLoading = false
    render()
  }
}

async function requestDestinationResearch(userIntent, destinationsValue) {
  if (!state.submission) {
    return
  }

  const destinations = String(destinationsValue || state.destinationInput || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  if (!state.submission.guidanceSummary) {
    state.error = "Run a Guide interpretation first so destination research starts from an interpreted result."
    render()
    return
  }

  if (destinations.length === 0) {
    state.error = "Add at least one destination before requesting destination research."
    render()
    return
  }

  state.destinationLoading = true
  state.error = ""
  render()

  try {
    const response = await fetch("/api/destination-research", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        userIntent,
        destinations,
        artifacts: {
          userProfile: state.submission.userProfile,
          assessmentSignals: state.submission.assessmentSignals,
          readinessProfile: state.submission.readinessProfile,
          archetypeProfile: state.submission.archetypeProfile,
          clarityReport: state.submission.clarityReport,
          guidanceSummary: state.submission.guidanceSummary,
          destinationResearchReports: state.submission.destinationResearchReports || [],
        },
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload.error || "Failed to generate destination research.")
    }
    if (!payload.destinationResearchReports) {
      throw new Error(payload.route?.reason || "The destination research path was not available for this request.")
    }
    state.submission.destinationResearchReports = payload.destinationResearchReports
    state.submission.fitComparisonReport = null
    state.submission.actionPlan = null
    invalidateImprovementReview()
    appendRouteLog(
      "research",
      payload.route,
      summarizeDestinations(payload.destinationResearchReports),
    )
    if (state.submission.destinationResearchReports.length >= 2) {
      state.comparisonInput = state.submission.destinationResearchReports
        .map((report) => report.destination)
        .join(", ")
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unexpected destination research failure."
  } finally {
    state.destinationLoading = false
    render()
  }
}

async function requestFitComparison(userIntent, destinationsValue) {
  if (!state.submission) {
    return
  }

  const reports = state.submission.destinationResearchReports || []
  const destinations = String(destinationsValue || state.comparisonInput || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  if (reports.length < 2) {
    state.error = "Generate at least two destination research reports before running comparison."
    render()
    return
  }

  if (destinations.length < 2) {
    state.error = "Select at least two destinations to compare."
    render()
    return
  }

  const availableDestinations = reports.map((report) => report.destination)
  const missingDestinations = destinations.filter((destination) =>
    !availableDestinations.some((name) => normalizeToken(name) === normalizeToken(destination))
  )
  if (missingDestinations.length > 0) {
    state.error = `Comparison can only use researched destinations. Missing research for: ${missingDestinations.join(", ")}.`
    render()
    return
  }

  state.comparisonLoading = true
  state.error = ""
  render()

  try {
    const response = await fetch("/api/fit-comparison", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        userIntent,
        destinations,
        artifacts: {
          userProfile: state.submission.userProfile,
          assessmentSignals: state.submission.assessmentSignals,
          readinessProfile: state.submission.readinessProfile,
          archetypeProfile: state.submission.archetypeProfile,
          clarityReport: state.submission.clarityReport,
          guidanceSummary: state.submission.guidanceSummary,
          destinationResearchReports: state.submission.destinationResearchReports || [],
          fitComparisonReport: state.submission.fitComparisonReport,
        },
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload.error || "Failed to generate fit comparison.")
    }
    if (!payload.fitComparisonReport) {
      throw new Error(payload.route?.reason || "The fit comparison path was not available for this request.")
    }
    state.submission.fitComparisonReport = payload.fitComparisonReport
    state.submission.actionPlan = null
    invalidateImprovementReview()
    appendRouteLog(
      "comparison",
      payload.route,
      payload.fitComparisonReport.comparisonSummary,
    )
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unexpected fit comparison failure."
  } finally {
    state.comparisonLoading = false
    render()
  }
}

function bindComparisonActions() {
  const comparisonInput = document.querySelector("[data-role='comparison-input']")
  if (comparisonInput) {
    comparisonInput.addEventListener("input", () => {
      state.comparisonInput = comparisonInput.value
    })
  }

  document.querySelectorAll("[data-action='comparison-intent']").forEach((button) => {
    button.addEventListener("click", () => {
      requestFitComparison(button.dataset.intent, state.comparisonInput)
    })
  })

  const submitButton = document.querySelector("[data-action='comparison-submit']")
  if (submitButton) {
    submitButton.addEventListener("click", () => {
      requestFitComparison(
        `Compare ${state.comparisonInput || "my researched destinations"} for me.`,
        state.comparisonInput,
      )
    })
  }
}

function renderPlanningSection() {
  const flowContext = deriveFlowContext()
  const planningStage = flowContext.stageMap.planning

  if (!state.submission?.clarityReport) {
    return `
      ${renderStageNotice({
        tone: "blocked",
        title: "Planning needs a baseline result",
        body: "Generate your baseline Clarity result first. Planning needs at least the profile, Clarity, and readiness artifacts.",
      })}
    `
  }

  if (state.planningLoading) {
    return `
      ${renderStageNotice({
        tone: "loading",
        title: "Planning in progress",
        body: "The Action Planning Agent is sequencing a grounded first-pass plan now.",
      })}
    `
  }

  const actionPlan = state.submission.actionPlan
  const comparisonReport = state.submission.fitComparisonReport
  const destinationReports = state.submission.destinationResearchReports || []
  const planContext = comparisonReport
    ? `Current lead: ${comparisonReport.strongestFit || "no clear lead yet"}`
    : destinationReports.length >= 2
      ? "Multiple researched destinations exist, but comparison is still open."
      : destinationReports.length === 1
        ? `One researched destination exists: ${destinationReports[0].destination}.`
        : "No destination research artifacts exist yet, so planning will stay clarity-first or research-first."

  return `
    <div class="guide-card">
      <p class="muted">${escapeHtml(planContext)}</p>
      ${planningStage.status !== "complete" ? renderStageNotice({
        tone: planningStage.status === "provisional" ? "caution" : planningStage.status === "blocked" ? "blocked" : "ready",
        title: planningStage.status === "provisional" ? "Planning is available, but still provisional" : planningStage.status === "blocked" ? "Planning is waiting on earlier context" : "Planning is ready",
        body: planningStage.summary,
        detail: planningStage.blocker || planningStage.supportingLabel,
      }) : ""}
      <div class="screen-actions guide-actions">
        <button class="button button-secondary" data-action="planning-intent" data-intent="What should I do next?">What should I do next?</button>
        <button class="button button-secondary" data-action="planning-intent" data-intent="Build my next 30 days.">Build my next 30 days</button>
        <button class="button button-secondary" data-action="planning-intent" data-intent="What should I not worry about yet?">What should I not worry about yet?</button>
      </div>
      ${actionPlan
        ? renderActionPlan(actionPlan)
        : renderStageNotice({
            tone: planningStage.status === "provisional" ? "caution" : "ready",
            title: "No action plan generated yet",
            body: planningStage.status === "provisional"
              ? "You can still generate a preparation-first plan, but treat it as sequencing support rather than a final move plan."
              : "Generate a plan once you want the current stage turned into concrete next steps.",
          })}
    </div>
  `
}

function renderActionPlan(plan) {
  const phases = [
    { key: "now", label: "Now" },
    { key: "soon", label: "Soon" },
    { key: "later", label: "Later" },
  ]

  return `
    <div class="comparison-report action-plan-report">
      <article class="guide-card comparison-summary-card">
        <p class="eyebrow">${escapeHtml(plan.horizon === "90Days" ? "90-day action plan" : "30-day action plan")}</p>
        <h4>${escapeHtml(plan.framingSummary)}</h4>
        <p>${escapeHtml(plan.stageSummary)}</p>
        ${renderArtifactMeta([
          `Planning mode: ${humanizeEnum(plan.planningMode)}`,
          `Readiness: ${humanizeEnum(plan.readinessLevel)}`,
          `Destination state: ${humanizeEnum(plan.destinationState)}`,
        ])}
        <div class="hero-grid comparison-metrics">
          <div class="metric">
            <span class="metric-label">Planning mode</span>
            <strong>${escapeHtml(humanizeEnum(plan.planningMode))}</strong>
          </div>
          <div class="metric">
            <span class="metric-label">Readiness level</span>
            <strong>${escapeHtml(humanizeEnum(plan.readinessLevel))}</strong>
          </div>
          <div class="metric">
            <span class="metric-label">Destination state</span>
            <strong>${escapeHtml(humanizeEnum(plan.destinationState))}</strong>
          </div>
          <div class="metric">
            <span class="metric-label">Working lead</span>
            <strong>${escapeHtml(plan.groundedIn.strongestFit || "Not fixed yet")}</strong>
          </div>
        </div>
        <section>
          <h5>Priorities now</h5>
          <ul class="priority-list">
            ${plan.priorities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
        <section>
          <h5>What not to focus on yet</h5>
          <ul class="priority-list">
            ${plan.notYet.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
        ${plan.suggestedNextExidusMove ? `<p class="guide-next"><strong>Next useful Exidus move:</strong> ${escapeHtml(plan.suggestedNextExidusMove)}</p>` : ""}
        <div class="screen-actions">
          <button class="button button-secondary" data-action="refinement-intent" data-intent="Update my report based on this new direction.">Refine the report with this plan</button>
        </div>
      </article>
      <div class="guide-grid destination-report-grid comparison-entry-grid">
        ${phases.map((phase) => {
          const actions = plan.actions.filter((action) => action.phase === phase.key)
          return `
            <article class="guide-card destination-report-card comparison-entry-card">
              <p class="eyebrow">${escapeHtml(phase.label)}</p>
              <h4>${escapeHtml(actions.length ? `${actions.length} action${actions.length === 1 ? "" : "s"}` : "No actions staged")}</h4>
              ${actions.length ? actions.map((action) => `
                <section>
                  <h5>${escapeHtml(action.title)}</h5>
                  <p>${escapeHtml(action.description)}</p>
                  <p class="muted">${escapeHtml(humanizeEnum(action.category))} • ${escapeHtml(humanizeEnum(action.urgency))} urgency</p>
                  <p class="muted">${escapeHtml(action.rationale)}</p>
                </section>
              `).join("") : `<p class="muted">Nothing staged here yet.</p>`}
            </article>
          `
        }).join("")}
      </div>
      <article class="guide-card">
        <p class="eyebrow">Sequencing notes</p>
        <ul class="priority-list">
          ${(plan.sequencingNotes || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </article>
    </div>
  `
}

async function requestActionPlan(userIntent) {
  if (!state.submission) {
    return
  }

  const planningStage = deriveFlowContext().stageMap.planning
  if (planningStage.status === "blocked") {
    state.error = planningStage.blocker || planningStage.summary
    render()
    return
  }

  state.planningLoading = true
  state.error = ""
  render()

  try {
    const response = await fetch("/api/action-plan", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        userIntent,
        artifacts: {
          userProfile: state.submission.userProfile,
          assessmentSignals: state.submission.assessmentSignals,
          readinessProfile: state.submission.readinessProfile,
          archetypeProfile: state.submission.archetypeProfile,
          clarityReport: state.submission.clarityReport,
          guidanceSummary: state.submission.guidanceSummary,
          destinationResearchReports: state.submission.destinationResearchReports || [],
          fitComparisonReport: state.submission.fitComparisonReport,
          actionPlan: state.submission.actionPlan,
        },
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload.error || "Failed to generate action plan.")
    }
    if (!payload.actionPlan) {
      throw new Error(payload.route?.reason || "The action planning path was not available for this request.")
    }
    state.submission.actionPlan = payload.actionPlan
    invalidateImprovementReview()
    appendRouteLog("planning", payload.route, payload.actionPlan.framingSummary)
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unexpected action planning failure."
  } finally {
    state.planningLoading = false
    render()
  }
}

function bindPlanningActions() {
  document.querySelectorAll("[data-action='planning-intent']").forEach((button) => {
    button.addEventListener("click", () => {
      requestActionPlan(button.dataset.intent)
    })
  })
}

function renderRefinementSection() {
  const flowContext = deriveFlowContext()
  const refinementStage = flowContext.stageMap.refinement

  if (!state.submission?.clarityReport) {
    return `
      ${renderStageNotice({
        tone: "blocked",
        title: "Refinement needs a baseline report",
        body: "Generate a baseline Clarity report first. Refinement needs an existing report to update.",
      })}
    `
  }

  if (state.refinementLoading) {
    return `
      ${renderStageNotice({
        tone: "loading",
        title: "Report refinement in progress",
        body: "The Report Refinement Agent is reconciling the current report with your updated context now.",
      })}
    `
  }

  const revision = state.submission.reportRevision
  const hasDownstreamContext = Boolean(
    (state.submission.destinationResearchReports || []).length ||
      state.submission.fitComparisonReport ||
      state.submission.actionPlan,
  )

  return `
    <div class="guide-card">
      <p class="muted">${escapeHtml(
        hasDownstreamContext
          ? "Downstream artifacts already exist, so you can revise the report using research, comparison, planning, or direct profile updates."
          : "You can still refine the report if your priorities or constraints changed, but the strongest revision path appears once downstream artifacts exist.",
      )}</p>
      ${refinementStage.status !== "complete" ? renderStageNotice({
        tone: refinementStage.status === "blocked" ? "blocked" : "ready",
        title: refinementStage.status === "blocked" ? "Refinement is waiting on meaningful change" : "Refinement is available",
        body: refinementStage.summary,
        detail: refinementStage.blocker || refinementStage.supportingLabel,
      }) : ""}
      <div class="screen-actions guide-actions">
        <button class="button button-secondary" data-action="refinement-intent" data-intent="Update my report based on this new direction.">Update my report</button>
        <button class="button button-secondary" data-action="refinement-intent" data-intent="Revise my report after comparison.">Revise after comparison</button>
        <button class="button button-secondary" data-action="refinement-intent" data-intent="What changed now that my priorities are clearer?">What changed now?</button>
      </div>
      <label class="helper" for="refinement-intent-input">Revision request</label>
      <textarea id="refinement-intent-input" class="textarea" data-role="refinement-intent-input" placeholder="Update my report based on this new direction.">${escapeHtml(state.refinementIntentInput || "")}</textarea>
      <label class="helper" for="refinement-priorities-input">Updated priorities</label>
      <textarea id="refinement-priorities-input" class="textarea" data-role="refinement-priorities-input" placeholder="Affordability, healthcare, belonging">${escapeHtml(state.refinementPrioritiesInput || "")}</textarea>
      <label class="helper" for="refinement-destinations-input">Updated destinations or shortlist</label>
      <textarea id="refinement-destinations-input" class="textarea" data-role="refinement-destinations-input" placeholder="Portugal, Mexico">${escapeHtml(state.refinementDestinationInput || "")}</textarea>
      <label class="helper" for="refinement-notes-input">New constraints or notes</label>
      <textarea id="refinement-notes-input" class="textarea" data-role="refinement-notes-input" placeholder="Schooling matters more now. Budget feels tighter than I first thought.">${escapeHtml(state.refinementNotesInput || "")}</textarea>
      <div class="screen-actions">
        <button class="button button-primary" data-action="refinement-submit">Generate report update</button>
      </div>
      ${revision
        ? renderRevisionReport(revision, state.submission.clarityReport)
        : renderStageNotice({
            tone: refinementStage.status === "blocked" ? "blocked" : "ready",
            title: "No report revision generated yet",
            body: refinementStage.status === "blocked"
              ? "Refinement is strongest after downstream work or a real profile change."
              : "Use refinement to reconcile new priorities, destination findings, or planning signals back into the working report.",
          })}
    </div>
  `
}

function renderRevisionReport(revision, report) {
  return `
    <div class="comparison-report action-plan-report">
      <article class="guide-card comparison-summary-card">
        <p class="eyebrow">Revision summary</p>
        <h4>${escapeHtml(revision.revisionSummary)}</h4>
        ${renderArtifactMeta([
          `Revision type: ${humanizeEnum(revision.revisionType)}`,
          `Significance: ${humanizeEnum(revision.significance)}`,
          `Grounded in destination work: ${revision.groundedIn.usedDestinationResearch.length ? revision.groundedIn.usedDestinationResearch.join(", ") : "No"}`,
        ])}
        <div class="hero-grid comparison-metrics">
          <div class="metric">
            <span class="metric-label">Revision type</span>
            <strong>${escapeHtml(humanizeEnum(revision.revisionType))}</strong>
          </div>
          <div class="metric">
            <span class="metric-label">Significance</span>
            <strong>${escapeHtml(humanizeEnum(revision.significance))}</strong>
          </div>
          <div class="metric">
            <span class="metric-label">Prior report</span>
            <strong>${escapeHtml(revision.priorReportId)}</strong>
          </div>
          <div class="metric">
            <span class="metric-label">Current report</span>
            <strong>${escapeHtml(revision.newReportId)}</strong>
          </div>
        </div>
        <section>
          <h5>What changed</h5>
          <ul class="priority-list">
            ${(revision.whatChanged || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
        <section>
          <h5>What stayed the same</h5>
          <ul class="priority-list">
            ${(revision.whatStayedTheSame || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
        <section>
          <h5>Pay attention now</h5>
          <ul class="priority-list">
            ${(revision.payAttentionNow || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
        <section>
          <h5>Sections updated</h5>
          <ul class="priority-list">
            ${((revision.changes?.sectionsUpdated || []).length
              ? revision.changes.sectionsUpdated
              : ["No specific section list was recorded."])
              .map((item) => `<li>${escapeHtml(humanizeEnum(item))}</li>`).join("")}
          </ul>
        </section>
      </article>
      <article class="guide-card destination-report-card comparison-entry-card">
        <p class="eyebrow">Updated report state</p>
        <h4>${escapeHtml(report.summary.fitDirectionSummary)}</h4>
        <p>${escapeHtml(report.summary.nextStepSummary)}</p>
        <section>
          <h5>Current priorities</h5>
          <ul class="token-list">
            ${(report.topPriorities || []).map((item) => `<li class="token">${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
        <section>
          <h5>Current tensions</h5>
          <ul class="priority-list">
            ${(report.contradictionFlags || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
        <section>
          <h5>Updated highlights</h5>
          <ul class="priority-list">
            ${(report.highlights || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
      </article>
    </div>
  `
}

function bindRefinementActions() {
  bindTextareaState("[data-role='refinement-intent-input']", "refinementIntentInput")
  bindTextareaState("[data-role='refinement-priorities-input']", "refinementPrioritiesInput")
  bindTextareaState("[data-role='refinement-destinations-input']", "refinementDestinationInput")
  bindTextareaState("[data-role='refinement-notes-input']", "refinementNotesInput")

  document.querySelectorAll("[data-action='refinement-intent']").forEach((button) => {
    button.addEventListener("click", () => {
      requestReportRefinement(button.dataset.intent)
    })
  })

  const submitButton = document.querySelector("[data-action='refinement-submit']")
  if (submitButton) {
    submitButton.addEventListener("click", () => {
      requestReportRefinement(
        state.refinementIntentInput || "Update my report based on this new direction.",
      )
    })
  }
}

async function requestReportRefinement(userIntent) {
  if (!state.submission) {
    return
  }

  const refinementStage = deriveFlowContext().stageMap.refinement
  if (refinementStage.status === "blocked") {
    state.error = refinementStage.blocker || refinementStage.summary
    render()
    return
  }

  state.refinementLoading = true
  state.error = ""
  render()

  try {
    const response = await fetch("/api/report-refinement", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        userIntent,
        profileUpdates: {
          topPriorities: state.refinementPrioritiesInput,
          destinationsConsidering: state.refinementDestinationInput,
          specialNotes: state.refinementNotesInput
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        },
        artifacts: {
          userProfile: state.submission.userProfile,
          assessmentSignals: state.submission.assessmentSignals,
          readinessProfile: state.submission.readinessProfile,
          archetypeProfile: state.submission.archetypeProfile,
          clarityReport: state.submission.clarityReport,
          guidanceSummary: state.submission.guidanceSummary,
          destinationResearchReports: state.submission.destinationResearchReports || [],
          fitComparisonReport: state.submission.fitComparisonReport,
          actionPlan: state.submission.actionPlan,
          reportRevision: state.submission.reportRevision,
        },
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload.error || "Failed to refine report.")
    }
    if (!payload.clarityReport || !payload.reportRevision) {
      throw new Error(payload.route?.reason || "The report refinement path was not available for this request.")
    }
    state.submission.clarityReport = payload.clarityReport
    state.submission.reportRevision = payload.reportRevision
    state.submission.userProfile = payload.userProfile || state.submission.userProfile
    invalidateImprovementReview()
    appendRouteLog(
      "refinement",
      payload.route,
      payload.reportRevision.revisionSummary,
    )
    state.refinementIntentInput = userIntent || state.refinementIntentInput
    state.refinementPrioritiesInput = (state.submission.userProfile?.topPriorities || []).join(", ")
    state.refinementDestinationInput = (state.submission.userProfile?.destinationsConsidering || []).join(", ")
    state.refinementNotesInput = (state.submission.userProfile?.specialNotes || []).join("\n")
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unexpected report refinement failure."
  } finally {
    state.refinementLoading = false
    render()
  }
}

async function requestImprovementReview() {
  if (!state.submission) {
    return
  }

  state.improvementLoading = true
  state.error = ""
  render()

  try {
    const response = await fetch("/api/improvement/review", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        artifacts: {
          userProfile: state.submission.userProfile,
          assessmentAnswers: state.submission.assessmentAnswers,
          assessmentSignals: state.submission.assessmentSignals,
          readinessProfile: state.submission.readinessProfile,
          archetypeProfile: state.submission.archetypeProfile,
          clarityReport: state.submission.clarityReport,
          guidanceSummary: state.submission.guidanceSummary,
          destinationResearchReports: state.submission.destinationResearchReports || [],
          fitComparisonReport: state.submission.fitComparisonReport,
          actionPlan: state.submission.actionPlan,
          reportRevision: state.submission.reportRevision,
        },
        routeHistory: state.routeLog,
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload.error || "Failed to run internal review.")
    }
    if (!payload.improvementReview) {
      throw new Error("The improvement review path returned no review bundle.")
    }
    state.submission.improvementReview = payload.improvementReview
    state.submission.approvalDecisions = payload.improvementReview.approvalDecisions || []
    state.reviewDraftNotes = {}
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unexpected improvement review failure."
  } finally {
    state.improvementLoading = false
    render()
  }
}

async function requestImprovementDecision(proposalId, decision) {
  if (!state.submission?.improvementReview || !proposalId || !decision) {
    return
  }

  const reviewer = String(state.reviewReviewerInput || "").trim()
  if (!reviewer) {
    state.error = "Enter a reviewer name before recording a decision."
    render()
    return
  }

  const notes = String(state.reviewDraftNotes[proposalId] || "").trim()
  state.reviewDecisionLoadingId = proposalId
  state.error = ""
  render()

  try {
    const response = await fetch("/api/improvement/decision", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        proposalId,
        decision,
        reviewer,
        rationale: notes || undefined,
        constraints: splitReviewNotes(notes),
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload.error || "Failed to record improvement review decision.")
    }
    if (!payload.improvementReview) {
      throw new Error("The decision endpoint returned no updated improvement review bundle.")
    }

    state.submission.improvementReview = payload.improvementReview
    state.submission.approvalDecisions = payload.improvementReview.approvalDecisions || []
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unexpected improvement decision failure."
  } finally {
    state.reviewDecisionLoadingId = ""
    render()
  }
}

function invalidateImprovementReview() {
  if (state.submission) {
    state.submission.improvementReview = null
    state.submission.approvalDecisions = []
  }
  state.reviewDraftNotes = {}
}

function bindTextareaState(selector, key) {
  const node = document.querySelector(selector)
  if (!node) {
    return
  }

  node.addEventListener("input", () => {
    state[key] = node.value
  })
}

function deriveFlowContext() {
  const submission = state.submission || {}
  const destinationCount = (submission.destinationResearchReports || []).length
  const hasClarity = Boolean(submission.clarityReport)
  const hasGuide = Boolean(submission.guidanceSummary)
  const hasComparison = Boolean(submission.fitComparisonReport)
  const hasActionPlan = Boolean(submission.actionPlan)
  const hasRevision = Boolean(submission.reportRevision)
  const comparisonReadyForPlanning = Boolean(
    submission.fitComparisonReport?.routeSignals?.readyForActionPlanning,
  )
  const hasDownstreamContext = Boolean(
    destinationCount > 0 || hasComparison || hasActionPlan,
  )
  const hasRefinementDraft = hasMeaningfulRefinementDraft()

  const stages = [
    {
      key: "clarity",
      label: "Clarity",
      headline: submission.clarityReport?.summary?.fitDirectionSummary || "Generate the baseline clarity result",
      summary: submission.clarityReport
        ? submission.clarityReport.summary.nextStepSummary
        : "Assessment answers become the initial Exidus profile, readiness read, and clarity report here.",
      status: submission.clarityReport ? "complete" : "ready",
      statusLabel: submission.clarityReport ? "Complete" : "Ready now",
      action: submission.clarityReport ? null : "Generate clarity",
      supportingLabel: submission.clarityReport ? "Baseline artifacts live" : null,
      blocker: null,
      meta: submission.clarityReport
        ? [
            `Readiness: ${humanizeEnum(submission.clarityReport.readinessProfile.readinessLevel)}`,
            `Primary archetype: ${humanizeEnum(submission.clarityReport.archetypeProfile.primaryLifeArchetype)}`,
          ]
        : [],
    },
    {
      key: "guide",
      label: "Guide",
      headline: submission.guidanceSummary?.summary || "Interpret the clarity result",
      summary: submission.guidanceSummary
        ? submission.guidanceSummary.suggestedNextMove || submission.guidanceSummary.explanation
        : "Use the Guide Agent to explain the report, surface tensions, and pick the next specialist layer.",
      status: submission.guidanceSummary ? "complete" : hasClarity ? "recommended" : "blocked",
      statusLabel: submission.guidanceSummary ? "Complete" : hasClarity ? "Recommended now" : "Waiting on clarity",
      action: "Run Guide",
      supportingLabel: submission.guidanceSummary ? `Mode: ${humanizeEnum(submission.guidanceSummary.mode)}` : "Interpret before deeper work",
      blocker: hasClarity ? null : "Planning, research, and later stages become more coherent after the baseline result exists.",
      meta: submission.guidanceSummary
        ? [
            `Readiness: ${humanizeEnum(submission.guidanceSummary.groundedIn.readinessLevel)}`,
            `Fit direction: ${humanizeEnum(submission.guidanceSummary.groundedIn.fitDirectionArchetype)}`,
          ]
        : [],
    },
    {
      key: "research",
      label: "Destination Research",
      headline: destinationCount
        ? `${destinationCount} destination report${destinationCount === 1 ? "" : "s"} available`
        : "Research destinations through the current profile",
      summary: destinationCount
        ? summarizeDestinations(submission.destinationResearchReports)
        : "Ground one or more destinations in the user profile, readiness level, and top priorities.",
      status: destinationCount ? "complete" : hasGuide ? "recommended" : "blocked",
      statusLabel: destinationCount ? "Complete" : hasGuide ? "Recommended now" : "Waiting on Guide",
      action: hasGuide ? "Run research" : null,
      supportingLabel: destinationCount ? `${destinationCount} report${destinationCount === 1 ? "" : "s"} generated` : "Guide interpretation unlocks this cleanly",
      blocker: hasGuide ? null : "Run Guide first so destination research starts from an interpreted result rather than a raw report.",
      meta: destinationCount
        ? submission.destinationResearchReports.slice(0, 2).map((report) =>
            `${report.destination}: ${humanizeEnum(report.profileFitVerdict)}`,
          )
        : [],
    },
    {
      key: "comparison",
      label: "Fit Comparison",
      headline: submission.fitComparisonReport?.comparisonSummary || "Compare researched shortlist",
      summary: submission.fitComparisonReport
        ? submission.fitComparisonReport.recommendedNextMove || "Shortlist comparison is available."
        : destinationCount >= 2
          ? "Two or more researched destinations exist, so shortlist comparison is now reachable."
          : "Comparison activates after at least two researched destination artifacts exist.",
      status: submission.fitComparisonReport ? "complete" : destinationCount >= 2 ? "recommended" : "blocked",
      statusLabel: submission.fitComparisonReport ? "Complete" : destinationCount >= 2 ? "Recommended now" : "Waiting on research",
      action: destinationCount >= 2 ? "Run comparison" : null,
      supportingLabel: submission.fitComparisonReport
        ? submission.fitComparisonReport.routeSignals?.readyForActionPlanning
          ? "Shortlist stable enough for planning"
          : "Shortlist still needs pressure-testing"
        : destinationCount >= 2
          ? "Shortlist has enough artifacts"
          : null,
      blocker: destinationCount >= 2 ? null : "Generate at least two destination research reports before comparing options.",
      meta: submission.fitComparisonReport
        ? [
            `Strongest fit: ${submission.fitComparisonReport.strongestFit || "No clear lead yet"}`,
            `Ready for planning: ${submission.fitComparisonReport.routeSignals?.readyForActionPlanning ? "Yes" : "Not yet"}`,
          ]
        : [],
    },
    {
      key: "planning",
      label: "Action Planning",
      headline: submission.actionPlan?.framingSummary || "Turn direction into a practical near-term plan",
      summary: submission.actionPlan
        ? submission.actionPlan.suggestedNextExidusMove || submission.actionPlan.stageSummary
        : !hasGuide
          ? "Planning should wait until the baseline result has been interpreted."
          : hasComparison && !comparisonReadyForPlanning
            ? "Planning is available, but it should stay provisional because the shortlist still needs pressure-testing."
            : "Planning should stay continuity-aware: clarity first, research first, or move prep depending on current artifacts.",
      status: submission.actionPlan
        ? "complete"
        : !hasClarity
          ? "blocked"
          : !hasGuide
            ? "blocked"
            : hasComparison && !comparisonReadyForPlanning
              ? "provisional"
              : "ready",
      statusLabel: submission.actionPlan
        ? "Complete"
        : !hasClarity
          ? "Waiting on clarity"
          : !hasGuide
            ? "Waiting on Guide"
            : hasComparison && !comparisonReadyForPlanning
              ? "Provisional now"
              : "Ready now",
      action: hasClarity && hasGuide ? "Run planning" : null,
      supportingLabel: submission.actionPlan
        ? `Mode: ${humanizeEnum(submission.actionPlan.planningMode)}`
        : hasComparison && !comparisonReadyForPlanning
          ? "Preparation-first only"
          : null,
      blocker: !hasClarity
        ? "Generate the baseline result first."
        : !hasGuide
          ? "Run Guide first so planning is grounded in an interpreted result."
          : null,
      meta: submission.actionPlan
        ? [
            `Mode: ${humanizeEnum(submission.actionPlan.planningMode)}`,
            `Destination state: ${humanizeEnum(submission.actionPlan.destinationState)}`,
          ]
        : [],
    },
    {
      key: "refinement",
      label: "Report Refinement",
      headline: submission.reportRevision?.revisionSummary || "Revise the report as context changes",
      summary: submission.reportRevision
        ? submission.clarityReport?.summary?.nextStepSummary || "A revised report is available."
        : hasDownstreamContext || hasRefinementDraft
          ? "Use refinement after changed priorities or downstream findings so the report stays coherent over time."
          : "Refinement is strongest after downstream work or a meaningful profile change.",
      status: submission.reportRevision
        ? "complete"
        : !hasClarity
          ? "blocked"
          : hasDownstreamContext || hasRefinementDraft
            ? "ready"
            : "blocked",
      statusLabel: submission.reportRevision
        ? "Complete"
        : !hasClarity
          ? "Waiting on clarity"
          : hasDownstreamContext || hasRefinementDraft
            ? "Ready now"
            : "Waiting on change",
      action: submission.clarityReport ? "Run refinement" : null,
      supportingLabel: submission.reportRevision
        ? `Significance: ${humanizeEnum(submission.reportRevision.significance)}`
        : hasDownstreamContext
          ? "Downstream context available"
          : hasRefinementDraft
            ? "Draft updates detected"
            : null,
      blocker: !hasClarity
        ? "Generate the baseline report first."
        : hasDownstreamContext || hasRefinementDraft
          ? null
          : "Add a real profile change or run downstream stages before generating a refinement.",
      meta: submission.reportRevision
        ? [
            `Type: ${humanizeEnum(submission.reportRevision.revisionType)}`,
            `Significance: ${humanizeEnum(submission.reportRevision.significance)}`,
          ]
        : [],
    },
  ]

  const currentStage =
    stages.find((stage) => stage.status === "recommended") ||
    stages.find((stage) => stage.status === "ready") ||
    stages.find((stage) => stage.status === "provisional") ||
    stages.find((stage) => stage.status === "blocked") ||
    stages[stages.length - 1]
  const latestRoute = state.routeLog[state.routeLog.length - 1]

  return {
    stages,
    currentStage,
    stageMap: Object.fromEntries(stages.map((stage) => [stage.key, stage])),
    latestRoute,
    latestChange: deriveLatestChangeSummary(submission),
  }
}

function buildArtifactInventory() {
  if (!state.submission) {
    return ["No runtime artifacts available yet."]
  }

  const items = [
    state.submission.userProfile
      ? `UserProfile -> priorities: ${(state.submission.userProfile.topPriorities || []).slice(0, 3).join(", ") || "none named"}`
      : null,
    state.submission.assessmentSignals
      ? `AssessmentSignals -> contradictions: ${(state.submission.assessmentSignals.contradictionFlags || []).length}`
      : null,
    state.submission.readinessProfile
      ? `ReadinessProfile -> ${humanizeEnum(state.submission.readinessProfile.readinessLevel)}`
      : null,
    state.submission.archetypeProfile
      ? `ArchetypeProfile -> ${humanizeEnum(state.submission.archetypeProfile.fitDirectionArchetype)}`
      : null,
    state.submission.clarityReport
      ? `ClarityReport -> ${state.submission.clarityReport.reportId}`
      : null,
    state.submission.guidanceSummary
      ? `GuidanceSummary -> ${humanizeEnum(state.submission.guidanceSummary.mode)}`
      : null,
    state.submission.destinationResearchReports?.length
      ? `DestinationResearchReport[] -> ${state.submission.destinationResearchReports.map((report) => report.destination).join(", ")}`
      : null,
    state.submission.fitComparisonReport
      ? `FitComparisonReport -> lead ${state.submission.fitComparisonReport.strongestFit || "not fixed"}`
      : null,
    state.submission.actionPlan
      ? `ActionPlan -> ${humanizeEnum(state.submission.actionPlan.planningMode)} ${state.submission.actionPlan.horizon}`
      : null,
    state.submission.reportRevision
      ? `ReportRevision -> ${humanizeEnum(state.submission.reportRevision.revisionType)}`
      : null,
    state.submission.improvementReview
      ? `ImprovementReview -> ${humanizeEnum(state.submission.improvementReview.evalResult.outcome)} for ${humanizeEnum(state.submission.improvementReview.targetAgentId)}`
      : null,
  ].filter(Boolean)

  return items.length ? items : ["No runtime artifacts available yet."]
}

function renderFlowOverview(flowContext) {
  const latestRouteSummary = flowContext.latestRoute
    ? `${humanizeEnum(flowContext.latestRoute.stage)} routed to ${humanizeEnum(flowContext.latestRoute.target)} with ${flowContext.latestRoute.confidence} confidence.`
    : "No routed runtime step has been recorded yet."

  return `
    <section class="guide-panel flow-overview-panel">
      <div class="guide-panel-header">
        <div>
          <p class="eyebrow">Flow Overview</p>
          <h3>${escapeHtml(flowContext.currentStage.label)} is the clearest next stage</h3>
        </div>
        <p class="muted">The runtime path below reflects the current artifact chain, not just which buttons happen to be visible.</p>
      </div>
      <div class="guide-grid overview-grid">
        <article class="guide-card">
          <p class="eyebrow">Current stage</p>
          <h4>${escapeHtml(flowContext.currentStage.headline)}</h4>
          <div class="stage-pill-row">
            ${renderStatusPill(flowContext.currentStage.status, flowContext.currentStage.statusLabel)}
          </div>
          <p>${escapeHtml(flowContext.currentStage.summary)}</p>
          ${flowContext.currentStage.blocker ? `<p class="muted">${escapeHtml(flowContext.currentStage.blocker)}</p>` : ""}
        </article>
        <article class="guide-card">
          <p class="eyebrow">Latest change</p>
          <h4>${escapeHtml(flowContext.latestChange.title)}</h4>
          <p>${escapeHtml(flowContext.latestChange.body)}</p>
          ${flowContext.latestChange.detail ? `<p class="muted">${escapeHtml(flowContext.latestChange.detail)}</p>` : ""}
        </article>
        <article class="guide-card">
          <p class="eyebrow">Latest route</p>
          <h4>${escapeHtml(latestRouteSummary)}</h4>
          <p>${escapeHtml(flowContext.latestRoute?.reason || "The next route will appear here after you trigger another runtime stage.")}</p>
          ${flowContext.latestRoute?.prerequisitesMissing?.length
            ? `<p class="muted">Missing or provisional prerequisites: ${escapeHtml(flowContext.latestRoute.prerequisitesMissing.join(", "))}</p>`
            : ""}
        </article>
      </div>
    </section>
  `
}

function renderStageNotice({ tone = "ready", title, body, detail }) {
  return `
    <div class="guide-card stage-notice stage-notice-${escapeHtml(tone)}">
      <div class="stage-pill-row">
        ${renderStatusPill(tone, tone === "loading" ? "In progress" : humanizeEnum(tone))}
      </div>
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(body)}</p>
      ${detail ? `<p class="muted">${escapeHtml(detail)}</p>` : ""}
    </div>
  `
}

function renderStatusPill(status, label) {
  return `<span class="status-pill status-pill-${escapeHtml(status)}">${escapeHtml(label)}</span>`
}

function renderArtifactMeta(items) {
  const presentItems = items.filter(Boolean)
  if (presentItems.length === 0) {
    return ""
  }

  return `
    <div class="artifact-meta-row">
      ${presentItems.map((item) => `<span class="artifact-meta-item">${escapeHtml(item)}</span>`).join("")}
    </div>
  `
}

function deriveLatestChangeSummary(submission) {
  if (submission.reportRevision) {
    return {
      title: "The working report has been revised",
      body: submission.reportRevision.revisionSummary,
      detail: submission.reportRevision.whatChanged?.[0],
    }
  }

  if (submission.actionPlan) {
    return {
      title: "A practical plan is available",
      body: submission.actionPlan.framingSummary,
      detail: submission.actionPlan.suggestedNextExidusMove,
    }
  }

  if (submission.fitComparisonReport) {
    return {
      title: "The shortlist has been pressure-tested",
      body: submission.fitComparisonReport.comparisonSummary,
      detail: submission.fitComparisonReport.recommendedNextMove,
    }
  }

  if ((submission.destinationResearchReports || []).length > 0) {
    return {
      title: "Destination research exists now",
      body: summarizeDestinations(submission.destinationResearchReports),
      detail: submission.destinationResearchReports[0]?.recommendedNextStep,
    }
  }

  if (submission.guidanceSummary) {
    return {
      title: "The baseline result has been interpreted",
      body: submission.guidanceSummary.summary,
      detail: submission.guidanceSummary.suggestedNextMove,
    }
  }

  return {
    title: "Baseline clarity is live",
    body: submission.clarityReport?.summary?.nextStepSummary || "The baseline Clarity report is ready for interpretation.",
    detail: null,
  }
}

function hasMeaningfulRefinementDraft() {
  const submission = state.submission
  if (!submission?.userProfile) {
    return false
  }

  const draftPriorities = parseCommaSeparated(state.refinementPrioritiesInput)
  const draftDestinations = parseCommaSeparated(state.refinementDestinationInput)
  const draftNotes = parseLineSeparated(state.refinementNotesInput)
  const profile = submission.userProfile

  if (!sameOrderedList(draftPriorities, profile.topPriorities || [])) {
    return draftPriorities.length > 0
  }

  if (!sameOrderedList(draftDestinations, profile.destinationsConsidering || [])) {
    return draftDestinations.length > 0
  }

  if (!sameOrderedList(draftNotes, profile.specialNotes || [])) {
    return draftNotes.length > 0
  }

  const trimmedIntent = (state.refinementIntentInput || "").trim().toLowerCase()
  if (trimmedIntent.length > 0 && !GENERIC_REFINEMENT_INTENTS.includes(trimmedIntent)) {
    return true
  }

  return false
}

function parseCommaSeparated(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseLineSeparated(value) {
  return String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}

function sameOrderedList(left, right) {
  if (left.length !== right.length) {
    return false
  }

  return left.every((item, index) => normalizeToken(item) === normalizeToken(right[index]))
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase()
}

function splitReviewNotes(value) {
  return String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}

function createRouteLogEntry({ stage, route, message, submission }) {
  return {
    stage,
    target: route?.target || stage,
    confidence: route?.confidence || "high",
    stateBucket: route?.stateBucket || "unassessed",
    reason: route?.reason || message,
    prerequisitesMissing: route?.prerequisitesMissing || [],
    message,
    artifacts: buildArtifactInventoryFromSubmission(submission),
    createdAt: new Date().toISOString(),
  }
}

function appendRouteLog(stage, route, message) {
  state.routeLog = [
    ...state.routeLog,
    createRouteLogEntry({
      stage,
      route,
      message,
      submission: state.submission,
    }),
  ]
}

function buildArtifactInventoryFromSubmission(submission) {
  const labels = [
    submission?.clarityReport ? "ClarityReport" : null,
    submission?.guidanceSummary ? "GuidanceSummary" : null,
    submission?.destinationResearchReports?.length ? "DestinationResearchReport" : null,
    submission?.fitComparisonReport ? "FitComparisonReport" : null,
    submission?.actionPlan ? "ActionPlan" : null,
    submission?.reportRevision ? "ReportRevision" : null,
    submission?.improvementReview ? "ImprovementReview" : null,
  ].filter(Boolean)

  return labels
}

function formatRouteEntry(entry) {
  const prerequisites = entry.prerequisitesMissing?.length
    ? ` Missing or provisional prerequisites: ${entry.prerequisitesMissing.join(", ")}.`
    : ""

  return `${humanizeEnum(entry.stage)} -> ${entry.target} (${entry.confidence} confidence, ${humanizeEnum(entry.stateBucket)} state). ${entry.reason}${prerequisites} Artifacts: ${entry.artifacts.join(", ") || "none yet"}.`
}

function renderProposalReviewCard(proposal) {
  const decision = proposal.decision
  const notes = state.reviewDraftNotes[proposal.proposalId] || decision?.rationale || ""
  const busy = state.reviewDecisionLoadingId === proposal.proposalId

  return `
    <article class="guide-card proposal-review-card">
      <div class="proposal-review-header">
        <div>
          <p class="eyebrow">${escapeHtml(humanizeEnum(proposal.proposalType))}</p>
          <h4>${escapeHtml(proposal.title)}</h4>
        </div>
        <div class="stage-pill-row">
          ${renderStatusPill(mapProposalStatusTone(proposal.status), humanizeEnum(proposal.status))}
        </div>
      </div>
      <ul class="priority-list proposal-meta-list">
        <li>Target: ${escapeHtml(proposal.targetLabel)}</li>
        <li>Artifact: ${escapeHtml(proposal.targetArtifact)}</li>
        <li>Risk: ${escapeHtml(humanizeEnum(proposal.riskLevel))}</li>
        <li>Approval required: ${escapeHtml(proposal.humanApprovalRequired ? "Yes" : "No")}</li>
      </ul>
      <div class="proposal-review-copy">
        <p><strong>Problem:</strong> ${escapeHtml(proposal.problemSummary)}</p>
        <p><strong>Proposed change:</strong> ${escapeHtml(proposal.proposedChangeSummary)}</p>
        <p><strong>Expected benefit:</strong> ${escapeHtml(proposal.expectedBenefit)}</p>
        <p><strong>Evidence refs:</strong> ${escapeHtml(proposal.evidenceRefs.length ? proposal.evidenceRefs.join(", ") : "none attached")}</p>
      </div>
      ${decision ? `
        <div class="proposal-decision-summary">
          <p><strong>Recorded decision:</strong> ${escapeHtml(humanizeEnum(decision.decision))} by ${escapeHtml(decision.reviewer)}</p>
          ${decision.rationale ? `<p class="muted">${escapeHtml(decision.rationale)}</p>` : ""}
          ${decision.constraints?.length ? `<p class="muted">Constraints: ${escapeHtml(decision.constraints.join(", "))}</p>` : ""}
        </div>
      ` : `<p class="muted">No explicit human decision has been recorded yet.</p>`}
      <label class="field-label" for="review-notes-${escapeAttribute(proposal.proposalId)}">Review notes</label>
      <textarea
        id="review-notes-${escapeAttribute(proposal.proposalId)}"
        class="textarea"
        data-role="proposal-review-notes"
        data-proposal-id="${escapeAttribute(proposal.proposalId)}"
        placeholder="Optional rationale or constraints. Use separate lines if you want them tracked as constraints."
      >${escapeHtml(notes)}</textarea>
      <div class="screen-actions review-actions">
        <button class="button button-secondary" data-action="record-review-decision" data-proposal-id="${escapeAttribute(proposal.proposalId)}" data-decision="approved" ${busy ? "disabled" : ""}>
          ${busy ? "Saving..." : "Approve"}
        </button>
        <button class="button button-secondary" data-action="record-review-decision" data-proposal-id="${escapeAttribute(proposal.proposalId)}" data-decision="approved-with-notes" ${busy ? "disabled" : ""}>
          ${busy ? "Saving..." : "Approve with notes"}
        </button>
        <button class="button button-secondary" data-action="record-review-decision" data-proposal-id="${escapeAttribute(proposal.proposalId)}" data-decision="rejected" ${busy ? "disabled" : ""}>
          ${busy ? "Saving..." : "Reject"}
        </button>
      </div>
    </article>
  `
}

function mapProposalStatusTone(status) {
  if (status === "approved" || status === "approved-with-notes") {
    return "ready"
  }
  if (status === "rejected") {
    return "blocked"
  }

  return "in-progress"
}

function summarizeDestinations(reports) {
  const items = (reports || []).map((report) =>
    `${report.destination} (${humanizeEnum(report.profileFitVerdict)})`,
  )

  return items.join(", ") || "No destinations surfaced yet."
}

function validateModule(module) {
  for (const question of module.questions) {
    if (!question.required) {
      continue
    }

    const value = state.answers[question.id]
    if (question.type === "text") {
      if (typeof value !== "string" || value.trim().length === 0) {
        return "Please complete the required fields before continuing."
      }
    } else if (question.type === "singleSelect" || question.type === "scale") {
      if (value === undefined || value === null || value === "") {
        return "Please complete the required fields before continuing."
      }
    } else if (!Array.isArray(value) || value.length === 0) {
      return "Please complete the required fields before continuing."
    }
  }

  return ""
}

function summarizeAnswer(question) {
  const value = state.answers[question.id]
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return ""
    }
    return `${question.prompt}: ${value.map((item) => optionLabel(question, item)).join(", ")}`
  }
  if (typeof value === "number") {
    return `${question.prompt}: ${value}/5`
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const display = question.options ? optionLabel(question, value) : value
    return `${question.prompt}: ${display}`
  }

  return ""
}

function optionLabel(question, value) {
  return question.options?.find((option) => option.value === value)?.label || value
}

function findQuestion(module, questionId) {
  return module.questions.find((question) => question.id === questionId)
}

function renderError(message) {
  if (appNode) {
    appNode.innerHTML = `
      <section class="screen state-message">
        <h2>Unable to load the assessment</h2>
        <p class="error">${escapeHtml(message)}</p>
      </section>
    `
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("\n", "&#10;")
}

function humanizeEnum(value) {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^\w/, (char) => char.toUpperCase())
}
