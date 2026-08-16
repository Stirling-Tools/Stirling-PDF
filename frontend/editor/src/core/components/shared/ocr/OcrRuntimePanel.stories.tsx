import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import OcrRuntimePanel from "@app/components/shared/ocr/OcrRuntimePanel";

const STATUS_ENDPOINT = "/api/v1/ui-data/ocr/runtime";

const engine = {
  url: "https://example.invalid/tesseract.zip",
  size: 39282150,
  sha256: "a".repeat(64),
  version: "5.4.0",
  name: "Tesseract 5.4.0",
};

const languages = {
  eng: { url: "u", size: 4113088, sha256: "b".repeat(64), name: "English" },
  spa: { url: "u", size: 2294433, sha256: "c".repeat(64), name: "Espanol" },
  cat: { url: "u", size: 1146012, sha256: "d".repeat(64), name: "Catala" },
  fra: { url: "u", size: 1130365, sha256: "e".repeat(64), name: "Francais" },
};

/** Every story is one answer from the status endpoint; that call drives the whole panel. */
function status(body: Record<string, unknown>) {
  return {
    msw: { handlers: [http.get(STATUS_ENDPOINT, () => HttpResponse.json(body))] },
  };
}

const meta = {
  title: "Shared/Ocr/OcrRuntimePanel",
  component: OcrRuntimePanel,
  parameters: { layout: "padded" },
} satisfies Meta<typeof OcrRuntimePanel>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Nothing installed: the only thing offered is the engine, with the size that decides it. */
export const EngineNotInstalled: Story = {
  parameters: status({
    engineInstalled: false,
    platform: "windows-x86_64",
    installedLanguages: [],
    catalogueReachable: true,
    engineAvailable: engine,
    availableLanguages: languages,
  }),
};

/** Engine present, so the language list appears — each with its download size. */
export const ChoosingLanguages: Story = {
  parameters: status({
    engineInstalled: true,
    platform: "windows-x86_64",
    installedLanguages: ["eng", "spa"],
    catalogueReachable: true,
    engineAvailable: engine,
    availableLanguages: languages,
  }),
};

/**
 * No catalogue reachable: a notice, not an error screen. Whatever is already
 * installed still works, and saying so is the difference between "degraded" and
 * "broken".
 */
export const CatalogueUnreachable: Story = {
  parameters: status({
    engineInstalled: true,
    platform: "windows-x86_64",
    installedLanguages: ["eng"],
    catalogueReachable: false,
    catalogueError: "HTTP 503 fetching the catalogue",
  }),
};

/** No engine published for this platform — the honest answer where a distro ships its own. */
export const NoEngineForPlatform: Story = {
  parameters: status({
    engineInstalled: false,
    platform: "linux-aarch64",
    installedLanguages: [],
    catalogueReachable: true,
    engineAvailable: null,
    availableLanguages: {},
  }),
};
