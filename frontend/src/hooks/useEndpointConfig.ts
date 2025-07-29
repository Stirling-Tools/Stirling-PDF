import { useState, useEffect } from 'react';

/**
 * Hook to check if a specific endpoint is enabled
 */
export function useEndpointEnabled(endpoint: string): {
  enabled: boolean | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEndpointStatus = async () => {
    if (!endpoint) {
      console.log('[Endpoint Validation] No endpoint provided, setting to null');
      setEnabled(null);
      setLoading(false);
      return;
    }

    console.log(`[Endpoint Validation] Starting validation for endpoint: ${endpoint}`);
    
    try {
      setLoading(true);
      setError(null);
      
      const url = `/api/v1/config/endpoint-enabled?endpoint=${encodeURIComponent(endpoint)}`;
      console.log(`[Endpoint Validation] Fetching from URL: ${url}`);
      
      const response = await fetch(url);
      console.log(`[Endpoint Validation] Response received for ${endpoint}:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      if (!response.ok) {
        const errorMessage = `Failed to check endpoint: ${response.status} ${response.statusText}`;
        console.error(`[Endpoint Validation] Error response for ${endpoint}:`, errorMessage);
        throw new Error(errorMessage);
      }
      
      const isEnabled: boolean = await response.json();
      console.log(`[Endpoint Validation] Endpoint ${endpoint} status:`, isEnabled);
      setEnabled(isEnabled);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error(`[Endpoint Validation] Failed to check endpoint ${endpoint}:`, err);
      console.error(`[Endpoint Validation] Error details:`, {
        name: err instanceof Error ? err.name : 'Unknown',
        message: errorMessage,
        stack: err instanceof Error ? err.stack : undefined
      });
      setError(errorMessage);
    } finally {
      setLoading(false);
      console.log(`[Endpoint Validation] Completed validation for ${endpoint}, loading: false`);
    }
  };

  useEffect(() => {
    console.log(`[Endpoint Validation] useEffect triggered for endpoint: ${endpoint}`);
    fetchEndpointStatus();
  }, [endpoint]);

  return {
    enabled,
    loading,
    error,
    refetch: fetchEndpointStatus,
  };
}

/**
 * Hook to check multiple endpoints at once using batch API
 * Returns a map of endpoint -> enabled status
 */
export function useMultipleEndpointsEnabled(endpoints: string[]): {
  endpointStatus: Record<string, boolean>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [endpointStatus, setEndpointStatus] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAllEndpointStatuses = async () => {
    if (!endpoints || endpoints.length === 0) {
      console.log('[Endpoint Validation] No endpoints provided for batch validation');
      setEndpointStatus({});
      setLoading(false);
      return;
    }

    console.log(`[Endpoint Validation] Starting batch validation for ${endpoints.length} endpoints:`, endpoints);
    
    try {
      setLoading(true);
      setError(null);
      
      // Use batch API for efficiency
      const endpointsParam = endpoints.join(',');
      const url = `/api/v1/config/endpoints-enabled?endpoints=${encodeURIComponent(endpointsParam)}`;
      console.log(`[Endpoint Validation] Batch fetch URL: ${url}`);
      
      const response = await fetch(url);
      console.log(`[Endpoint Validation] Batch response received:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      if (!response.ok) {
        const errorMessage = `Failed to check endpoints: ${response.status} ${response.statusText}`;
        console.error(`[Endpoint Validation] Batch error response:`, errorMessage);
        throw new Error(errorMessage);
      }
      
      const statusMap: Record<string, boolean> = await response.json();
      console.log(`[Endpoint Validation] Batch endpoint statuses:`, statusMap);
      setEndpointStatus(statusMap);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('[Endpoint Validation] Failed to check multiple endpoints:', err);
      console.error('[Endpoint Validation] Batch error details:', {
        name: err instanceof Error ? err.name : 'Unknown',
        message: errorMessage,
        stack: err instanceof Error ? err.stack : undefined
      });
      setError(errorMessage);
      
      // Fallback: assume all endpoints are disabled on error
      const fallbackStatus = endpoints.reduce((acc, endpoint) => {
        acc[endpoint] = false;
        return acc;
      }, {} as Record<string, boolean>);
      console.log('[Endpoint Validation] Using fallback status (all disabled):', fallbackStatus);
      setEndpointStatus(fallbackStatus);
    } finally {
      setLoading(false);
      console.log(`[Endpoint Validation] Completed batch validation for ${endpoints.length} endpoints, loading: false`);
    }
  };

  useEffect(() => {
    const endpointsKey = endpoints.join(',');
    console.log(`[Endpoint Validation] Batch useEffect triggered for endpoints: ${endpointsKey}`);
    fetchAllEndpointStatuses();
  }, [endpoints.join(',')]); // Re-run when endpoints array changes

  return {
    endpointStatus,
    loading,
    error,
    refetch: fetchAllEndpointStatuses,
  };
}