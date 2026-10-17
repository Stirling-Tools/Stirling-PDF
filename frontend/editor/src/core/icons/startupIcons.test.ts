import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// oxlint-disable-next-line no-restricted-imports -- the generator is a build script, outside the @app alias
import { renderStartupIcons } from "../../../scripts/icons/startupIcons.mjs";

const GENERATED = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "startupIcons.generated.ts",
);

describe("generated startup icon markup", () => {
  it("matches the committed file, so a changed drawing was regenerated", () => {
    expect(readFileSync(GENERATED, "utf8")).toBe(renderStartupIcons());
  });
});
