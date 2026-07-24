import React from "react";
import { Card, Group, Stack, Text } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { LocalIcon } from "@app/components/shared/LocalIcon";

export interface PlanLinkPromptProps {
  /** Heading, e.g. "Link your Stirling account". */
  title: string;
  /** Body copy explaining why to link. */
  body: string;
  /** Primary CTA label, e.g. "Link Stirling account". */
  ctaLabel: string;
  /** Invoked when the CTA is clicked (deep-links to the portal's link flow). */
  onLink: () => void;
}

/**
 * Shown on the Plan & Usage page when a self-hosted instance isn't linked to a
 * Stirling account yet — metered usage and billing only exist once linked.
 * Purely presentational: every string is supplied by the caller so it stays
 * i18n-agnostic and Storybook-friendly.
 */
const PlanLinkPrompt: React.FC<PlanLinkPromptProps> = ({
  title,
  body,
  ctaLabel,
  onLink,
}) => {
  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="sm" align="flex-start">
        <Group gap="sm" align="center" wrap="nowrap">
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--mantine-primary-color-light)",
              flexShrink: 0,
            }}
          >
            <LocalIcon
              icon="link"
              width="1.1rem"
              height="1.1rem"
              style={{ color: "var(--mantine-primary-color-filled)" }}
            />
          </div>
          <Text size="md" fw={600}>
            {title}
          </Text>
        </Group>
        <Text size="sm" c="dimmed">
          {body}
        </Text>
        <Button
          variant="primary"
          onClick={onLink}
          leftSection={<LocalIcon icon="link" width="1rem" height="1rem" />}
        >
          {ctaLabel}
        </Button>
      </Stack>
    </Card>
  );
};

export default PlanLinkPrompt;
