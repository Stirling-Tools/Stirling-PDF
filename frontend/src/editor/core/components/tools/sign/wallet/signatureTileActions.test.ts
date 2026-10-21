import { describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";
import type { SavedSignature } from "@app/types/signature";
import {
  draftSignatureActions,
  savedSignatureActions,
  type SavedActionContext,
} from "@app/components/tools/sign/wallet/signatureTileActions";

const t = ((_key: string, fallback: string) =>
  fallback) as unknown as TFunction;

const signature = (scope: SavedSignature["scope"]): SavedSignature => ({
  id: "sig",
  type: "canvas",
  dataUrl: "data:image/png;base64,",
  label: "Mine",
  scope,
  createdAt: 1,
  updatedAt: 1,
});

const context = (
  overrides: Partial<SavedActionContext> = {},
): SavedActionContext => ({
  t,
  isPlacing: false,
  isDefault: false,
  isAdmin: false,
  canShare: false,
  onPlace: vi.fn(),
  onStop: vi.fn(),
  onRename: vi.fn(),
  onToggleDefault: vi.fn(),
  onShare: vi.fn(),
  onDelete: vi.fn(),
  ...overrides,
});

const ids = (actions: { id: string }[]) => actions.map((action) => action.id);

describe("savedSignatureActions", () => {
  it("lets the owner manage a personal signature", () => {
    expect(
      ids(savedSignatureActions(signature("personal"), context())),
    ).toEqual(["place", "rename", "default", "delete"]);
  });

  it("keeps shared signatures read-only for non-admins", () => {
    expect(ids(savedSignatureActions(signature("shared"), context()))).toEqual([
      "place",
      "default",
    ]);
  });

  it("offers sharing only to admins on server storage, for personal signatures", () => {
    const admin = context({ isAdmin: true, canShare: true });
    expect(ids(savedSignatureActions(signature("personal"), admin))).toContain(
      "share",
    );
    expect(
      ids(savedSignatureActions(signature("localStorage"), admin)),
    ).not.toContain("share");
  });

  it("swaps place for stop while the signature is being placed", () => {
    const actions = savedSignatureActions(
      signature("personal"),
      context({ isPlacing: true }),
    );
    expect(actions[0].id).toBe("stop");
  });

  it("labels the default toggle by the current state", () => {
    const actions = savedSignatureActions(
      signature("personal"),
      context({ isDefault: true }),
    );
    expect(actions.find((action) => action.id === "default")?.label).toBe(
      "Remove as default",
    );
  });
});

describe("draftSignatureActions", () => {
  it("hides saving when the library is full", () => {
    const actions = draftSignatureActions({
      t,
      isPlacing: false,
      canSave: false,
      onPlace: vi.fn(),
      onStop: vi.fn(),
      onSave: vi.fn(),
      onDiscard: vi.fn(),
    });
    expect(ids(actions)).toEqual(["place", "discard"]);
  });
});
