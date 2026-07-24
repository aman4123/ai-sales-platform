import { readFile } from "node:fs/promises";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";

async function fetchJson(url, label) {
  return fetch(url, { signal: AbortSignal.timeout(15_000) }).then((response) => {
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}.`);
    return response.json();
  });
}

const catalog = await fetchJson("https://www.schemastore.org/api/json/catalog.json", "Schema catalog");
if (!catalog.schemas) {
  throw new Error("Schema catalog did not contain a schemas collection.");
}
const entry = catalog.schemas.find((schema) =>
  schema.fileMatch?.some((pattern) => pattern.endsWith("render.yaml")));
if (!entry) throw new Error("The Render Blueprint schema is missing from SchemaStore.");
const schema = await fetchJson(entry.url, "Render schema");
const validator = new Ajv({ allErrors: true, strict: false });
addFormats(validator);

for (const file of ["render.yaml", "render.production.yaml"]) {
  const document = YAML.parse(await readFile(file, "utf8"));
  const valid = validator.validate(schema, document);
  if (!valid) {
    throw new Error(
      `Invalid Render Blueprint ${file}:\n${validator.errorsText(validator.errors, { separator: "\n" })}`,
    );
  }
}

const freeBlueprint = YAML.parse(await readFile("render.yaml", "utf8"));
const services = freeBlueprint.services ?? [];
if (services.length !== 1 || services[0]?.type !== "web" || services[0]?.plan !== "free") {
  throw new Error("render.yaml must create exactly one Free web service.");
}
const freeService = services[0];
if ((freeBlueprint.databases?.length ?? 0) !== 0) {
  throw new Error("render.yaml must not create a Render-managed database.");
}
if (freeService.disk || freeService.scaling || (freeService.numInstances ?? 1) !== 1) {
  throw new Error("The Free Blueprint must not add a disk, autoscaling, or extra instances.");
}
if (freeService.previews?.generation === "automatic") {
  throw new Error("The Free Blueprint must not create automatic preview environments.");
}
if (freeService.preDeployCommand) {
  throw new Error("Render Free does not support pre-deploy commands.");
}
if (!freeService.dockerCommand?.includes("prisma/build/index.js migrate deploy")) {
  throw new Error("The Free web service must apply committed Prisma migrations before startup.");
}
if (freeService.envVars?.some(({ key }) => key === "DEEPSEEK_API_KEY")) {
  throw new Error("The zero-cost Blueprint must not activate a paid AI provider.");
}
const aiMonthlyLimit = freeService.envVars?.find(({ key }) => key === "AI_MONTHLY_REQUEST_LIMIT");
if (Number(aiMonthlyLimit?.value) !== 0) {
  throw new Error("The zero-cost Blueprint must keep the paid-AI monthly limit at zero.");
}
const requiredDashboardSecrets = ["DATABASE_URL", "DIRECT_URL", "REDIS_URL", "RESEND_API_KEY"];
for (const key of requiredDashboardSecrets) {
  const definition = freeService.envVars?.find((item) => item.key === key);
  if (!definition || definition.sync !== false) {
    throw new Error(`${key} must be supplied through the Render dashboard.`);
  }
}

process.stdout.write(
  `Render Blueprints are valid against ${entry.url}; the default Blueprint is cost-guarded to one Free web service.\n`,
);
