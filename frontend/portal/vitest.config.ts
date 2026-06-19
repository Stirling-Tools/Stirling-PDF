import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";

// Standalone portal test config. Mirrors the @portal/* + @shared/* aliases from
// vite.config.ts so unit tests resolve the same imports the app and Storybook do.
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      projects: [resolve(import.meta.dirname, "tsconfig.json")],
    }),
  ],
  resolve: {
    alias: {
      "@portal": resolve(import.meta.dirname, "src"),
      "@shared": resolve(import.meta.dirname, "..", "shared"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [resolve(import.meta.dirname, "src/setupTests.ts")],
    root: import.meta.dirname,
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
