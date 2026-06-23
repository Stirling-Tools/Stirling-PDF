import React from "react";
import { Stack, Text, TextInput } from "@mantine/core";
import { Button } from "@shared/components/Button";
import { useTranslation } from "react-i18next";

interface EmailStageProps {
  emailInput: string;
  setEmailInput: (email: string) => void;
  emailError: string;
  onSubmit: () => void;
}

export const EmailStage: React.FC<EmailStageProps> = ({
  emailInput,
  setEmailInput,
  emailError,
  onSubmit,
}) => {
  const { t } = useTranslation();

  return (
    <Stack
      gap="lg"
      style={{ maxWidth: "500px", margin: "0 auto", padding: "2rem 0" }}
    >
      <Text size="sm" c="dimmed">
        {t(
          "payment.emailStage.description",
          "We'll use this to send your license key and receipts.",
        )}
      </Text>

      <TextInput
        label={t("payment.emailStage.emailLabel", "Email Address")}
        placeholder={t("payment.emailStage.emailPlaceholder", "your@email.com")}
        value={emailInput}
        onChange={(e) => setEmailInput(e.currentTarget.value)}
        error={emailError}
        size="lg"
        required
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSubmit();
          }
        }}
      />

      <Button onClick={onSubmit} disabled={!emailInput.trim()}>
        {t("payment.emailStage.continue", "Continue")}
      </Button>
    </Stack>
  );
};
