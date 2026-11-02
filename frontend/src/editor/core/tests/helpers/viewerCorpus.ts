import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Downloads the ECI Altona visual corpus into the ignored test cache.
 *
 * ECI_DIR overrides the download with local copies. The 120 MB Altona 2.0
 * page is only fetched when `heavy` is set or VIEWER_CORPUS_HEAVY=1, so the
 * normal suite pays for the 1.2 corpus only.
 */
export interface ViewerCorpus {
  altonaVisual: string;
  altonaTechnical: string;
  altonaTechnical2: string | null;
}

interface EnsureViewerCorpusOptions {
  heavy?: boolean;
}

const CACHE_DIR = path.resolve(
  import.meta.dirname,
  "../../../../../.cache/viewer-corpus",
);
const ALTONA_VISUAL_URL = "https://eci.org/lib/exe/altona_visual_1v2a_x3.pdf";
const ALTONA_VISUAL_SHA256 =
  "6b73ff0186bbc19b8896eff545d4102216987bb34af62794fa0844b611031727";
const ALTONA_TECHNICAL_URL =
  "https://eci.org/lib/exe/altona_technical_1v2_x3.pdf";
const ALTONA_TECHNICAL_SHA256 =
  "06b980fa09cd45f35a1fc9a2b907911201e91c0fcc2ee5a67820f6bb7818e630";
const ALTONA_TECHNICAL_2_URL =
  "https://eci.org/lib/exe/eci_altona-test-suite-v2_technical2_x4.pdf";
const ALTONA_TECHNICAL_2_SHA256 =
  "57233105f699c6110bbeeeca769587ccfc8e543f1e58b791c812607bfefe294f";
const ALTONA_VISUAL_NAMES = [
  "altona_visual_1v2a_x3.pdf",
  "altona-visual-1v2a.pdf",
];
const ALTONA_TECHNICAL_NAMES = [
  "altona_technical_1v2_x3.pdf",
  "altona-technical-1v2.pdf",
];
const ALTONA_TECHNICAL_2_NAMES = [
  "altona2_technical_x4.pdf",
  "altona-technical-2.pdf",
];

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function download(
  url: string,
  destination: string,
  expectedSha256: string,
): Promise<void> {
  if (fs.existsSync(destination)) {
    const cached = await fs.promises.readFile(destination);
    if (sha256(cached) === expectedSha256) return;
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok) {
    throw new Error(
      `Viewer corpus download failed: ${url} returned ${response.status}. ` +
        "Set ECI_DIR to use local copies.",
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const actualSha256 = sha256(buffer);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `Viewer corpus checksum mismatch for ${url}: expected ${expectedSha256}, got ${actualSha256}.`,
    );
  }
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp`;
  await fs.promises.writeFile(temporary, buffer);
  await fs.promises.rename(temporary, destination);
}

function localFile(names: string[]): string | null {
  const directory = process.env.ECI_DIR;
  if (!directory) return null;
  for (const name of names) {
    const candidate = path.join(directory, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function ensureEci(
  name: string,
  localNames: string[],
  url: string,
  expectedSha256: string,
): Promise<string> {
  const local = localFile(localNames);
  if (local) return local;
  const destination = path.join(CACHE_DIR, "eci", name);
  await download(url, destination, expectedSha256);
  return destination;
}

export async function ensureViewerCorpus(
  options: EnsureViewerCorpusOptions = {},
): Promise<ViewerCorpus> {
  const [altonaVisual, altonaTechnical] = await Promise.all([
    ensureEci(
      "altona_visual_1v2a_x3.pdf",
      ALTONA_VISUAL_NAMES,
      ALTONA_VISUAL_URL,
      ALTONA_VISUAL_SHA256,
    ),
    ensureEci(
      "altona_technical_1v2_x3.pdf",
      ALTONA_TECHNICAL_NAMES,
      ALTONA_TECHNICAL_URL,
      ALTONA_TECHNICAL_SHA256,
    ),
  ]);
  const localHeavy = localFile(ALTONA_TECHNICAL_2_NAMES);
  const altonaTechnical2 =
    localHeavy ??
    (options.heavy || process.env.VIEWER_CORPUS_HEAVY === "1"
      ? await ensureEci(
          "altona2_technical_x4.pdf",
          ALTONA_TECHNICAL_2_NAMES,
          ALTONA_TECHNICAL_2_URL,
          ALTONA_TECHNICAL_2_SHA256,
        )
      : null);
  return {
    altonaVisual,
    altonaTechnical,
    altonaTechnical2,
  };
}
