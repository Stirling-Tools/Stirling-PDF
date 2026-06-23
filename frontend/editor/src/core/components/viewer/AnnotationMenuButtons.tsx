import { Tooltip, Popover, TextInput, Stack } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import CommentIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import AddCommentIcon from "@mui/icons-material/AddCommentOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNewRounded";
import LocalIcon from "@app/components/shared/LocalIcon";
import { Button } from "@shared/components/Button";
import type { FirstLinkTarget } from "@app/components/viewer/useAnnotationMenuHandlers";

export function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <Tooltip label={t("annotation.delete", "Delete")}>
      <Button
        aria-label={t("annotation.delete", "Delete")}
        variant="outlined"
        accent="danger"
        size="md"
        onClick={onDelete}
        style={{
          "--sui-btn-bg": "var(--bg-raised)",
          "--sui-btn-fg": "var(--text-secondary)",
          "--sui-btn-bd": "var(--border-default)",
        }}
        leftSection={<DeleteIcon style={{ fontSize: 18 }} />}
      />
    </Tooltip>
  );
}

export function EditTextButton({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation();
  return (
    <Tooltip label={t("annotation.editText", "Edit Text")}>
      <Button
        aria-label={t("annotation.editText", "Edit Text")}
        variant="outlined"
        size="md"
        onClick={onEdit}
        style={{
          "--sui-btn-bg": "var(--bg-raised)",
          "--sui-btn-fg": "var(--text-secondary)",
          "--sui-btn-bd": "var(--border-default)",
        }}
        leftSection={<EditIcon style={{ fontSize: 18 }} />}
      />
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
    <Tooltip label={label}>
      <Button
        aria-label={label}
        variant={isInSidebar ? "filled" : "outlined"}
        size="md"
        onClick={isInSidebar ? onView : onAdd}
        style={
          isInSidebar
            ? undefined
            : {
                "--sui-btn-bg": "var(--bg-raised)",
                "--sui-btn-fg": "var(--text-secondary)",
                "--sui-btn-bd": "var(--border-default)",
              }
        }
        leftSection={<AddCommentIcon style={{ fontSize: 18 }} />}
      />
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
    <Tooltip label={label}>
      <Button
        aria-label={label}
        variant="outlined"
        size="md"
        onClick={onClick}
        style={{
          "--sui-btn-bg": "var(--bg-raised)",
          "--sui-btn-fg": "var(--text-secondary)",
          "--sui-btn-bd": "var(--border-default)",
        }}
        leftSection={<CommentIcon style={{ fontSize: 18 }} />}
      />
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
        <Button
          aria-label={t("viewer.comments.goToLink", "Go to link")}
          variant="outlined"
          size="md"
          onClick={onGoToLink}
          style={{
            "--sui-btn-bg": "var(--bg-raised)",
            "--sui-btn-fg": "var(--text-secondary)",
            "--sui-btn-bd": "var(--border-default)",
          }}
          leftSection={<OpenInNewIcon style={{ fontSize: 18 }} />}
        />
      </Tooltip>
    );
  }

  return (
    <Popover opened={open} onClose={() => setOpen(false)} position="top">
      <Popover.Target>
        <Tooltip label={t("viewer.comments.addLink", "Add link")}>
          <Button
            aria-label={t("viewer.comments.addLink", "Add link")}
            variant="outlined"
            size="md"
            onClick={() => setOpen((o) => !o)}
            style={{
              "--sui-btn-bg": "var(--bg-raised)",
              "--sui-btn-fg": "var(--text-secondary)",
              "--sui-btn-bd": "var(--border-default)",
            }}
            leftSection={
              <LocalIcon icon="link" width="1.25rem" height="1.25rem" />
            }
          />
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
