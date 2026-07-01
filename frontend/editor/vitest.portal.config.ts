import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "node:path";

// Transitional standalone test config for the portal layer (editor/src/portal/)
// while it is not yet a lazy route in the editor app. Deleted once the portal
// tests fold into the editor vitest projects. Root defaults to this file's dir
// (editor/), so globs below are relative to editor/.
const portalDir = resolve(__dirname, "src/portal");

export default defineConfig({
  // Pin root to editor/ (this file's dir) so the globs below resolve there
  // rather than against the cwd (frontend/) when invoked via --config.
  root: __dirname,
  plugins: [
    react(),
    tsconfigPaths({
      // Broad project so @app/* resolves in every editor file the portal tests
      // pull in (proprietary/ui, core, ...), matching vite.portal.config.ts.
      projects: [resolve(__dirname, "tsconfig.portal.vite.json")],
    }),
  ],
  resolve: {
    alias: {
      "@portal": portalDir,
    },
  },
  server: {
    fs: {
      // The hoisted node_modules live at the frontend root, above editor/;
      // whitelist it so Vite can serve them under this config's root.
      allow: [resolve(__dirname, "..")],
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/portal/setupTests.ts"],
    css: false,
    include: ["src/portal/**/*.test.{ts,tsx}"],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  esbuild: {
    target: "es2020",
  },
});
