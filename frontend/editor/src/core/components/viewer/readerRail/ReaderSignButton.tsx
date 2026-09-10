import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover, Text } from "@mantine/core";
import DrawIcon from "@mui/icons-material/Draw";

import { ActionIcon } from "@app/ui/ActionIcon";
import { Tooltip as AppTooltip } from "@app/components/shared/Tooltip";
import { Button } from "@app/ui/Button";
import { useSavedSignatures } from "@app/hooks/tools/sign/useSavedSignatures";
import { useSignature } from "@app/contexts/SignatureContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import type { SavedSignature } from "@app/types/signature";
import type { SignParameters } from "@app/hooks/tools/sign/useSignParameters";

/** The saved signature to reach for: the one most recently touched. */
function mostRecent(signatures: SavedSignature[]): SavedSignature | null {
  if (signatures.length === 0) return null;
  return signatures.reduce((latest, candidate) =>
    candidate.updatedAt > latest.updatedAt ? candidate : latest,
  );
}

/** The saved signature as the placement layer wants it. */
function toPlacementConfig(signature: SavedSignature): SignParameters {
  const base: SignParameters = {
    signatureType: signature.type,
    signatureData: signature.dataUrl,
  };
  if (signature.type !== "text") return base;
  return {
    ...base,
    signerName: signature.signerName,
    fontFamily: signature.fontFamily,
    fontSize: signature.fontSize,
    textColor: signature.textColor,
  };
}

/**
 * Signing while reading: one press arms your last signature for placement, so the
 * next click on the page drops it. The full Sign tool exists to *build* a signature -
 * choosing a source, drawing, typing - and none of that is needed to reuse one.
 *
 * With nothing saved there is nothing to arm, so the press opens a panel offering the
 * full tool instead. Only pressing that leaves the document.
 */
export function ReaderSignButton() {
  const { t } = useTranslation();
  const { savedSignatures, isLoading } = useSavedSignatures();
  const { setSignatureConfig, activateSignaturePlacementMode } = useSignature();
  const { handleToolSelect } = useToolWorkflow();
  const [promptOpen, setPromptOpen] = useState(false);

  const signature = useMemo(
    () => mostRecent(savedSignatures),
    [savedSignatures],
  );
  const label = t("reader.rail.sign", "Sign");

  const press = useCallback(() => {
    if (!signature) {
      setPromptOpen(true);
      return;
    }
    setSignatureConfig(toPlacementConfig(signature));
    activateSignaturePlacementMode();
  }, [signature, setSignatureConfig, activateSignaturePlacementMode]);

  const openFullTool = useCallback(() => {
    setPromptOpen(false);
    handleToolSelect("sign");
  }, [handleToolSelect]);

  const trigger = (
    <ActionIcon
      variant="tertiary"
      size="md"
      shape="circle"
      aria-label={label}
      disabled={isLoading}
      onClick={press}
    >
      <DrawIcon fontSize="small" />
    </ActionIcon>
  );

  if (signature) {
    return (
      <AppTooltip content={label} position="left" arrow delay={0}>
        {trigger}
      </AppTooltip>
    );
  }

  return (
    <Popover
      position="left"
      withArrow
      shadow="md"
      offset={8}
      opened={promptOpen}
      onChange={setPromptOpen}
    >
      <Popover.Target>{trigger}</Popover.Target>
      <Popover.Dropdown>
        <div className="reader-rail__prompt">
          <Text size="sm" fw={500}>
            {t("reader.sign.noneTitle", "No saved signature")}
          </Text>
          <Text size="xs" c="dimmed">
            {t(
              "reader.sign.noneBody",
              "Create one and it will be one press away here.",
            )}
          </Text>
          <Button size="sm" onClick={openFullTool}>
            {t("reader.sign.openTool", "Create a signature")}
          </Button>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

export default ReaderSignButton;
