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
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import auditService, { AuditEvent } from '@app/services/auditService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import { useAuditFilters } from '@app/hooks/useAuditFilters';
import AuditFiltersForm from '@app/components/shared/config/configSections/audit/AuditFiltersForm';

interface AuditEventsTableProps {
  loginEnabled?: boolean;
}

const AuditEventsTable: React.FC<AuditEventsTableProps> = ({ loginEnabled = true }) => {
  const { t } = useTranslation();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

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
                  <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm">
                    {t('audit.events.timestamp', 'Timestamp')}
                  </Table.Th>
                  <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm">
                    {t('audit.events.type', 'Type')}
                  </Table.Th>
                  <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm">
                    {t('audit.events.user', 'User')}
                  </Table.Th>
                  <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm">
                    {t('audit.events.ipAddress', 'IP Address')}
                  </Table.Th>
                  <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm" ta="center">
                    {t('audit.events.actions', 'Actions')}
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {events.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Text ta="center" c="dimmed" py="xl">
                        {t('audit.events.noEvents', 'No events found')}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  events.map((event) => (
                    <Table.Tr key={event.id}>
                      <Table.Td>
                        <Text size="sm">{formatDate(event.timestamp)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{event.eventType}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{event.username}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{event.ipAddress}</Text>
                      </Table.Td>
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
                  ))
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
