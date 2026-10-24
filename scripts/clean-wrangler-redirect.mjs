import { rm } from "node:fs/promises";

// The Cloudflare Vite plugin writes a deploy redirect for Wrangler CLI use.
// Local commands must not inherit the last deployment's environment.
await rm(".wrangler/deploy/config.json", { force: true });
