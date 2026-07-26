import { describe, expect, it } from "vitest";
import { groundedEmailSystemPrompt, validateGeneratedEmail, type GroundedEmailInput } from "./campaign.email.js";

const input: GroundedEmailInput = {
  company: "Example Logistics",
  contact: "Alex Rao",
  industry: "Logistics",
  tone: "Friendly",
  savedSignature: "Sam\nExample Sales",
  productService: "AI Sales Platform",
  valueProposition: "Evidence-backed prospect research with human approval",
  campaignGoal: "Introduce the platform",
  verifiedFacts: [{ field: "website", value: "https://example.com", evidenceIds: ["ev-1"] }],
};

describe("grounded campaign email", () => {
  it("preserves the exact signature and evidence references", () => {
    const draft = validateGeneratedEmail(JSON.stringify({
      subject: "A careful approach to prospect research",
      greeting: "Hello Alex Rao,",
      body: "I am reaching out about AI Sales Platform for Example Logistics.",
      cta: "Would it be useful to review whether it fits your process?",
      closing: "Best regards,",
    }), input);
    expect(draft?.signature).toBe(input.savedSignature);
    expect(draft?.evidenceIds).toEqual(["ev-1"]);
    expect(draft?.wordCount).toBeGreaterThan(0);
  });

  it("rejects placeholders and invented contact tokens", () => {
    expect(validateGeneratedEmail(JSON.stringify({ subject: "Hello [Name]", greeting: "Hi", body: "Intro", cta: "Reply", closing: "Thanks" }), input)).toBeNull();
    expect(validateGeneratedEmail(JSON.stringify({ subject: "Hello", greeting: "Hi", body: "Visit https://invented.example or call +1 555 123 4567", cta: "Reply", closing: "Thanks" }), input)).toBeNull();
    expect(validateGeneratedEmail(JSON.stringify({ subject: "Hello\r\nBcc: attacker@example.test", greeting: "Hi", body: "Intro", cta: "Reply", closing: "Thanks" }), input)).toBeNull();
  });

  it("makes the factual and autonomy boundaries explicit", () => {
    expect(groundedEmailSystemPrompt).toMatch(/Never invent facts/i);
    expect(groundedEmailSystemPrompt).toMatch(/Use no placeholders/i);
    expect(groundedEmailSystemPrompt).toMatch(/human review/i);
    expect(groundedEmailSystemPrompt).toMatch(/do not auto-negotiate/i);
  });
});
