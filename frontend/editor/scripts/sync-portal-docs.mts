/**
 * Sync the portal Developer Docs from the Stirling docs repo.
 *
 * Fetches the docs repo tarball, extracts `docs/**` in-process (no external tar
 * binary, no per-file GitHub rate limits), shapes it with the pure transforms in
 * src/portal/docs/manifest/transform.ts, and writes the committed manifest that
 * the portal docs view renders. Re-run with `npm run docs:sync`.
 *
 * Env: DOCS_REPO, DOCS_REF, DOCS_ROOT override the defaults below.
 */
import { gunzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// tsx/node16 can't resolve the @portal alias here, so import by relative .ts path.
// eslint-disable-next-line no-restricted-imports
import {
  buildManifest,
  type CategoryMap,
  type RawDoc,
} from "../src/portal/docs/manifest/transform.ts";

const REPO = process.env.DOCS_REPO ?? "Stirling-Tools/Stirling-Tools.github.io";
const REF = process.env.DOCS_REF ?? "main";
const ROOT = process.env.DOCS_ROOT ?? "docs";
const SITE = "https://docs.stirlingpdf.com";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../src/portal/generated/docsManifest.json");

/* ── Minimal tar reader (ustar + pax/GNU long names) ─────────────────────── */

interface TarEntry {
  name: string;
  type: string;
  data: Buffer;
}

function readTar(buf: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let longName: string | null = null;
  let paxPath: string | null = null;

  const str = (start: number, len: number) => {
    const slice = buf.subarray(start, start + len);
    const end = slice.indexOf(0);
    return slice.toString("utf8", 0, end === -1 ? len : end);
  };

  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    // Two consecutive zero blocks mark the end of the archive.
    if (header.every((b) => b === 0)) break;

    const name = str(offset, 100);
    const prefix = str(offset + 345, 155);
    const sizeStr = str(offset + 124, 12).trim();
    const size = parseInt(sizeStr, 8) || 0;
    const type = String.fromCharCode(header[156]);
    const dataStart = offset + 512;
    const data = buf.subarray(dataStart, dataStart + size);

    let fullName = prefix ? `${prefix}/${name}` : name;
    if (longName) {
      fullName = longName;
      longName = null;
    }
    if (paxPath) {
      fullName = paxPath;
      paxPath = null;
    }

    if (type === "L") {
      // GNU long name: the payload is the real name of the next entry.
      longName = data.toString("utf8").replace(/\0+$/, "");
    } else if (type === "x") {
      // pax extended header: pull a `path=` record for the next entry.
      const record = /(?:^|\n)\d+ path=([^\n]+)\n/.exec(data.toString("utf8"));
      if (record) paxPath = record[1];
    } else if (type === "0" || type === "\0" || type === "") {
      entries.push({ name: fullName, type, data: Buffer.from(data) });
    }

    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

/* ── Fetch + shape ───────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const url = `https://api.github.com/repos/${REPO}/tarball/${REF}`;
  console.log(`Fetching ${REPO}@${REF} …`);
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "stirling-portal-docs-sync",
      ...(process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {}),
    },
  });
  if (!res.ok) {
    throw new Error(
      `GitHub tarball fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  const gz = Buffer.from(await res.arrayBuffer());
  const entries = readTar(gunzipSync(gz));

  // Strip the "<repo>-<sha>/" wrapper dir and keep only files under docs root.
  const prefix = `${ROOT}/`;
  const rawDocs: RawDoc[] = [];
  const categories: CategoryMap = {};
  for (const entry of entries) {
    const rel = entry.name.replace(/^[^/]+\//, "");
    if (!rel.startsWith(prefix)) continue;
    const inner = rel.slice(prefix.length);
    if (!inner) continue;
    if (inner.endsWith("/_category_.json")) {
      const dir = inner.slice(0, -"/_category_.json".length);
      try {
        categories[dir] = JSON.parse(entry.data.toString("utf8"));
      } catch {
        console.warn(`  skipping unparseable _category_.json in ${dir}`);
      }
    } else if (/\.mdx?$/i.test(inner)) {
      rawDocs.push({ relPath: inner, content: entry.data.toString("utf8") });
    }
  }

  if (rawDocs.length === 0) {
    throw new Error(`No markdown found under ${ROOT}/ — wrong repo/ref/root?`);
  }

  const manifest = buildManifest(rawDocs, categories, {
    repo: REPO,
    ref: REF,
    root: ROOT,
    siteBaseUrl: SITE,
  });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const items = manifest.nav.reduce((n, s) => n + s.items.length, 0);
  console.log(
    `Wrote ${manifest.nav.length} sections, ${items} docs → ${OUT.replace(/.*[/\\]frontend[/\\]/, "frontend/")}`,
  );
  for (const s of manifest.nav) {
    console.log(`  ${s.icon} ${s.label} (${s.items.length})`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
