/**
 * Seed a load of realistic-looking folders + files for visual testing.
 *
 * Wires straight into IndexedDB so we don't have to go through the
 * upload pipeline. Used by the dev-only "Seed sample data" button in
 * the file manager toolbar.
 */

import { folderStorage } from "@app/services/folderStorage";
import { fileStorage } from "@app/services/fileStorage";
import {
  FolderId,
  FolderRecord,
  FOLDER_COLOR_PALETTE,
  ROOT_FOLDER_ID,
  createFolderId,
} from "@app/types/folder";
import { FileId } from "@app/types/file";
import {
  StirlingFile,
  StirlingFileStub,
  createStirlingFile,
} from "@app/types/fileContext";
import { generateSampleThumbnail } from "@app/components/filesPage/generateSampleThumbnail";

const FOLDER_NAMES = [
  "Invoices",
  "Receipts",
  "Tax 2024",
  "Tax 2025",
  "Contracts",
  "Personal",
  "Holiday photos",
  "Project Cascade",
  "Project Atlas",
  "Bank statements",
  "Old contracts",
  "Onboarding",
  "Reference",
  "Templates",
];

const FILE_NAMES = [
  "Annual report.pdf",
  "Q1 invoice.pdf",
  "Q2 invoice.pdf",
  "Mortgage statement.pdf",
  "Insurance.pdf",
  "Tax return signed.pdf",
  "Lease agreement.pdf",
  "NDA Acme Co.pdf",
  "Passport scan.pdf",
  "Driver licence.pdf",
  "Receipt 2024-01-12.pdf",
  "Receipt 2024-03-04.pdf",
  "Receipt 2024-08-17.pdf",
  "Holiday itinerary.pdf",
  "Concert tickets.pdf",
  "Workshop slides.pptx",
  "Onboarding kit.docx",
  "Letter to council.docx",
  "P60.pdf",
  "P45.pdf",
  "Energy bill.pdf",
  "Phone bill.pdf",
  "Cooking notes.txt",
  "Reading list.txt",
  "Article draft.md",
  "Architecture sketch.png",
  "Kitchen tile sample.jpg",
  "Receipts batch.zip",
];

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fakePdfBytes(label: string): ArrayBuffer {
  // Minimal-but-valid-looking PDF header + filler so the size column has
  // realistic numbers. Not a real PDF — only used for visual stubs.
  const body = `%PDF-1.7\n% ${label}\n% ${"-".repeat(randomInt(20, 400))}\n%%EOF\n`;
  return new TextEncoder().encode(body).buffer;
}

export interface SeedResult {
  folders: number;
  files: number;
}

/**
 * Creates a tree of folders and files. Idempotent-ish: each invocation
 * adds a fresh batch so repeated clicks build up data rather than
 * duplicating exactly.
 */
export async function seedSampleData(options?: {
  folders?: number;
  files?: number;
}): Promise<SeedResult> {
  const folderCount = options?.folders ?? 6;
  const fileCount = options?.files ?? 22;

  // ─── folders ────────────────────────────────────────────────────────
  const created: { id: FolderId; depth: number }[] = [];
  for (let i = 0; i < folderCount; i += 1) {
    // Some folders nest inside earlier ones to create a real tree.
    const parent =
      i > 2 && Math.random() < 0.4
        ? created[randomInt(0, Math.max(0, i - 1))]?.id ?? ROOT_FOLDER_ID
        : ROOT_FOLDER_ID;

    // Seed DOES NOT go through folderSyncService — it's a dev-only fixture
    // for visual testing. Write the cache directly so it persists without
    // needing the storage backend deployed.
    const now = Date.now();
    const record: FolderRecord = {
      id: createFolderId(),
      name: randomItem(FOLDER_NAMES),
      parentFolderId: parent,
      color: randomItem(FOLDER_COLOR_PALETTE),
      createdAt: now,
      updatedAt: now,
    };
    await folderStorage.upsertFolder(record);
    const parentDepth =
      parent === null
        ? -1
        : created.find((f) => f.id === parent)?.depth ?? -1;
    created.push({ id: record.id, depth: parentDepth + 1 });
  }

  // ─── files ──────────────────────────────────────────────────────────
  for (let i = 0; i < fileCount; i += 1) {
    const targetFolder =
      Math.random() < 0.45 && created.length > 0
        ? randomItem(created).id
        : null;
    const buffer = fakePdfBytes(`sample-${i}`);
    const blob = new Blob([buffer], { type: "application/pdf" });
    const file = new File([blob], randomItem(FILE_NAMES), {
      type: "application/pdf",
      lastModified:
        Date.now() - randomInt(0, 60) * 24 * 60 * 60 * 1000,
    });
    const stirlingFile: StirlingFile = createStirlingFile(file);
    const stub: StirlingFileStub = {
      id: stirlingFile.fileId,
      name: stirlingFile.name,
      type: stirlingFile.type,
      size: stirlingFile.size,
      lastModified: stirlingFile.lastModified,
      createdAt: Date.now(),
      isLeaf: true,
      versionNumber: 1,
      originalFileId: stirlingFile.fileId,
      toolHistory: [],
      folderId: targetFolder,
      thumbnailUrl: generateSampleThumbnail(stirlingFile.name),
    };
    await fileStorage.storeStirlingFile(stirlingFile, stub);
    // moveFilesToFolder is the simplest way to set the folderId on the
    // stored record (storeStirlingFile reads folderId from the stub but
    // does so once at write-time; this re-uses the tested path).
    if (targetFolder) {
      await fileStorage.moveFilesToFolder(
        [stirlingFile.fileId as FileId],
        targetFolder,
      );
    }
  }

  return { folders: folderCount, files: fileCount };
}

/**
 * Wipe everything seeded — handy when iterating on visuals.
 */
export async function clearAllSampleData(): Promise<void> {
  await fileStorage.clearAll();
  await folderStorage.clearAll();
}
