import { Router } from "express";
import { z } from "zod";
import { NotFoundError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import { buildIdealCustomerProfile, scoreLead } from "./icp.service.js";
import { tenantScope, tenantWrite } from "../tenancy/tenant.service.js";

const icpSchema = z.object({
  name: z.string().trim().min(2).max(120),
  productService: z.string().trim().min(2).max(500),
  targetIndustry: z.string().trim().min(2).max(160),
  geography: z.string().trim().min(2).max(160),
  companySize: z.string().trim().max(120).optional(),
  painPoints: z.array(z.string().trim().min(2).max(200)).max(20).default([]),
  preferredBuyerRole: z.string().trim().max(160).optional(),
  exclusions: z.array(z.string().trim().min(2).max(200)).max(20).default([]),
  campaignGoal: z.string().trim().min(2).max(500),
});

const scoreSchema = z.object({
  industryFit: z.number().min(0).max(1),
  locationFit: z.number().min(0).max(1),
  companySizeFit: z.number().min(0).max(1),
  evidenceQuality: z.number().min(0).max(1),
  websiteAvailable: z.boolean(),
  publicContactAvailable: z.boolean(),
  productRelevance: z.number().min(0).max(1),
  dataFreshness: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  riskFlags: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
});

const idSchema = z.string().min(1).max(64);

export function createIcpRouter(database: DatabaseClient) {
  const router = Router();

  router.get("/", async (request, response) => {
    const profiles = await database.idealCustomerProfile.findMany({
      where: { ...tenantScope(request.tenant, request.user!.id), deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    response.json({ data: { profiles } });
  });

  router.post("/", async (request, response) => {
    const input = icpSchema.parse(request.body);
    const generated = buildIdealCustomerProfile(input);
    const profile = await database.idealCustomerProfile.create({
      data: {
        userId: request.user!.id,
        ...tenantWrite(request.tenant),
        name: input.name,
        productService: input.productService,
        targetIndustry: input.targetIndustry,
        geography: input.geography,
        companySize: input.companySize ?? null,
        painPoints: input.painPoints,
        preferredBuyerRole: input.preferredBuyerRole ?? null,
        exclusions: input.exclusions,
        campaignGoal: input.campaignGoal,
        summary: generated.summary,
        fitCriteria: generated.fitCriteria,
        exclusionCriteria: generated.exclusionCriteria,
        searchQueries: generated.searchQueries,
        scoringModel: generated.scoringModel,
      },
    });
    response.status(201).json({ data: { profile } });
  });

  router.get("/:id", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const profile = await database.idealCustomerProfile.findFirst({
      where: { id, ...tenantScope(request.tenant, request.user!.id), deletedAt: null },
    });
    if (!profile) throw new NotFoundError("Ideal customer profile");
    response.json({ data: { profile } });
  });

  router.post("/score", (request, response) => {
    response.json({ data: scoreLead(scoreSchema.parse(request.body)) });
  });

  return router;
}
