import { useState, useEffect, useMemo } from "react";
import {
  Paper,
  Group,
  Text,
  ActionIcon,
  UnstyledButton,
  Popover,
  List,
  ScrollArea,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useConversionCloudStatus } from "@app/hooks/useConversionCloudStatus";
import {
  selfHostedServerMonitor,
  type SelfHostedServerState,
} from "@app/services/selfHostedServerMonitor";
import {
  connectionModeService,
  type ConnectionMode,
} from "@app/services/connectionModeService";
import { tauriBackendService } from "@app/services/tauriBackendService";
import { endpointAvailabilityService } from "@app/services/endpointAvailabilityService";
import {
  EXTENSION_TO_ENDPOINT,
  ENDPOINT_I18N,
} from "@app/constants/convertConstants";
import { ENDPOINTS as SPLIT_ENDPOINTS } from "@app/constants/splitConstants";
import type { ToolId } from "@app/types/toolId";

const BANNER_BG = "var(--mantine-color-gray-1)";
const BANNER_BORDER = "var(--mantine-color-gray-3)";
const BANNER_TEXT = "var(--mantine-color-gray-7)";
const BANNER_ICON = "var(--mantine-color-gray-5)";
const BANNER_LINK = "var(--mantine-color-gray-6)";

/** Maps split endpoint → [i18n key, English fallback] for the method name */
const SPLIT_ENDPOINT_I18N: Record<string, [string, string]> = {
  "split-pages": ["split.methods.byPages.name", "Pages"],
  "split-pdf-by-sections": ["split.methods.bySections.name", "Sections"],
  "split-by-size-or-count": ["split.methods.bySize.name", "File Size"],
  "split-pdf-by-chapters": ["split.methods.byChapters.name", "Chapters"],
  "auto-split-pdf": ["split.methods.byPageDivider.name", "Page Divider"],
  "split-for-poster-print": ["split.methods.byPoster.name", "Printable Chunks"],
};

/**
 * Desktop-only banner shown when the user is in self-hosted mode and the
 * configured Stirling-PDF server is unreachable.
 *
 * - Warns the user their server is offline
 * - Explains whether local fallback is active
 * - Shows an expandable list of tools that are unavailable locally
 * - Session-dismissable (reappears on next launch if server still offline)
 */
export function SelfHostedOfflineBanner() {
  const { t } = useTranslation();
  const [connectionMode, setConnectionMode] = useState<ConnectionMode | null>(
    null,
  );
  const [serverState, setServerState] = useState<SelfHostedServerState>(() =>
    selfHostedServerMonitor.getSnapshot(),
  );
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localBackendReady, setLocalBackendReady] = useState(
    () => !!tauriBackendService.getBackendUrl(),
  );

  // Load connection mode and keep it live via subscription
  useEffect(() => {
    void connectionModeService.getCurrentMode().then(setConnectionMode);
    return connectionModeService.subscribeToModeChanges((config) =>
      setConnectionMode(config.mode),
    );
  }, []);

  // Subscribe to self-hosted server status changes
  useEffect(() => {
    const unsub = selfHostedServerMonitor.subscribe((state) => {
      setServerState(state);
      // Auto-collapse tool list when server comes back online
      if (state.isOnline) setExpanded(false);
    });
    return unsub;
  }, []);

  // React to local backend port being discovered
  useEffect(() => {
    return tauriBackendService.subscribeToStatus(() => {
      setLocalBackendReady(!!tauriBackendService.getBackendUrl());
    });
  }, []);

  // Re-use the toolAvailability already computed by useToolManagement —
  // tools with reason 'selfHostedOffline' are the ones unavailable locally.
  const { toolAvailability, toolRegistry } = useToolWorkflow();

  // Re-use conversion availability already computed by useConversionCloudStatus.
  const { availability: conversionAvailability } = useConversionCloudStatus();

  const [splitAvailability, setSplitAvailability] = useState<
    Record<string, boolean>
  >({});
  useEffect(() => {
    if (serverState.status !== "offline") {
      setSplitAvailability({});
      return;
    }
    const localUrl = tauriBackendService.getBackendUrl();
    if (!localUrl) {
      setSplitAvailability({});
      return;
    }
    const uniqueEndpoints = [
      ...new Set(Object.values(SPLIT_ENDPOINTS)),
    ] as string[];
    void Promise.all(
      uniqueEndpoints.map(async (ep) => ({
        ep,
        supported: await endpointAvailabilityService
          .isEndpointSupportedLocally(ep, localUrl)
          .catch(() => false),
      })),
    ).then((results) => {
      const map: Record<string, boolean> = {};
      for (const { ep, supported } of results) map[ep] = supported;
      setSplitAvailability(map);
    });
  }, [serverState.status]);

  const allUnavailableNames = useMemo(() => {
    // Top-level tools unavailable in self-hosted offline mode
    const toolNames = (Object.keys(toolAvailability) as ToolId[])
      .filter(
        (id) =>
          toolAvailability[id]?.available === false &&
          toolAvailability[id]?.reason === "selfHostedOffline",
      )
      .map((id) => toolRegistry[id]?.name ?? id)
      .filter(Boolean);

    // Use translated tool names from the registry as prefixes
    const convertPrefix = toolRegistry["convert" as ToolId]?.name ?? "Convert";
    const splitPrefix = toolRegistry["split" as ToolId]?.name ?? "Split";

    // Conversion types unavailable locally — deduplicated by endpoint
    const unavailableEndpoints = new Set<string>();
    for (const [key, available] of Object.entries(conversionAvailability)) {
      if (!available) {
        const dashIdx = key.indexOf("-");
        const fromExt = key.slice(0, dashIdx);
        const toExt = key.slice(dashIdx + 1);
        const endpoint = EXTENSION_TO_ENDPOINT[fromExt]?.[toExt];
        if (endpoint) unavailableEndpoints.add(endpoint);
      }
    }
    const conversionNames = [...unavailableEndpoints]
      .map((ep) => {
        const i18n = ENDPOINT_I18N[ep];
        const suffix = i18n ? (i18n[0] ? t(i18n[0], i18n[1]) : i18n[1]) : ep;
        return `${convertPrefix}: ${suffix}`;
      })
      .filter(Boolean);

    // Split methods unavailable locally
    const unavailableSplitNames = Object.entries(splitAvailability)
      .filter(([, available]) => !available)
      .map(([ep]) => {
        const i18n = SPLIT_ENDPOINT_I18N[ep];
        const suffix = i18n ? t(i18n[0], i18n[1]) : ep;
        return `${splitPrefix}: ${suffix}`;
      })
      .filter(Boolean);

    return [...toolNames, ...conversionNames, ...unavailableSplitNames].sort();
  }, [
    toolAvailability,
    toolRegistry,
    conversionAvailability,
    splitAvailability,
    t,
  ]);

  // Only show when in self-hosted mode, server confirmed offline, and not dismissed
  const show =
    !dismissed &&
    connectionMode === "selfhosted" &&
    serverState.status === "offline";

  if (!show) return null;

  const messageText = localBackendReady
    ? t(
        "selfHosted.offline.messageWithFallback",
        "Some tools require a server connection.",
      )
    : t(
        "selfHosted.offline.messageNoFallback",
        "Tools are unavailable until your server comes back online.",
      );

  return (
    <Paper
      radius={0}
      style={{
        background: BANNER_BG,
        borderBottom: `1px solid ${BANNER_BORDER}`,
      }}
    >
      <Group
        gap="xs"
        align="center"
        wrap="nowrap"
        justify="space-between"
        px="sm"
        py={6}
      >
        <Group
          gap="xs"
          align="center"
          wrap="nowrap"
          style={{ minWidth: 0, flex: 1 }}
        >
          <LocalIcon
            icon="warning-rounded"
            width="1rem"
            height="1rem"
            style={{ color: BANNER_ICON, flexShrink: 0 }}
          />
          <Text
            size="xs"
            fw={600}
            style={{ color: BANNER_TEXT, flexShrink: 0 }}
          >
            {t("selfHosted.offline.title", "Server unreachable")}
          </Text>
          <Text
            size="xs"
            style={{
              color: BANNER_TEXT,
              opacity: 0.8,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {messageText}
          </Text>
        </Group>
        {allUnavailableNames.length > 0 && (
          <Popover
            opened={expanded}
            onClose={() => setExpanded(false)}
            position="bottom-end"
            withinPortal
            shadow="md"
            width={260}
          >
            <Popover.Target>
              <UnstyledButton
                onClick={() => setExpanded((e) => !e)}
                style={{
                  color: BANNER_LINK,
                  fontSize: "var(--mantine-font-size-xs)",
                  fontWeight: 500,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {expanded
                  ? t(
                      "selfHosted.offline.hideTools",
                      "Hide unavailable tools ▴",
                    )
                  : t(
                      "selfHosted.offline.showTools",
                      "View unavailable tools ▾",
                    )}
              </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown p="xs">
              <ScrollArea.Autosize mah={300}>
                <List size="xs" spacing={2}>
                  {allUnavailableNames.map((name) => (
                    <List.Item key={name}>{name}</List.Item>
                  ))}
                </List>
              </ScrollArea.Autosize>
            </Popover.Dropdown>
          </Popover>
        )}
        <ActionIcon
          variant="subtle"
          size="xs"
          onClick={() => setDismissed(true)}
          aria-label={t("close", "Close")}
          style={{ color: BANNER_TEXT }}
        >
          <LocalIcon icon="close-rounded" width="0.8rem" height="0.8rem" />
        </ActionIcon>
      </Group>
    </Paper>
  );
}
