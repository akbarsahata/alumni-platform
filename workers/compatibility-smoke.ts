import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { authSchema, compatProbe } from "../app/auth/schema";

interface SmokeEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}

export default {
  async fetch(request: Request, env: SmokeEnv) {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      const database = drizzle(env.DB, { schema: { compatProbe } });
      const [probe] = await database.select().from(compatProbe).where(eq(compatProbe.id, 1));
      return Response.json({
        ok: probe?.result === "d1-query-ok",
        query: probe?.result,
      });
    }

    if (url.pathname.startsWith("/api/auth/")) {
      const database = drizzle(env.DB, { schema: authSchema });
      const auth = betterAuth({
        baseURL: env.BETTER_AUTH_URL,
        secret: env.BETTER_AUTH_SECRET,
        database: drizzleAdapter(database, {
          provider: "sqlite",
          schema: authSchema,
          transaction: false,
        }),
        emailAndPassword: { enabled: true },
      });
      return auth.handler(request);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<SmokeEnv>;
