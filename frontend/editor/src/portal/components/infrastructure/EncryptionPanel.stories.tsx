import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, userEvent, within } from "storybook/test";
import { EncryptionPanel } from "@portal/components/infrastructure/EncryptionPanel";
import type {
  EncryptionKeyInfo,
  MigrationStatus,
  StorageEncryptionStatus,
} from "@portal/api/storageEncryption";

const BASE = "/api/v1/admin/storage-encryption";

const key = (
  over: Partial<EncryptionKeyInfo> & { keyId: string },
): EncryptionKeyInfo => ({
  scopeType: "TEAM",
  scopeId: 1,
  keyVersion: 1,
  masterKeyVersion: 2,
  status: "ACTIVE",
  createdAt: "2026-06-02T09:14:00",
  statusChangedAt: null,
  statusChangedBy: null,
  ...over,
});

const ACTIVE_STATUS: StorageEncryptionStatus = {
  writeEnabled: true,
  active: true,
  masterKeyFingerprint: "9f2c41a7be03d5e8",
  masterKeyVersion: 2,
  masterKeySource: "config",
  encryptedFiles: 4128,
  plaintextFiles: 0,
  keys: [
    key({ keyId: "1f0b6a11-0000-4000-8000-000000000001", scopeId: 1 }),
    key({ keyId: "1f0b6a11-0000-4000-8000-000000000002", scopeId: 4 }),
    key({
      keyId: "1f0b6a11-0000-4000-8000-000000000003",
      scopeType: "GLOBAL",
      scopeId: 0,
    }),
  ],
};

const IDLE_MIGRATION: MigrationStatus = {
  state: "IDLE",
  total: null,
  processed: null,
  skipped: null,
  failed: null,
  startedAt: null,
  finishedAt: null,
};

/** Handlers for a healthy, fully encrypted install. */
const handlers = (
  status: StorageEncryptionStatus,
  migration: MigrationStatus = IDLE_MIGRATION,
) => [
  http.get(`${BASE}/status`, () => HttpResponse.json(status)),
  http.get(`${BASE}/migrate/status`, () => HttpResponse.json(migration)),
  http.post(`${BASE}/keys/:keyId/disable`, ({ params }) =>
    HttpResponse.json(key({ keyId: String(params.keyId), status: "DISABLED" })),
  ),
  http.post(`${BASE}/keys/:keyId/enable`, ({ params }) =>
    HttpResponse.json(key({ keyId: String(params.keyId), status: "RETIRED" })),
  ),
];

const meta: Meta<typeof EncryptionPanel> = {
  title: "Portal/Infrastructure/EncryptionPanel",
  component: EncryptionPanel,
  parameters: {
    layout: "padded",
    msw: { handlers: handlers(ACTIVE_STATUS) },
  },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "72rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof EncryptionPanel>;

/** 01. Feature has never been switched on: nothing encrypted, no keys. */
export const EncryptionOff: Story = {
  globals: { tier: "enterprise" },
  parameters: {
    msw: {
      handlers: handlers({
        writeEnabled: false,
        active: false,
        masterKeyFingerprint: null,
        masterKeyVersion: null,
        encryptedFiles: 0,
        plaintextFiles: 1840,
        keys: [],
      }),
    },
  },
};

/** 02. The healthy state: encrypting, fully covered, keys listed. */
export const Active: Story = {
  globals: { tier: "enterprise" },
};

/** 03. Pro licence: encryption runs, audit does not. */
export const ProLicenceAuditNotice: Story = {
  globals: { tier: "pro" },
};

/** 04. The revoke dialog, which is where the surprising behaviour is explained. */
export const RevokeConfirmation: Story = {
  globals: { tier: "enterprise" },
  args: { clusterEnabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const buttons = await canvas.findAllByRole("button", { name: /revoke/i });
    await userEvent.click(buttons[0]);
    await expect(
      await within(document.body).findByText(/stop opening/i),
    ).toBeVisible();
  },
};

/** 05. A revoked key, showing who did it. */
export const KeyRevoked: Story = {
  globals: { tier: "enterprise" },
  parameters: {
    msw: {
      handlers: handlers({
        ...ACTIVE_STATUS,
        keys: [
          key({
            keyId: "1f0b6a11-0000-4000-8000-000000000001",
            scopeId: 1,
            status: "DISABLED",
            statusChangedAt: "2026-08-11T14:02:00",
            statusChangedBy: "connor@stirlingpdf.com",
          }),
          key({ keyId: "1f0b6a11-0000-4000-8000-000000000002", scopeId: 4 }),
        ],
      }),
    },
  },
};

/**
 * 06. Restored while the scope had minted a replacement, so the key comes back
 * RETIRED rather than ACTIVE. The case a reviewer is most likely to assume
 * works the other way.
 */
export const KeyRestoredAsRetired: Story = {
  globals: { tier: "enterprise" },
  parameters: {
    msw: {
      handlers: handlers({
        ...ACTIVE_STATUS,
        keys: [
          key({
            keyId: "1f0b6a11-0000-4000-8000-000000000001",
            scopeId: 1,
            keyVersion: 1,
            status: "RETIRED",
            statusChangedAt: "2026-08-11T14:09:00",
            statusChangedBy: "connor@stirlingpdf.com",
          }),
          key({
            keyId: "1f0b6a11-0000-4000-8000-000000000009",
            scopeId: 1,
            keyVersion: 2,
            status: "ACTIVE",
          }),
        ],
      }),
    },
  },
};

/** 07. Migration in flight over a real backlog. */
export const MigrationRunning: Story = {
  globals: { tier: "enterprise" },
  parameters: {
    msw: {
      handlers: handlers(
        { ...ACTIVE_STATUS, encryptedFiles: 3120, plaintextFiles: 1008 },
        {
          state: "RUNNING",
          total: 4128,
          processed: 3120,
          skipped: 4,
          failed: 0,
          startedAt: "2026-08-11T13:40:00Z",
          finishedAt: null,
        },
      ),
    },
  },
};

/** 08. The run stopped because encryption was switched off mid-flight. */
export const MigrationFailed: Story = {
  globals: { tier: "enterprise" },
  parameters: {
    msw: {
      handlers: handlers(
        { ...ACTIVE_STATUS, encryptedFiles: 812, plaintextFiles: 3316 },
        {
          state: "FAILED",
          total: 4128,
          processed: 812,
          skipped: 2,
          failed: 0,
          startedAt: "2026-08-11T13:40:00Z",
          finishedAt: "2026-08-11T13:44:00Z",
        },
      ),
    },
  },
};

/** 09. Mid-rotation: rows still on the old key, so the old key must be kept. */
export const RotationPending: Story = {
  globals: { tier: "enterprise" },
  parameters: {
    msw: {
      handlers: handlers({
        ...ACTIVE_STATUS,
        masterKeyVersion: 3,
        keys: [
          key({
            keyId: "1f0b6a11-0000-4000-8000-000000000001",
            scopeId: 1,
            masterKeyVersion: 2,
          }),
          key({
            keyId: "1f0b6a11-0000-4000-8000-000000000002",
            scopeId: 4,
            masterKeyVersion: 2,
          }),
          key({
            keyId: "1f0b6a11-0000-4000-8000-000000000003",
            scopeType: "GLOBAL",
            scopeId: 0,
            masterKeyVersion: 3,
          }),
        ],
      }),
    },
  },
};

/** 11. Storage switched off: the API refuses before touching the database. */
export const StorageDisabled: Story = {
  globals: { tier: "enterprise" },
  parameters: {
    msw: {
      handlers: [
        http.get(`${BASE}/status`, () =>
          HttpResponse.json({ detail: "Storage is disabled" }, { status: 403 }),
        ),
        http.get(`${BASE}/migrate/status`, () =>
          HttpResponse.json(IDLE_MIGRATION),
        ),
      ],
    },
  },
};

/** The key registry could not be read at all. */
export const RegistryUnavailable: Story = {
  globals: { tier: "enterprise" },
  parameters: {
    msw: {
      handlers: [
        http.get(`${BASE}/status`, () =>
          HttpResponse.json(
            { detail: "The storage encryption key registry could not be read" },
            { status: 503 },
          ),
        ),
        http.get(`${BASE}/migrate/status`, () =>
          HttpResponse.json(IDLE_MIGRATION),
        ),
      ],
    },
  },
};

/** The master key was auto-generated, so it may never have been backed up. */
export const GeneratedMasterKey: Story = {
  globals: { tier: "enterprise" },
  parameters: {
    msw: {
      handlers: handlers({ ...ACTIVE_STATUS, masterKeySource: "generated" }),
    },
  },
};
