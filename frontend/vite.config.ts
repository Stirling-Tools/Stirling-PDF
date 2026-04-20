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

  // Dev server port: default 5173 (matches tauri.conf.json devUrl).
  // Override via VITE_DEV_PORT env var; 0 lets the OS pick a free port.
  const devPort = process.env.VITE_DEV_PORT
    ? parseInt(process.env.VITE_DEV_PORT, 10)
    : 5173;
  // Backend proxy target: default localhost:8080. Override via BACKEND_URL env var
  // so the top-level dev launcher can wire a dynamically-assigned backend port.
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8080";
  const backendProxy = {
    target: backendUrl,
    changeOrigin: true,
    secure: false,
    xfwd: true,
  };

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
          {
            // pdfjs-dist CMap data for CJK / non-latin glyph mapping — required
            // when rendering PDFs inside workers where the default DOM fetch paths
            // aren't available.
            src: "node_modules/pdfjs-dist/cmaps/*",
            dest: "pdfjs/cmaps",
          },
          {
            // pdfjs-dist standard font data (Helvetica/Times/etc.) — needed so
            // workers can substitute non-embedded base 14 fonts without DOM access.
            src: "node_modules/pdfjs-dist/standard_fonts/*",
            dest: "pdfjs/standard_fonts",
          },
        ],
      }),
    ],
    server: {
      host: true,
      port: devPort,
      // Tauri expects a fixed port, and we generally want strict behaviour,
      // except when the caller requested an OS-assigned port (0).
      strictPort: devPort !== 0,
      watch: {
        // tell vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
      // Only use proxy in web mode - Tauri handles backend connections directly
      proxy:
        effectiveMode === "desktop"
          ? undefined
          : {
              "/api": backendProxy,
              "/oauth2": backendProxy,
              "/saml2": backendProxy,
              "/login/oauth2": backendProxy,
              "/login/saml2": backendProxy,
              "/swagger-ui": backendProxy,
              "/v1/api-docs": backendProxy,
            },
    },
    base: env.RUN_SUBPATH ? `/${env.RUN_SUBPATH}` : "./",
  };
});
