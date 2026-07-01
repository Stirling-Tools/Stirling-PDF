import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "node:path";

// Transitional standalone test config for the portal layer (editor/src/portal/)
// while it is not yet a lazy route in the editor app. Deleted once the portal
// tests fold into the editor vitest projects. Explicit resolve.alias for
// @portal and @shared so imports resolve even when they originate inside
// frontend/shared/ (outside the portal tsconfig scope), matching the
// resolve.alias block in vite.portal.config.ts. Root defaults to this file's
// dir (editor/), so globs below are relative to editor/.
const portalDir = resolve(__dirname, "src/portal");
const sharedDir = resolve(__dirname, "..", "shared");

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
      "@shared": sharedDir,
    },
  },
  server: {
    fs: {
      // Allow Vite to serve files from the shared/ sibling directory (one level
      // up from editor/), which the tests would otherwise be blocked from.
      allow: [resolve(__dirname, "..")],
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/portal/setupTests.ts"],
    css: false,
    include: ["src/portal/**/*.test.{ts,tsx}", "../shared/**/*.test.ts"],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  esbuild: {
    target: "es2020",
  },
});
