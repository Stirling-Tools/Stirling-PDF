import { fetch } from '@tauri-apps/plugin-http';

/**
 * Tauri HTTP Client - wrapper around Tauri's native HTTP client
 * Provides axios-compatible API while bypassing CORS restrictions
 */

export interface TauriHttpResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: TauriHttpRequestConfig;
}

export interface TauriHttpRequestConfig {
  url?: string;
  method?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean> | any;
  data?: any;
  timeout?: number;
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer';
  withCredentials?: boolean;
  // Custom properties for desktop
  operationName?: string;
  skipBackendReadyCheck?: boolean;
  skipAuthRedirect?: boolean;
  // Axios compatibility properties (ignored by Tauri HTTP)
  suppressErrorToast?: boolean;
  cancelToken?: any;
}

export interface TauriHttpError extends Error {
  config?: TauriHttpRequestConfig;
  code?: string;
  request?: unknown;
  response?: TauriHttpResponse;
  isAxiosError: boolean;
  toJSON: () => object;
}

type RequestInterceptor = (config: TauriHttpRequestConfig) => Promise<TauriHttpRequestConfig> | TauriHttpRequestConfig;
type ResponseInterceptor<T = any> = (response: TauriHttpResponse<T>) => Promise<TauriHttpResponse<T>> | TauriHttpResponse<T>;
type ErrorInterceptor = (error: any) => Promise<any>;

interface Interceptors {
  request: {
    handlers: RequestInterceptor[];
    use: (onFulfilled: RequestInterceptor, onRejected?: ErrorInterceptor) => number;
  };
  response: {
    handlers: { fulfilled: ResponseInterceptor; rejected?: ErrorInterceptor }[];
    use: (onFulfilled: ResponseInterceptor, onRejected?: ErrorInterceptor) => number;
  };
}

class TauriHttpClient {
  public defaults: TauriHttpRequestConfig = {
    baseURL: '',
    headers: {},
    timeout: 120000,
    responseType: 'json',
    withCredentials: false, // Desktop doesn't need credentials (backend has allowCredentials=false)
  };

  public interceptors: Interceptors = {
    request: {
      handlers: [],
      use: (onFulfilled: RequestInterceptor, _onRejected?: ErrorInterceptor) => {
        this.interceptors.request.handlers.push(onFulfilled);
        return this.interceptors.request.handlers.length - 1;
      },
    },
    response: {
      handlers: [],
      use: (onFulfilled: ResponseInterceptor, onRejected?: ErrorInterceptor) => {
        this.interceptors.response.handlers.push({ fulfilled: onFulfilled, rejected: onRejected });
        return this.interceptors.response.handlers.length - 1;
      },
    },
  };

  constructor(config?: TauriHttpRequestConfig) {
    if (config) {
      this.defaults = { ...this.defaults, ...config };
    }
  }

  private createError(message: string, config?: TauriHttpRequestConfig, code?: string, response?: TauriHttpResponse, originalError?: unknown): TauriHttpError {
    const error = new Error(message) as TauriHttpError;
    error.config = config;
    error.code = code;
    error.response = response;
    error.isAxiosError = true;
    error.toJSON = () => ({
      message: error.message,
      name: error.name,
      config: error.config,
      code: error.code,
    });

    // Log detailed error information for debugging
    console.error('[TauriHttpClient] Error details:', {
      message,
      code,
      url: config?.url,
      method: config?.method,
      status: response?.status,
      originalError: originalError instanceof Error ? {
        name: originalError.name,
        message: originalError.message,
        stack: originalError.stack,
      } : originalError,
    });

    return error;
  }

  private isResponseLike(value: unknown): value is TauriHttpResponse {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<TauriHttpResponse>;
    return (
      typeof candidate.status === 'number' &&
      'data' in candidate &&
      candidate.config !== undefined
    );
  }

  private buildUrl(config: TauriHttpRequestConfig): string {
    let url = config.url || '';

    // If URL is already absolute, use it as-is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    // Prepend baseURL if present
    const baseURL = config.baseURL || this.defaults.baseURL || '';
    if (baseURL) {
      url = baseURL + url;
    }

    // Add query parameters
    if (config.params && typeof config.params === 'object') {
      const searchParams = new URLSearchParams();
      Object.entries(config.params as Record<string, unknown>).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
    }

    return url;
  }

  private async executeRequest<T = any>(config: TauriHttpRequestConfig): Promise<TauriHttpResponse<T>> {
    // Merge with defaults
    const mergedConfig: TauriHttpRequestConfig = {
      ...this.defaults,
      ...config,
      headers: {
        ...this.defaults.headers,
        ...config.headers,
      },
    };

    // Run request interceptors
    let finalConfig = mergedConfig;
    for (const interceptor of this.interceptors.request.handlers) {
      finalConfig = await Promise.resolve(interceptor(finalConfig));
    }

    const url = this.buildUrl(finalConfig);
    const method = (finalConfig.method || 'GET').toUpperCase();

    // Prepare request body and headers
    let body: BodyInit | undefined;
    const headers: Record<string, string> = { ...(finalConfig.headers || {}) };

    if (finalConfig.data) {
      if (finalConfig.data instanceof FormData) {
        // FormData can be passed directly
        body = finalConfig.data;
      } else if (typeof finalConfig.data === 'object') {
        // Serialize as JSON
        body = JSON.stringify(finalConfig.data);
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      } else {
        body = String(finalConfig.data);
      }
    }

    try {
      // Convert withCredentials to fetch API's credentials option
      const credentials: RequestCredentials = finalConfig.withCredentials ? 'include' : 'omit';

      // Make the request using Tauri's native HTTP client (standard Fetch API)
      // Enable certificate bypass for HTTPS to handle missing intermediate certs and self-signed certs
      const fetchOptions: any = {
        method,
        headers,
        body,
        credentials,
      };

      // Always enable dangerous settings for HTTPS to allow connections to servers with:
      // - Missing intermediate certificates
      // - Self-signed certificates
      // - Certificate hostname mismatches
      if (url.startsWith('https://')) {
        fetchOptions.danger = {
          acceptInvalidCerts: true,
          acceptInvalidHostnames: true,
        };
      }

      const response = await fetch(url, fetchOptions);

      // Parse response based on responseType
      let data: T;
      const responseType = finalConfig.responseType || 'json';

      if (responseType === 'json') {
        data = await response.json() as T;
      } else if (responseType === 'text') {
        data = (await response.text()) as T;
      } else if (responseType === 'blob') {
        // Standard fetch doesn't set blob.type from Content-Type header (unlike axios)
        // Set it manually to match axios behavior
        const blob = await response.blob();
        if (!blob.type) {
          const contentType = response.headers.get('content-type') || 'application/octet-stream';
          data = new Blob([blob], { type: contentType }) as T;
        } else {
          data = blob as T;
        }
      } else if (responseType === 'arraybuffer') {
        data = (await response.arrayBuffer()) as T;
      } else {
        data = await response.json() as T;
      }

      // Convert Headers to plain object
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const httpResponse: TauriHttpResponse<T> = {
        data,
        status: response.status,
        statusText: response.statusText || '',
        headers: responseHeaders,
        config: finalConfig,
      };

      // Check for HTTP errors
      if (!response.ok) {
        // Create more descriptive error messages based on status code
        let errorMessage = `Request failed with status code ${response.status}`;
        let errorCode = 'ERR_BAD_REQUEST';

        if (response.status === 401) {
          errorMessage = 'Authentication failed - Invalid credentials';
          errorCode = 'ERR_UNAUTHORIZED';
        } else if (response.status === 403) {
          errorMessage = 'Access denied - Insufficient permissions';
          errorCode = 'ERR_FORBIDDEN';
        } else if (response.status === 404) {
          errorMessage = 'Endpoint not found - Server may not support this operation';
          errorCode = 'ERR_NOT_FOUND';
        } else if (response.status === 500) {
          errorMessage = 'Internal server error - Please check server logs';
          errorCode = 'ERR_SERVER_ERROR';
        } else if (response.status === 502 || response.status === 503 || response.status === 504) {
          errorMessage = 'Server unavailable or timeout - Please try again';
          errorCode = 'ERR_SERVICE_UNAVAILABLE';
        }

        console.error(`[TauriHttpClient] HTTP Error ${response.status}:`, {
          url,
          method,
          status: response.status,
          statusText: response.statusText,
        });

        const error = this.createError(
          errorMessage,
          finalConfig,
          errorCode,
          httpResponse
        );

        // Run error interceptors
        let finalError: unknown = error;
        for (const handler of this.interceptors.response.handlers) {
          if (handler.rejected) {
            try {
              finalError = await Promise.resolve(handler.rejected(finalError));
            } catch (e) {
              finalError = e;
            }
          }
        }
        throw finalError;
      }

      // Run response interceptors
      let finalResponse = httpResponse;
      for (const handler of this.interceptors.response.handlers) {
        finalResponse = await Promise.resolve(handler.fulfilled(finalResponse)) as TauriHttpResponse<T>;
      }

      return finalResponse;
    } catch (error: unknown) {
      // If it's already a TauriHttpError with interceptors run, re-throw
      if (error && typeof error === 'object' && 'isAxiosError' in error) {
        throw error;
      }

      // Some layers may throw a response-like object directly.
      // Handle it by status instead of incorrectly wrapping as ERR_NETWORK.
      if (this.isResponseLike(error)) {
        if (error.status >= 200 && error.status < 300) {
          return error as TauriHttpResponse<T>;
        }

        const errorCode =
          error.status === 401
            ? 'ERR_UNAUTHORIZED'
            : error.status === 403
            ? 'ERR_FORBIDDEN'
            : error.status === 404
            ? 'ERR_NOT_FOUND'
            : error.status >= 500
            ? 'ERR_SERVER_ERROR'
            : 'ERR_BAD_REQUEST';

        const errorMessage = `Request failed with status code ${error.status}`;
        const httpError = this.createError(
          errorMessage,
          finalConfig,
          errorCode,
          error as TauriHttpResponse,
          error
        );

        let finalError: unknown = httpError;
        for (const handler of this.interceptors.response.handlers) {
          if (handler.rejected) {
            try {
              finalError = await Promise.resolve(handler.rejected(finalError));
            } catch (e) {
              finalError = e;
            }
          }
        }
        throw finalError;
      }

      // Create detailed error messages for network/other failures
      let errorMessage = 'Network Error';
      let errorCode = 'ERR_NETWORK';

      if (error instanceof Error) {
        const errMsg = error.message.toLowerCase();

        // Connection refused - server not running or wrong port
        if (errMsg.includes('connection refused') || errMsg.includes('econnrefused')) {
          errorMessage = `Unable to connect to server at ${url}. Server may not be running or port is incorrect.`;
          errorCode = 'ERR_CONNECTION_REFUSED';
        }
        // Timeout - server too slow or unreachable
        else if (errMsg.includes('timeout') || errMsg.includes('timed out')) {
          errorMessage = `Connection timed out to ${url}. Server is not responding or is too slow.`;
          errorCode = 'ERR_TIMEOUT';
        }
        // DNS failure - invalid domain or network issue
        else if (errMsg.includes('getaddrinfo') || errMsg.includes('dns') || errMsg.includes('not found') || errMsg.includes('enotfound')) {
          errorMessage = `Cannot resolve server address: ${url}. Please check the URL is correct.`;
          errorCode = 'ERR_DNS_FAILURE';
        }
        // SSL/TLS errors - certificate issues
        else if (errMsg.includes('ssl') || errMsg.includes('tls') || errMsg.includes('certificate') || errMsg.includes('cert')) {
          errorMessage = `SSL/TLS certificate error for ${url}. Server may have invalid or self-signed certificate.`;
          errorCode = 'ERR_SSL_ERROR';
        }
        // Protocol errors - wrong protocol (http vs https)
        else if (errMsg.includes('protocol') || errMsg.includes('https') || errMsg.includes('http')) {
          errorMessage = `Protocol error connecting to ${url}. Try using https:// instead of http:// or vice versa.`;
          errorCode = 'ERR_PROTOCOL';
        }
        // CORS errors
        else if (errMsg.includes('cors')) {
          errorMessage = `CORS error connecting to ${url}. Server may not allow requests from this application.`;
          errorCode = 'ERR_CORS';
        }
        // Generic error with original message
        else {
          errorMessage = `Network error: ${error.message}`;
          errorCode = 'ERR_NETWORK';
        }

        console.error('[TauriHttpClient] Network error:', {
          url,
          method,
          errorType: errorCode,
          originalMessage: error.message,
          stack: error.stack,
        });
      } else {
        console.error('[TauriHttpClient] Unknown error type:', error);
      }

      const httpError = this.createError(
        errorMessage,
        finalConfig,
        errorCode,
        undefined,
        error
      );

      // Run error interceptors
      let finalError: unknown = httpError;
      for (const handler of this.interceptors.response.handlers) {
        if (handler.rejected) {
          try {
            finalError = await Promise.resolve(handler.rejected(finalError));
          } catch (e) {
            finalError = e;
          }
        }
      }
      throw finalError;
    }
  }

  async request<T = any>(config: TauriHttpRequestConfig): Promise<TauriHttpResponse<T>> {
    return this.executeRequest<T>(config);
  }

  async get<T = any>(url: string, config?: TauriHttpRequestConfig): Promise<TauriHttpResponse<T>> {
    return this.executeRequest<T>({ ...config, method: 'GET', url });
  }

  async delete<T = any>(url: string, config?: TauriHttpRequestConfig): Promise<TauriHttpResponse<T>> {
    return this.executeRequest<T>({ ...config, method: 'DELETE', url });
  }

  async head<T = any>(url: string, config?: TauriHttpRequestConfig): Promise<TauriHttpResponse<T>> {
    return this.executeRequest<T>({ ...config, method: 'HEAD', url });
  }

  async options<T = any>(url: string, config?: TauriHttpRequestConfig): Promise<TauriHttpResponse<T>> {
    return this.executeRequest<T>({ ...config, method: 'OPTIONS', url });
  }

  async post<T = any>(url: string, data?: any, config?: TauriHttpRequestConfig): Promise<TauriHttpResponse<T>> {
    return this.executeRequest<T>({ ...config, method: 'POST', url, data });
  }

  async put<T = any>(url: string, data?: any, config?: TauriHttpRequestConfig): Promise<TauriHttpResponse<T>> {
    return this.executeRequest<T>({ ...config, method: 'PUT', url, data });
  }

  async patch<T = any>(url: string, data?: any, config?: TauriHttpRequestConfig): Promise<TauriHttpResponse<T>> {
    return this.executeRequest<T>({ ...config, method: 'PATCH', url, data });
  }

  // Axios compatibility methods
  create(config?: TauriHttpRequestConfig): TauriHttpClient {
    return new TauriHttpClient({ ...this.defaults, ...config });
  }

  getUri(config?: TauriHttpRequestConfig): string {
    return this.buildUrl({ ...this.defaults, ...config });
  }

  async postForm<T = any>(url: string, data?: any, config?: TauriHttpRequestConfig): Promise<TauriHttpResponse<T>> {
    const formData = data instanceof FormData ? data : new FormData();
    if (!(data instanceof FormData) && data && typeof data === 'object') {
      Object.entries(data).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
    }
    return this.post<T>(url, formData, config);
  }

  async putForm<T = any>(url: string, data?: any, config?: TauriHttpRequestConfig): Promise<TauriHttpResponse<T>> {
    const formData = data instanceof FormData ? data : new FormData();
    if (!(data instanceof FormData) && data && typeof data === 'object') {
      Object.entries(data).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
    }
    return this.put<T>(url, formData, config);
  }

  async patchForm<T = any>(url: string, data?: any, config?: TauriHttpRequestConfig): Promise<TauriHttpResponse<T>> {
    const formData = data instanceof FormData ? data : new FormData();
    if (!(data instanceof FormData) && data && typeof data === 'object') {
      Object.entries(data).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
    }
    return this.patch<T>(url, formData, config);
  }
}

// Factory function matching axios.create()
export function create(config?: TauriHttpRequestConfig): TauriHttpClient {
  return new TauriHttpClient(config);
}

// Default instance
export default new TauriHttpClient();
