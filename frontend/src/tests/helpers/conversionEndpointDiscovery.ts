/**
 * Conversion Endpoint Discovery for E2E Testing
 * 
 * Uses the backend's endpoint configuration API to discover available conversions
 */

import { useMultipleEndpointsEnabled } from '../../hooks/useEndpointConfig';

export interface ConversionEndpoint {
  endpoint: string;
  fromFormat: string;
  toFormat: string;
  description: string;
  apiPath: string;
}

// Complete list of conversion endpoints based on EndpointConfiguration.java
const ALL_CONVERSION_ENDPOINTS: ConversionEndpoint[] = [
  {
    endpoint: 'pdf-to-img',
    fromFormat: 'pdf',
    toFormat: 'image',
    description: 'Convert PDF to images (PNG, JPG, GIF, etc.)',
    apiPath: '/api/v1/convert/pdf/img'
  },
  {
    endpoint: 'img-to-pdf',
    fromFormat: 'image',
    toFormat: 'pdf',
    description: 'Convert images to PDF',
    apiPath: '/api/v1/convert/img/pdf'
  },
  {
    endpoint: 'pdf-to-pdfa',
    fromFormat: 'pdf',
    toFormat: 'pdfa',
    description: 'Convert PDF to PDF/A',
    apiPath: '/api/v1/convert/pdf/pdfa'
  },
  {
    endpoint: 'file-to-pdf',
    fromFormat: 'office',
    toFormat: 'pdf',
    description: 'Convert office files to PDF',
    apiPath: '/api/v1/convert/file/pdf'
  },
  {
    endpoint: 'pdf-to-word',
    fromFormat: 'pdf',
    toFormat: 'docx',
    description: 'Convert PDF to Word document',
    apiPath: '/api/v1/convert/pdf/word'
  },
  {
    endpoint: 'pdf-to-presentation',
    fromFormat: 'pdf',
    toFormat: 'pptx',
    description: 'Convert PDF to PowerPoint presentation',
    apiPath: '/api/v1/convert/pdf/presentation'
  },
  {
    endpoint: 'pdf-to-text',
    fromFormat: 'pdf',
    toFormat: 'txt',
    description: 'Convert PDF to plain text',
    apiPath: '/api/v1/convert/pdf/text'
  },
  {
    endpoint: 'pdf-to-html',
    fromFormat: 'pdf',
    toFormat: 'html',
    description: 'Convert PDF to HTML',
    apiPath: '/api/v1/convert/pdf/html'
  },
  {
    endpoint: 'pdf-to-xml',
    fromFormat: 'pdf',
    toFormat: 'xml',
    description: 'Convert PDF to XML',
    apiPath: '/api/v1/convert/pdf/xml'
  },
  {
    endpoint: 'html-to-pdf',
    fromFormat: 'html',
    toFormat: 'pdf',
    description: 'Convert HTML to PDF',
    apiPath: '/api/v1/convert/html/pdf'
  },
  {
    endpoint: 'url-to-pdf',
    fromFormat: 'url',
    toFormat: 'pdf',
    description: 'Convert web page to PDF',
    apiPath: '/api/v1/convert/url/pdf'
  },
  {
    endpoint: 'markdown-to-pdf',
    fromFormat: 'md',
    toFormat: 'pdf',
    description: 'Convert Markdown to PDF',
    apiPath: '/api/v1/convert/markdown/pdf'
  },
  {
    endpoint: 'pdf-to-csv',
    fromFormat: 'pdf',
    toFormat: 'csv',
    description: 'Extract CSV data from PDF',
    apiPath: '/api/v1/convert/pdf/csv'
  },
  {
    endpoint: 'pdf-to-markdown',
    fromFormat: 'pdf',
    toFormat: 'md',
    description: 'Convert PDF to Markdown',
    apiPath: '/api/v1/convert/pdf/markdown'
  },
  {
    endpoint: 'eml-to-pdf',
    fromFormat: 'eml',
    toFormat: 'pdf',
    description: 'Convert email (EML) to PDF',
    apiPath: '/api/v1/convert/eml/pdf'
  }
];

export class ConversionEndpointDiscovery {
  private baseUrl: string;
  private cache: Map<string, boolean> | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(baseUrl: string = process.env.BACKEND_URL || 'http://localhost:8080') {
    this.baseUrl = baseUrl;
  }

  /**
   * Get all available conversion endpoints by checking with backend
   */
  async getAvailableConversions(): Promise<ConversionEndpoint[]> {
    const endpointStatuses = await this.getEndpointStatuses();
    
    return ALL_CONVERSION_ENDPOINTS.filter(conversion => 
      endpointStatuses.get(conversion.endpoint) === true
    );
  }

  /**
   * Get all unavailable conversion endpoints
   */
  async getUnavailableConversions(): Promise<ConversionEndpoint[]> {
    const endpointStatuses = await this.getEndpointStatuses();
    
    return ALL_CONVERSION_ENDPOINTS.filter(conversion => 
      endpointStatuses.get(conversion.endpoint) === false
    );
  }

  /**
   * Check if a specific conversion is available
   */
  async isConversionAvailable(endpoint: string): Promise<boolean> {
    const endpointStatuses = await this.getEndpointStatuses();
    return endpointStatuses.get(endpoint) === true;
  }

  /**
   * Get available conversions grouped by source format
   */
  async getConversionsByFormat(): Promise<Record<string, ConversionEndpoint[]>> {
    const availableConversions = await this.getAvailableConversions();
    
    const grouped: Record<string, ConversionEndpoint[]> = {};
    
    availableConversions.forEach(conversion => {
      if (!grouped[conversion.fromFormat]) {
        grouped[conversion.fromFormat] = [];
      }
      grouped[conversion.fromFormat].push(conversion);
    });
    
    return grouped;
  }

  /**
   * Get supported target formats for a given source format
   */
  async getSupportedTargetFormats(fromFormat: string): Promise<string[]> {
    const availableConversions = await this.getAvailableConversions();
    
    return availableConversions
      .filter(conversion => conversion.fromFormat === fromFormat)
      .map(conversion => conversion.toFormat);
  }

  /**
   * Get all supported source formats
   */
  async getSupportedSourceFormats(): Promise<string[]> {
    const availableConversions = await this.getAvailableConversions();
    
    const sourceFormats = new Set(
      availableConversions.map(conversion => conversion.fromFormat)
    );
    
    return Array.from(sourceFormats);
  }

  /**
   * Get endpoint statuses from backend using batch API
   */
  private async getEndpointStatuses(): Promise<Map<string, boolean>> {
    // Return cached result if still valid
    if (this.cache && Date.now() < this.cacheExpiry) {
      return this.cache;
    }

    try {
      const endpointNames = ALL_CONVERSION_ENDPOINTS.map(conv => conv.endpoint);
      const endpointsParam = endpointNames.join(',');
      
      const response = await fetch(
        `${this.baseUrl}/api/v1/config/endpoints-enabled?endpoints=${encodeURIComponent(endpointsParam)}`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch endpoint statuses: ${response.status} ${response.statusText}`);
      }
      
      const statusMap: Record<string, boolean> = await response.json();
      
      // Convert to Map and cache
      this.cache = new Map(Object.entries(statusMap));
      this.cacheExpiry = Date.now() + this.CACHE_DURATION;
      
      console.log(`Retrieved status for ${Object.keys(statusMap).length} conversion endpoints`);
      return this.cache;
      
    } catch (error) {
      console.error('Failed to get endpoint statuses:', error);
      
      // Fallback: assume all endpoints are disabled
      const fallbackMap = new Map<string, boolean>();
      ALL_CONVERSION_ENDPOINTS.forEach(conv => {
        fallbackMap.set(conv.endpoint, false);
      });
      
      return fallbackMap;
    }
  }

  /**
   * Utility to create a skipping condition for tests
   */
  static createSkipCondition(endpoint: string, discovery: ConversionEndpointDiscovery) {
    return async () => {
      const available = await discovery.isConversionAvailable(endpoint);
      return !available;
    };
  }

  /**
   * Get detailed conversion info by endpoint name
   */
  getConversionInfo(endpoint: string): ConversionEndpoint | undefined {
    return ALL_CONVERSION_ENDPOINTS.find(conv => conv.endpoint === endpoint);
  }

  /**
   * Get all conversion endpoints (regardless of availability)
   */
  getAllConversions(): ConversionEndpoint[] {
    return [...ALL_CONVERSION_ENDPOINTS];
  }
}

// Export singleton instance for reuse across tests
export const conversionDiscovery = new ConversionEndpointDiscovery();

/**
 * React hook version for use in components (wraps the class)
 */
export function useConversionEndpoints() {
  const endpointNames = ALL_CONVERSION_ENDPOINTS.map(conv => conv.endpoint);
  const { endpointStatus, loading, error, refetch } = useMultipleEndpointsEnabled(endpointNames);
  
  const availableConversions = ALL_CONVERSION_ENDPOINTS.filter(
    conv => endpointStatus[conv.endpoint] === true
  );
  
  const unavailableConversions = ALL_CONVERSION_ENDPOINTS.filter(
    conv => endpointStatus[conv.endpoint] === false
  );
  
  return {
    availableConversions,
    unavailableConversions,
    allConversions: ALL_CONVERSION_ENDPOINTS,
    endpointStatus,
    loading,
    error,
    refetch,
    isConversionAvailable: (endpoint: string) => endpointStatus[endpoint] === true
  };
}