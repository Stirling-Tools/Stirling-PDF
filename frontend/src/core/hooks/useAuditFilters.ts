import { useState, useEffect } from 'react';
import auditService, { AuditFilters } from '@app/services/auditService';

/**
 * Shared hook for managing audit filters across components
 */
export function useAuditFilters(initialFilters: Partial<AuditFilters> = {}, loginEnabled: boolean = true) {
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [filters, setFilters] = useState<AuditFilters>({
    eventType: undefined,
    username: undefined,
    startDate: undefined,
    endDate: undefined,
    ...initialFilters,
  });

  // Fetch metadata on mount
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
        console.error('Failed to fetch audit metadata:', err);
      }
    };

    if (loginEnabled) {
      fetchMetadata();
    }
  }, [loginEnabled]);

  const handleFilterChange = (key: keyof AuditFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setFilters({
      eventType: undefined,
      username: undefined,
      startDate: undefined,
      endDate: undefined,
      page: initialFilters.page,
      pageSize: initialFilters.pageSize,
    });
  };

  return {
    filters,
    setFilters,
    eventTypes,
    users,
    handleFilterChange,
    handleClearFilters,
  };
}
