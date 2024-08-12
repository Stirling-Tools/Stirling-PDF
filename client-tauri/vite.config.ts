import { defineConfig } from "vite";
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import react from "@vitejs/plugin-react";
import topLevelAwait from "vite-plugin-top-level-await";
import dynamicImport from 'vite-plugin-dynamic-import';
import compileTime from "vite-plugin-compile-time";
import { fileURLToPath, URL } from 'node:url';


// https://vitejs.dev/config/
export default defineConfig(async () => ({
    plugins: [
        // Thanks: https://stackoverflow.com/questions/74417822/how-can-i-use-buffer-process-in-vite-app
        nodePolyfills({
            include: [],

            globals: {
                Buffer: true, // can also be 'build', 'dev', or false
                global: false,
                process: true,
            },
            // Whether to polyfill `node:` protocol imports.
            protocolImports: false,
        }),
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
    base: '/', // relative paths sadly don't work with react router dom sub-dirs for some reason...
}));
