/**
 * The shared Rust tools (tools-core/) as wasm. The backend runs the same code
 * natively, so a tool here produces what the server produces from the same
 * PDFium.
 *
 * The module has no PDFium of its own: its `pdfium` imports are EmbedPDF's
 * exports passed straight through, so it works on document handles from
 * pdfiumService. The two modules have separate memories, so the module asks
 * the `host` imports to copy pixels between them.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { getPdfiumModule } from "@app/services/pdfiumService";

/** Percentages from 0 to 200, where 100 leaves that property unchanged. */
export interface ColorAdjustments {
  contrast: number;
  brightness: number;
  saturation: number;
  red: number;
  green: number;
  blue: number;
}

export interface ToolsCore {
  /**
   * Appends an adjusted image of each page of `source` to the empty document
   * `target`. Both are pdfiumService handles the caller still owns. Throws with
   * the library's reason on failure.
   */
  adjustColors(
    source: number,
    target: number,
    adjustments: ColorAdjustments,
  ): void;
}

interface ToolsCoreExports {
  memory: WebAssembly.Memory;
  stirling_last_error(): number;
  stirling_adjust_colors(
    source: number,
    target: number,
    contrast: number,
    brightness: number,
    saturation: number,
    red: number,
    green: number,
    blue: number,
  ): number;
}

let compiled: Promise<WebAssembly.Module> | null = null;
const instances = new WeakMap<WrappedPdfiumModule, Promise<ToolsCore>>();

/** The tools bound to the current PDFium module, which a reset replaces. */
export async function getToolsCore(): Promise<ToolsCore> {
  const pdfium = await getPdfiumModule();
  let tools = instances.get(pdfium);
  if (!tools) {
    tools = compile().then((module) => instantiate(module, pdfium));
    instances.set(pdfium, tools);
    tools.catch(() => instances.delete(pdfium));
  }
  return tools;
}

function wasmUrl(): string {
  return new URL(
    `${import.meta.env.BASE_URL}wasm/stirling-tools.wasm`,
    window.location.href,
  ).href;
}

function compile(): Promise<WebAssembly.Module> {
  compiled ??= fetchModule().catch((error: unknown) => {
    compiled = null;
    throw error;
  });
  return compiled;
}

async function fetchModule(): Promise<WebAssembly.Module> {
  const response = await fetch(wasmUrl());
  try {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await WebAssembly.compile(await response.arrayBuffer());
  } catch (cause) {
    // The dev server answers a missing file with index.html, so a failed
    // compile is the usual sign of a build made without Rust.
    throw new Error(
      "The Rust tools are not built: run `task tools-core:build:wasm`",
      { cause },
    );
  }
}

async function instantiate(
  module: WebAssembly.Module,
  pdfium: WrappedPdfiumModule,
): Promise<ToolsCore> {
  const pdfiumExports = exportsOf(pdfium);
  const pdfiumMemory = pdfiumExports.memory;
  if (!(pdfiumMemory instanceof WebAssembly.Memory)) {
    throw new Error("EmbedPDF's PDFium does not export its memory");
  }
  let toolsMemory: WebAssembly.Memory | null = null;
  // Fresh views per call: either memory may have grown since the last one.
  const bytes = (memory: WebAssembly.Memory, address: number, length: number) =>
    new Uint8Array(memory.buffer, address >>> 0, length);
  const ours = (): WebAssembly.Memory => {
    if (!toolsMemory) throw new Error("Rust tools called before instantiation");
    return toolsMemory;
  };

  const instance = await WebAssembly.instantiate(module, {
    pdfium: pdfiumImports(module, pdfiumExports),
    host: {
      copy_from_pdfium: (source: number, target: number, length: number) =>
        bytes(ours(), target, length).set(bytes(pdfiumMemory, source, length)),
      copy_to_pdfium: (source: number, target: number, length: number) =>
        bytes(pdfiumMemory, target, length).set(bytes(ours(), source, length)),
    },
  });
  const tools = toolsExports(instance);
  toolsMemory = tools.memory;

  const lastError = (): string => {
    const start = tools.stirling_last_error() >>> 0;
    const memory = new Uint8Array(tools.memory.buffer);
    const end = memory.indexOf(0, start);
    return new TextDecoder().decode(memory.subarray(start, end));
  };

  return {
    adjustColors(source, target, adjustments) {
      const status = tools.stirling_adjust_colors(
        source,
        target,
        adjustments.contrast,
        adjustments.brightness,
        adjustments.saturation,
        adjustments.red,
        adjustments.green,
        adjustments.blue,
      );
      if (status !== 0) throw new Error(lastError());
    },
  };
}

function exportsOf(pdfium: WrappedPdfiumModule): Record<string, unknown> {
  // EmbedPDF types only malloc and free; the object holds every export.
  return pdfium.pdfium.wasmExports as unknown as Record<string, unknown>;
}

/** Every `pdfium` import the module declares, taken from EmbedPDF's exports. */
function pdfiumImports(
  module: WebAssembly.Module,
  pdfiumExports: Record<string, unknown>,
): WebAssembly.ModuleImports {
  const imports: WebAssembly.ModuleImports = {};
  for (const { module: namespace, name } of WebAssembly.Module.imports(
    module,
  )) {
    if (namespace !== "pdfium") continue;
    const fn = pdfiumExports[name];
    if (typeof fn !== "function") {
      throw new Error(
        `EmbedPDF's PDFium does not export ${name}, which the Rust tools need`,
      );
    }
    imports[name] = fn;
  }
  return imports;
}

function toolsExports(instance: WebAssembly.Instance): ToolsCoreExports {
  const { memory, stirling_last_error, stirling_adjust_colors } =
    instance.exports;
  if (
    !(memory instanceof WebAssembly.Memory) ||
    typeof stirling_last_error !== "function" ||
    typeof stirling_adjust_colors !== "function"
  ) {
    throw new Error("The Rust tools wasm is missing an expected export");
  }
  return instance.exports as unknown as ToolsCoreExports;
}
