// Drives a real tool from the UI, in the packaged app, end to end.
//
// This is the only test that covers the whole desktop chain in one go: the
// webview renders the workbench, a file lands in IndexedDB inside the packaged
// app, the tool posts to /api/v1/general/rotate-pdf on the *bundled* backend,
// and the result comes back into the review panel. Any link in that chain can
// break in the desktop build alone - the Playwright suites run against a dev
// server with stubbed APIs and would not notice.

import { fixture } from "../lib/app-binary.mjs";
import {
  dismissStartupModals,
  uploadFile,
  waitForAppMount,
} from "./helpers/ui.js";

describe("desktop UI runs a tool against the bundled backend", () => {
  it("uploads a PDF, rotates it, and surfaces a downloadable result", async () => {
    await waitForAppMount();
    await dismissStartupModals();

    await uploadFile(fixture("sample.pdf"));

    const rotateTool = await $('[data-tour="tool-button-rotate"]');
    await rotateTool.click();

    // Rotate needs no configuration beyond its default angle, so the run button
    // enabling is the signal that the tool accepted the uploaded file.
    const runButton = await $('[data-tour="run-button"]');
    await runButton.waitForEnabled({
      timeout: 30_000,
      timeoutMsg:
        "Rotate's run button never enabled - the uploaded file did not reach " +
        "the tool panel.",
    });
    await runButton.click();

    // The review panel only renders once the backend has returned a result, so
    // this failing means the request never completed: the bundled backend was
    // unreachable from the webview, or it errored.
    await $('[data-testid="review-panel-container"]').waitForExist({
      timeout: 120_000,
      timeoutMsg:
        "No review panel after running Rotate - the UI never got a result " +
        "back from the bundled backend.",
    });
    await expect($('[data-testid="download-result-button"]')).toExist();
  });
});
