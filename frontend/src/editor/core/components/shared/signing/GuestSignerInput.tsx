import { useState } from "react";
import { Group, Stack, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { Chip } from "@app/ui/Chip";
import { Icon } from "@app/ui/Icon";

// Typo guard only; the signing mailer applies its own address check before sending.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Collects signers without an account; each is emailed a private link that signs only this request. */
export function GuestSignerInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (emails: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addDraft = () => {
    const email = draft.trim();
    if (!email) return;
    if (!EMAIL_PATTERN.test(email)) {
      setError(
        t("signWorkspace.guestEmailInvalid", "Enter a valid email address"),
      );
      return;
    }
    if (
      value.some((existing) => existing.toLowerCase() === email.toLowerCase())
    ) {
      setError(
        t("signWorkspace.guestEmailDuplicate", "This email is already added"),
      );
      return;
    }
    onChange([...value, email]);
    setDraft("");
    setError(null);
  };

  return (
    <Stack gap="xs">
      <TextInput
        type="email"
        label={t("signWorkspace.guestEmailLabel", "Invite by email")}
        description={t(
          "signWorkspace.guestEmailHelp",
          "People without an account get a private link to sign this document.",
        )}
        placeholder={t(
          "signWorkspace.guestEmailPlaceholder",
          "name@example.com",
        )}
        value={draft}
        error={error}
        disabled={disabled}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          addDraft();
        }}
        inputContainer={(input) => (
          <Group gap="xs" wrap="nowrap">
            <div style={{ flex: 1 }}>{input}</div>
            <Button
              variant="secondary"
              disabled={disabled || !draft.trim()}
              onClick={addDraft}
              leftSection={<Icon name="plus" size={16} />}
            >
              {t("signWorkspace.guestEmailAdd", "Add")}
            </Button>
          </Group>
        )}
      />
      {value.length > 0 && (
        <Group gap="xs">
          {/* Not Chip's onRemove: Mantine renders that button aria-hidden and
              out of the tab order, so keyboard users could not remove a guest. */}
          {value.map((email) => (
            <Group key={email} gap={2} wrap="nowrap">
              <Chip size="sm">{email}</Chip>
              <ActionIcon
                variant="quiet"
                size="sm"
                disabled={disabled}
                aria-label={t("signWorkspace.removeGuest", "Remove {{email}}", {
                  email,
                })}
                onClick={() =>
                  onChange(value.filter((other) => other !== email))
                }
              >
                <Icon name="x" size={14} />
              </ActionIcon>
            </Group>
          ))}
        </Group>
      )}
    </Stack>
  );
}
