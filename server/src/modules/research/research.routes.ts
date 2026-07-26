import { Router } from "express";
import { z } from "zod";
import { AppError, NotFoundError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import type { RedisClient } from "../../lib/redis.js";
import { consumeMonthlyAiRequest, resolveAiProvider } from "../ai/ai.routes.js";
import { askGroq } from "../ai/ai.service.js";
import {
  evidenceConfidence,
  evidenceConflicts,
  evidenceFromSearch,
  groundedResearchSystemPrompt,
  groundedResearchUserPrompt,
  supportedResearchFields,
  validateGroundedResearchOutput,
  type GroundingEvidence,
} from "./research.grounding.js";
import { searchProviderConfiguration } from "./search.providers.js";
import { executeVerifiedSearch } from "./search.service.js";

const createJobSchema = z.object({
  query: z.string().trim().min(3).max(500),
  targetType: z.enum(["COMPANY", "MARKET", "CONTACT"]).default("COMPANY"),
  confirmPaidSearch: z.boolean().default(false),
});

const listJobsSchema = z.object({
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const idSchema = z.string().min(1).max(64);

function evidenceValue(
  evidence: GroundingEvidence[],
  field: (typeof supportedResearchFields)[number],
) {
  return evidence.find((item) => item.field === field)?.value ?? null;
}

function unknownFields(evidence: GroundingEvidence[]) {
  const known = new Set(evidence.map((item) => item.field));
  return supportedResearchFields.filter((field) => !known.has(field));
}

function safeErrorCode(error: unknown) {
  return error instanceof AppError ? error.code : "RESEARCH_FAILED";
}

function safeErrorMessage(error: unknown) {
  return error instanceof AppError ? error.message : "Verified research could not be completed.";
}

export function createResearchRouter(database: DatabaseClient, redis: RedisClient | null) {
  const router = Router();

  router.get("/status", async (_request, response) => {
    const configuration = searchProviderConfiguration();
    response.json({
      data: {
        ...configuration,
        health: configuration.configured
          ? { provider: configuration.provider, configured: true, liveCheckPerformed: false }
          : null,
      },
    });
  });

  router.get("/jobs", async (request, response) => {
    const query = listJobsSchema.parse(request.query);
    const jobs = await database.researchJob.findMany({
      where: { userId: request.user!.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { _count: { select: { results: true } } },
    });
    const hasMore = jobs.length > query.limit;
    const page = hasMore ? jobs.slice(0, query.limit) : jobs;
    response.json({
      data: {
        jobs: page,
        nextCursor: hasMore ? page.at(-1)!.id : null,
      },
    });
  });

  router.get("/jobs/:id", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const job = await database.researchJob.findFirst({
      where: { id, userId: request.user!.id },
      include: {
        results: {
          orderBy: { confidenceScore: "desc" },
          include: { evidence: { orderBy: { confidence: "desc" } } },
        },
      },
    });
    if (!job) throw new NotFoundError("Research job");
    response.json({ data: { job } });
  });

  router.post("/jobs", async (request, response) => {
    const input = createJobSchema.parse(request.body);
    if (!input.confirmPaidSearch) {
      throw new AppError(
        409,
        "SEARCH_CONFIRMATION_REQUIRED",
        "Confirm the paid search request before starting verified research.",
      );
    }
    const configuration = searchProviderConfiguration();
    if (!configuration.configured) {
      throw new AppError(503, "SEARCH_NOT_CONFIGURED", configuration.message);
    }

    const job = await database.researchJob.create({
      data: {
        userId: request.user!.id,
        query: input.query,
        targetType: input.targetType,
        provider: configuration.provider,
        status: "RUNNING",
        startedAt: new Date(),
      },
    });

    try {
      const search = await executeVerifiedSearch(
        database,
        redis,
        request.user!.id,
        input.query,
      );
      const groundedCandidates = evidenceFromSearch(search);
      const allEvidence = groundedCandidates.candidates.flatMap((candidate) => candidate.evidence);
      const settings = await database.userSettings.findUnique({
        where: { userId: request.user!.id },
        select: { aiProvider: true },
      });
      const aiProvider = resolveAiProvider(settings?.aiProvider ?? "MOCK");
      let groundedAiOutput = null;
      if (aiProvider === "GROQ" && allEvidence.length > 0) {
        await consumeMonthlyAiRequest(redis);
        const rawOutput = await askGroq(
          groundedResearchSystemPrompt,
          groundedResearchUserPrompt(allEvidence),
          { temperature: 0.1 },
        );
        groundedAiOutput = validateGroundedResearchOutput(rawOutput, allEvidence);
      }

      const results = [];
      for (const candidate of groundedCandidates.candidates) {
        const candidateIds = new Set(candidate.evidence.map((item) => item.id));
        const conflicts = evidenceConflicts(candidate.evidence);
        const riskFlags = new Set([
          "REQUIRES_CONFIRMATION",
          ...groundedCandidates.riskFlags,
          ...(conflicts.length > 0 ? ["CONFLICTING_SOURCES"] : []),
          ...(groundedAiOutput === null && aiProvider === "GROQ" ? ["AI_OUTPUT_REJECTED"] : []),
        ]);
        const relevantAnalysis =
          groundedAiOutput?.analysis.filter((analysis) =>
            analysis.evidenceIds.every((id) => candidateIds.has(id)),
          ) ?? [];
        const result = await database.companyResearchResult.create({
          data: {
            userId: request.user!.id,
            jobId: job.id,
            companyName: evidenceValue(candidate.evidence, "companyName"),
            website: evidenceValue(candidate.evidence, "website"),
            domain: evidenceValue(candidate.evidence, "domain"),
            description: evidenceValue(candidate.evidence, "description"),
            unknownFields: unknownFields(candidate.evidence),
            confidenceScore: evidenceConfidence(candidate.evidence),
            riskFlags: [...riskFlags],
            staleAt: new Date(Date.now() + 30 * 86_400_000),
            salesAnalysis: {
              label: "AI analysis",
              statements: relevantAnalysis,
              rejectedUnsupportedFacts: groundedAiOutput?.rejectedFactCount ?? 0,
            },
            evidence: {
              create: candidate.evidence.map((item) => ({
                id: item.id,
                field: item.field,
                value: item.value,
                sourceUrl: item.sourceUrl,
                sourceTitle: item.sourceTitle,
                sourceType: item.sourceType,
                retrievedAt: item.retrievedAt,
                confidence: item.confidence,
                verificationStatus: item.verificationStatus,
                ...(item.quotedSnippet ? { quotedSnippet: item.quotedSnippet } : {}),
                isPrimarySource: item.isPrimarySource,
              })),
            },
          },
          include: { evidence: true },
        });
        results.push(result);
      }

      const completedJob = await database.researchJob.update({
        where: { id: job.id, userId: request.user!.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      response.status(201).json({
        data: {
          job: { ...completedJob, results },
          cached: search.cached,
        },
      });
    } catch (error) {
      await database.researchJob.update({
        where: { id: job.id, userId: request.user!.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorCode: safeErrorCode(error),
          error: safeErrorMessage(error),
        },
      });
      throw error;
    }
  });

  router.post("/results/:id/save", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const result = await database.companyResearchResult.findFirst({
      where: { id, userId: request.user!.id },
    });
    if (!result) throw new NotFoundError("Research result");
    if (!result.companyName) {
      throw new AppError(422, "COMPANY_NAME_UNVERIFIED", "A sourced company name is required.");
    }

    const existing = result.domain
      ? await database.company.findUnique({
          where: { userId_domain: { userId: request.user!.id, domain: result.domain } },
        })
      : null;
    const company =
      existing ??
      (await database.company.create({
        data: {
          userId: request.user!.id,
          name: result.companyName,
          legalName: result.legalName,
          aliases: result.aliases,
          website: result.website,
          domain: result.domain,
          industry: result.industry,
          description: result.description,
          headquarters: result.headquarters,
          operatingLocations: result.operatingLocations,
          publicPhone: result.publicPhone,
          publicEmail: result.publicEmail,
          ...(result.socialProfiles !== null ? { socialProfiles: result.socialProfiles } : {}),
          ...(result.registrationIdentifiers !== null
            ? { registrationIdentifiers: result.registrationIdentifiers }
            : {}),
          productsServices: result.productsServices,
          confidenceScore: result.confidenceScore,
          riskFlags: result.riskFlags,
          staleAt: result.staleAt,
        },
      }));

    if (result.companyId !== company.id) {
      await database.companyResearchResult.update({
        where: { id, userId: request.user!.id },
        data: { companyId: company.id },
      });
    }
    response.status(existing ? 200 : 201).json({ data: { company, duplicate: Boolean(existing) } });
  });

  return router;
}
