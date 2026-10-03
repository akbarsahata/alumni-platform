import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const houses = ["Komodo", "Lion", "Rhino", "Hornbill", "Dove", "Eagle", "Dolphin", "Shark", "Mantaray"];
const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const quote = value => "'" + value.replaceAll("'", "''") + "'";
let directory;
try {
  if (process.argv.length !== 3) throw new Error("Use: npm run bootstrap -- /private/path/appointment.json (local D1 only).");
  const input = JSON.parse(await readFile(process.argv[2], "utf8"));
  if (!text(input.primaryUserId, 200) || !text(input.operator, 200) || !text(input.reason, 1000) || !Array.isArray(input.trustedAlumni)) throw new Error("Provide primaryUserId, operator, reason and trustedAlumni.");
  const seen = new Set();
  for (const member of input.trustedAlumni) {
    if (!text(member.userId, 200) || !houses.includes(member.house) || seen.has(member.userId)) throw new Error("Each trusted alumnus needs a unique verified userId and exactly one valid house.");
    seen.add(member.userId);
  }
  directory = await mkdtemp(join(tmpdir(), "alumni-bootstrap-"));
  const file = join(directory, "bootstrap.sql");
  await writeFile(file, `INSERT INTO organization_bootstrap (singleton,primary_user_id,operator,reason,trusted_alumni) VALUES (1,${quote(input.primaryUserId)},${quote(input.operator.trim())},${quote(input.reason.trim())},${quote(JSON.stringify(input.trustedAlumni))});`, { mode: 0o600 });
  const args = ["d1", "execute", "alumni_local", "--local", "--config", "wrangler.jsonc", "--file", file];
  if (process.env.ALUMNI_TEST_STATE) args.push("--persist-to", process.env.ALUMNI_TEST_STATE);
  // Suppress SQL and errors that may contain appointment details.
  execFileSync("node_modules/.bin/wrangler", args, { stdio: "pipe" });
  console.log("Private bootstrap completed. Sign in as the appointed primary administrator to inspect the audit.");
} catch (error) {
  console.error("Bootstrap rejected. Provide a private JSON file with primaryUserId, operator, reason and trustedAlumni. Check verified accounts, houses, migrations and whether bootstrap already ran. Local D1 only.");
  process.exitCode = 1;
} finally {
  if (directory) await rm(directory, { recursive: true, force: true });
}
