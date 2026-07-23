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
const document = YAML.parse(await readFile("render.yaml", "utf8"));
const validator = new Ajv({ allErrors: true, strict: false });
addFormats(validator);
const valid = validator.validate(schema, document);
if (!valid) {
  throw new Error(`Invalid Render Blueprint:\n${validator.errorsText(validator.errors, { separator: "\n" })}`);
}
process.stdout.write(`Render Blueprint is valid against ${entry.url}.\n`);
