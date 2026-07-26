import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "../../lib/errors.js";

type AddressLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: number }>>;

const blockedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

export function isPrivateOrReservedIp(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0]!;
  if (normalized.startsWith("::ffff:")) {
    return isPrivateOrReservedIp(normalized.slice("::ffff:".length));
  }

  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b! >= 64 && b! <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a! >= 224
    );
  }

  if (isIP(normalized) === 6) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("2001:db8:")
    );
  }

  return true;
}

export async function assertSafePublicUrl(
  rawUrl: string,
  lookup: AddressLookup = dnsLookup,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError(400, "UNSAFE_RESEARCH_URL", "The research source URL is invalid.");
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new AppError(400, "UNSAFE_RESEARCH_URL", "The research source URL is not allowed.");
  }
  if ((url.port && url.port !== "80" && url.port !== "443") || url.hostname.length > 253) {
    throw new AppError(400, "UNSAFE_RESEARCH_URL", "The research source URL is not allowed.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    blockedHostnames.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new AppError(400, "UNSAFE_RESEARCH_URL", "Private network URLs are not allowed.");
  }

  if (isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new AppError(400, "UNSAFE_RESEARCH_URL", "Private network URLs are not allowed.");
    }
    return url;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new AppError(400, "RESEARCH_URL_UNRESOLVED", "The research source could not be resolved.");
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateOrReservedIp(address))) {
    throw new AppError(400, "UNSAFE_RESEARCH_URL", "Private network URLs are not allowed.");
  }

  return url;
}

export function containsPromptInjection(content: string): boolean {
  return /(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|system)|system\s+prompt|developer\s+message|reveal\s+(?:your|the)\s+(?:prompt|instructions)|you\s+are\s+now/i.test(
    content,
  );
}

export function sanitizeResearchContent(content: string): string {
  const withoutMarkup = content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|amp|lt|gt);/gi, (entity, name: string) => ({
      nbsp: " ",
      amp: "&",
      lt: "<",
      gt: ">",
    })[name.toLowerCase()] ?? entity);
  return [...withoutMarkup]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

async function readLimitedText(response: Response, maximumBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel();
    throw new AppError(422, "RESEARCH_PAGE_TOO_LARGE", "The research source is too large.");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let body = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += chunk.value.byteLength;
    if (received > maximumBytes) {
      await reader.cancel();
      throw new AppError(422, "RESEARCH_PAGE_TOO_LARGE", "The research source is too large.");
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  return body + decoder.decode();
}

export async function fetchPublicPage(
  rawUrl: string,
  options: { timeoutMs: number; maximumBytes: number },
  fetcher: typeof fetch = fetch,
): Promise<{
  url: string;
  content: string;
  contentType: string;
  retrievedAt: string;
  promptInjectionDetected: boolean;
}> {
  let url = await assertSafePublicUrl(rawUrl);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    let response: Response;
    try {
      response = await fetcher(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs),
        headers: { accept: "text/html,text/plain;q=0.9" },
      });
    } catch {
      throw new AppError(502, "RESEARCH_PAGE_UNAVAILABLE", "The research source is unavailable.");
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) {
        throw new AppError(502, "RESEARCH_PAGE_INVALID", "The research source returned an invalid redirect.");
      }
      url = await assertSafePublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new AppError(502, "RESEARCH_PAGE_UNAVAILABLE", "The research source is unavailable.");
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!contentType.startsWith("text/html") && !contentType.startsWith("text/plain")) {
      await response.body?.cancel();
      throw new AppError(422, "RESEARCH_PAGE_UNSUPPORTED", "The research source format is unsupported.");
    }
    const content = sanitizeResearchContent(await readLimitedText(response, options.maximumBytes));
    const promptInjectionDetected = containsPromptInjection(content);
    return {
      url: url.toString(),
      content: promptInjectionDetected ? "" : content,
      contentType,
      retrievedAt: new Date().toISOString(),
      promptInjectionDetected,
    };
  }

  throw new AppError(422, "RESEARCH_REDIRECT_LIMIT", "The research source redirected too many times.");
}
