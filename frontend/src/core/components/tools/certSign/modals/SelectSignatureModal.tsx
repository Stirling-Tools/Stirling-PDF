import {
  Modal,
  Stack,
  Button,
  Text,
  Group,
  Box,
  ActionIcon,
  UnstyledButton,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  useSavedSignatures,
  SavedSignature,
} from "@app/hooks/tools/sign/useSavedSignatures";
import DrawIcon from "@mui/icons-material/Draw";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import ImageIcon from "@mui/icons-material/Image";
import CloseIcon from "@mui/icons-material/Close";

interface SelectSignatureModalProps {
  opened: boolean;
  onClose: () => void;
  onSignatureSelected: (signature: SavedSignature) => void;
  onCreateNew: (type: "canvas" | "text" | "image") => void;
}

export const SelectSignatureModal: React.FC<SelectSignatureModalProps> = ({
  opened,
  onClose,
  onSignatureSelected,
  onCreateNew,
}) => {
  const { t } = useTranslation();
  const { savedSignatures, removeSignature } = useSavedSignatures();

  const sortedSavedSignatures = [...savedSignatures].sort(
    (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
  );

  const renderSignaturePreview = (sig: SavedSignature) => {
    if (sig.type === "text") {
      return (
        <Box
          style={{
            width: 72,
            height: 28,
            backgroundColor: "#ffffff",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 8px",
            overflow: "hidden",
            border: "1px solid var(--mantine-color-gray-3)",
          }}
        >
          <Text
            size="sm"
            style={{
              fontFamily: sig.fontFamily,
              color: sig.textColor,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {sig.signerName}
          </Text>
        </Box>
      );
    }

    return (
      <Box
        style={{
          width: 72,
          height: 28,
          backgroundColor: "#ffffff",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2px 6px",
          border: "1px solid var(--mantine-color-gray-3)",
        }}
      >
        <Box
          component="img"
          src={sig.dataUrl}
          alt={
            sig.label ||
            t("certSign.collab.signRequest.saved.defaultLabel", "Signature")
          }
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            display: "block",
          }}
        />
      </Box>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t(
        "certSign.collab.signRequest.selectSignatureTitle",
        "Select or Create Signature",
      )}
      centered
      size="md"
    >
      <Stack gap="md">
        {sortedSavedSignatures.length > 0 && (
          <>
            <Text size="sm" fw={600}>
              {t(
                "certSign.collab.signRequest.savedSignatures",
                "Saved Signatures",
              )}
            </Text>
            <Stack gap="xs">
              {sortedSavedSignatures.map((sig) => (
                <Group
                  key={sig.id}
                  gap={0}
                  wrap="nowrap"
                  style={{
                    border: "1px solid var(--mantine-color-gray-3)",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  <UnstyledButton
                    onClick={() => {
                      onSignatureSelected(sig);
                      onClose();
                    }}
                    style={{ flex: 1, padding: "12px" }}
                  >
                    {renderSignaturePreview(sig)}
                  </UnstyledButton>
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    size="sm"
                    onClick={() => removeSignature(sig.id)}
                    aria-label={t(
                      "certSign.collab.signRequest.saved.delete",
                      "Delete signature",
                    )}
                    style={{ margin: "0 6px" }}
                  >
                    <CloseIcon sx={{ fontSize: "1rem" }} />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
          </>
        )}

        <Text
          size="sm"
          fw={600}
          mt={sortedSavedSignatures.length > 0 ? "md" : 0}
        >
          {t(
            "certSign.collab.signRequest.createNewSignature",
            "Create New Signature",
          )}
        </Text>

        <Group grow>
          <Button
            variant="outline"
            leftSection={<DrawIcon />}
            onClick={() => {
              onCreateNew("canvas");
              onClose();
            }}
          >
            {t("certSign.collab.signRequest.modeTabs.draw", "Draw")}
          </Button>
          <Button
            variant="outline"
            leftSection={<TextFieldsIcon />}
            onClick={() => {
              onCreateNew("text");
              onClose();
            }}
          >
            {t("certSign.collab.signRequest.modeTabs.text", "Type")}
          </Button>
          <Button
            variant="outline"
            leftSection={<ImageIcon />}
            onClick={() => {
              onCreateNew("image");
              onClose();
            }}
          >
            {t("certSign.collab.signRequest.modeTabs.image", "Upload")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
