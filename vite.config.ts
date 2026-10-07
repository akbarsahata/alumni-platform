import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({
      ...(process.env.ALUMNI_TEST_CONFIG ? { configPath: process.env.ALUMNI_TEST_CONFIG } : {}),
      viteEnvironment: { name: "ssr" },
      ...(process.env.ALUMNI_TEST_STATE
        ? { persistState: { path: process.env.ALUMNI_TEST_STATE } }
        : {}),
    }),
    tailwindcss(),
    reactRouter(),
  ],
  optimizeDeps: {
    include: [
      "react-select",
      "sonner",
      "lucide-react",
      "radix-ui",
      "class-variance-authority",
      "clsx",
      "tailwind-merge",
    ],
  },
  resolve: {
    tsconfigPaths: true,
  },
});
