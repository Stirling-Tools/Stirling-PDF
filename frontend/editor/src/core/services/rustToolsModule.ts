/**
 * A tools-core wasm module (the shared Rust in tools-core/) bound to the
 * editor's PDFium. The backend loads the same code natively, so a tool here
 * produces what the server produces from the same PDFium.
 *
 * A module has no PDFium of its own: its `pdfium` imports are EmbedPDF's
 * exports passed straight through, so it works on pdfiumService's document
 * handles. The two have separate memories, so the module's `host` imports copy
 * bytes between them and allocate the buffers PDFium reads and writes.
 *
 * Every module follows the convention its Rust side (`stirling_abi`) defines:
 * a call returns 0, leaving any result as JSON, or fails, leaving a message.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { getPdfiumModule } from "@app/services/pdfiumService";

export interface RustToolsModule {
  /**
   * Calls the export `name` and returns its result JSON, or an empty string
   * from a call that sets none. Throws with the module's message on failure.
   */
  call(name: string, ...args: number[]): string;
  /**
   * Copies `bytes` into the module's memory, runs `use` with their address,
   * copies them back into `bytes` (a call may change them) and frees them.
   */
  withBytes<T>(
    bytes: Uint8Array | Uint8ClampedArray,
    use: (pointer: number) => T,
  ): T;
}

type ExportedFunction = (...args: number[]) => number;

const compiled = new Map<string, Promise<WebAssembly.Module>>();
const instances = new WeakMap<
  WrappedPdfiumModule,
  Map<string, Promise<RustToolsModule>>
>();

/** The module at `url`, bound to the current PDFium module, which a reset replaces. */
export async function loadRustToolsModule(
  url: string,
): Promise<RustToolsModule> {
  const pdfium = await getPdfiumModule();
  let forPdfium = instances.get(pdfium);
  if (!forPdfium) {
    forPdfium = new Map();
    instances.set(pdfium, forPdfium);
  }
  let loading = forPdfium.get(url);
  if (!loading) {
    loading = compile(url).then((module) => instantiate(module, pdfium));
    forPdfium.set(url, loading);
    loading.catch(() => forPdfium.delete(url));
  }
  return loading;
}

function compile(url: string): Promise<WebAssembly.Module> {
  let module = compiled.get(url);
  if (!module) {
    module = fetchModule(url);
    compiled.set(url, module);
    module.catch(() => compiled.delete(url));
  }
  return module;
}

async function fetchModule(url: string): Promise<WebAssembly.Module> {
  const response = await fetch(url);
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
): Promise<RustToolsModule> {
  const pdfiumExports = exportsOf(pdfium);
  const pdfiumMemory = pdfiumExports.memory;
  const pdfiumMalloc = pdfiumExports.malloc;
  const pdfiumFree = pdfiumExports.free;
  if (
    !(pdfiumMemory instanceof WebAssembly.Memory) ||
    typeof pdfiumMalloc !== "function" ||
    typeof pdfiumFree !== "function"
  ) {
    throw new Error(
      "EmbedPDF's PDFium does not export its memory and allocator",
    );
  }
  let ownMemory: WebAssembly.Memory | null = null;
  const own = (): WebAssembly.Memory => {
    if (!ownMemory) throw new Error("Rust tools called before instantiation");
    return ownMemory;
  };

  const instance = await WebAssembly.instantiate(module, {
    pdfium: pdfiumImports(module, pdfiumExports),
    host: {
      copy_from_pdfium: (source: number, target: number, length: number) =>
        bytes(own(), target, length).set(bytes(pdfiumMemory, source, length)),
      copy_to_pdfium: (source: number, target: number, length: number) =>
        bytes(pdfiumMemory, target, length).set(bytes(own(), source, length)),
      pdfium_alloc: pdfiumMalloc,
      pdfium_free: pdfiumFree,
    },
  });
  const memory = instance.exports.memory;
  if (!(memory instanceof WebAssembly.Memory)) {
    throw new Error("The Rust tools module does not export its memory");
  }
  ownMemory = memory;
  const fn = (name: string): ExportedFunction => {
    const exported = instance.exports[name];
    if (typeof exported !== "function") {
      throw new Error(`The Rust tools module does not export ${name}`);
    }
    return exported as ExportedFunction;
  };
  const text = (name: string): string => {
    const all = new Uint8Array(memory.buffer);
    const start = fn(name)() >>> 0;
    return new TextDecoder().decode(all.subarray(start, all.indexOf(0, start)));
  };

  return {
    call(name, ...args) {
      if (fn(name)(...args) !== 0) throw new Error(text("stirling_last_error"));
      return text("stirling_last_result");
    },
    withBytes(data, use) {
      const pointer = fn("stirling_alloc")(data.length);
      try {
        bytes(memory, pointer, data.length).set(data);
        const result = use(pointer);
        data.set(bytes(memory, pointer, data.length));
        return result;
      } finally {
        fn("stirling_free")(pointer, data.length);
      }
    },
  };
}

/** A fresh view each time: either memory may have grown since the last one. */
function bytes(memory: WebAssembly.Memory, address: number, length: number) {
  return new Uint8Array(memory.buffer, address >>> 0, length);
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
    const exported = pdfiumExports[name];
    if (typeof exported !== "function") {
      throw new Error(
        `EmbedPDF's PDFium does not export ${name}, which the Rust tools need`,
      );
    }
    imports[name] = exported;
  }
  return imports;
}
