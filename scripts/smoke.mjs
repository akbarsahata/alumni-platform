import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const appMarker = 'id="page-content"';

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export async function smokeCheck(origin, options = {}) {
  const url = new URL("/login", origin);
  if (url.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("Smoke checks require an https origin outside local development.");

  const attempts = positiveInteger(options.attempts, 12);
  const delayMs = positiveInteger(options.delayMs, 5000);
  const timeoutMs = positiveInteger(options.timeoutMs, 10000);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": "alumni-platform-deploy-smoke" },
      });
      const body = await response.text();
      const contentType = response.headers.get("content-type") ?? "";
      if (response.status !== 200) throw new Error(`returned HTTP ${response.status}`);
      if (!contentType.toLowerCase().includes("text/html"))
        throw new Error(`returned content-type ${contentType || "none"}`);
      if (!body.includes(appMarker)) throw new Error("did not return the application shell");
      if (options.expectNoindex) {
        const robots = response.headers.get("x-robots-tag") ?? "";
        if (!robots.toLowerCase().includes("noindex"))
          throw new Error("did not return X-Robots-Tag: noindex");
      }

      console.log(
        `[smoke] ${url} served the application${options.expectNoindex ? " with noindex" : ""}.`
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.log(`[smoke] ${url} not ready (attempt ${attempt}/${attempts}); retrying.`);
        await sleep(delayMs);
      }
    }
  }

  throw new Error(
    `Smoke check failed for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [origin, ...flags] = process.argv.slice(2);
  if (!origin || flags.some((flag) => flag !== "--expect-noindex")) {
    console.error("Usage: node scripts/smoke.mjs <origin> [--expect-noindex]");
    process.exitCode = 1;
  } else {
    await smokeCheck(origin, { expectNoindex: flags.includes("--expect-noindex") }).catch(
      (error) => {
        console.error(`[smoke] ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    );
  }
}
