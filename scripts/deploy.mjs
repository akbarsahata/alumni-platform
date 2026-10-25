import { execFileSync } from "node:child_process";
import { access, appendFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = process.cwd();
const wrangler = resolve(root, "node_modules/.bin/wrangler");
const buildConfigPath = resolve(root, "build/server/wrangler.json");
const redirectPath = resolve(root, ".wrangler/deploy/config.json");

const placeholderD1 = new Set([
  "00000000-0000-0000-0000-000000000000",
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
]);
const placeholderKv = new Set([
  "00000000000000000000000000000000",
  "00000000000000000000000000000001",
  "00000000000000000000000000000002",
]);
// Keep aligned with env.staging in wrangler.jsonc. Production must never reuse
// the staging database or namespace.
const stagingD1 = "3cebe648-9065-4be8-ab8f-48958e9d36be";
const stagingKv = "72a57fe4e83c4029a2ada4e5a84ddd80";

function usage() {
  console.error(
    "Usage: node scripts/deploy.mjs <staging|production> [--check] [--secrets-file <path>]"
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args) {
  console.log(`[deploy] ${command} ${args.join(" ")}`);
  execFileSync(command, args, { stdio: "inherit", env: process.env });
}

function runJson(command, args) {
  const output = execFileSync(command, args, {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  assert(start >= 0 && end > start, `${command} did not return JSON`);
  return JSON.parse(output.slice(start, end + 1));
}

async function appendSummary(line) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

function expectedEnvironment(environment, allowPlaceholders) {
  if (environment === "staging")
    return {
      workerName: "alumni-platform-staging",
      origin: "https://kasmanss.akbarsahata.id",
      hostname: "kasmanss.akbarsahata.id",
      placeholder: false,
    };

  const configured = process.env.PRODUCTION_URL?.trim();
  if (configured) {
    const url = new URL(configured);
    assert(url.protocol === "https:", "PRODUCTION_URL must use https.");
    assert(!url.username && !url.password, "PRODUCTION_URL must not include credentials.");
    assert(
      url.pathname === "/" && !url.search && !url.hash,
      "PRODUCTION_URL must be an origin without a path, query, or fragment."
    );
    return {
      workerName: "alumni-platform-production",
      origin: url.origin,
      hostname: url.hostname,
      placeholder: false,
    };
  }
  assert(allowPlaceholders, "PRODUCTION_URL is required for a production deploy.");
  return {
    workerName: "alumni-platform-production",
    origin: "https://production.invalid",
    hostname: "production.invalid",
    placeholder: true,
  };
}

function validateBuildConfig(config, environment, expected, allowPlaceholders) {
  assert(
    config.targetEnvironment === environment,
    `build/server/wrangler.json targets ${config.targetEnvironment ?? "no environment"}, not ${environment}`
  );
  assert(
    config.name === expected.workerName,
    `build/server/wrangler.json configures ${config.name ?? "no worker"}, not ${expected.workerName}`
  );
  assert(config.env === undefined, "Flattened build config must not contain an env block");
  assert(config.workers_dev === false, "Deployed Workers must disable workers_dev");
  assert(config.preview_urls === false, "Deployed Workers must disable preview URLs");
  assert(config.observability?.enabled === true, "Deployed Workers must enable observability");
  assert(config.vars?.ENVIRONMENT === environment, `Runtime ENVIRONMENT must be ${environment}`);
  assert(
    config.vars?.BETTER_AUTH_URL === expected.origin,
    `Runtime BETTER_AUTH_URL must be ${expected.origin}`
  );
  for (const key of ["EMAIL_FROM", "EMAIL_REPLY_TO"])
    assert(
      typeof config.vars?.[key] === "string" && config.vars[key].trim().length > 0,
      `Runtime ${key} must be configured`
    );

  const database = config.d1_databases?.find((item) => item?.binding === "DB");
  assert(database, "Build output is missing the DB D1 binding");
  assert(
    typeof database.migrations_dir === "string" && database.migrations_dir.length > 0,
    "Build output is missing the D1 migrations directory"
  );
  const namespace = config.kv_namespaces?.find((item) => item?.binding === "LOCAL_MAIL");
  assert(namespace, "Build output is missing the LOCAL_MAIL KV binding");

  if (!allowPlaceholders) {
    assert(
      !placeholderD1.has(database.database_id),
      "Replace the placeholder staging/production D1 ID"
    );
    assert(!placeholderKv.has(namespace.id), "Replace the placeholder staging/production KV ID");
  }
  if (environment === "production") {
    assert(database.database_id !== stagingD1, "Production must not use the staging D1 ID");
    assert(namespace.id !== stagingKv, "Production must not use the staging KV ID");
  }
  if (!expected.placeholder) {
    const route = config.routes?.find(
      (item) => item?.custom_domain === true && item?.pattern === expected.hostname
    );
    assert(route, `Build output is missing the custom domain route for ${expected.hostname}`);
  }
  assert(Array.isArray(config.secrets?.required), "Build output is missing required secrets");
  assert(
    config.secrets.required.includes("BETTER_AUTH_SECRET"),
    "Build output does not require BETTER_AUTH_SECRET"
  );
  assert(
    config.secrets.required.includes("RESEND_API_KEY"),
    "Build output does not require RESEND_API_KEY"
  );
}

async function findDevVars(directory) {
  const found = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await findDevVars(path)));
    else if (entry.name === ".dev.vars" || entry.name.startsWith(".dev.vars.")) found.push(path);
  }
  return found;
}

async function cleanBuildSecrets() {
  await rm(resolve(root, "build/server/.dev.vars"), { force: true });
  const found = await findDevVars(resolve(root, "build"));
  assert(found.length === 0, `Build output contains local secret files: ${found.join(", ")}`);
}

async function resolveSecretsFile(explicitPath) {
  if (explicitPath) {
    const path = resolve(root, explicitPath);
    await access(path);
    return { file: path, cleanup: async () => {} };
  }

  const betterAuthSecret = process.env.BETTER_AUTH_SECRET?.trim();
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  assert(
    betterAuthSecret && resendApiKey,
    "Set BETTER_AUTH_SECRET and RESEND_API_KEY, or pass --secrets-file."
  );
  const directory = await mkdtemp(join(tmpdir(), "alumni-deploy-"));
  const file = join(directory, "worker-secrets.json");
  await writeFile(
    file,
    JSON.stringify({ BETTER_AUTH_SECRET: betterAuthSecret, RESEND_API_KEY: resendApiKey }),
    {
      mode: 0o600,
    }
  );
  return { file, cleanup: async () => rm(directory, { recursive: true, force: true }) };
}

async function assertSecretsAvailable(explicitPath) {
  if (explicitPath) {
    await access(resolve(root, explicitPath));
    return;
  }
  assert(
    process.env.BETTER_AUTH_SECRET?.trim() && process.env.RESEND_API_KEY?.trim(),
    "Set BETTER_AUTH_SECRET and RESEND_API_KEY, or pass --secrets-file."
  );
}

async function main() {
  const args = process.argv.slice(2);
  const environment = args[0];
  if (!environment || !["staging", "production"].includes(environment)) {
    usage();
    process.exitCode = 1;
    return;
  }

  let checkOnly = false;
  let explicitSecretsPath;
  for (let index = 1; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--check") {
      checkOnly = true;
    } else if (argument === "--secrets-file" && args[index + 1]) {
      explicitSecretsPath = args[++index];
    } else {
      usage();
      process.exitCode = 1;
      return;
    }
  }

  process.env.CLOUDFLARE_ENV = environment;
  await rm(redirectPath, { force: true });
  run("npm", ["run", "build"]);

  const buildConfig = JSON.parse(await readFile(buildConfigPath, "utf8"));
  const expected = expectedEnvironment(environment, checkOnly);
  validateBuildConfig(buildConfig, environment, expected, checkOnly);
  await cleanBuildSecrets();

  if (checkOnly) {
    console.log(
      `[deploy] ${environment} build config is valid; no migrations or deployment performed.`
    );
    return;
  }

  if (process.env.CI && (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID))
    throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required in CI.");
  await assertSecretsAvailable(explicitSecretsPath);

  if (environment === "production") {
    const info = runJson(wrangler, [
      "d1",
      "time-travel",
      "info",
      "DB",
      "--env",
      "production",
      "--json",
    ]);
    assert(
      typeof info.bookmark === "string" && info.bookmark.length > 0,
      "Time Travel returned no bookmark"
    );
    console.log(`[deploy] D1 Time Travel bookmark: ${info.bookmark}`);
    await appendSummary(`- D1 Time Travel bookmark: \`${info.bookmark}\``);
  }

  run(wrangler, ["d1", "migrations", "apply", "DB", "--remote", "--env", environment]);

  const secrets = await resolveSecretsFile(explicitSecretsPath);
  try {
    run(wrangler, ["deploy", "--env", environment, "--secrets-file", secrets.file]);
  } finally {
    await secrets.cleanup();
  }

  await appendSummary(`- Worker: ${expected.workerName}`);
  await appendSummary(`- Origin: ${expected.origin}`);
  console.log(`[deploy] Deployed ${expected.workerName} to ${expected.origin}`);
}

main().catch((error) => {
  console.error(`[deploy] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
