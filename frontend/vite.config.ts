import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import { viteStaticCopy } from "vite-plugin-static-copy";

const VALID_MODES = [
  "core",
  "proprietary",
  "saas",
  "desktop",
  "prototypes",
] as const;
type BuildMode = (typeof VALID_MODES)[number];

const TSCONFIG_MAP: Record<BuildMode, string> = {
  core: "./tsconfig.core.vite.json",
  proprietary: "./tsconfig.proprietary.vite.json",
  saas: "./tsconfig.saas.vite.json",
  desktop: "./tsconfig.desktop.vite.json",
  prototypes: "./tsconfig.prototypes.vite.json",
};

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the
  // `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), "");

  // Resolve the effective build mode.
  // Explicit --mode flags take precedence; otherwise default to proprietary
  // unless DISABLE_ADDITIONAL_FEATURES=true, in which case default to core.
  const effectiveMode: BuildMode = (VALID_MODES as readonly string[]).includes(
    mode,
  )
    ? (mode as BuildMode)
    : process.env.DISABLE_ADDITIONAL_FEATURES === "true"
      ? "core"
      : "proprietary";

  const tsconfigProject = TSCONFIG_MAP[effectiveMode];

  return {
    plugins: [
      react(),
      tsconfigPaths({
        projects: [tsconfigProject],
      }),
      viteStaticCopy({
        targets: [
          {
            //provides static pdfium so embedpdf can run without cdn
            src: "node_modules/@embedpdf/pdfium/dist/pdfium.wasm",
            dest: "pdfium",
          },
          {
            // Copy jscanify vendor files to dist
            src: "public/vendor/jscanify/*",
            dest: "vendor/jscanify",
          },
        ],
      }),
    ],
    server: {
      host: true,
      // make sure this port matches the devUrl port in tauri.conf.json file
      port: 5173,
      // Tauri expects a fixed port, fail if that port is not available
      strictPort: true,
      watch: {
        // tell vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
      // Only use proxy in web mode - Tauri handles backend connections directly
      proxy:
        effectiveMode === "desktop"
          ? undefined
          : {
              "/api": {
                target: "http://localhost:8080",
                changeOrigin: true,
                secure: false,
                xfwd: true,
              },
              "/oauth2": {
                target: "http://localhost:8080",
                changeOrigin: true,
                secure: false,
                xfwd: true,
              },
              "/saml2": {
                target: "http://localhost:8080",
                changeOrigin: true,
                secure: false,
                xfwd: true,
              },
              "/login/oauth2": {
                target: "http://localhost:8080",
                changeOrigin: true,
                secure: false,
                xfwd: true,
              },
              "/login/saml2": {
                target: "http://localhost:8080",
                changeOrigin: true,
                secure: false,
                xfwd: true,
              },
              "/swagger-ui": {
                target: "http://localhost:8080",
                changeOrigin: true,
                secure: false,
                xfwd: true,
              },
              "/v1/api-docs": {
                target: "http://localhost:8080",
                changeOrigin: true,
                secure: false,
                xfwd: true,
              },
            },
    },
    base: env.RUN_SUBPATH ? `/${env.RUN_SUBPATH}` : "./",
  };
});
