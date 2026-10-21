import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

function wrangler(args) {
  assert.ok(process.env.ALUMNI_TEST_STATE?.includes("integration-state-"));
  return execFileSync(
    "node_modules/.bin/wrangler",
    [
      "d1",
      "execute",
      "alumni_local",
      "--local",
      "--persist-to",
      process.env.ALUMNI_TEST_STATE,
      ...args,
    ],
    { stdio: "pipe", encoding: "utf8" }
  );
}

// Writes are guarded to the runner's disposable D1 state.
export function fixtureSql(sql) {
  return wrangler(["--command", sql]);
}

export function fixtureQuery(sql) {
  const output = wrangler(["--json", "--command", sql]);
  return JSON.parse(output)[0].results;
}
