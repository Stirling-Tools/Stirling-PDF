import { Tooltip, Popover, TextInput, Stack } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import CommentIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import AddCommentIcon from "@mui/icons-material/AddCommentOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNewRounded";
import LocalIcon from "@app/components/shared/LocalIcon";
import { Button } from "@app/ui/Button";
import type { FirstLinkTarget } from "@app/components/viewer/useAnnotationMenuHandlers";
import "@app/components/viewer/TextSelectionMenu.css";

export function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <Tooltip label={t("annotation.delete", "Delete")} withArrow>
      <button
        type="button"
        className="embedpdf-floating-btn embedpdf-floating-btn-danger"
        onClick={onDelete}
        aria-label={t("annotation.delete", "Delete")}
      >
        <DeleteIcon style={{ fontSize: 18 }} />
      </button>
    </Tooltip>
  );
}

export function EditTextButton({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation();
  return (
    <Tooltip label={t("annotation.editText", "Edit Text")} withArrow>
      <button
        type="button"
        className="embedpdf-floating-btn"
        onClick={onEdit}
        aria-label={t("annotation.editText", "Edit Text")}
      >
        <EditIcon style={{ fontSize: 18 }} />
      </button>
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
  const label = isInSidebar
    ? t("viewer.comments.viewComment", "View comment")
    : t("viewer.comments.addComment", "Add comment");
  return (
    <Tooltip label={label} withArrow>
      <button
        type="button"
        className={`embedpdf-floating-btn ${isInSidebar ? "embedpdf-floating-btn-active" : ""}`}
        onClick={isInSidebar ? onView : onAdd}
        aria-label={label}
      >
        <AddCommentIcon style={{ fontSize: 18 }} />
      </button>
    </Tooltip>
  );
}

interface CommentButtonProps {
  hasContent: boolean;
  onClick: () => void;
}

export function CommentButton({ hasContent, onClick }: CommentButtonProps) {
  const { t } = useTranslation();
  const label = hasContent
    ? t("viewer.comments.viewComment", "View comment")
    : t("viewer.comments.addComment", "Add comment");
  return (
    <Tooltip label={label} withArrow>
      <button
        type="button"
        className="embedpdf-floating-btn"
        onClick={onClick}
        aria-label={label}
      >
        <CommentIcon style={{ fontSize: 18 }} />
      </button>
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
      <Tooltip label={t("viewer.comments.goToLink", "Go to link")} withArrow>
        <button
          type="button"
          className="embedpdf-floating-btn"
          onClick={onGoToLink}
          aria-label={t("viewer.comments.goToLink", "Go to link")}
        >
          <OpenInNewIcon style={{ fontSize: 18 }} />
        </button>
      </Tooltip>
    );
  }

  return (
    <Popover
      opened={open}
      onClose={() => setOpen(false)}
      position="top"
      withArrow
    >
      <Popover.Target>
        <Tooltip label={t("viewer.comments.addLink", "Add link")} withArrow>
          <button
            type="button"
            className="embedpdf-floating-btn"
            onClick={() => setOpen((o) => !o)}
            aria-label={t("viewer.comments.addLink", "Add link")}
          >
            <LocalIcon icon="link" width="1.15rem" height="1.15rem" />
          </button>
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
            size="sm"
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
