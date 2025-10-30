import apiClient from '@app/services/apiClient';

export interface EndpointStatistic {
  endpoint: string;
  visits: number;
  percentage: number;
}

export interface EndpointStatisticsResponse {
  endpoints: EndpointStatistic[];
  totalEndpoints: number;
  totalVisits: number;
}

export interface UsageChartData {
  labels: string[];
  values: number[];
}

const usageAnalyticsService = {
  /**
   * Get endpoint statistics
   */
  async getEndpointStatistics(
    limit?: number,
    dataType: 'all' | 'api' | 'ui' = 'all'
  ): Promise<EndpointStatisticsResponse> {
    const params: Record<string, any> = {};

    if (limit !== undefined) {
      params.limit = limit;
    }

    if (dataType !== 'all') {
      params.dataType = dataType;
    }

    const response = await apiClient.get<EndpointStatisticsResponse>(
      '/api/v1/proprietary/ui-data/usage-endpoint-statistics',
      { params }
    );
    return response.data;
  },

  /**
   * Get chart data for endpoint usage
   */
  async getChartData(
    limit?: number,
    dataType: 'all' | 'api' | 'ui' = 'all'
  ): Promise<UsageChartData> {
    const stats = await this.getEndpointStatistics(limit, dataType);

    return {
      labels: stats.endpoints.map((e) => e.endpoint),
      values: stats.endpoints.map((e) => e.visits),
    };
  },
};

export default usageAnalyticsService;
