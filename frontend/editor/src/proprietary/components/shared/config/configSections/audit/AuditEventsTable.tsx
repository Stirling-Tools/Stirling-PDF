import React, { useState, useEffect, type ReactNode } from "react";
import {
  Card,
  Text,
  Group,
  Stack,
  Pagination,
  Modal,
  Code,
  Loader,
  Alert,
  Table,
  Badge,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import auditService, {
  AuditEvent,
  AuditFilters,
} from "@app/services/auditService";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import { useAuditFilters } from "@app/hooks/useAuditFilters";
import AuditFiltersForm from "@app/components/shared/config/configSections/audit/AuditFiltersForm";
import { Icon, type IconName } from "@app/ui/Icon";

interface AuditEventsTableProps {
  loginEnabled?: boolean;
  captureFileHash?: boolean;
  capturePdfAuthor?: boolean;
}

type SortKey = "timestamp" | "eventType" | "username" | "ipAddress";

const EVENT_TYPE_COLORS: Record<string, string> = {
  USER_LOGIN: "green",
  USER_LOGOUT: "gray",
  USER_FAILED_LOGIN: "red",
  USER_PROFILE_UPDATE: "blue",
  SETTINGS_CHANGED: "orange",
  FILE_OPERATION: "cyan",
  PDF_PROCESS: "violet",
  UI_DATA: "gray",
  HTTP_REQUEST: "indigo",
};

function getEventTypeColor(type: string): string {
  return EVENT_TYPE_COLORS[type] || "blue";
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

interface EventFileInfo {
  documentName: string;
  author: string;
  fileHash: string;
}

/** Reads the first file in an event's details; author and hash only when a column shows them. */
function getEventFileInfo(
  event: AuditEvent,
  withAuthorAndHash: boolean,
): EventFileInfo {
  const info = { documentName: "", author: "", fileHash: "" };
  if (!event.details || typeof event.details !== "object") return info;
  const files = (event.details as Record<string, unknown>).files;
  if (!Array.isArray(files) || files.length === 0) return info;
  const firstFile = files[0] as Record<string, unknown>;
  info.documentName = typeof firstFile.name === "string" ? firstFile.name : "";
  if (withAuthorAndHash) {
    info.author =
      typeof firstFile.pdfAuthor === "string" ? firstFile.pdfAuthor : "";
    info.fileHash =
      typeof firstFile.fileHash === "string"
        ? firstFile.fileHash.substring(0, 16) + "..."
        : "";
  }
  return info;
}

interface SortableHeaderProps {
  label: string;
  icon: IconName;
  onSort: () => void;
}

function SortableHeader({ label, icon, onSort }: SortableHeaderProps) {
  return (
    <Table.Th
      style={{
        fontWeight: 600,
        color: "var(--mantine-color-gray-7)",
        padding: "0.5rem",
      }}
      fz="sm"
    >
      <Button
        type="button"
        variant="tertiary"
        hover={false}
        onClick={onSort}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {label}
        <Icon name={icon} size="0.9rem" />
      </Button>
    </Table.Th>
  );
}

function ColumnHeader({
  children,
  centered = false,
}: {
  children: ReactNode;
  centered?: boolean;
}) {
  return (
    <Table.Th
      style={{
        fontWeight: 600,
        color: "var(--mantine-color-gray-7)",
      }}
      fz="sm"
      ta={centered ? "center" : undefined}
    >
      {children}
    </Table.Th>
  );
}

interface EventColumns {
  showAuthor: boolean;
  showFileHash: boolean;
}

interface EventsTableHeaderProps extends EventColumns {
  getSortIcon: (key: SortKey) => IconName;
  onSort: (key: SortKey) => void;
}

function EventsTableHeader({
  showAuthor,
  showFileHash,
  getSortIcon,
  onSort,
}: EventsTableHeaderProps) {
  const { t } = useTranslation();
  return (
    <Table.Thead>
      <Table.Tr style={{ backgroundColor: "var(--mantine-color-gray-0)" }}>
        <SortableHeader
          label={t("audit.events.timestamp", "Timestamp")}
          icon={getSortIcon("timestamp")}
          onSort={() => onSort("timestamp")}
        />
        <SortableHeader
          label={t("audit.events.type", "Type")}
          icon={getSortIcon("eventType")}
          onSort={() => onSort("eventType")}
        />
        <SortableHeader
          label={t("audit.events.user", "User")}
          icon={getSortIcon("username")}
          onSort={() => onSort("username")}
        />
        <ColumnHeader>
          {t("audit.events.documentName", "Document Name")}
        </ColumnHeader>
        {showAuthor && (
          <ColumnHeader>{t("audit.events.author", "Author")}</ColumnHeader>
        )}
        {showFileHash && (
          <ColumnHeader>{t("audit.events.fileHash", "File Hash")}</ColumnHeader>
        )}
        <ColumnHeader centered>
          {t("audit.events.actions", "Actions")}
        </ColumnHeader>
      </Table.Tr>
    </Table.Thead>
  );
}

function NoEventsRow({ colSpan }: { colSpan: number }) {
  const { t } = useTranslation();
  return (
    <Table.Tr>
      <Table.Td colSpan={colSpan}>
        <Group justify="center" py="xl">
          <Stack align="center" gap={0}>
            <Icon name="search" size="2rem" style={{ opacity: 0.4 }} />
            <Text ta="center" c="dimmed" size="sm">
              {t("audit.events.noEvents", "No events found")}
            </Text>
          </Stack>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

interface AuditEventRowProps extends EventColumns {
  event: AuditEvent;
  loginEnabled: boolean;
  onViewDetails: () => void;
}

function AuditEventRow({
  event,
  showAuthor,
  showFileHash,
  loginEnabled,
  onViewDetails,
}: AuditEventRowProps) {
  const { t } = useTranslation();
  const { documentName, author, fileHash } = getEventFileInfo(
    event,
    showAuthor || showFileHash,
  );
  return (
    <Table.Tr>
      <Table.Td>
        <Text size="sm">{formatDate(event.timestamp)}</Text>
      </Table.Td>
      <Table.Td>
        <Badge
          variant="light"
          size="sm"
          color={getEventTypeColor(event.eventType)}
        >
          {event.eventType}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{event.username}</Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm" title={documentName}>
          {documentName || "—"}
        </Text>
      </Table.Td>
      {showAuthor && (
        <Table.Td>
          <Text size="sm">{author}</Text>
        </Table.Td>
      )}
      {showFileHash && (
        <Table.Td>
          <Text
            size="sm"
            title={fileHash}
            style={{ fontFamily: "monospace", fontSize: "0.75rem" }}
          >
            {fileHash}
          </Text>
        </Table.Td>
      )}
      <Table.Td ta="center">
        <Button
          variant="tertiary"
          size="sm"
          onClick={onViewDetails}
          disabled={!loginEnabled}
        >
          {t("audit.events.viewDetails", "View Details")}
        </Button>
      </Table.Td>
    </Table.Tr>
  );
}

interface EventRowsProps extends EventColumns {
  events: AuditEvent[];
  loginEnabled: boolean;
  onViewDetails: (event: AuditEvent) => void;
}

function EventRows({ events, onViewDetails, ...row }: EventRowsProps) {
  if (events.length === 0) {
    const colSpan = 5 + (row.showAuthor ? 1 : 0) + (row.showFileHash ? 1 : 0);
    return <NoEventsRow colSpan={colSpan} />;
  }
  return (
    <>
      {events.map((event) => (
        <AuditEventRow
          key={event.id}
          event={event}
          onViewDetails={() => onViewDetails(event)}
          {...row}
        />
      ))}
    </>
  );
}

interface EventsPaginationProps {
  page: number;
  total: number;
  onChange: (page: number) => void;
}

function EventsPagination({ page, total, onChange }: EventsPaginationProps) {
  if (total <= 1) return null;
  return (
    <Group justify="center" mt="md">
      <Pagination value={page} onChange={onChange} total={total} />
    </Group>
  );
}

interface AuditEventsResultsProps
  extends EventRowsProps, Omit<EventsTableHeaderProps, keyof EventColumns> {
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function AuditEventsResults({
  loading,
  error,
  page,
  totalPages,
  onPageChange,
  getSortIcon,
  onSort,
  ...rows
}: AuditEventsResultsProps) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Loader size="lg" my="xl" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert
        color="red"
        title={t("audit.events.error", "Error loading events")}
      >
        {error}
      </Alert>
    );
  }
  return (
    <div
      style={{
        overflowX: "auto",
        overflowY: "hidden",
        marginBottom: "1rem",
      }}
    >
      <Table
        horizontalSpacing="md"
        verticalSpacing="sm"
        withRowBorders
        highlightOnHover
        style={{
          "--table-border-color": "var(--mantine-color-gray-3)",
        }}
      >
        <EventsTableHeader
          showAuthor={rows.showAuthor}
          showFileHash={rows.showFileHash}
          getSortIcon={getSortIcon}
          onSort={onSort}
        />
        <Table.Tbody>
          <EventRows {...rows} />
        </Table.Tbody>
      </Table>
      <EventsPagination
        page={page}
        total={totalPages}
        onChange={onPageChange}
      />
    </div>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Text size="sm" fw={600} c="dimmed">
        {label}
      </Text>
      {children}
    </div>
  );
}

function EventDetails({ event }: { event: AuditEvent | null }) {
  const { t } = useTranslation();
  if (!event) return null;
  return (
    <Stack gap="md">
      <DetailField label={t("audit.events.timestamp", "Timestamp")}>
        <Text size="sm">{formatDate(event.timestamp)}</Text>
      </DetailField>
      <DetailField label={t("audit.events.type", "Type")}>
        <Text size="sm">{event.eventType}</Text>
      </DetailField>
      <DetailField label={t("audit.events.user", "User")}>
        <Text size="sm">{event.username}</Text>
      </DetailField>
      <DetailField label={t("audit.events.ipAddress", "IP Address")}>
        <Text size="sm">{event.ipAddress}</Text>
      </DetailField>
      <DetailField label={t("audit.events.details", "Details")}>
        <Code block mah={300} style={{ overflow: "auto" }}>
          {JSON.stringify(event.details, null, 2)}
        </Code>
      </DetailField>
    </Stack>
  );
}

const AuditEventsTable: React.FC<AuditEventsTableProps> = ({
  loginEnabled = true,
  captureFileHash = false,
  capturePdfAuthor = false,
}) => {
  const { t } = useTranslation();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>("timestamp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const showAuthor = capturePdfAuthor;
  const showFileHash = captureFileHash;

  // Use shared filters hook
  const { filters, eventTypes, users, handleFilterChange, handleClearFilters } =
    useAuditFilters(
      {
        page: 0,
        pageSize: 20,
      },
      loginEnabled,
    );

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await auditService.getEvents({
          ...filters,
          page: currentPage - 1,
        });
        setEvents(response.events);
        setTotalPages(response.totalPages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load events");
      } finally {
        setLoading(false);
      }
    };

    if (loginEnabled) {
      fetchEvents();
    } else {
      // Provide example audit events when login is disabled
      const now = new Date();
      setEvents([
        {
          id: "1",
          timestamp: new Date(now.getTime() - 1000 * 60 * 15).toISOString(),
          eventType: "LOGIN",
          username: "admin",
          ipAddress: "192.168.1.100",
          details: { message: "User logged in successfully" },
        },
        {
          id: "2",
          timestamp: new Date(now.getTime() - 1000 * 60 * 30).toISOString(),
          eventType: "FILE_UPLOAD",
          username: "user1",
          ipAddress: "192.168.1.101",
          details: { message: "Uploaded document.pdf" },
        },
        {
          id: "3",
          timestamp: new Date(now.getTime() - 1000 * 60 * 45).toISOString(),
          eventType: "SETTINGS_CHANGE",
          username: "admin",
          ipAddress: "192.168.1.100",
          details: { message: "Modified system settings" },
        },
        {
          id: "4",
          timestamp: new Date(now.getTime() - 1000 * 60 * 60).toISOString(),
          eventType: "FILE_DOWNLOAD",
          username: "user2",
          ipAddress: "192.168.1.102",
          details: { message: "Downloaded report.pdf" },
        },
        {
          id: "5",
          timestamp: new Date(now.getTime() - 1000 * 60 * 90).toISOString(),
          eventType: "LOGOUT",
          username: "user1",
          ipAddress: "192.168.1.101",
          details: { message: "User logged out" },
        },
      ]);
      setTotalPages(1);
      setLoading(false);
    }
  }, [filters, currentPage, loginEnabled]);

  // Wrap filter handlers to reset pagination
  const handleFilterChangeWithReset = (
    key: keyof AuditFilters,
    value: AuditFilters[keyof AuditFilters],
  ) => {
    handleFilterChange(key, value);
    setCurrentPage(1);
  };

  const handleClearFiltersWithReset = () => {
    handleClearFilters();
    setCurrentPage(1);
  };

  // Sort handling
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getSortIcon = (key: SortKey): IconName => {
    if (sortKey !== key) return "chevrons-up-down";
    return sortDir === "asc" ? "chevron-up" : "chevron-down";
  };

  // Apply sorting to current events
  const sortedEvents = [...events].sort((a, b) => {
    let aVal: string | number | undefined;
    let bVal: string | number | undefined;

    switch (sortKey) {
      case "timestamp":
        aVal = new Date(a.timestamp).getTime();
        bVal = new Date(b.timestamp).getTime();
        break;
      case "eventType":
        aVal = a.eventType;
        bVal = b.eventType;
        break;
      case "username":
        aVal = a.username;
        bVal = b.username;
        break;
      case "ipAddress":
        aVal = a.ipAddress;
        bVal = b.ipAddress;
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <Card padding="lg" radius="md" withBorder>
      <Stack gap="md">
        <Text size="lg" fw={600}>
          {t("audit.events.title", "Audit Events")}
        </Text>

        <AuditFiltersForm
          filters={filters}
          eventTypes={eventTypes}
          users={users}
          onFilterChange={handleFilterChangeWithReset}
          onClearFilters={handleClearFiltersWithReset}
          disabled={!loginEnabled}
        />

        <AuditEventsResults
          loading={loading}
          error={error}
          events={sortedEvents}
          showAuthor={showAuthor}
          showFileHash={showFileHash}
          loginEnabled={loginEnabled}
          getSortIcon={getSortIcon}
          onSort={toggleSort}
          onViewDetails={setSelectedEvent}
          page={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </Stack>

      <Modal
        opened={selectedEvent !== null}
        onClose={() => setSelectedEvent(null)}
        title={t("audit.events.eventDetails", "Event Details")}
        size="lg"
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      >
        <EventDetails event={selectedEvent} />
      </Modal>
    </Card>
  );
};

export default AuditEventsTable;
