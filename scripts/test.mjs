import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, open, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))
    );
  });
}

await mkdir("test-results", { recursive: true });
await mkdir(".wrangler", { recursive: true });
process.env.ALUMNI_TEST_STATE = resolve(await mkdtemp(".wrangler/integration-state-"));
process.env.ALUMNI_TEST_CONFIG = `${process.env.ALUMNI_TEST_STATE}/wrangler.jsonc`;
process.env.ALUMNI_TEST_VARS = `${process.env.ALUMNI_TEST_STATE}/.dev.vars`;
await writeFile(
  process.env.ALUMNI_TEST_CONFIG,
  (await readFile("wrangler.jsonc", "utf8"))
    .replace('"./workers/app.ts"', JSON.stringify(resolve("workers/app.ts")))
    .replace('"migrations"', JSON.stringify(resolve("migrations")))
);
await writeFile(
  process.env.ALUMNI_TEST_VARS,
  `BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}\nBETTER_AUTH_URL=http://127.0.0.1:5173\nLOCAL_MAIL_KEY=${randomBytes(32).toString("hex")}\n`,
  { mode: 0o600 }
);
await run("node_modules/.bin/wrangler", [
  "d1",
  "migrations",
  "apply",
  "alumni_local",
  "--local",
  "--persist-to",
  process.env.ALUMNI_TEST_STATE,
]);
await mkdir("test-results", { recursive: true });
const log = await open("test-results/worker.log", "w", 0o600);
const server = spawn(
  "node_modules/.bin/react-router",
  ["dev", "--host", "127.0.0.1", "--port", "5173", "--strictPort"],
  {
    detached: true,
    stdio: ["ignore", log.fd, log.fd],
  }
);
let serverExited = false;
server.once("exit", () => {
  serverExited = true;
});
function stop() {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
}
process.once("SIGINT", () => {
  stop();
  process.exit(130);
});
process.once("SIGTERM", () => {
  stop();
  process.exit(143);
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    await delay(250);
    if (serverExited)
      throw new Error(
        "Worker could not start. Stop any app on port 5173; see test-results/worker.log."
      );
    try {
      ready = (await fetch("http://127.0.0.1:5173/login")).ok;
    } catch {}
    if (ready) break;
  }
  if (!ready) throw new Error("Worker did not become ready; see test-results/worker.log.");
  // AllSettled keeps the Worker alive until both suites have finished, even if one fails.
  if (!process.argv[2]) {
    await run(process.execPath, ["--test", "tests/roles.test.mjs"]);
    await run(process.execPath, ["--test", "tests/membership.test.mjs"]);
  }
  const results = await Promise.allSettled(
    process.argv[2]
      ? [run(process.execPath, ["--test", process.argv[2]])]
      : [
          run(process.execPath, ["--test", "tests/auth.test.mjs"]),
          run("node_modules/.bin/playwright", ["test"]),
        ]
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  if (process.argv[3]) await run("node_modules/.bin/playwright", ["test", process.argv[3]]);
} finally {
  stop();
  await log.close();
  // Remove only the disposable state created by this run.
  await rm(process.env.ALUMNI_TEST_STATE, { recursive: true, force: true });
}
