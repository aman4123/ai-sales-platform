import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";

export interface UnsubscribeTokenPayload {
  tenantId: string;
  recipientId: string;
  version: 1;
}

function signature(value: string) {
  return createHmac("sha256", env.JWT_REFRESH_SECRET).update(value).digest();
}

export function createUnsubscribeToken(input: Omit<UnsubscribeTokenPayload, "version">) {
  const payload = Buffer.from(JSON.stringify({ ...input, version: 1 }), "utf8").toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload | null {
  if (token.length > 1_000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return null;
  const expected = signature(payload);
  const supplied = Buffer.from(suppliedSignature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<UnsubscribeTokenPayload>;
    if (
      parsed.version !== 1
      || typeof parsed.tenantId !== "string"
      || parsed.tenantId.length < 1
      || parsed.tenantId.length > 128
      || typeof parsed.recipientId !== "string"
      || parsed.recipientId.length < 1
      || parsed.recipientId.length > 128
    ) return null;
    return { version: 1, tenantId: parsed.tenantId, recipientId: parsed.recipientId };
  } catch {
    return null;
  }
}
