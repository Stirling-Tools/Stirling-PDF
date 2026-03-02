import React, { useState, useEffect } from 'react';
import {
  Card,
  Text,
  Group,
  Stack,
  Button,
  Pagination,
  Modal,
  Code,
  Loader,
  Alert,
  Table,
  Badge,
  UnstyledButton,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import auditService, { AuditEvent } from '@app/services/auditService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import { useAuditFilters } from '@app/hooks/useAuditFilters';
import AuditFiltersForm from '@app/components/shared/config/configSections/audit/AuditFiltersForm';
import LocalIcon from '@app/components/shared/LocalIcon';

interface AuditEventsTableProps {
  loginEnabled?: boolean;
  pdfMetadataEnabled?: boolean;
}

const AuditEventsTable: React.FC<AuditEventsTableProps> = ({ loginEnabled = true, pdfMetadataEnabled = false }) => {
  const { t } = useTranslation();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [sortKey, setSortKey] = useState<'timestamp' | 'eventType' | 'username' | 'ipAddress' | null>('timestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Use shared filters hook
  const { filters, eventTypes, users, handleFilterChange, handleClearFilters } = useAuditFilters({
    page: 0,
    pageSize: 20,
  }, loginEnabled);

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
        setError(err instanceof Error ? err.message : 'Failed to load events');
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
          id: '1',
          timestamp: new Date(now.getTime() - 1000 * 60 * 15).toISOString(),
          eventType: 'LOGIN',
          username: 'admin',
          ipAddress: '192.168.1.100',
          details: { message: 'User logged in successfully' },
        },
        {
          id: '2',
          timestamp: new Date(now.getTime() - 1000 * 60 * 30).toISOString(),
          eventType: 'FILE_UPLOAD',
          username: 'user1',
          ipAddress: '192.168.1.101',
          details: { message: 'Uploaded document.pdf' },
        },
        {
          id: '3',
          timestamp: new Date(now.getTime() - 1000 * 60 * 45).toISOString(),
          eventType: 'SETTINGS_CHANGE',
          username: 'admin',
          ipAddress: '192.168.1.100',
          details: { message: 'Modified system settings' },
        },
        {
          id: '4',
          timestamp: new Date(now.getTime() - 1000 * 60 * 60).toISOString(),
          eventType: 'FILE_DOWNLOAD',
          username: 'user2',
          ipAddress: '192.168.1.102',
          details: { message: 'Downloaded report.pdf' },
        },
        {
          id: '5',
          timestamp: new Date(now.getTime() - 1000 * 60 * 90).toISOString(),
          eventType: 'LOGOUT',
          username: 'user1',
          ipAddress: '192.168.1.101',
          details: { message: 'User logged out' },
        },
      ]);
      setTotalPages(1);
      setLoading(false);
    }
  }, [filters, currentPage, loginEnabled]);

  // Wrap filter handlers to reset pagination
  const handleFilterChangeWithReset = (key: keyof typeof filters, value: any) => {
    handleFilterChange(key, value);
    setCurrentPage(1);
  };

  const handleClearFiltersWithReset = () => {
    handleClearFilters();
    setCurrentPage(1);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Sort handling
  const toggleSort = (key: 'timestamp' | 'eventType' | 'username' | 'ipAddress') => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const getSortIcon = (key: 'timestamp' | 'eventType' | 'username' | 'ipAddress') => {
    if (sortKey !== key) return 'unfold-more';
    return sortDir === 'asc' ? 'expand-less' : 'expand-more';
  };

  // Event type colors
  const EVENT_TYPE_COLORS: Record<string, string> = {
    USER_LOGIN: 'green',
    USER_LOGOUT: 'gray',
    USER_FAILED_LOGIN: 'red',
    USER_PROFILE_UPDATE: 'blue',
    SETTINGS_CHANGED: 'orange',
    FILE_OPERATION: 'cyan',
    PDF_PROCESS: 'violet',
    HTTP_REQUEST: 'indigo',
  };

  const getEventTypeColor = (type: string): string => {
    return EVENT_TYPE_COLORS[type] || 'blue';
  };

  // Apply sorting to current events
  const sortedEvents = [...events].sort((a, b) => {
    let aVal: any;
    let bVal: any;

    switch (sortKey) {
      case 'timestamp':
        aVal = new Date(a.timestamp).getTime();
        bVal = new Date(b.timestamp).getTime();
        break;
      case 'eventType':
        aVal = a.eventType;
        bVal = b.eventType;
        break;
      case 'username':
        aVal = a.username;
        bVal = b.username;
        break;
      case 'ipAddress':
        aVal = a.ipAddress;
        bVal = b.ipAddress;
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <Card padding="lg" radius="md" withBorder>
      <Stack gap="md">
        <Text size="lg" fw={600}>
          {t('audit.events.title', 'Audit Events')}
        </Text>

        {/* Filters */}
        <AuditFiltersForm
          filters={filters}
          eventTypes={eventTypes}
          users={users}
          onFilterChange={handleFilterChangeWithReset}
          onClearFilters={handleClearFiltersWithReset}
          disabled={!loginEnabled}
        />

        {/* Table */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Loader size="lg" my="xl" />
          </div>
        ) : error ? (
          <Alert color="red" title={t('audit.events.error', 'Error loading events')}>
            {error}
          </Alert>
        ) : (
          <>
            <div style={{ overflowX: 'auto', overflowY: 'hidden', marginBottom: '1rem' }}>
            <Table
              horizontalSpacing="md"
              verticalSpacing="sm"
              withRowBorders
              highlightOnHover
              style={{
                '--table-border-color': 'var(--mantine-color-gray-3)',
              } as React.CSSProperties}
            >
              <Table.Thead>
                <Table.Tr style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
                  <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)', padding: '0.5rem' }} fz="sm">
                    <UnstyledButton onClick={() => toggleSort('timestamp')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
                      {t('audit.events.timestamp', 'Timestamp')}
                      <LocalIcon icon={getSortIcon('timestamp')} width="0.9rem" height="0.9rem" />
                    </UnstyledButton>
                  </Table.Th>
                  <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)', padding: '0.5rem' }} fz="sm">
                    <UnstyledButton onClick={() => toggleSort('eventType')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
                      {t('audit.events.type', 'Type')}
                      <LocalIcon icon={getSortIcon('eventType')} width="0.9rem" height="0.9rem" />
                    </UnstyledButton>
                  </Table.Th>
                  <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)', padding: '0.5rem' }} fz="sm">
                    <UnstyledButton onClick={() => toggleSort('username')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
                      {t('audit.events.user', 'User')}
                      <LocalIcon icon={getSortIcon('username')} width="0.9rem" height="0.9rem" />
                    </UnstyledButton>
                  </Table.Th>
                  <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm">
                    {t('audit.events.documentName', 'Document Name')}
                  </Table.Th>
                  {pdfMetadataEnabled && (
                    <>
                      <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm">
                        {t('audit.events.author', 'Author')}
                      </Table.Th>
                      <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm">
                        {t('audit.events.fileHash', 'File Hash')}
                      </Table.Th>
                    </>
                  )}
                  <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm" ta="center">
                    {t('audit.events.actions', 'Actions')}
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sortedEvents.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={pdfMetadataEnabled ? 7 : 5}>
                      <Group justify="center" py="xl">
                        <Stack align="center" gap={0}>
                          <LocalIcon icon="search" width="2rem" height="2rem" style={{ opacity: 0.4 }} />
                          <Text ta="center" c="dimmed" size="sm">
                            {t('audit.events.noEvents', 'No events found')}
                          </Text>
                        </Stack>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  sortedEvents.map((event) => {
                    // Extract document name, author, hash from details.files if available
                    let documentName = '';
                    let author = '';
                    let fileHash = '';
                    if (event.details && typeof event.details === 'object') {
                      const details = event.details as Record<string, any>;
                      const files = details.files;
                      if (Array.isArray(files) && files.length > 0) {
                        const firstFile = files[0] as Record<string, any>;
                        documentName = firstFile.name || '';
                        if (pdfMetadataEnabled) {
                          author = firstFile.pdfAuthor || '';
                          fileHash = firstFile.fileHash ? firstFile.fileHash.substring(0, 16) + '...' : '';
                        }
                      }
                    }

                    return (
                      <Table.Tr key={event.id}>
                        <Table.Td>
                          <Text size="sm">{formatDate(event.timestamp)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" size="sm" color={getEventTypeColor(event.eventType)}>
                            {event.eventType}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{event.username}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" title={documentName}>
                            {documentName || '—'}
                          </Text>
                        </Table.Td>
                        {pdfMetadataEnabled && (
                          <>
                            <Table.Td>
                              <Text size="sm">{author}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" title={fileHash} style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                {fileHash}
                              </Text>
                            </Table.Td>
                          </>
                        )}
                        <Table.Td ta="center">
                          <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => setSelectedEvent(event)}
                            disabled={!loginEnabled}
                          >
                            {t('audit.events.viewDetails', 'View Details')}
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })
                )}
              </Table.Tbody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <Group justify="center" mt="md">
                <Pagination
                  value={currentPage}
                  onChange={setCurrentPage}
                  total={totalPages}
                />
              </Group>
            )}
            </div>
          </>
        )}
      </Stack>

      {/* Event Details Modal */}
      <Modal
        opened={selectedEvent !== null}
        onClose={() => setSelectedEvent(null)}
        title={t('audit.events.eventDetails', 'Event Details')}
        size="lg"
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      >
        {selectedEvent && (
          <Stack gap="md">
            <div>
              <Text size="sm" fw={600} c="dimmed">
                {t('audit.events.timestamp', 'Timestamp')}
              </Text>
              <Text size="sm">{formatDate(selectedEvent.timestamp)}</Text>
            </div>
            <div>
              <Text size="sm" fw={600} c="dimmed">
                {t('audit.events.type', 'Type')}
              </Text>
              <Text size="sm">{selectedEvent.eventType}</Text>
            </div>
            <div>
              <Text size="sm" fw={600} c="dimmed">
                {t('audit.events.user', 'User')}
              </Text>
              <Text size="sm">{selectedEvent.username}</Text>
            </div>
            <div>
              <Text size="sm" fw={600} c="dimmed">
                {t('audit.events.ipAddress', 'IP Address')}
              </Text>
              <Text size="sm">{selectedEvent.ipAddress}</Text>
            </div>
            <div>
              <Text size="sm" fw={600} c="dimmed">
                {t('audit.events.details', 'Details')}
              </Text>
              <Code block mah={300} style={{ overflow: 'auto' }}>
                {JSON.stringify(selectedEvent.details, null, 2)}
              </Code>
            </div>
          </Stack>
        )}
      </Modal>
    </Card>
  );
};

export default AuditEventsTable;
