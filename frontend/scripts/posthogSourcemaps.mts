import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

// Pinned and run through npx, not a dependency: the package downloads a ~120 MB
// binary on install, which every `npm ci` would pay for one upload job.
const POSTHOG_CLI = "@posthog/cli@0.18.12";

const CHUNK_ID_COMMENT = "\n//# chunkId=";

/**
 * True when the build environment holds the credentials posthog-cli reads
 * (`POSTHOG_CLI_API_KEY`, `POSTHOG_CLI_PROJECT_ID`, and optionally
 * `POSTHOG_CLI_HOST`, which defaults to US cloud).
 */
export function posthogSourcemapUploadConfigured(): boolean {
  return Boolean(
    process.env.POSTHOG_CLI_API_KEY && process.env.POSTHOG_CLI_PROJECT_ID,
  );
}

// Derived from the code so an unchanged chunk keeps its content hash, and with
// it its long-term cache entry, across builds.
function stableChunkId(code: string): string {
  const hex = createHash("sha256").update(code).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// The registration posthog-js reads to map a stack frame's file to its chunk
// id. Must match the format posthog-cli's own `sourcemap inject` writes.
function chunkIdSnippet(chunkId: string): string {
  return `;!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._posthogChunkIds=e._posthogChunkIds||{},e._posthogChunkIds[n]=${JSON.stringify(chunkId)})}catch(e){}}();`;
}

function uploadChunks(chunkPaths: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const cli = spawn(
      "npx",
      [
        "--yes",
        POSTHOG_CLI,
        "sourcemap",
        "upload",
        "--stdin",
        "--release-mode",
        "symbol-set",
        "--skip-on-conflict",
      ],
      {
        stdio: ["pipe", "inherit", "inherit"],
        shell: process.platform === "win32",
      },
    );
    cli.on("error", reject);
    cli.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`posthog-cli exited with code ${code}`)),
    );
    cli.stdin.end(`${chunkPaths.join("\n")}\n`);
  });
}

/**
 * Emits hidden source maps, uploads them to PostHog error tracking, then deletes
 * every `.map` from the output so no map is ever served.
 *
 * Only add this plugin when {@link posthogSourcemapUploadConfigured} is true. A
 * failed upload warns instead of failing the build: symbolication is diagnostic
 * and must not block a release. Worker bundles get no chunk id, so their frames
 * stay minified; their maps are deleted with the rest.
 */
export function posthogSourcemapPlugin(): Plugin {
  return {
    name: "posthog-sourcemaps",
    apply: "build",
    config: () => ({ build: { sourcemap: "hidden" } }),
    renderChunk: {
      order: "post",
      handler(code, chunk) {
        if (!chunk.fileName.endsWith(".js")) return null;
        const chunkId = stableChunkId(code);
        // Appended, not prepended: nothing before it moves, so the chunk's
        // existing map stays valid (map: null keeps it).
        return {
          code: `${code}\n${chunkIdSnippet(chunkId)}${CHUNK_ID_COMMENT}${chunkId}`,
          map: null,
        };
      },
    },
    writeBundle: {
      sequential: true,
      async handler(options, bundle) {
        const outDir = options.dir ?? path.dirname(options.file ?? "");
        const chunkPaths = Object.values(bundle)
          .filter(
            (output) =>
              output.type === "chunk" && output.code.includes(CHUNK_ID_COMMENT),
          )
          .map((output) => path.resolve(outDir, output.fileName));

        try {
          await uploadChunks(chunkPaths);
        } catch (error) {
          this.warn(`PostHog source map upload failed: ${String(error)}`);
        }

        await Promise.all(
          Object.keys(bundle)
            .filter((fileName) => fileName.endsWith(".map"))
            .map((fileName) =>
              fs.rm(path.resolve(outDir, fileName), { force: true }),
            ),
        );
      },
    },
  };
}
