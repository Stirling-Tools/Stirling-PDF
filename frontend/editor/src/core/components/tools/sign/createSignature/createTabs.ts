import type { TFunction } from "i18next";
import type { IconName } from "@app/ui/Icon";
import type { CreateTab } from "@app/components/tools/sign/createSignature/types";

export const CREATE_TAB_ICONS: Record<CreateTab, IconName> = {
  draw: "signature",
  type: "type",
  upload: "upload",
  phone: "qr-code",
};

export function createTabs(showPhone: boolean): CreateTab[] {
  return showPhone
    ? ["draw", "type", "upload", "phone"]
    : ["draw", "type", "upload"];
}

export function createTabLabel(t: TFunction, tab: CreateTab): string {
  const labels: Record<CreateTab, string> = {
    draw: t("sign.wallet.tabs.draw", "Draw"),
    type: t("sign.wallet.tabs.type", "Type"),
    upload: t("sign.wallet.tabs.upload", "Upload"),
    phone: t("sign.wallet.tabs.phone", "Phone"),
  };
  return labels[tab];
}

export function defaultSignatureName(t: TFunction, tab: CreateTab): string {
  const names: Record<CreateTab, string> = {
    draw: t("sign.wallet.defaultName.draw", "My signature"),
    type: t("sign.wallet.defaultName.type", "Typed signature"),
    upload: t("sign.wallet.defaultName.upload", "Uploaded signature"),
    phone: t("sign.wallet.defaultName.phone", "Phone signature"),
  };
  return names[tab];
}
