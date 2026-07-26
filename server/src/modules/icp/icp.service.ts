export interface IcpInput {
  productService: string;
  targetIndustry: string;
  geography: string;
  companySize?: string | undefined;
  painPoints: string[];
  preferredBuyerRole?: string | undefined;
  exclusions: string[];
  campaignGoal: string;
}

export interface LeadScoreInput {
  industryFit: number;
  locationFit: number;
  companySizeFit: number;
  evidenceQuality: number;
  websiteAvailable: boolean;
  publicContactAvailable: boolean;
  productRelevance: number;
  dataFreshness: number;
  confidence: number;
  riskFlags: string[];
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function buildIdealCustomerProfile(input: IcpInput) {
  const size = input.companySize?.trim() || "Any verified company size";
  const role = input.preferredBuyerRole?.trim() || "Publicly identified relevant buyer role";
  const painPointGuidance = input.painPoints.length
    ? input.painPoints.map((painPoint) => `${painPoint} (requires confirmation)`)
    : ["No company pain point may be assumed without evidence"];

  return {
    summary: `${input.productService} for possible-fit organizations in ${input.targetIndustry}, ${input.geography}. Company-specific fit requires verification.`,
    fitCriteria: {
      industry: input.targetIndustry,
      geography: input.geography,
      companySize: size,
      buyerRole: role,
      opportunitySignals: painPointGuidance,
    },
    exclusionCriteria: {
      explicit: input.exclusions,
      safeguards: [
        "Exclude suppressed or opted-out contacts",
        "Exclude private personal contact data",
        "Exclude companies without sufficient evidence",
      ],
    },
    searchQueries: [
      `${input.targetIndustry} companies ${input.geography}`,
      `${input.targetIndustry} official company website ${input.geography}`,
      `${input.targetIndustry} public business directory ${input.geography}`,
    ],
    scoringModel: {
      industryFit: 20,
      locationFit: 15,
      companySizeFit: 15,
      evidenceQuality: 15,
      websiteAvailability: 10,
      publicContactAvailability: 10,
      productRelevance: 5,
      dataFreshness: 5,
      confidence: 5,
      riskPenaltyPerFlag: 5,
    },
  };
}

export function scoreLead(input: LeadScoreInput) {
  const components = [
    ["Industry fit", clamp(input.industryFit) * 20],
    ["Location fit", clamp(input.locationFit) * 15],
    ["Company-size fit", clamp(input.companySizeFit) * 15],
    ["Evidence quality", clamp(input.evidenceQuality) * 15],
    ["Website availability", input.websiteAvailable ? 10 : 0],
    ["Public contact availability", input.publicContactAvailable ? 10 : 0],
    ["Product relevance", clamp(input.productRelevance) * 5],
    ["Data freshness", clamp(input.dataFreshness) * 5],
    ["Confidence", clamp(input.confidence) * 5],
  ] as const;
  const positive = components.reduce((total, [, points]) => total + points, 0);
  const riskPenalty = Math.min(25, input.riskFlags.length * 5);
  const score = Math.round(Math.max(0, Math.min(100, positive - riskPenalty)));
  return {
    score,
    label: score >= 75 ? "Possible fit" : score >= 50 ? "Potential opportunity" : "Requires confirmation",
    reasons: [
      ...components.map(([criterion, points]) => ({ criterion, points: Math.round(points) })),
      { criterion: "Risk flags", points: -riskPenalty, flags: input.riskFlags },
    ],
  };
}
