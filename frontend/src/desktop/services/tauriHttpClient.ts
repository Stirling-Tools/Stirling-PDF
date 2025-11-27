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
    withCredentials: true,
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

  private createError(message: string, config?: TauriHttpRequestConfig, code?: string, response?: TauriHttpResponse): TauriHttpError {
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
    return error;
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
      // Debug logging
      console.debug(`[tauriHttpClient] Fetch request:`, { url, method });
      console.debug(`[tauriHttpClient] Request headers:`, headers);
      if (headers.Authorization) {
        console.debug(`[tauriHttpClient] Authorization header: ${headers.Authorization.substring(0, 50)}...`);
      }

      // Make the request using Tauri's native HTTP client (standard Fetch API)
      const response = await fetch(url, {
        method,
        headers,
        body,
      });

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
        const error = this.createError(
          `Request failed with status code ${response.status}`,
          finalConfig,
          'ERR_BAD_REQUEST',
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

      // Create new error for network/other failures
      const errorMessage = error instanceof Error ? error.message : 'Network Error';
      const httpError = this.createError(
        errorMessage,
        finalConfig,
        'ERR_NETWORK'
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
