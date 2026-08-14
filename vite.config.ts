// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { VitePWA } from "vite-plugin-pwa";

const isVercelBuild = process.env.VERCEL === "1";
const vercelMcpStub = fileURLToPath(new URL("./src/lib/vercel-mcp-stub.ts", import.meta.url));

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    resolve: isVercelBuild
      ? {
          alias: [
            { find: /^@lovable\.dev\/mcp-js$/, replacement: vercelMcpStub },
            { find: /^@lovable\.dev\/mcp-js\/stacks\/tanstack$/, replacement: vercelMcpStub },
          ],
        }
      : undefined,
    plugins: [
      ...(isVercelBuild ? [] : [mcpPlugin()]),
      VitePWA({
        outDir: isVercelBuild ? ".vercel/output/static" : ".output/public",
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        strategies: "generateSW",
        devOptions: { enabled: false },
        // Manifest is hand-authored at public/manifest.webmanifest — do not let the plugin overwrite it.
        manifest: false,
        workbox: {
          navigateFallback: "/",
          navigateFallbackDenylist: [
            /^\/login/,
            /^\/reset-password/,
            /^\/api\//,
            /^\/\.mcp/,
            /^\/\.well-known/,
            /^\/\.lovable/,
            /^\/~oauth/,
            /^\/sw\.js$/,
          ],
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}"],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: false,
          runtimeCaching: [
            {
              // Hashed build assets — safe to cache aggressively
              urlPattern: ({ url, sameOrigin }) =>
                sameOrigin && url.pathname.startsWith("/assets/"),
              handler: "CacheFirst",
              options: {
                cacheName: "app-assets",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              // Google Fonts CSS
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "StaleWhileRevalidate",
              options: { cacheName: "google-fonts-css" },
            },
            {
              // Google Fonts files
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-files",
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Supabase REST GETs for dashboard/roster/calendar/reports reads
              urlPattern: ({ url, request }) =>
                request.method === "GET" &&
                /\.supabase\.co$/.test(url.hostname) &&
                url.pathname.startsWith("/rest/v1/"),
              handler: "NetworkFirst",
              options: {
                cacheName: "supabase-reads",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // HTML navigations — network first with a short timeout, fallback to cached shell
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "app-shell",
                networkTimeoutSeconds: 3,
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
          ],
        },
      }),
    ],
  },
});
