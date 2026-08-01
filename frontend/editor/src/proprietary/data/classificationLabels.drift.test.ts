import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { DEFAULT_CLASSIFICATION_LABELS } from "@app/data/classificationLabels";

// The classifier vocabulary is bundled in TWO places that must not drift:
//  - this frontend JSON (source of truth for sidebar categories + display names)
//  - a backend copy the classify tool sends to the AI engine per request
//    (app/proprietary/src/main/resources/classification/classification-labels.json).
// The backend sends label IDS the engine stores on the document and the frontend
// then displays, so a divergence means the classifier picks a label the UI can't
// render (or the UI advertises labels the classifier never uses). This guards it.

const REPO_ROOT = path.resolve(__dirname, "../../../../..");
const BACKEND_LABELS_FILE = path.join(
  REPO_ROOT,
  "app/proprietary/src/main/resources/classification/classification-labels.json",
);

interface Label {
  id: string;
  name: string;
  icon?: string | null;
}

function readBackendLabels(): Label[] {
  const raw = JSON.parse(fs.readFileSync(BACKEND_LABELS_FILE, "utf8")) as {
    labels: Label[];
  };
  return raw.labels;
}

describe("classification label vocabulary (frontend ↔ backend)", () => {
  const frontend = DEFAULT_CLASSIFICATION_LABELS;
  const backend = readBackendLabels();

  it("has the identical set of label ids on both sides", () => {
    const frontendIds = [...new Set(frontend.map((l) => l.id))].sort();
    const backendIds = [...new Set(backend.map((l) => l.id))].sort();
    expect(backendIds).toEqual(frontendIds);
  });

  it("has matching name and icon per id on both sides", () => {
    const backendById = new Map(backend.map((l) => [l.id, l]));
    for (const label of frontend) {
      const other = backendById.get(label.id);
      expect(other, `backend missing label "${label.id}"`).toBeDefined();
      expect({ name: other!.name, icon: other!.icon ?? null }).toEqual({
        name: label.name,
        icon: label.icon ?? null,
      });
    }
  });
});
