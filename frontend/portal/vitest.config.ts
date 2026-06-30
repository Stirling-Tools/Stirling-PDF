import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "node:path";

// Standalone test config for the portal app, mirroring the editor's setup.
// Explicit resolve.alias for @portal and @shared so imports resolve even when
// they originate inside frontend/shared/ (outside the portal tsconfig scope),
// matching the resolve.alias block in the portal's vite.config.ts.
const portalDir = resolve(__dirname, "src");
const sharedDir = resolve(__dirname, "..", "shared");

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      projects: [resolve(__dirname, "tsconfig.json")],
    }),
  ],
  resolve: {
    alias: {
      "@portal": portalDir,
      "@shared": sharedDir,
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  esbuild: {
    target: "es2020",
  },
});
