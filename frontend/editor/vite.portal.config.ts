import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";

// Transitional standalone vite config for the portal while it lives in-tree as
// its own layer (editor/src/portal/) but is not yet a lazy route in the editor
// app. Deleted once the portal is dissolved into an in-app admin route.
//
// Layout:
//   frontend/editor/vite.portal.config.ts   <-- this config
//   frontend/editor/src/portal/             <-- root (index.html, main.tsx, public/, source)
//   frontend/node_modules/                   <-- hoisted workspace deps
//
// The build emits to frontend/dist-portal/ (parallel to the editor's dist/), so
// scripts/dev-origin-proxy.ts keeps serving it unchanged.
const PORTAL_ROOT = resolve(import.meta.dirname, "src/portal");
const FRONTEND_ROOT = resolve(import.meta.dirname, "..");

export default defineConfig(async ({ mode }) => {
  // Load .env files from the portal root, regardless of where invoked from.
  const env = loadEnv(mode, PORTAL_ROOT, "");

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
    root: PORTAL_ROOT,
    // Portal static assets (locales, MSW worker, favicon) live in a sibling of
    // editor/public/ rather than under src/. Transitional: these fold into the
    // editor's own public/ when the portal becomes an in-app route.
    publicDir: resolve(FRONTEND_ROOT, "editor/portal-public"),
    plugins: [
      react(),
      tsconfigPaths({
        // Broad project (include 'src') so @app/* is rewritten in every editor
        // file the portal build pulls in (proprietary/ui, core, ...), not just
        // the portal layer's own files.
        projects: [resolve(import.meta.dirname, "tsconfig.portal.vite.json")],
      }),
    ],
    // Explicit @portal alias as a belt-and-braces fallback alongside
    // tsconfigPaths (which handles @app/@portal for files in the tsconfig).
    resolve: {
      alias: {
        "@portal": PORTAL_ROOT,
      },
    },
    // The hoisted node_modules live at the frontend root, above this config's
    // root. Vite refuses to serve files outside its root by default;
    // whitelisting the frontend root opens them.
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      fs: {
        allow: [FRONTEND_ROOT],
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
      outDir: resolve(FRONTEND_ROOT, "dist-portal"),
      emptyOutDir: true,
    },
    base: env.RUN_SUBPATH ? `/${env.RUN_SUBPATH}` : "./",
  };
});
