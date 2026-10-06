import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal, RadioGroup } from "@app/ui";
import type { Member } from "@portal/api/users";

/**
 * Asked when a leader makes someone active on a full team: who gives up their place. Leaders keep
 * theirs, so only active members are offered.
 */
export function MakeActiveModal({
  member,
  candidates,
  busy,
  onClose,
  onConfirm,
}: {
  /** The disabled member who is getting a place; null closes the dialog. */
  member: Member | null;
  /** Active, non-leader members of the same team. */
  candidates: Member[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (replace: Member) => void;
}) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<string>("");
  useEffect(() => {
    if (member) setChoice("");
  }, [member]);
  const replace = candidates.find((c) => c.id === choice) ?? null;

  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      width="md"
      title={t("users.makeActive.title", "Make {{name}} active", {
        name: member?.name ?? "",
      })}
      subtitle={t(
        "users.makeActive.subtitle",
        "Your plan has no free place. Choose who gives up theirs; they can't sign in until a place frees up.",
      )}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t("users.makeActive.cancel", "Cancel")}
          </Button>
          <Button
            onClick={() => replace && onConfirm(replace)}
            disabled={!replace}
            loading={busy}
          >
            {t("users.makeActive.confirm", "Swap places")}
          </Button>
        </>
      }
    >
      <RadioGroup
        name="make-active-replace"
        value={choice}
        onChange={setChoice}
        options={candidates.map((c) => ({
          value: c.id,
          label: c.name,
          description: c.email !== c.name ? c.email : undefined,
        }))}
      />
    </Modal>
  );
}
