import { LinkAccountFooterItem as CloudLinkAccountFooterItem } from "@portal-cloud/components/LinkAccountFooterItem";
import { LinkAccountFooterItem as ServerLinkAccountFooterItem } from "@portal-proprietary/components/LinkAccountFooterItem";
import { editionComponent } from "@portal/edition";

/** Only a self-hosted server has an instance to link. */
export const LinkAccountFooterItem = editionComponent(
  CloudLinkAccountFooterItem,
  ServerLinkAccountFooterItem,
);
