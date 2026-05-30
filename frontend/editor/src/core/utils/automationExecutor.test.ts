import { describe, expect, test } from "vitest";
import { processMultiFileResponse } from "@app/utils/automationExecutor";

// Regression coverage for the automation-side mirror of the merge bug. Before
// the isZipResponse fix, processMultiFileResponse decided "single PDF vs ZIP"
// with an exact-equality Content-Type check, so any non-canonical response
// (charset suffix, octet-stream) misrouted the PDF into ZIP extraction and
// the user saw a bogus `automation_*.zip` instead of the processed file.
//
// These tests call processMultiFileResponse directly with each bug-trigger
// Content-Type and assert the returned File is a PDF, not a ZIP.

const PDF_BYTES = new Uint8Array([
  0x25,
  0x50,
  0x44,
  0x46,
  0x2d,
  0x31,
  0x2e,
  0x37, // "%PDF-1.7"
  0x0a,
  0x25,
  0xe2,
  0xe3,
  0xcf,
  0xd3,
  0x0a, // typical PDF header padding
]);

const inputFiles = [
  new File(["fake"], "input.pdf", { type: "application/pdf" }),
];

async function run(contentType: string) {
  return processMultiFileResponse(
    new Blob([PDF_BYTES]),
    { "content-type": contentType },
    inputFiles,
    "automated_",
    false,
  );
}

describe("processMultiFileResponse (automation execution)", () => {
  test('PDF body + "application/octet-stream" -> PDF, not bogus .zip', async () => {
    const result = await run("application/octet-stream");
    expect(result.length).toBe(1);
    expect(result[0].name).not.toMatch(/\.zip$/);
  });

  test('PDF body + "application/pdf;charset=UTF-8" -> PDF, not bogus .zip', async () => {
    const result = await run("application/pdf;charset=UTF-8");
    expect(result.length).toBe(1);
    expect(result[0].name).not.toMatch(/\.zip$/);
  });

  test('PDF body + "APPLICATION/PDF" (uppercased) -> PDF, not bogus .zip', async () => {
    const result = await run("APPLICATION/PDF");
    expect(result.length).toBe(1);
    expect(result[0].name).not.toMatch(/\.zip$/);
  });

  test('PDF body + canonical "application/pdf" -> PDF (sanity)', async () => {
    const result = await run("application/pdf");
    expect(result.length).toBe(1);
    expect(result[0].name).not.toMatch(/\.zip$/);
  });
});
