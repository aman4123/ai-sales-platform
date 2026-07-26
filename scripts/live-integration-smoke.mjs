import nodemailer from "nodemailer";

if (process.env.RUN_LIVE_INTEGRATION_TESTS !== "true") {
  process.stdout.write(`${JSON.stringify({ status: "disabled", message: "Set RUN_LIVE_INTEGRATION_TESTS=true to opt in." })}\n`);
  process.exit(0);
}

const timeoutMs = 15_000;
const checks = [];

async function checkedFetch(name, url, init, validate = () => true) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const body = await response.json().catch(() => null);
  if (!response.ok || !validate(body)) throw new Error(`${name} live health check failed with HTTP ${response.status}.`);
  checks.push({ provider: name, status: "pass" });
}

if (process.env.GROQ_API_KEY) {
  await checkedFetch("groq", "https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
      messages: [{ role: "user", content: "Reply with exactly OK." }],
      max_tokens: 8,
      temperature: 0,
    }),
  }, (body) => Array.isArray(body?.choices));
}

if (process.env.TAVILY_API_KEY) {
  await checkedFetch("tavily", "https://api.tavily.com/search", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.TAVILY_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ query: "OpenAI official website", max_results: 1, search_depth: "basic", include_answer: false }),
  }, (body) => Array.isArray(body?.results));
}

if (process.env.BRAVE_SEARCH_API_KEY) {
  await checkedFetch("brave", "https://api.search.brave.com/res/v1/web/search?q=OpenAI%20official%20website&count=1", {
    headers: { accept: "application/json", "x-subscription-token": process.env.BRAVE_SEARCH_API_KEY },
  }, (body) => Array.isArray(body?.web?.results));
}

if (process.env.SERPER_API_KEY) {
  await checkedFetch("serper", "https://google.serper.dev/search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.SERPER_API_KEY },
    body: JSON.stringify({ q: "OpenAI official website", num: 1 }),
  }, (body) => Array.isArray(body?.organic));
}

if (process.env.EMAIL_DELIVERY_MODE === "smtp" && process.env.SMTP_HOST) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: process.env.SMTP_SECURE === "true",
    ...(process.env.SMTP_USER && process.env.SMTP_PASSWORD
      ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
      : {}),
    connectionTimeout: timeoutMs,
  });
  await transporter.verify();
  checks.push({ provider: "smtp", status: "pass", emailSent: false });
}

const recipient = process.env.LIVE_TEST_EMAIL_RECIPIENT?.trim();
if (recipient && process.env.LIVE_TEST_EMAIL_CONFIRM === "SEND_ONE_TRANSACTIONAL_SMOKE") {
  if (process.env.EMAIL_DELIVERY_MODE !== "resend" || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    throw new Error("Explicit live email smoke requires Resend configuration and EMAIL_FROM.");
  }
  await checkedFetch("resend", `${(process.env.RESEND_API_URL ?? "https://api.resend.com").replace(/\/$/, "")}/emails`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: `AI Sales Platform <${process.env.EMAIL_FROM}>`,
      to: [recipient],
      subject: "AI Sales Platform integration smoke test",
      text: "This is an explicitly authorized transactional integration smoke test. It is not a campaign message.",
    }),
  }, (body) => typeof body?.id === "string");
}

if (checks.length === 0) throw new Error("No live provider credentials were configured for the opt-in smoke test.");
process.stdout.write(`${JSON.stringify({ status: "pass", checks })}\n`);
