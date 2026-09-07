import { Tooltip, Popover, TextInput, Stack } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import type { FirstLinkTarget } from "@app/components/viewer/useAnnotationMenuHandlers";

export function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <Tooltip label={t("annotation.delete", "Delete")}>
      <ActionIcon
        aria-label={t("annotation.delete", "Delete")}
        variant="secondary"
        accent="danger"
        size="md"
        onClick={onDelete}
      >
        <Icon name="trash" size={18} />
      </ActionIcon>
    </Tooltip>
  );
}

export function EditTextButton({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation();
  return (
    <Tooltip label={t("annotation.editText", "Edit Text")}>
      <ActionIcon
        aria-label={t("annotation.editText", "Edit Text")}
        variant="secondary"
        accent="neutral"
        size="md"
        onClick={onEdit}
      >
        <Icon name="pencil" size={18} />
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
  const label = isInSidebar
    ? t("viewer.comments.viewComment", "View comment")
    : t("viewer.comments.addComment", "Add comment");
  return (
    <Tooltip label={label}>
      <ActionIcon
        aria-label={label}
        variant={isInSidebar ? "primary" : "secondary"}
        accent={isInSidebar ? undefined : "neutral"}
        size="md"
        onClick={isInSidebar ? onView : onAdd}
      >
        <Icon name="message-square-plus" size={18} />
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
  const label = hasContent
    ? t("viewer.comments.viewComment", "View comment")
    : t("viewer.comments.addComment", "Add comment");
  return (
    <Tooltip label={label}>
      <ActionIcon
        aria-label={label}
        variant="secondary"
        accent="neutral"
        size="md"
        onClick={onClick}
      >
        <Icon name="message-square" size={18} />
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
          aria-label={t("viewer.comments.goToLink", "Go to link")}
          variant="secondary"
          accent="neutral"
          size="md"
          onClick={onGoToLink}
        >
          <Icon name="external-link" size={18} />
        </ActionIcon>
      </Tooltip>
    );
  }

  return (
    <Popover opened={open} onClose={() => setOpen(false)} position="top">
      <Popover.Target>
        <Tooltip label={t("viewer.comments.addLink", "Add link")}>
          <ActionIcon
            aria-label={t("viewer.comments.addLink", "Add link")}
            variant="secondary"
            accent="neutral"
            size="md"
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name="link" size="1.25rem" />
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
