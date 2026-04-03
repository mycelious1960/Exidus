export type AssessmentQuestionType =
  | "multiSelect"
  | "rankedSelect"
  | "singleSelect"
  | "scale"
  | "text"

export interface AssessmentOption {
  value: string
  label: string
  hint?: string
}

export interface AssessmentQuestionDefinition {
  id: string
  prompt: string
  helper?: string
  type: AssessmentQuestionType
  required?: boolean
  maxSelections?: number
  options?: AssessmentOption[]
  scale?: {
    min: number
    max: number
    minLabel: string
    maxLabel: string
  }
  placeholder?: string
}

export interface AssessmentModuleDefinition {
  id: string
  step: number
  title: string
  intro: string
  questions: AssessmentQuestionDefinition[]
}

const PUSH_FACTOR_OPTIONS: AssessmentOption[] = [
  { value: "burnout", label: "Burnout and exhaustion" },
  { value: "economicPressure", label: "Cost of living and economic pressure" },
  { value: "racialStrain", label: "Racial and social strain" },
  { value: "overstimulation", label: "Lack of peace and overstimulation" },
  { value: "belongingDeficit", label: "Lack of belonging" },
  { value: "safetyConcern", label: "Safety concerns" },
  { value: "futurePessimism", label: "Lack of future optimism" },
]

const PULL_FACTOR_OPTIONS: AssessmentOption[] = [
  { value: "peace", label: "Peace" },
  { value: "affordability", label: "Affordability" },
  { value: "belonging", label: "Belonging" },
  { value: "dignity", label: "Dignity" },
  { value: "slowerPace", label: "Slower pace" },
  { value: "stability", label: "Stability" },
  { value: "freedom", label: "Freedom and self-direction" },
  { value: "reinvention", label: "Reinvention and a fresh start" },
]

const DESTINATION_CRITERIA_OPTIONS: AssessmentOption[] = [
  { value: "affordability", label: "Affordability" },
  { value: "safety", label: "Safety" },
  { value: "socialFit", label: "Racial and social fit" },
  { value: "blackCommunity", label: "Black community and belonging" },
  { value: "healthcare", label: "Healthcare" },
  { value: "infrastructure", label: "Infrastructure and convenience" },
  { value: "climate", label: "Climate and environment" },
  { value: "paceOfLife", label: "Pace of life" },
  { value: "workCompatibility", label: "Income and work compatibility" },
  { value: "visaFeasibility", label: "Visa and entry feasibility" },
]

const OBLIGATION_OPTIONS: AssessmentOption[] = [
  { value: "none", label: "None of the above" },
  { value: "children", label: "Children or parenting responsibilities" },
  { value: "partner", label: "Partner or spouse considerations" },
  { value: "elderCare", label: "Elder care or family obligations" },
  { value: "debt", label: "Debt or financial obligations" },
  { value: "health", label: "Health-related responsibilities" },
  { value: "work", label: "Work commitments" },
  { value: "documentation", label: "Documentation or legal complexity" },
]

export const ASSESSMENT_FLOW: AssessmentModuleDefinition[] = [
  {
    id: "why-you-want-out",
    step: 1,
    title: "Why do you want out?",
    intro:
      "Before destinations, it helps to get honest about what is no longer working and what feels too costly to keep absorbing.",
    questions: [
      {
        id: "pushFactors",
        prompt: "What feels most unsustainable about your current life in the U.S.?",
        helper: "Choose up to three that feel genuinely true right now.",
        type: "rankedSelect",
        required: true,
        maxSelections: 3,
        options: PUSH_FACTOR_OPTIONS,
      },
      {
        id: "motivationOrientation",
        prompt: "Which statement feels most true?",
        type: "singleSelect",
        required: true,
        options: [
          { value: "pushDriven", label: "I mostly want relief from what life feels like now" },
          { value: "pullDriven", label: "I mostly want to build toward a better life elsewhere" },
          { value: "balanced", label: "Both feel equally true" },
          { value: "unclear", label: "I am not sure yet" },
        ],
      },
      {
        id: "reflectionWhyNow",
        prompt: "In one or two sentences, what do you most want to change?",
        helper: "Keep it specific enough to sound like your real life, not an ideal statement.",
        type: "text",
        placeholder: "Example: I want a life that feels calmer and less racially exhausting day to day.",
      },
    ],
  },
  {
    id: "what-you-want-more-of",
    step: 2,
    title: "What are you moving toward?",
    intro:
      "Leaving is not only about what you are done with. It is also about the life qualities you want more of.",
    questions: [
      {
        id: "pullFactors",
        prompt: "What are you hoping life abroad could give you more of?",
        helper: "Choose and rank your top three outcomes.",
        type: "rankedSelect",
        required: true,
        maxSelections: 3,
        options: PULL_FACTOR_OPTIONS,
      },
      {
        id: "lifeVision",
        prompt: "Which kind of life sounds most like what you want?",
        type: "singleSelect",
        required: true,
        options: [
          { value: "calmAffordability", label: "Calmer and more affordable" },
          { value: "belongingCentered", label: "More culturally grounded and connected" },
          { value: "flexibleRemote", label: "More flexible and self-directed" },
          { value: "stable", label: "Safer and more stable" },
          { value: "slowBeautiful", label: "Slower and more beautiful" },
          { value: "freshChapter", label: "A cleaner reset and fresh chapter" },
          { value: "figuringItOut", label: "I am still figuring that out" },
        ],
      },
      {
        id: "reflectionBetterLife",
        prompt: "What does a better quality of life mean to you right now?",
        type: "text",
        placeholder: "Describe the feeling, pace, or conditions you want more of.",
      },
    ],
  },
  {
    id: "destination-fit-criteria",
    step: 3,
    title: "What matters most in the place you go next?",
    intro:
      "A destination can look good on paper and still be wrong for your life. This section turns preference into decision logic.",
    questions: [
      {
        id: "destinationCriteriaRanked",
        prompt: "Which destination factors matter most to you?",
        helper: "Choose and rank your top five.",
        type: "rankedSelect",
        required: true,
        maxSelections: 5,
        options: DESTINATION_CRITERIA_OPTIONS,
      },
      {
        id: "nonNegotiables",
        prompt: "Which of these are true non-negotiables?",
        helper: "These can overlap with your ranked priorities.",
        type: "multiSelect",
        maxSelections: 3,
        options: DESTINATION_CRITERIA_OPTIONS,
      },
      {
        id: "destinationsConsidering",
        prompt: "Which destinations are already on your mind?",
        helper: "Optional. Separate multiple destinations with commas.",
        type: "text",
        placeholder: "Example: Portugal, Mexico, Ghana",
      },
    ],
  },
  {
    id: "reality-readiness-check",
    step: 4,
    title: "What does your real life allow right now?",
    intro:
      "This section is about timing, flexibility, and what kind of move is actually workable from where you are now.",
    questions: [
      {
        id: "incomeSituation",
        prompt: "Which best describes your current income situation?",
        type: "singleSelect",
        required: true,
        options: [
          { value: "portableStable", label: "Location-flexible and stable" },
          { value: "portableInconsistent", label: "Location-flexible but inconsistent" },
          { value: "tiedToLocation", label: "Tied to my current location or job" },
          { value: "uncertain", label: "Uncertain or in transition" },
          { value: "noAnswer", label: "I would rather not say" },
        ],
      },
      {
        id: "financialConfidence",
        prompt: "How confident do you feel about your financial flexibility right now?",
        type: "scale",
        required: true,
        scale: {
          min: 1,
          max: 5,
          minLabel: "Not confident at all",
          maxLabel: "Very confident",
        },
      },
      {
        id: "obligations",
        prompt: "Which responsibilities significantly affect your ability to relocate?",
        helper: "Choose all that apply.",
        type: "multiSelect",
        options: OBLIGATION_OPTIONS,
      },
      {
        id: "adminReadiness",
        prompt: "How prepared are you administratively for a move abroad?",
        type: "singleSelect",
        required: true,
        options: [
          { value: "veryEarly", label: "Very early" },
          { value: "awareNotOrganized", label: "Somewhat aware, but not organized" },
          { value: "moderatelyPrepared", label: "Moderately prepared" },
          { value: "highlyPrepared", label: "Highly prepared" },
          { value: "notSure", label: "Not sure" },
        ],
      },
      {
        id: "timeline",
        prompt: "What timeline feels most realistic for you?",
        type: "singleSelect",
        required: true,
        options: [
          { value: "within6Months", label: "Within 6 months" },
          { value: "6to12Months", label: "6 to 12 months" },
          { value: "1to2Years", label: "1 to 2 years" },
          { value: "2PlusYears", label: "2+ years" },
          { value: "exploringOnly", label: "I am still exploring, not planning yet" },
        ],
      },
      {
        id: "uncertaintyTolerance",
        prompt: "How much uncertainty can you realistically tolerate right now?",
        type: "scale",
        required: true,
        scale: {
          min: 1,
          max: 5,
          minLabel: "Very little",
          maxLabel: "A lot",
        },
      },
      {
        id: "reflectionConstraints",
        prompt: "What is the biggest practical constraint you are trying to work around?",
        type: "text",
        placeholder: "Optional. Name the main constraint in plain language.",
      },
    ],
  },
  {
    id: "tradeoff-and-fit-logic",
    step: 5,
    title: "What kind of direction actually fits?",
    intro:
      "The goal here is not certainty. It is to understand how you prioritize when real-world tradeoffs show up.",
    questions: [
      {
        id: "tradeoffAffordabilityVsBelonging",
        prompt: "If you had to choose, which matters more right now: affordability or belonging?",
        type: "singleSelect",
        required: true,
        options: [
          { value: "affordability", label: "Affordability" },
          { value: "belonging", label: "Belonging and social fit" },
        ],
      },
      {
        id: "tradeoffInfrastructureVsPace",
        prompt: "Which matters more right now: strong infrastructure or a slower, softer pace?",
        type: "singleSelect",
        required: true,
        options: [
          { value: "infrastructure", label: "Infrastructure and convenience" },
          { value: "peace", label: "Slower pace and more peace" },
        ],
      },
      {
        id: "tradeoffEaseVsEmotionalFit",
        prompt: "Which matters more right now: ease of move or stronger emotional fit?",
        type: "singleSelect",
        required: true,
        options: [
          { value: "ease", label: "Ease of move and practicality" },
          { value: "idealFit", label: "Stronger emotional fit" },
        ],
      },
      {
        id: "nextStepFocus",
        prompt: "Which kind of next step would help you most right now?",
        type: "singleSelect",
        required: true,
        options: [
          { value: "narrowingOptions", label: "Narrowing my options" },
          { value: "understandingReadiness", label: "Understanding my readiness" },
          { value: "figuringPriorities", label: "Figuring out what matters most" },
          { value: "decidingTradeoffs", label: "Deciding what tradeoffs I can accept" },
          { value: "shortActionPlan", label: "Building a short action plan" },
        ],
      },
      {
        id: "biggestQuestion",
        prompt: "What is your biggest unanswered question right now?",
        type: "text",
        placeholder: "Optional. This helps carry your concern into the baseline report context.",
      },
    ],
  },
]
