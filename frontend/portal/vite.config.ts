import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";

// Portal app — sibling to frontend/editor/. Standalone vite config so the
// editor's config stays editor-only.
//
// Layout:
//   frontend/portal/         <-- this config's root
//     index.html
//     main.tsx
//     src/
//     public/
//     tsconfig.json
//   frontend/shared/         <-- imported via @shared/*
//   frontend/node_modules/   <-- hoisted workspace deps
//
// The build emits to frontend/dist-portal/ (parallel to the editor's dist/).

export default defineConfig(async ({ mode }) => {
  // Load .env files relative to this config, regardless of where invoked from.
  const env = loadEnv(mode, import.meta.dirname, "");

  // Backend proxy so the portal shares the editor's origin for auth: with mocks
  // off, /api/v1/auth/* (and OAuth/SAML redirects) reach the Spring backend and
  // the same stirling_jwt token works across both apps. Mirrors the editor's
  // proxy; override the target via BACKEND_URL.
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8080";
  const backendProxy = {
    target: backendUrl,
    changeOrigin: true,
    secure: false,
    xfwd: true,
  };
  const backendProxyConfig = {
    "/api": backendProxy,
    "/oauth2": backendProxy,
    "/saml2": backendProxy,
  };

  return {
    plugins: [
      react(),
      tsconfigPaths({
        projects: [resolve(import.meta.dirname, "tsconfig.json")],
      }),
    ],
    // Explicit aliases — tsconfigPaths only resolves imports inside files
    // covered by portal/tsconfig.json's `include`. shared/components/index.ts
    // re-exports via `@shared/*` from inside shared/ itself, so we need
    // resolve.alias for vite to handle those too.
    resolve: {
      alias: {
        "@portal": resolve(import.meta.dirname, "src"),
        "@shared": resolve(import.meta.dirname, "..", "shared"),
      },
    },
    // The portal's @shared/* alias resolves to frontend/shared/, one level up
    // from this config's root. Vite refuses to serve files outside its root
    // by default; whitelisting the workspace root opens up shared/ and the
    // hoisted node_modules.
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      fs: {
        allow: [resolve(import.meta.dirname, "..")],
      },
      proxy: backendProxyConfig,
    },
    preview: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: backendProxyConfig,
    },
    build: {
      outDir: "../dist-portal",
      emptyOutDir: true,
    },
    base: env.RUN_SUBPATH ? `/${env.RUN_SUBPATH}` : "./",
  };
});
