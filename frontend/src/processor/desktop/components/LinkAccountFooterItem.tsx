import { LinkAccountFooterItem as CloudLinkAccountFooterItem } from "@processor-cloud/components/LinkAccountFooterItem";
import { LinkAccountFooterItem as ServerLinkAccountFooterItem } from "@processor-proprietary/components/LinkAccountFooterItem";
import { editionComponent } from "@processor/edition";

/** Only a self-hosted server has an instance to link. */
export const LinkAccountFooterItem = editionComponent(
  CloudLinkAccountFooterItem,
  ServerLinkAccountFooterItem,
);
