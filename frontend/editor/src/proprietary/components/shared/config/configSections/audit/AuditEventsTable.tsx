import React, { useState, useEffect, useMemo, type ReactNode } from "react";
import {
  Card,
  Text,
  Group,
  Stack,
  Pagination,
  Modal,
  Code,
  Alert,
} from "@mantine/core";
import { column, DataTable, type DataTableColumn } from "@app/ui";
import { type StatusTone } from "@app/ui/StatusBadge";
import { useTranslation } from "react-i18next";
import auditService, {
  AuditEvent,
  AuditFilters,
} from "@app/services/auditService";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import { useAuditFilters } from "@app/hooks/useAuditFilters";
import AuditFiltersForm from "@app/components/shared/config/configSections/audit/AuditFiltersForm";

interface AuditEventsTableProps {
  loginEnabled?: boolean;
  captureFileHash?: boolean;
  capturePdfAuthor?: boolean;
}

const EVENT_TYPE_TONES: Record<string, StatusTone> = {
  USER_LOGIN: "success",
  USER_LOGOUT: "neutral",
  USER_FAILED_LOGIN: "danger",
  USER_PROFILE_UPDATE: "info",
  SETTINGS_CHANGED: "warning",
  FILE_OPERATION: "info",
  PDF_PROCESS: "purple",
  UI_DATA: "neutral",
  HTTP_REQUEST: "neutral",
};

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
  const files = event.details.files;
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

interface AuditEventsResultsProps {
  loading: boolean;
  error: string | null;
  events: AuditEvent[];
  showAuthor: boolean;
  showFileHash: boolean;
  loginEnabled: boolean;
  onViewDetails: (event: AuditEvent) => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function AuditEventsResults({
  loading,
  error,
  events,
  showAuthor,
  showFileHash,
  loginEnabled,
  onViewDetails,
  page,
  totalPages,
  onPageChange,
}: AuditEventsResultsProps) {
  const { t } = useTranslation();

  const columns = useMemo<DataTableColumn<AuditEvent>[]>(() => {
    const cols: DataTableColumn<AuditEvent>[] = [
      column.mono({
        key: "timestamp",
        header: t("audit.events.timestamp", "Timestamp"),
        sortable: true,
        get: (e) => formatDate(e.timestamp),
        sortBy: (e) => new Date(e.timestamp).getTime(),
      }),
      column.badge({
        key: "eventType",
        header: t("audit.events.type", "Type"),
        sortable: true,
        get: (e) => ({
          tone: EVENT_TYPE_TONES[e.eventType] ?? "info",
          label: e.eventType,
        }),
      }),
      column.text({
        key: "username",
        header: t("audit.events.user", "User"),
        sortable: true,
        get: (e) => e.username || "-",
      }),
      column.text({
        key: "documentName",
        header: t("audit.events.documentName", "Document Name"),
        sortable: true,
        get: (e) => getEventFileInfo(e, false).documentName || "—",
      }),
    ];

    if (showAuthor) {
      cols.push(
        column.text({
          key: "author",
          header: t("audit.events.author", "Author"),
          sortable: true,
          get: (e) => getEventFileInfo(e, true).author || "-",
        }),
      );
    }

    if (showFileHash) {
      cols.push(
        column.mono({
          key: "fileHash",
          header: t("audit.events.fileHash", "File Hash"),
          sortable: true,
          get: (e) => getEventFileInfo(e, true).fileHash || "-",
        }),
      );
    }

    cols.push(
      column.actions({
        key: "actions",
        header: t("audit.events.actions", "Actions"),
        get: (e) => [
          {
            label: t("audit.events.viewDetails", "View Details"),
            disabled: !loginEnabled,
            onClick: () => onViewDetails(e),
          },
        ],
      }),
    );

    return cols;
  }, [t, showAuthor, showFileHash, loginEnabled, onViewDetails]);

  return (
    <div>
      <DataTable
        columns={columns}
        rows={events}
        rowKey={(e) => String(e.id)}
        loading={loading}
        error={
          error ? (
            <Alert
              color="red"
              title={t("audit.events.error", "Error loading events")}
            >
              {error}
            </Alert>
          ) : undefined
        }
        empty={t("audit.events.noEvents", "No events found")}
        defaultSort={{ key: "timestamp", direction: "desc" }}
      />
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
        setError(
          err instanceof Error
            ? err.message
            : t("audit.events.loadFailed", "Failed to load events"),
        );
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
          events={events}
          showAuthor={showAuthor}
          showFileHash={showFileHash}
          loginEnabled={loginEnabled}
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
