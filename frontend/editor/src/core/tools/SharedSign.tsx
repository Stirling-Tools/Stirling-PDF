import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Center,
  Chip,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { BaseToolProps } from "@app/types/tool";
import { useGroupSigningEnabled } from "@app/hooks/useGroupSigningEnabled";
import { useViewScopedFiles } from "@app/hooks/tools/shared/useViewScopedFiles";
import { useSigningSessionController } from "@app/hooks/signing/useSigningSessionController";
import { CreateSessionFlow } from "@app/components/shared/signing/CreateSessionFlow";
import { SessionDetailPanel } from "@app/components/tools/certSign/panels/SessionDetailPanel";
import SignRequestPanel from "@app/components/tools/certSign/panels/SignRequestPanel";
import type {
  SignRequestSummary,
  SessionSummary,
} from "@app/types/signingSession";

type Tab = "active" | "completed";

type SessionItem =
  | (SignRequestSummary & { itemType: "signRequest" })
  | (SessionSummary & { itemType: "mySession" });

function sortByRecency(items: SessionItem[]): SessionItem[] {
  return [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

const SharedSign = (_props: BaseToolProps) => {
  const { t } = useTranslation();
  const groupSigningEnabled = useGroupSigningEnabled();
  const controller = useSigningSessionController(groupSigningEnabled);
  const selectedFiles = useViewScopedFiles();

  const [tab, setTab] = useState<Tab>("active");
  const [filters, setFilters] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [dueDate, setDueDate] = useState("");

  // Switching tabs clears filters (the available chips differ per tab).
  const changeTab = (value: Tab) => {
    setTab(value);
    setFilters([]);
  };

  const { signRequests, mySessions } = controller;

  const activeItems = useMemo<SessionItem[]>(
    () =>
      sortByRecency([
        ...signRequests
          .filter((r) => r.myStatus !== "SIGNED" && r.myStatus !== "DECLINED")
          .map((r) => ({ ...r, itemType: "signRequest" as const })),
        ...mySessions
          .filter((s) => !s.finalized)
          .map((s) => ({ ...s, itemType: "mySession" as const })),
      ]),
    [signRequests, mySessions],
  );

  const completedItems = useMemo<SessionItem[]>(
    () =>
      sortByRecency([
        ...signRequests
          .filter((r) => r.myStatus === "SIGNED" || r.myStatus === "DECLINED")
          .map((r) => ({ ...r, itemType: "signRequest" as const })),
        ...mySessions
          .filter((s) => s.finalized)
          .map((s) => ({ ...s, itemType: "mySession" as const })),
      ]),
    [signRequests, mySessions],
  );

  const statusFor = (item: SessionItem): { color: string; label: string } => {
    if (item.itemType === "mySession") {
      const s = item as SessionSummary;
      if (s.finalized) {
        return { color: "green", label: t("certSign.finalized", "Finalized") };
      }
      const signed = s.signedCount ?? 0;
      const total = s.participantCount ?? 0;
      if (total > 0 && signed === total) {
        return {
          color: "green",
          label: t("certSign.readyToFinalize", "Ready to finalize"),
        };
      }
      if (total > 0) {
        return {
          color: signed > 0 ? "yellow" : "blue",
          label: t(
            "certSign.signatureProgress",
            "{{signedCount}}/{{totalCount}} signatures",
            { signedCount: signed, totalCount: total },
          ),
        };
      }
      return {
        color: "blue",
        label: t("certSign.awaitingSignatures", "Awaiting signatures"),
      };
    }
    const req = item as SignRequestSummary;
    switch (req.myStatus) {
      case "SIGNED":
        return { color: "green", label: t("certSign.signed", "Signed") };
      case "DECLINED":
        return { color: "red", label: t("certSign.declined", "Declined") };
      case "VIEWED":
        return { color: "blue", label: t("certSign.viewed", "Viewed") };
      default:
        return { color: "orange", label: t("certSign.pending", "Pending") };
    }
  };

  const onItemClick = (item: SessionItem) => {
    if (item.itemType === "signRequest") {
      void controller.openSignRequest(item as SignRequestSummary);
    } else {
      void controller.openSession(item as SessionSummary);
    }
  };

  if (!groupSigningEnabled) {
    return (
      <Stack p="md">
        <Alert
          color="yellow"
          title={t("sharedSign.disabledTitle", "Not enabled")}
        >
          {t(
            "sharedSign.disabledBody",
            "Collaborative signing isn't enabled on this server.",
          )}
        </Alert>
      </Stack>
    );
  }

  if (controller.view === "detail" && controller.detailData) {
    return <SessionDetailPanel data={controller.detailData} />;
  }

  if (controller.view === "request" && controller.requestData) {
    return <SignRequestPanel data={controller.requestData} />;
  }

  if (showCreate) {
    return (
      <Stack p="md" gap="md">
        <Group>
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<ArrowBackIcon sx={{ fontSize: "1rem" }} />}
            onClick={() => setShowCreate(false)}
          >
            {t("sharedSign.backToSessions", "Back to sessions")}
          </Button>
        </Group>
        <CreateSessionFlow
          selectedFiles={selectedFiles}
          selectedUserIds={selectedUserIds}
          onSelectedUserIdsChange={setSelectedUserIds}
          dueDate={dueDate}
          onDueDateChange={setDueDate}
          creating={controller.creating}
          onSubmit={(settings) => {
            void controller
              .createSession(settings, selectedUserIds, dueDate)
              .then((ok) => {
                if (ok) {
                  setShowCreate(false);
                  setSelectedUserIds([]);
                  setDueDate("");
                  changeTab("active");
                }
              });
          }}
        />
      </Stack>
    );
  }

  const filterOptions =
    tab === "active"
      ? [
          { key: "mine", label: t("sharedSign.filterMine", "Mine") },
          { key: "overdue", label: t("sharedSign.filterOverdue", "Overdue") },
        ]
      : [
          { key: "mine", label: t("sharedSign.filterMine", "Mine") },
          { key: "signed", label: t("sharedSign.filterSigned", "Signed") },
          {
            key: "declined",
            label: t("sharedSign.filterDeclined", "Declined"),
          },
        ];

  const applyFilters = (list: SessionItem[]): SessionItem[] => {
    let result = list;
    const now = Date.now();
    if (filters.includes("mine")) {
      result = result.filter((s) => s.itemType === "mySession");
    }
    if (filters.includes("overdue")) {
      // Only sign requests carry a dueDate; owned sessions (SessionSummary) don't
      // expose one in the list payload, so overdue filtering requires a backend change.
      result = result.filter(
        (s) =>
          s.itemType === "signRequest" &&
          Boolean(s.dueDate) &&
          new Date(s.dueDate).getTime() < now,
      );
    }
    if (filters.includes("signed")) {
      result = result.filter(
        (s) => (s as SignRequestSummary).myStatus === "SIGNED",
      );
    }
    if (filters.includes("declined")) {
      result = result.filter(
        (s) => (s as SignRequestSummary).myStatus === "DECLINED",
      );
    }
    return result;
  };

  const items = applyFilters(tab === "active" ? activeItems : completedItems);

  return (
    <Stack p="md" gap="md">
      <SegmentedControl
        fullWidth
        value={tab}
        onChange={(value) => changeTab(value as Tab)}
        data={[
          { label: t("sharedSign.tab.active", "Active"), value: "active" },
          {
            label: t("sharedSign.tab.completed", "Completed"),
            value: "completed",
          },
        ]}
      />

      <Button
        variant="light"
        leftSection={<AddIcon sx={{ fontSize: "1.1rem" }} />}
        onClick={() => setShowCreate(true)}
      >
        {t("sharedSign.newRequest", "Request signatures")}
      </Button>

      <Chip.Group multiple value={filters} onChange={setFilters}>
        <Group gap="xs">
          {filterOptions.map((f) => (
            <Chip key={f.key} value={f.key} size="xs" radius="sm">
              {f.label}
            </Chip>
          ))}
        </Group>
      </Chip.Group>

      {controller.loading && items.length === 0 ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : items.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="xl">
          {tab === "active"
            ? t(
                "sharedSign.empty.active",
                "No pending sign requests or active sessions",
              )
            : t("sharedSign.empty.completed", "No completed sessions")}
        </Text>
      ) : (
        <Stack gap="sm">
          {items.map((item) => {
            const status = statusFor(item);
            const parts: string[] = [];
            if (item.itemType === "signRequest") {
              const req = item as SignRequestSummary;
              parts.push(
                t("sharedSign.fromOwner", "From {{owner}}", {
                  owner: req.ownerUsername ?? t("unknown", "Unknown"),
                }),
              );
              if (req.dueDate) {
                parts.push(
                  t("sharedSign.due", "Due {{date}}", {
                    date: new Date(req.dueDate).toLocaleDateString(),
                  }),
                );
              }
            } else {
              const s = item as SessionSummary;
              parts.push(
                t("sharedSign.createdOn", "Created {{date}}", {
                  date: new Date(s.createdAt).toLocaleDateString(),
                }),
              );
              if (
                s.signedCount !== undefined &&
                s.participantCount !== undefined
              ) {
                parts.push(
                  t("sharedSign.signedCount", "{{signed}}/{{total}} signed", {
                    signed: s.signedCount,
                    total: s.participantCount,
                  }),
                );
              }
            }
            const subtitle = parts.join(" • ");
            return (
              <Paper
                key={`${item.itemType}-${item.sessionId}`}
                withBorder
                radius="md"
                p="sm"
                onClick={() => onItemClick(item)}
                style={{ cursor: "pointer" }}
              >
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Text size="sm" fw={500} truncate>
                      {item.documentName}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {subtitle}
                    </Text>
                  </Stack>
                  <Badge size="sm" color={status.color} variant="light">
                    {status.label}
                  </Badge>
                </Group>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
};

export default SharedSign;
