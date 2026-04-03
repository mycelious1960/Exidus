import type { ConfidenceLevel, ProfileType } from "../../types/exidus-schema.ts"

export interface DestinationKnowledge {
  slug: string
  name: string
  aliases: string[]
  costLevel: "low" | "moderate" | "high"
  budgetBandsUsd: {
    solo: { comfortable: number; stretch: number }
    family: { comfortable: number; stretch: number }
  }
  immigrationFocus: string[]
  taxCaution: string
  climateTags: string[]
  languageContext: string
  priorityFits: string[]
  priorityTensions: string[]
  profileBoosts: ProfileType[]
  profileCautions: Partial<Record<ProfileType, string>>
  sections: {
    visaImmigration: DestinationSectionData
    costOfLiving: DestinationSectionData
    healthcare: DestinationSectionData
    safety: DestinationSectionData
    climateEnvironment: DestinationSectionData
    taxImplications: DestinationSectionData
    cultureIntegration: DestinationSectionData
    education?: DestinationSectionData
    practicalNextSteps: DestinationSectionData
  }
  sources: Array<{
    label: string
    url?: string
    type?: string
  }>
}

export interface DestinationSectionData {
  summary: string
  confidence: ConfidenceLevel
  notes: string[]
}

export const DESTINATION_KNOWLEDGE_BASE: DestinationKnowledge[] = [
  {
    slug: "portugal",
    name: "Portugal",
    aliases: ["portugal", "pt"],
    costLevel: "moderate",
    budgetBandsUsd: {
      solo: { comfortable: 2600, stretch: 1800 },
      family: { comfortable: 4800, stretch: 3400 },
    },
    immigrationFocus: ["D7", "digital nomad", "passive income", "residency"],
    taxCaution:
      "Portugal can still be workable for Americans, but expat tax planning should be treated as specialist work rather than assumed advantage.",
    climateTags: ["warm", "coastal", "mild winters"],
    languageContext: "English is workable in larger cities and expat-heavy areas, but bureaucracy still leans Portuguese.",
    priorityFits: ["affordability", "pace of life", "healthcare", "stability", "walkability"],
    priorityTensions: ["bureaucracy", "housing pressure", "tax complexity"],
    profileBoosts: ["solo", "retiree", "digitalNomad"],
    profileCautions: {
      family:
        "School choice and family housing can get materially more expensive in Lisbon, Porto, and popular coastal areas.",
    },
    sections: {
      visaImmigration: {
        summary:
          "Portugal often stays on shortlist conversations because it has recognizable residency pathways for income-backed or remote-income applicants, but requirements and processing friction change enough that eligibility should be rechecked before planning around it.",
        confidence: "medium",
        notes: [
          "Americans usually look first at income-backed residency routes rather than assuming a casual move is possible.",
          "Consular processes, proof-of-funds expectations, and appointment timing can become the real bottleneck.",
        ],
      },
      costOfLiving: {
        summary:
          "Portugal can still be moderate-cost relative to many US cities, but the affordability story weakens fast in Lisbon and Porto if you need high-quality housing or imported lifestyle comforts.",
        confidence: "medium",
        notes: [
          "Secondary cities usually create a better budget-to-quality-of-life tradeoff than Lisbon.",
          "Rental competition has become part of the real affordability equation, not just monthly price averages.",
        ],
      },
      healthcare: {
        summary:
          "Portugal generally offers a credible public-plus-private healthcare mix, with many expats relying on private coverage for speed and convenience while still valuing the overall system quality.",
        confidence: "medium",
        notes: [
          "Access mechanics and waiting times matter more than broad quality claims.",
          "Private insurance may still make sense even if public options exist.",
        ],
      },
      safety: {
        summary:
          "Portugal is often perceived as relatively stable and manageable on day-to-day personal safety, though urban petty theft and tourist-zone risk still need normal caution.",
        confidence: "medium",
        notes: [
          "The appeal here is more low-intensity stability than the absence of all risk.",
        ],
      },
      climateEnvironment: {
        summary:
          "The climate is one of Portugal’s stronger pull factors, especially for users who want warmth without year-round tropical heat, but regional differences matter a lot.",
        confidence: "high",
        notes: [
          "Coastal humidity and winter housing quality can affect comfort more than postcard expectations suggest.",
        ],
      },
      taxImplications: {
        summary:
          "Tax treatment should be treated cautiously. Portugal can be attractive in some cases, but US taxpayers should not assume a simple or universally favorable outcome.",
        confidence: "low",
        notes: [
          "Verify residency, local income treatment, and treaty implications with a cross-border tax professional.",
        ],
      },
      cultureIntegration: {
        summary:
          "Portugal can feel welcoming for many foreigners, but deeper belonging depends on language effort, neighborhood choice, and tolerance for slower bureaucracy.",
        confidence: "medium",
        notes: [
          "Expat infrastructure exists, but relying on it too heavily can limit actual integration.",
        ],
      },
      education: {
        summary:
          "For families, Portugal can offer local and international schooling options, but the quality-cost tradeoff changes sharply by city and school type.",
        confidence: "medium",
        notes: [
          "International school tuition can change the affordability story substantially.",
        ],
      },
      practicalNextSteps: {
        summary:
          "Portugal is usually worth a structured next pass only if you pressure-test residency pathway fit, housing budget, and city choice together rather than separately.",
        confidence: "high",
        notes: [
          "Start with immigration eligibility, then housing, then on-the-ground city fit.",
        ],
      },
    },
    sources: [
      { label: "Portugal visas and consular information", url: "https://vistos.mne.gov.pt/en/", type: "official" },
      { label: "ePortugal public services portal", url: "https://eportugal.gov.pt/en", type: "official" },
    ],
  },
  {
    slug: "mexico",
    name: "Mexico",
    aliases: ["mexico", "mx"],
    costLevel: "low",
    budgetBandsUsd: {
      solo: { comfortable: 2200, stretch: 1500 },
      family: { comfortable: 4200, stretch: 2800 },
    },
    immigrationFocus: ["temporary residency", "economic solvency", "consular process"],
    taxCaution:
      "Mexico can look straightforward from a residency perspective, but tax residency and local income treatment should not be inferred from visa status alone.",
    climateTags: ["varied climates", "warm options", "high altitude options"],
    languageContext: "Spanish matters much more for deeper integration, daily admin, and healthcare navigation outside expat-heavy zones.",
    priorityFits: ["affordability", "pace of life", "warm climate", "proximity to US"],
    priorityTensions: ["regional safety variance", "bureaucratic inconsistency", "infrastructure variance"],
    profileBoosts: ["solo", "digitalNomad", "family"],
    profileCautions: {
      family:
        "Family fit in Mexico is highly city-specific. Safety, school quality, and neighborhood choice matter more than country-level averages.",
    },
    sections: {
      visaImmigration: {
        summary:
          "Mexico often stays attractive because residency pathways are relatively legible for financially qualified applicants, but the consular process and proof thresholds still need confirmation before treating it as easy.",
        confidence: "medium",
        notes: [
          "Temporary residency is often the first serious route people examine.",
          "Requirements can vary by consulate practice and update cycle.",
        ],
      },
      costOfLiving: {
        summary:
          "Mexico can offer a strong affordability-to-lifestyle ratio for many Americans, but the range is wide between premium neighborhoods and more local-market living.",
        confidence: "medium",
        notes: [
          "Affordability usually improves faster than Portugal once you move beyond top expat enclaves.",
          "Imported habits, private healthcare, and international-school choices can still move costs quickly.",
        ],
      },
      healthcare: {
        summary:
          "Mexico has credible private healthcare options in major cities, and many expats rely on private care for predictability, but quality and convenience vary significantly by location.",
        confidence: "medium",
        notes: [
          "City choice matters more than broad national assumptions.",
        ],
      },
      safety: {
        summary:
          "Safety in Mexico is not well served by one national verdict. The question is whether your shortlist cities and neighborhoods align with your risk tolerance and daily routines.",
        confidence: "medium",
        notes: [
          "Regional variation is the central issue, not just a generic country label.",
          "Petty crime, organized crime exposure, and neighborhood-level stability are different questions.",
        ],
      },
      climateEnvironment: {
        summary:
          "Mexico gives you more climate choice than many destinations, from temperate highlands to beach heat, which can be a real fit advantage if climate is a major priority.",
        confidence: "high",
        notes: [
          "Altitude, rainy seasons, and heat tolerance should all be checked against actual city candidates.",
        ],
      },
      taxImplications: {
        summary:
          "Tax treatment should be handled cautiously because residency status, source of income, and time in country can create a very different outcome than lifestyle-oriented content suggests.",
        confidence: "low",
        notes: [
          "Do not assume a residency visa answers the tax question.",
        ],
      },
      cultureIntegration: {
        summary:
          "Mexico can feel socially warm and accessible, but real integration usually depends on language effort and choosing a city where your daily life is not built entirely around expat convenience.",
        confidence: "medium",
        notes: [
          "Spanish capacity changes the quality of daily life materially.",
        ],
      },
      education: {
        summary:
          "For families, Mexico can provide local and international options, but school quality and commute reality need to be reviewed city by city rather than assumed from the country label.",
        confidence: "medium",
        notes: [
          "International schools can preserve continuity but materially alter the budget.",
        ],
      },
      practicalNextSteps: {
        summary:
          "Mexico becomes decision-useful when you narrow to actual cities, test residency eligibility, and compare neighborhood-level safety and housing rather than staying at country level.",
        confidence: "high",
        notes: [
          "Shortlist two cities before spending too much time on generalized Mexico research.",
        ],
      },
    },
    sources: [
      { label: "Mexico consular information", url: "https://consulmex.sre.gob.mx/", type: "official" },
      { label: "Mexico immigration institute", url: "https://www.gob.mx/inm", type: "official" },
    ],
  },
  {
    slug: "spain",
    name: "Spain",
    aliases: ["spain", "es"],
    costLevel: "moderate",
    budgetBandsUsd: {
      solo: { comfortable: 2800, stretch: 2000 },
      family: { comfortable: 5000, stretch: 3600 },
    },
    immigrationFocus: ["digital nomad", "non-lucrative visa", "residency"],
    taxCaution:
      "Spain can open serious options for some remote earners, but tax consequences are complex enough that no planning should assume a simple expat-friendly outcome.",
    climateTags: ["warm south", "temperate north", "urban heat"],
    languageContext: "English is usable in tourist and professional settings, but Spanish becomes important for admin, healthcare, and deeper integration.",
    priorityFits: ["healthcare", "stability", "climate", "urban infrastructure"],
    priorityTensions: ["tax complexity", "housing cost", "bureaucracy"],
    profileBoosts: ["solo", "digitalNomad", "retiree"],
    profileCautions: {
      family:
        "Spain can work for families, but family budgeting needs to account for housing and schooling in stronger-demand cities.",
    },
    sections: {
      visaImmigration: {
        summary:
          "Spain can be compelling where the residency route matches your income structure, but the distinction between remote-work, passive-income, and long-stay options matters more than generic country appeal.",
        confidence: "medium",
        notes: [
          "Residency strategy depends heavily on how your income is earned and documented.",
        ],
      },
      costOfLiving: {
        summary:
          "Spain can be workable on a moderate US-based budget, especially outside Madrid and Barcelona, but housing and lifestyle variance are large enough to break simplistic assumptions.",
        confidence: "medium",
        notes: [
          "Second-tier cities often produce the better fit-to-cost ratio.",
        ],
      },
      healthcare: {
        summary:
          "Healthcare is one of Spain’s stronger pull factors, especially for users weighting system quality and everyday stability.",
        confidence: "medium",
        notes: [
          "Public versus private access mechanics should still be verified for your residency path.",
        ],
      },
      safety: {
        summary:
          "Spain generally reads as relatively stable for everyday living, with the main caution being urban petty theft rather than a broad security breakdown.",
        confidence: "medium",
        notes: [],
      },
      climateEnvironment: {
        summary:
          "Spain offers strong climate variety, but the climate fit question should be city-specific because the north, coast, interior, and south feel materially different.",
        confidence: "high",
        notes: [],
      },
      taxImplications: {
        summary:
          "Tax is one of the bigger caution categories for Spain because the destination can be attractive at lifestyle level while still requiring serious cross-border tax planning.",
        confidence: "low",
        notes: [
          "Verify remote-work income treatment and residency exposure with a specialist.",
        ],
      },
      cultureIntegration: {
        summary:
          "Spain can offer strong everyday livability, but language acquisition and tolerance for admin friction still shape whether it feels genuinely sustainable.",
        confidence: "medium",
        notes: [],
      },
      practicalNextSteps: {
        summary:
          "Spain is worth a second-pass review when healthcare, lifestyle systems, and urban livability are high priorities and your income structure matches a real residency route.",
        confidence: "high",
        notes: [],
      },
    },
    sources: [
      { label: "Spanish consular information", url: "https://www.exteriores.gob.es/", type: "official" },
      { label: "Spain immigration portal", url: "https://www.inclusion.gob.es/", type: "official" },
    ],
  },
  {
    slug: "costa-rica",
    name: "Costa Rica",
    aliases: ["costa rica", "costa-rica", "cr"],
    costLevel: "moderate",
    budgetBandsUsd: {
      solo: { comfortable: 2600, stretch: 1800 },
      family: { comfortable: 4700, stretch: 3200 },
    },
    immigrationFocus: ["rentista", "pensionado", "remote income"],
    taxCaution:
      "Costa Rica may look appealing on a lifestyle basis, but residency and local tax treatment still need case-specific confirmation.",
    climateTags: ["tropical", "humid", "rainy seasons"],
    languageContext: "Spanish improves resilience and daily ease quickly, especially outside expat enclaves.",
    priorityFits: ["nature", "pace of life", "warm climate"],
    priorityTensions: ["cost creep", "car dependence", "admin friction"],
    profileBoosts: ["retiree", "solo", "family"],
    profileCautions: {
      digitalNomad:
        "Remote workers should pressure-test internet reliability and local work setup at the city level rather than assuming the national brand story is enough.",
    },
    sections: {
      visaImmigration: {
        summary:
          "Costa Rica is often researched through income-backed residency routes, but practical viability depends on income proof, administrative persistence, and whether your desired lifestyle matches the actual residency path.",
        confidence: "medium",
        notes: [],
      },
      costOfLiving: {
        summary:
          "Costa Rica can feel more expensive than expected once imported goods, preferred housing, transportation, and private healthcare are included.",
        confidence: "medium",
        notes: [],
      },
      healthcare: {
        summary:
          "Healthcare can be a positive part of the Costa Rica case, but many foreigners still want a clear view of public access versus private convenience.",
        confidence: "medium",
        notes: [],
      },
      safety: {
        summary:
          "Costa Rica often feels more manageable than some regional alternatives for everyday living, though petty crime and location-specific caution still matter.",
        confidence: "medium",
        notes: [],
      },
      climateEnvironment: {
        summary:
          "Climate fit is strong only if you genuinely want tropical humidity and can tolerate seasonal rain, heat, and occasional infrastructure stress.",
        confidence: "high",
        notes: [],
      },
      taxImplications: {
        summary:
          "Tax questions should stay in the verify-later category until residency mechanics and income sources are clear.",
        confidence: "low",
        notes: [],
      },
      cultureIntegration: {
        summary:
          "Costa Rica can feel calm and attractive, but deeper belonging still depends on language effort and how insulated you want your life to be from local systems.",
        confidence: "medium",
        notes: [],
      },
      education: {
        summary:
          "Family fit depends heavily on location and whether you need private or international schooling.",
        confidence: "medium",
        notes: [],
      },
      practicalNextSteps: {
        summary:
          "Costa Rica usually deserves a narrower city-level pass before it deserves commitment-level planning.",
        confidence: "high",
        notes: [],
      },
    },
    sources: [
      { label: "Costa Rica immigration", url: "https://migracion.go.cr/", type: "official" },
    ],
  },
  {
    slug: "ghana",
    name: "Ghana",
    aliases: ["ghana", "gh"],
    costLevel: "moderate",
    budgetBandsUsd: {
      solo: { comfortable: 2500, stretch: 1800 },
      family: { comfortable: 4600, stretch: 3200 },
    },
    immigrationFocus: ["residency permits", "long-stay setup", "diaspora return pathways"],
    taxCaution:
      "Ghana may be culturally compelling for some users, but legal status and tax exposure should be verified carefully rather than inferred from diaspora narratives.",
    climateTags: ["hot", "humid", "tropical"],
    languageContext: "English is a practical advantage in Ghana, though local social integration still has its own learning curve.",
    priorityFits: ["belonging", "diaspora connection", "english environment", "warm climate"],
    priorityTensions: ["infrastructure variance", "cost surprises", "heat"],
    profileBoosts: ["solo", "family", "other"],
    profileCautions: {
      retiree:
        "Healthcare depth and heat tolerance should be pressure-tested more carefully if retirement stability is a major priority.",
    },
    sections: {
      visaImmigration: {
        summary:
          "Ghana may be researched less through standardized expat pipelines and more through permit pathways plus local legal process, so official verification matters early.",
        confidence: "low",
        notes: [],
      },
      costOfLiving: {
        summary:
          "Ghana is not automatically cheap once housing standards, generator or backup needs, transportation, and imported habits are included.",
        confidence: "medium",
        notes: [],
      },
      healthcare: {
        summary:
          "Healthcare fit depends heavily on your expectations, city choice, and willingness to rely on private options when needed.",
        confidence: "low",
        notes: [],
      },
      safety: {
        summary:
          "Ghana is often discussed as socially manageable for foreigners, but practical safety still depends on local area, transport patterns, and lifestyle choices.",
        confidence: "medium",
        notes: [],
      },
      climateEnvironment: {
        summary:
          "Climate fit is strong only if you genuinely want heat and can tolerate humidity, dust periods, and infrastructure strain during some seasons.",
        confidence: "high",
        notes: [],
      },
      taxImplications: {
        summary:
          "Tax questions should be treated as specialist territory, especially for remote or foreign-source income.",
        confidence: "low",
        notes: [],
      },
      cultureIntegration: {
        summary:
          "Ghana can have a powerful belonging and diaspora appeal for some Black Americans, but belonging should not be romanticized into instant ease.",
        confidence: "medium",
        notes: [],
      },
      education: {
        summary:
          "Families should investigate specific school options rather than assuming a smooth default path.",
        confidence: "low",
        notes: [],
      },
      practicalNextSteps: {
        summary:
          "Ghana warrants a grounded next pass that separates cultural pull from infrastructure, healthcare, and permit reality.",
        confidence: "high",
        notes: [],
      },
    },
    sources: [
      { label: "Ghana Immigration Service", url: "https://www.gis.gov.gh/", type: "official" },
    ],
  },
]

export const DESTINATION_ALIASES = DESTINATION_KNOWLEDGE_BASE.flatMap((item) => item.aliases)

export function findDestinationKnowledge(name: string) {
  const normalized = normalizeDestinationName(name)
  return DESTINATION_KNOWLEDGE_BASE.find((item) => item.aliases.includes(normalized))
}

export function normalizeDestinationName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
}
