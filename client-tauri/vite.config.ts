import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import topLevelAwait from "vite-plugin-top-level-await";
import dynamicImport from 'vite-plugin-dynamic-import'
import compileTime from "vite-plugin-compile-time"
import { fileURLToPath, URL } from 'node:url'


// https://vitejs.dev/config/
export default defineConfig(async () => ({
    plugins: [
        react(),
        topLevelAwait({
            // The export name of top-level await promise for each chunk module
            promiseExportName: "__tla",
            // The function to generate import names of top-level await promise in each chunk module
            promiseImportName: i => `__tla_${i}`
        }),
        compileTime(),
        dynamicImport(),
    ],
    resolve: {
        alias: {
          '#pdfcpu': fileURLToPath(new URL("../shared-operations/src/wasm/pdfcpu/pdfcpu-wrapper.client", import.meta.url))
        }
    },
    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
        port: 1420,
        strictPort: true,
    },
    // 3. to make use of `TAURI_DEBUG` and other env variables
    // https://tauri.app/v1/api/config#buildconfig.beforedevcommand
    envPrefix: ["VITE_"],
}));
