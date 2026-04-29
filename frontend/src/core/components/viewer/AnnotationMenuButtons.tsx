import {
  ActionIcon,
  Tooltip,
  Popover,
  TextInput,
  Button,
  Stack,
} from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import CommentIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import AddCommentIcon from "@mui/icons-material/AddCommentOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNewRounded";
import LocalIcon from "@app/components/shared/LocalIcon";
import type { FirstLinkTarget } from "@app/components/viewer/useAnnotationMenuHandlers";

export const commonButtonStyles = {
  root: {
    flexShrink: 0,
    backgroundColor: "var(--bg-raised)",
    border: "1px solid var(--border-default)",
    color: "var(--text-secondary)",
    "&:hover": {
      backgroundColor: "var(--hover-bg)",
      borderColor: "var(--border-strong)",
      color: "var(--text-primary)",
    },
  },
};

export function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <Tooltip label={t("annotation.delete", "Delete")}>
      <ActionIcon
        variant="subtle"
        color="red"
        size="md"
        onClick={onDelete}
        styles={{
          root: {
            ...commonButtonStyles.root,
            "&:hover": {
              backgroundColor: "var(--mantine-color-red-1)",
              borderColor: "var(--mantine-color-red-4)",
              color: "var(--mantine-color-red-7)",
            },
          },
        }}
      >
        <DeleteIcon style={{ fontSize: 18 }} />
      </ActionIcon>
    </Tooltip>
  );
}

export function EditTextButton({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation();
  return (
    <Tooltip label={t("annotation.editText", "Edit Text")}>
      <ActionIcon
        variant="subtle"
        color="gray"
        size="md"
        onClick={onEdit}
        styles={commonButtonStyles}
      >
        <EditIcon style={{ fontSize: 18 }} />
      </ActionIcon>
    </Tooltip>
  );
}

interface AttachCommentButtonProps {
  isInSidebar: boolean;
  onView: () => void;
  onAdd: () => void;
}

export function AttachCommentButton({
  isInSidebar,
  onView,
  onAdd,
}: AttachCommentButtonProps) {
  const { t } = useTranslation();
  return (
    <Tooltip
      label={
        isInSidebar
          ? t("viewer.comments.viewComment", "View comment")
          : t("viewer.comments.addComment", "Add comment")
      }
    >
      <ActionIcon
        variant={isInSidebar ? "filled" : "subtle"}
        color={isInSidebar ? "blue" : "gray"}
        size="md"
        onClick={isInSidebar ? onView : onAdd}
        styles={isInSidebar ? undefined : commonButtonStyles}
      >
        <AddCommentIcon style={{ fontSize: 18 }} />
      </ActionIcon>
    </Tooltip>
  );
}

interface CommentButtonProps {
  hasContent: boolean;
  onClick: () => void;
}

export function CommentButton({ hasContent, onClick }: CommentButtonProps) {
  const { t } = useTranslation();
  return (
    <Tooltip
      label={
        hasContent
          ? t("viewer.comments.viewComment", "View comment")
          : t("viewer.comments.addComment", "Add comment")
      }
    >
      <ActionIcon
        variant="subtle"
        color="gray"
        size="md"
        onClick={onClick}
        styles={commonButtonStyles}
      >
        <CommentIcon style={{ fontSize: 18 }} />
      </ActionIcon>
    </Tooltip>
  );
}

interface LinkButtonProps {
  firstLinkTarget: FirstLinkTarget | null;
  onGoToLink: () => void;
  onAddLink: (url: string) => void;
}

export function LinkButton({
  firstLinkTarget,
  onGoToLink,
  onAddLink,
}: LinkButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  if (firstLinkTarget) {
    return (
      <Tooltip label={t("viewer.comments.goToLink", "Go to link")}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="md"
          onClick={onGoToLink}
          styles={commonButtonStyles}
        >
          <OpenInNewIcon style={{ fontSize: 18 }} />
        </ActionIcon>
      </Tooltip>
    );
  }

  return (
    <Popover opened={open} onClose={() => setOpen(false)} position="top">
      <Popover.Target>
        <Tooltip label={t("viewer.comments.addLink", "Add link")}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            onClick={() => setOpen((o) => !o)}
            styles={commonButtonStyles}
          >
            <LocalIcon icon="link" width="1.25rem" height="1.25rem" />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <TextInput
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            size="sm"
            style={{ minWidth: 220 }}
          />
          <Button
            size="xs"
            disabled={!url.trim()}
            onClick={() => {
              onAddLink(url);
              setUrl("");
              setOpen(false);
            }}
          >
            {t("viewer.comments.addLink", "Add link")}
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
