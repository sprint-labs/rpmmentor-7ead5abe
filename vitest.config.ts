import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      // `all` reports the untested files too — without it the percentages only
      // describe the modules that already have a test, which is the number we
      // are trying to improve.
      all: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        // Generated or vendored: shadcn primitives and the router tree are not
        // this project's logic and would drown the signal.
        "src/components/ui/**",
        "src/routeTree.gen.ts",
        "src/integrations/supabase/types.ts",
      ],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
    },
  },
});
