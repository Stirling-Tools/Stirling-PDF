import samplePdf from "@editor/tests/test-fixtures/sample.pdf?url";
import multiPagePdf from "@editor/tests/test-fixtures/multi-page-sample.pdf?url";
import comparePdfA from "@editor/tests/test-fixtures/compare_sample_a.pdf?url";
import comparePdfB from "@editor/tests/test-fixtures/compare_sample_b.pdf?url";
import formFieldsPdf from "@editor/tests/test-fixtures/form-fields-sample.pdf?url";
import signedPdf from "@editor/tests/test-fixtures/signed-sample.pdf?url";
import encryptedPdf from "@editor/tests/test-fixtures/encrypted.pdf?url";
import encryptedRestrictedPdf from "@editor/tests/test-fixtures/encrypted-restricted.pdf?url";
import corruptedPdf from "@editor/tests/test-fixtures/corrupted.pdf?url";
import scannedPdf from "@editor/tests/test-fixtures/scanned-no-ocr.pdf?url";
import scannedEncryptedPdf from "@editor/tests/test-fixtures/scanned-no-ocr-encrypted.pdf?url";
import samplePng from "@editor/tests/test-fixtures/sample.png?url";
import sampleJpg from "@editor/tests/test-fixtures/sample.jpg?url";
import sampleDocx from "@editor/tests/test-fixtures/sample.docx?url";
import sampleHtml from "@editor/tests/test-fixtures/sample.html?url";
import sampleSvg from "@editor/tests/test-fixtures/sample.svg?url";
import sampleMd from "@editor/tests/test-fixtures/sample.md?url";
import sampleEml from "@editor/tests/test-fixtures/sample.eml?url";
import sampleCbz from "@editor/tests/test-fixtures/sample.cbz?url";
import sampleEpub from "@editor/tests/test-fixtures/sample.epub?url";
import validP12 from "@editor/tests/test-fixtures/certs/valid-test.p12?url";
import validJks from "@editor/tests/test-fixtures/certs/valid-test.jks?url";
import validKeyPem from "@editor/tests/test-fixtures/certs/valid-test-key.pem.txt?url";
import validCertPem from "@editor/tests/test-fixtures/certs/valid-test-cert.pem.txt?url";

/**
 * Real files the tool-panel stories load, so a panel reads them exactly as it
 * reads an upload. Names are the file names the panel shows.
 */
export const FIXTURES = {
  "sample.pdf": { url: samplePdf, type: "application/pdf" },
  "multi-page-sample.pdf": { url: multiPagePdf, type: "application/pdf" },
  "compare_sample_a.pdf": { url: comparePdfA, type: "application/pdf" },
  "compare_sample_b.pdf": { url: comparePdfB, type: "application/pdf" },
  "form-fields-sample.pdf": { url: formFieldsPdf, type: "application/pdf" },
  "signed-sample.pdf": { url: signedPdf, type: "application/pdf" },
  "encrypted.pdf": { url: encryptedPdf, type: "application/pdf" },
  "encrypted-restricted.pdf": {
    url: encryptedRestrictedPdf,
    type: "application/pdf",
  },
  "corrupted.pdf": { url: corruptedPdf, type: "application/pdf" },
  "scanned-no-ocr.pdf": { url: scannedPdf, type: "application/pdf" },
  "scanned-no-ocr-encrypted.pdf": {
    url: scannedEncryptedPdf,
    type: "application/pdf",
  },
  "sample.png": { url: samplePng, type: "image/png" },
  "sample.jpg": { url: sampleJpg, type: "image/jpeg" },
  "sample.docx": {
    url: sampleDocx,
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  "sample.html": { url: sampleHtml, type: "text/html" },
  "sample.svg": { url: sampleSvg, type: "image/svg+xml" },
  "sample.md": { url: sampleMd, type: "text/markdown" },
  "sample.eml": { url: sampleEml, type: "message/rfc822" },
  "sample.cbz": { url: sampleCbz, type: "application/vnd.comicbook+zip" },
  "sample.epub": { url: sampleEpub, type: "application/epub+zip" },
  "valid-test.p12": { url: validP12, type: "application/x-pkcs12" },
  "valid-test.jks": { url: validJks, type: "application/octet-stream" },
  "valid-test-key.pem": { url: validKeyPem, type: "application/x-pem-file" },
  "valid-test-cert.pem": { url: validCertPem, type: "application/x-pem-file" },
} as const;

export type FixtureName = keyof typeof FIXTURES;

/** The password to open each encrypted fixture. */
export const FIXTURE_PASSWORDS = {
  "encrypted.pdf": "testpass123",
  "encrypted-restricted.pdf": "open-pass",
  "scanned-no-ocr-encrypted.pdf": "scan-password",
} as const satisfies Partial<Record<FixtureName, string>>;

/**
 * Permissions (owner) passwords that differ from the opening password, so
 * opening the fixture does not grant the owner's rights.
 */
export const FIXTURE_OWNER_PASSWORDS = {
  "encrypted-restricted.pdf": "owner-pass",
} as const satisfies Partial<Record<EncryptedFixtureName, string>>;

export type EncryptedFixtureName = keyof typeof FIXTURE_PASSWORDS;

export async function loadFixture(name: FixtureName): Promise<File> {
  const { url, type } = FIXTURES[name];
  const response = await fetch(url);
  return new File([await response.blob()], name, { type });
}
