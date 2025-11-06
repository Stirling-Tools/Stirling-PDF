import apiClient from '@app/services/apiClient';

export interface AuditSystemStatus {
  enabled: boolean;
  level: string;
  retentionDays: number;
  totalEvents: number;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: string;
  username: string;
  ipAddress: string;
  details: Record<string, any>;
}

export interface AuditEventsResponse {
  events: AuditEvent[];
  totalEvents: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ChartData {
  labels: string[];
  values: number[];
}

export interface AuditChartsData {
  eventsByType: ChartData;
  eventsByUser: ChartData;
  eventsOverTime: ChartData;
}

export interface AuditFilters {
  eventType?: string;
  username?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

const auditService = {
  /**
   * Get audit system status
   */
  async getSystemStatus(): Promise<AuditSystemStatus> {
    const response = await apiClient.get<any>('/api/v1/proprietary/ui-data/audit-dashboard');
    const data = response.data;

    // Map V1 response to expected format
    return {
      enabled: data.auditEnabled,
      level: data.auditLevel,
      retentionDays: data.retentionDays,
      totalEvents: 0, // Will be fetched separately
    };
  },

  /**
   * Get audit events with pagination and filters
   */
  async getEvents(filters: AuditFilters = {}): Promise<AuditEventsResponse> {
    const response = await apiClient.get<AuditEventsResponse>('/api/v1/proprietary/ui-data/audit-events', {
      params: filters,
    });
    return response.data;
  },

  /**
   * Get chart data for dashboard
   */
  async getChartsData(timePeriod: 'day' | 'week' | 'month' = 'week'): Promise<AuditChartsData> {
    const response = await apiClient.get<AuditChartsData>('/api/v1/proprietary/ui-data/audit-charts', {
      params: { period: timePeriod },
    });
    return response.data;
  },

  /**
   * Export audit data
   */
  async exportData(
    format: 'csv' | 'json',
    filters: AuditFilters = {}
  ): Promise<Blob> {
    const response = await apiClient.get('/api/v1/proprietary/ui-data/audit-export', {
      params: { format, ...filters },
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Get available event types for filtering
   */
  async getEventTypes(): Promise<string[]> {
    const response = await apiClient.get<string[]>('/api/v1/proprietary/ui-data/audit-event-types');
    return response.data;
  },

  /**
   * Get list of users for filtering
   */
  async getUsers(): Promise<string[]> {
    const response = await apiClient.get<string[]>('/api/v1/proprietary/ui-data/audit-users');
    return response.data;
  },
};

export default auditService;
