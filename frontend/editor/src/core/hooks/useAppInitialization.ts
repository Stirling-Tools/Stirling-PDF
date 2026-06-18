import { startEagerWasmCompilation } from "@app/services/wasmPrecompiler";

/**
 * App initialization hook
 * Core version: triggers eager WASM compilation
 *
 * This hook is called once when the app starts to allow different builds
 * to perform initialization tasks that require access to contexts like FileContext.
 */
export function useAppInitialization(): void {
  // Eagerly precompile PDFium WASM in the background
  startEagerWasmCompilation();
}
