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
    includeHome: boolean = true,
    includeLogin: boolean = true
  ): Promise<EndpointStatisticsResponse> {
    const params: Record<string, any> = {
      includeHome,
      includeLogin,
    };

    if (limit !== undefined) {
      params.limit = limit;
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
    includeHome: boolean = true,
    includeLogin: boolean = true
  ): Promise<UsageChartData> {
    const stats = await this.getEndpointStatistics(limit, includeHome, includeLogin);

    return {
      labels: stats.endpoints.map((e) => e.endpoint),
      values: stats.endpoints.map((e) => e.visits),
    };
  },
};

export default usageAnalyticsService;
