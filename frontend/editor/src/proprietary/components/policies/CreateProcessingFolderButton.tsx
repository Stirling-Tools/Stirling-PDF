import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { useProcessingFolderCreation } from "@app/hooks/useProcessingFolderCreation";
import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";

/** Both CTAs open the same creation flow; the wizard owns destination availability. */
export function CreateProcessingFolderButton() {
  const { t } = useTranslation();
  const creation = useProcessingFolderCreation();
  // Folder processing runs against the connected account; signed out there is nowhere
  // to run it, so the CTA shows disabled with a prompt to sign in rather than opening a
  // wizard that would dead-end.
  const signedIn = usePoliciesEnabled();
  const label = t("processingFolders.setup.title");
  return (
    <>
      <Tooltip
        label={t(
          "processingFolders.setup.signInRequired",
          "Sign in to set up folder processing",
        )}
        disabled={signedIn}
        withArrow
      >
        {/* Wrapper receives hover so the tooltip still fires while the button is disabled
            (a disabled button takes no pointer events). */}
        <span style={{ display: "inline-flex" }}>
          <Button
            variant="secondary"
            fat
            disabled={!signedIn}
            onClick={(event) => {
              event.stopPropagation();
              creation.open?.();
            }}
            leftSection={<Icon name="folder-plus" size="1rem" />}
          >
            {label}
          </Button>
        </span>
      </Tooltip>
      {creation.dialog}
    </>
  );
}
