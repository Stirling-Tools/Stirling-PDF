import type { TFunction } from "i18next";
import type { SavedSignature } from "@app/types/signature";
import type { SignatureTileAction } from "@app/components/tools/sign/wallet/SignatureTile";

interface PlaceActionContext {
  t: TFunction;
  isPlacing: boolean;
  onPlace: () => void;
  onStop: () => void;
}

export interface SavedActionContext extends PlaceActionContext {
  isDefault: boolean;
  isAdmin: boolean;
  canShare: boolean;
  onRename: () => void;
  onToggleDefault: () => void;
  onShare: () => void;
  onDelete: () => void;
}

export interface DraftActionContext extends PlaceActionContext {
  canSave: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

const isAction = (
  action: SignatureTileAction | false,
): action is SignatureTileAction => action !== false;

function placeAction({
  t,
  isPlacing,
  onPlace,
  onStop,
}: PlaceActionContext): SignatureTileAction {
  if (isPlacing) {
    return {
      id: "stop",
      label: t("sign.wallet.menu.stop", "Stop placing"),
      icon: "circle-pause",
      onSelect: onStop,
    };
  }
  return {
    id: "place",
    label: t("sign.wallet.menu.place", "Place on page"),
    icon: "locate-fixed",
    onSelect: onPlace,
  };
}

export function savedSignatureActions(
  signature: SavedSignature,
  ctx: SavedActionContext,
): SignatureTileAction[] {
  const { t } = ctx;
  const canEdit = signature.scope !== "shared" || ctx.isAdmin;
  const canShare = ctx.canShare && signature.scope === "personal";
  const actions: (SignatureTileAction | false)[] = [
    placeAction(ctx),
    canEdit && {
      id: "rename",
      label: t("sign.wallet.menu.rename", "Rename"),
      icon: "pencil",
      onSelect: ctx.onRename,
    },
    {
      id: "default",
      label: ctx.isDefault
        ? t("sign.wallet.menu.removeDefault", "Remove as default")
        : t("sign.wallet.menu.makeDefault", "Make default"),
      icon: "star",
      onSelect: ctx.onToggleDefault,
    },
    canShare && {
      id: "share",
      label: t("sign.wallet.menu.share", "Share with everyone"),
      icon: "users",
      onSelect: ctx.onShare,
    },
    canEdit && {
      id: "delete",
      label: t("sign.wallet.menu.delete", "Delete"),
      icon: "trash",
      danger: true,
      onSelect: ctx.onDelete,
    },
  ];
  return actions.filter(isAction);
}

export function draftSignatureActions(
  ctx: DraftActionContext,
): SignatureTileAction[] {
  const { t } = ctx;
  const actions: (SignatureTileAction | false)[] = [
    placeAction(ctx),
    ctx.canSave && {
      id: "save",
      label: t("sign.wallet.menu.save", "Save to my signatures"),
      icon: "save",
      onSelect: ctx.onSave,
    },
    {
      id: "discard",
      label: t("sign.wallet.menu.discard", "Discard"),
      icon: "trash",
      danger: true,
      onSelect: ctx.onDiscard,
    },
  ];
  return actions.filter(isAction);
}
