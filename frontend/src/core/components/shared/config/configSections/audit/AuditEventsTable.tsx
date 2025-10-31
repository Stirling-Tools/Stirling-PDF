import React, { useState, useEffect } from 'react';
import {
  Card,
  Text,
  Group,
  Stack,
  Select,
  TextInput,
  Button,
  Pagination,
  Modal,
  Code,
  Loader,
  Alert,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useTranslation } from 'react-i18next';
import auditService, { AuditEvent, AuditFilters } from '@app/services/auditService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';

interface AuditEventsTableProps {}

const AuditEventsTable: React.FC<AuditEventsTableProps> = () => {
  const { t } = useTranslation();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [users, setUsers] = useState<string[]>([]);

  // Filters
  const [filters, setFilters] = useState<AuditFilters>({
    eventType: undefined,
    username: undefined,
    startDate: undefined,
    endDate: undefined,
    page: 0,
    pageSize: 20,
  });

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [types, usersList] = await Promise.all([
          auditService.getEventTypes(),
          auditService.getUsers(),
        ]);
        setEventTypes(types);
        setUsers(usersList);
      } catch (err) {
        console.error('Failed to fetch metadata:', err);
      }
    };

    fetchMetadata();
  }, []);

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

    fetchEvents();
  }, [filters, currentPage]);

  const handleFilterChange = (key: keyof AuditFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setFilters({
      eventType: undefined,
      username: undefined,
      startDate: undefined,
      endDate: undefined,
      page: 0,
      pageSize: 20,
    });
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
        <Group>
          <Select
            placeholder={t('audit.events.filterByType', 'Filter by type')}
            data={eventTypes.map((type) => ({ value: type, label: type }))}
            value={filters.eventType}
            onChange={(value) => handleFilterChange('eventType', value || undefined)}
            clearable
            style={{ flex: 1, minWidth: 200 }}
            comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
          />
          <Select
            placeholder={t('audit.events.filterByUser', 'Filter by user')}
            data={users.map((user) => ({ value: user, label: user }))}
            value={filters.username}
            onChange={(value) => handleFilterChange('username', value || undefined)}
            clearable
            searchable
            style={{ flex: 1, minWidth: 200 }}
            comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
          />
          <DateInput
            placeholder={t('audit.events.startDate', 'Start date')}
            value={filters.startDate ? new Date(filters.startDate) : null}
            onChange={(value: string | null) =>
              handleFilterChange('startDate', value ?? undefined)
            }
            clearable
            style={{ flex: 1, minWidth: 150 }}
            popoverProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
          />
          <DateInput
            placeholder={t('audit.events.endDate', 'End date')}
            value={filters.endDate ? new Date(filters.endDate) : null}
            onChange={(value: string | null) =>
              handleFilterChange('endDate', value ?? undefined)
            }
            clearable
            style={{ flex: 1, minWidth: 150 }}
            popoverProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
          />
          <Button variant="outline" onClick={handleClearFilters}>
            {t('audit.events.clearFilters', 'Clear')}
          </Button>
        </Group>

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
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '2px solid var(--mantine-color-gray-3)',
                    }}
                  >
                    <th style={{ textAlign: 'left' }}>
                      {t('audit.events.timestamp', 'Timestamp')}
                    </th>
                    <th style={{ textAlign: 'left' }}>
                      {t('audit.events.type', 'Type')}
                    </th>
                    <th style={{ textAlign: 'left' }}>
                      {t('audit.events.user', 'User')}
                    </th>
                    <th style={{ textAlign: 'left' }}>
                      {t('audit.events.ipAddress', 'IP Address')}
                    </th>
                    <th style={{ textAlign: 'center' }}>
                      {t('audit.events.actions', 'Actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                        <Text c="dimmed">{t('audit.events.noEvents', 'No events found')}</Text>
                      </td>
                    </tr>
                  ) : (
                    events.map((event) => (
                      <tr
                        key={event.id}
                        style={{
                          borderBottom: '1px solid var(--mantine-color-gray-2)',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor =
                            'var(--mantine-color-gray-0)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <td>
                          <Text size="sm">{formatDate(event.timestamp)}</Text>
                        </td>
                        <td>
                          <Text size="sm">{event.eventType}</Text>
                        </td>
                        <td>
                          <Text size="sm">{event.username}</Text>
                        </td>
                        <td>
                          <Text size="sm">{event.ipAddress}</Text>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => setSelectedEvent(event)}
                          >
                            {t('audit.events.viewDetails', 'View Details')}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

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
