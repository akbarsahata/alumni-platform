import { readFile, mkdtemp, writeFile, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";

const targets = ["staging", "production"];
const target = process.env.SEED_ENVIRONMENT;
const enabled = process.env.SEEDING_ENABLED;
if (!targets.includes(target)) throw new Error("SEED_ENVIRONMENT must be staging or production.");
if (!["true", "false"].includes(enabled)) throw new Error("Invalid SEEDING_ENABLED flag.");

const event = process.env.GITHUB_EVENT_NAME;
const ref = process.env.GITHUB_REF_NAME;
const releaseTag = process.env.SEED_RELEASE_TAG?.trim() || ref;
const releasePrerelease = process.env.SEED_RELEASE_PRERELEASE;
if (event === "push") {
  if (ref !== "master" || target !== "staging")
    throw new Error("Only a push to master may seed staging.");
} else if (event === "release") {
  if (target !== "production" || releasePrerelease !== "false" || !releaseTag?.startsWith("v"))
    throw new Error("Only a published non-prerelease v* release may seed production.");
} else if (event) {
  throw new Error("Seeds run only from master pushes or published v* releases.");
}

const file = resolve("seeds/seed.sql");
const sql = await readFile(file, "utf8");
if (!sql.replace(/--[^\n]*/g, "").trim()) throw new Error("Seed file is empty.");
const trigger =
  event === "release"
    ? `release ${releaseTag}`
    : event === "push"
      ? `push ${ref}`
      : "local invocation";
const message = `Seed target: ${target} (${trigger}). Remote seeding ${enabled === "true" ? "enabled" : "disabled; no database writes"}.`;
console.log(message);
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
if (process.argv.includes("--check") || enabled === "false") process.exit(0);

for (const key of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "D1_DATABASE_ID"])
  if (!process.env[key]?.trim()) throw new Error(`Missing environment secret: ${key}`);
if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(process.env.D1_DATABASE_ID))
  throw new Error("Invalid D1_DATABASE_ID.");

const directory = await mkdtemp(join(tmpdir(), "alumni-seed-"));
try {
  const config = join(directory, "wrangler.json");
  await writeFile(
    config,
    JSON.stringify({
      name: `alumni-seed-${target}`,
      compatibility_date: "2026-10-01",
      d1_databases: [{ binding: "DB", database_id: process.env.D1_DATABASE_ID }],
    }),
    { mode: 0o600 }
  );
  execFileSync(
    resolve("node_modules/.bin/wrangler"),
    ["d1", "execute", "DB", "--remote", "--config", config, "--file", file, "--yes"],
    { stdio: "inherit" }
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
