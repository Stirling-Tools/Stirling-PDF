import { invoke } from '@tauri-apps/api/core';
import { fetch } from '@tauri-apps/plugin-http';

export type ConnectionMode = 'saas' | 'selfhosted';

export interface SSOProviderConfig {
  id: string;
  path: string;
  label?: string;
}

export interface ServerConfig {
  url: string;
  enabledOAuthProviders?: SSOProviderConfig[];
  loginMethod?: string;
}

export interface ConnectionConfig {
  mode: ConnectionMode;
  server_config: ServerConfig | null;
  lock_connection_mode: boolean;
}

export interface DiagnosticResult {
  stage: string;
  success: boolean;
  message: string;
  duration?: number;
}

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  diagnostics?: DiagnosticResult[];
}

export class ConnectionModeService {
  private static instance: ConnectionModeService;
  private currentConfig: ConnectionConfig | null = null;
  private configLoadedOnce = false;
  private modeListeners = new Set<(config: ConnectionConfig) => void>();

  static getInstance(): ConnectionModeService {
    if (!ConnectionModeService.instance) {
      ConnectionModeService.instance = new ConnectionModeService();
    }
    return ConnectionModeService.instance;
  }

  async getCurrentConfig(): Promise<ConnectionConfig> {
    if (!this.configLoadedOnce) {
      await this.loadConfig();
    }
    return this.currentConfig || { mode: 'saas', server_config: null, lock_connection_mode: false };
  }

  async getCurrentMode(): Promise<ConnectionMode> {
    const config = await this.getCurrentConfig();
    return config.mode;
  }

  async getServerConfig(): Promise<ServerConfig | null> {
    const config = await this.getCurrentConfig();
    return config.server_config;
  }

  subscribeToModeChanges(listener: (config: ConnectionConfig) => void): () => void {
    this.modeListeners.add(listener);
    return () => {
      this.modeListeners.delete(listener);
    };
  }

  private notifyListeners() {
    if (this.currentConfig) {
      this.modeListeners.forEach(listener => listener(this.currentConfig!));
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const config = await invoke<ConnectionConfig>('get_connection_config');
      this.currentConfig = config;
      this.configLoadedOnce = true;
    } catch (error) {
      console.error('Failed to load connection config:', error);
      // Default to SaaS mode on error
      this.currentConfig = { mode: 'saas', server_config: null, lock_connection_mode: false };
      this.configLoadedOnce = true;
    }
  }

  async switchToSaaS(saasServerUrl: string): Promise<void> {
    if (this.currentConfig?.lock_connection_mode) {
      throw new Error('Connection mode is locked by provisioning');
    }

    console.log('Switching to SaaS mode');

    const serverConfig: ServerConfig = { url: saasServerUrl };

    await invoke('set_connection_mode', {
      mode: 'saas',
      serverConfig,
    });

    this.currentConfig = { mode: 'saas', server_config: serverConfig, lock_connection_mode: this.currentConfig?.lock_connection_mode ?? false };
    this.notifyListeners();

    console.log('Switched to SaaS mode successfully');
  }

  async switchToSelfHosted(serverConfig: ServerConfig): Promise<void> {
    console.log('Switching to self-hosted mode:', serverConfig);

    await invoke('set_connection_mode', {
      mode: 'selfhosted',
      serverConfig,
    });

    this.currentConfig = { mode: 'selfhosted', server_config: serverConfig, lock_connection_mode: this.currentConfig?.lock_connection_mode ?? false };
    this.notifyListeners();

    console.log('Switched to self-hosted mode successfully');
  }

  /**
   * Test connection to a server URL with comprehensive multi-stage diagnostics
   * @returns Detailed test results with diagnostics and recommendations
   */
  async testConnection(url: string): Promise<ConnectionTestResult> {
    console.log(`[ConnectionModeService] 🔍 Starting comprehensive connection diagnostics for: ${url}`);
    console.log(`[ConnectionModeService] ==================== DIAGNOSTIC SESSION START ====================`);
    console.log(`[ConnectionModeService] System Information:`);
    console.log(`[ConnectionModeService]    - User Agent: ${navigator.userAgent}`);
    console.log(`[ConnectionModeService]    - Platform: ${navigator.platform}`);
    console.log(`[ConnectionModeService]    - Online: ${navigator.onLine}`);
    console.log(`[ConnectionModeService]    - Connection Type: ${(navigator as any).connection?.effectiveType || 'unknown'}`);
    console.log(`[ConnectionModeService]    - Language: ${navigator.language}`);
    console.log(`[ConnectionModeService]    - Cookies Enabled: ${navigator.cookieEnabled}`);
    console.log(`[ConnectionModeService]    - Hardware Concurrency: ${navigator.hardwareConcurrency || 'unknown'} cores`);
    console.log(`[ConnectionModeService]    - Max Touch Points: ${navigator.maxTouchPoints}`);

    // Check for proxy environment variables
    console.log(`[ConnectionModeService] Environment Check:`);
    const envProxy = (window as any).process?.env?.HTTP_PROXY || (window as any).process?.env?.HTTPS_PROXY;
    if (envProxy) {
      console.log(`[ConnectionModeService]    - Proxy detected: ${envProxy}`);
    } else {
      console.log(`[ConnectionModeService]    - No proxy environment variables detected`);
    }

    // Check if running in Tauri (v2 uses different detection)
    console.log(`[ConnectionModeService]    - Checking Tauri context...`);
    console.log(`[ConnectionModeService]    - window.__TAURI__ type: ${typeof (window as any).__TAURI__}`);
    console.log(`[ConnectionModeService]    - window.__TAURI_INTERNALS__ type: ${typeof (window as any).__TAURI_INTERNALS__}`);
    console.log(`[ConnectionModeService]    - window.location.href:`, window.location.href);
    console.log(`[ConnectionModeService]    - window.location.protocol:`, window.location.protocol);

    // Tauri v2 detection: check for __TAURI_INTERNALS__ or tauri:// protocol
    const isTauriV2 = typeof (window as any).__TAURI_INTERNALS__ !== 'undefined' ||
                      window.location.protocol === 'tauri:' ||
                      window.location.hostname === 'tauri.localhost';
    const isTauriV1 = typeof (window as any).__TAURI__ !== 'undefined';
    const isTauri = isTauriV1 || isTauriV2;

    console.log(`[ConnectionModeService]    - Running in Tauri v1: ${isTauriV1}`);
    console.log(`[ConnectionModeService]    - Running in Tauri v2: ${isTauriV2}`);
    console.log(`[ConnectionModeService]    - Running in Tauri: ${isTauri}`);

    if (isTauri) {
      if (isTauriV1) {
        const tauriApi = (window as any).__TAURI__;
        console.log(`[ConnectionModeService]    - Tauri v1 API:`, tauriApi);
      }
      if (isTauriV2) {
        console.log(`[ConnectionModeService]    - Tauri v2 detected via internals/protocol`);
        const internals = (window as any).__TAURI_INTERNALS__;
        console.log(`[ConnectionModeService]    - Tauri internals:`, internals);
      }
    }

    const diagnostics: DiagnosticResult[] = [];
    const healthUrl = `${url.replace(/\/$/, '')}/api/v1/info/status`;
    const isLocal = this.isLocalAddress(url);
    const isHttpUrl = url.startsWith('http://');
    const isHttpsUrl = url.startsWith('https://');

    console.log(`[ConnectionModeService] Connection Parameters:`);
    console.log(`[ConnectionModeService]    - Target URL: ${url}`);
    console.log(`[ConnectionModeService]    - Health endpoint: ${healthUrl}`);
    console.log(`[ConnectionModeService]    - Is local address: ${isLocal}`);
    console.log(`[ConnectionModeService]    - Protocol: ${isHttpUrl ? 'HTTP' : isHttpsUrl ? 'HTTPS' : 'Unknown'}`);
    console.log(`[ConnectionModeService] ================================================================`);

    // STAGE 1: Test the protocol they specified
    if (isHttpUrl) {
      console.log(`[ConnectionModeService] Stage 1: Testing HTTP (as specified in URL)`);
      const stage1Result = await this.testHTTP(healthUrl, 'Stage 1: HTTP (as specified)');
      diagnostics.push(stage1Result);

      if (stage1Result.success) {
        console.log(`[ConnectionModeService] ✅ Connection successful with HTTP`);

        // Log success summary
        console.log(`[ConnectionModeService] ==================== DIAGNOSTIC SUMMARY ====================`);
        console.log(`[ConnectionModeService] ✅ CONNECTION SUCCESSFUL`);
        console.log(`[ConnectionModeService] Protocol: HTTP (as requested by user)`);
        console.log(`[ConnectionModeService] Duration: ${stage1Result.duration}ms`);
        console.log(`[ConnectionModeService] ==================== DIAGNOSTIC SESSION END ====================`);

        return {
          success: true,
          diagnostics,
        };
      }

      // HTTP failed, try HTTPS as fallback
      console.log(`[ConnectionModeService] Stage 2: HTTP failed, trying HTTPS`);
      const httpsUrl = healthUrl.replace('http://', 'https://');
      const stage2Result = await this.testHTTPS(httpsUrl, 'Stage 2: Trying HTTPS', false);
      diagnostics.push(stage2Result);

      if (stage2Result.success) {
        return {
          success: false,
          error: 'Server is only accessible via HTTPS, not HTTP.',
          errorCode: 'HTTP_NOT_AVAILABLE',
          diagnostics,
        };
      }

      // Both failed, continue with more diagnostics below
    } else {
      // HTTPS URL or no protocol - test HTTPS
      console.log(`[ConnectionModeService] Stage 1: Testing HTTPS with full certificate validation`);
      const stage1Result = await this.testHTTPS(healthUrl, 'Stage 1: Standard HTTPS', false);
      diagnostics.push(stage1Result);

      if (stage1Result.success) {
        console.log(`[ConnectionModeService] ✅ Connection successful with standard HTTPS`);

        // Log success summary
        console.log(`[ConnectionModeService] ==================== DIAGNOSTIC SUMMARY ====================`);
        console.log(`[ConnectionModeService] ✅ CONNECTION SUCCESSFUL`);
        console.log(`[ConnectionModeService] Protocol: HTTPS with valid certificate`);
        console.log(`[ConnectionModeService] Duration: ${stage1Result.duration}ms`);
        console.log(`[ConnectionModeService] ==================== DIAGNOSTIC SESSION END ====================`);

        return { success: true, diagnostics };
      }

      // STAGE 2: Test with certificate validation disabled (diagnose cert issues)
      console.log(`[ConnectionModeService] Stage 2: Testing HTTPS with certificate validation disabled`);
      const stage2Result = await this.testHTTPS(healthUrl, 'Stage 2: HTTPS (no cert validation)', true);
      diagnostics.push(stage2Result);

      if (stage2Result.success) {
        console.log(`[ConnectionModeService] ⚠️ Certificate issue detected - but connection works with bypass enabled`);
        console.log(`[ConnectionModeService] ==================== DIAGNOSTIC SUMMARY ====================`);
        console.log(`[ConnectionModeService] ✅ CONNECTION SUCCESSFUL (with certificate bypass)`);
        console.log(`[ConnectionModeService] Protocol: HTTPS with certificate validation disabled`);
        console.log(`[ConnectionModeService] Duration: ${stage2Result.duration}ms`);
        console.log(`[ConnectionModeService] Note: Server has missing intermediate certificate or invalid cert`);
        console.log(`[ConnectionModeService] ==================== DIAGNOSTIC SESSION END ====================`);
        return {
          success: true,
          diagnostics,
        };
      }

      // STAGE 3: Try HTTP instead (for local/internal servers)
      console.log(`[ConnectionModeService] Stage 3: Testing HTTP instead of HTTPS`);
      const httpUrl = healthUrl.replace('https://', 'http://');
      const stage3Result = await this.testHTTP(httpUrl, 'Stage 3: HTTP (unencrypted)');
      diagnostics.push(stage3Result);

      if (stage3Result.success) {
        console.log(`[ConnectionModeService] ⚠️ HTTP works but HTTPS doesn't`);
        return {
          success: false,
          error: 'Server is only accessible via HTTP (not HTTPS).',
          errorCode: 'HTTPS_NOT_AVAILABLE',
          diagnostics,
        };
      }
    }

    // STAGE 4: Test with longer timeout (diagnose slow connections)
    console.log(`[ConnectionModeService] Stage 4: Testing with extended timeout (30s)`);
    const stage4Result = await this.testWithLongTimeout(healthUrl);
    diagnostics.push(stage4Result);

    if (stage4Result.success) {
      console.log(`[ConnectionModeService] ⚠️ Connection slow but eventually successful`);
      return {
        success: true,
        diagnostics,
      };
    }

    // STAGE 5A: Test external connectivity with standard endpoint
    console.log(`[ConnectionModeService] Stage 5A: Testing external connectivity (google.com)`);
    const stage5aResult = await this.testStage5_ExternalConnectivity();
    diagnostics.push(stage5aResult);

    // STAGE 5B: Test with alternative endpoint (in case google is blocked)
    console.log(`[ConnectionModeService] Stage 5B: Testing alternative endpoint (cloudflare.com)`);
    const stage5bResult = await this.testAlternativeEndpoint();
    diagnostics.push(stage5bResult);

    // STAGE 5C: Test with HTTP vs HTTPS for external endpoint
    console.log(`[ConnectionModeService] Stage 5C: Testing HTTP external endpoint`);
    const stage5cResult = await this.testHTTPExternal();
    diagnostics.push(stage5cResult);

    if (!stage5aResult.success && !stage5bResult.success && !stage5cResult.success) {
      console.log(`[ConnectionModeService] ❌ No external connectivity - network/firewall issue`);
      return {
        success: false,
        error: 'No internet connectivity detected. All network requests are failing.',
        errorCode: 'NETWORK_BLOCKED',
        diagnostics,
      };
    }

    // If some external endpoints work but not the target, it's more specific
    if (stage5aResult.success || stage5bResult.success || stage5cResult.success) {
      console.log(`[ConnectionModeService] ✅ External connectivity confirmed - issue is specific to target server`);
    }

    // STAGE 6: Test DNS resolution for the target server
    console.log(`[ConnectionModeService] Stage 6: Testing DNS resolution for target server`);
    const urlObj = new URL(url);
    const stage6Result = await this.testStage6_DNSResolution(urlObj.hostname);
    diagnostics.push(stage6Result);

    if (!stage6Result.success && stage6Result.message.includes('DNS lookup failed')) {
      console.log(`[ConnectionModeService] ❌ DNS resolution failed for target server`);
      return {
        success: false,
        error: `Cannot resolve hostname: ${urlObj.hostname}`,
        errorCode: 'DNS_RESOLUTION_FAILED',
        diagnostics,
      };
    }

    // STAGE 7: Try different HTTP method (HEAD instead of GET)
    console.log(`[ConnectionModeService] Stage 7: Testing with HEAD method`);
    const stage7Result = await this.testWithHEADMethod(healthUrl);
    diagnostics.push(stage7Result);

    if (stage7Result.success) {
      console.log(`[ConnectionModeService] ⚠️ HEAD method works but GET doesn't - unusual server behavior`);
      return {
        success: false,
        error: 'Server responds to HEAD requests but not GET requests.',
        errorCode: 'METHOD_MISMATCH',
        diagnostics,
      };
    }

    // STAGE 8: Try with modified User-Agent
    console.log(`[ConnectionModeService] Stage 8: Testing with browser User-Agent`);
    const stage8Result = await this.testWithBrowserUserAgent(healthUrl);
    diagnostics.push(stage8Result);

    if (stage8Result.success) {
      console.log(`[ConnectionModeService] ⚠️ Works with browser User-Agent - server may be blocking desktop apps`);
      return {
        success: false,
        error: 'Server blocks Tauri/desktop app User-Agent but allows browser User-Agent.',
        errorCode: 'USER_AGENT_BLOCKED',
        diagnostics,
      };
    }

    // STAGE 9: Final analysis - server-specific issue
    console.log(`[ConnectionModeService] ❌ Server unreachable - all diagnostic tests failed`);

    // Analyze timing patterns
    const avgDuration = diagnostics
      .filter(d => !d.success && d.duration)
      .reduce((sum, d) => sum + (d.duration || 0), 0) /
      diagnostics.filter(d => !d.success && d.duration).length;

    // Log comprehensive diagnostic summary
    console.log(`[ConnectionModeService] ==================== DIAGNOSTIC SUMMARY ====================`);
    console.log(`[ConnectionModeService] Total tests run: ${diagnostics.length}`);
    console.log(`[ConnectionModeService] Passed: ${diagnostics.filter(d => d.success).length}`);
    console.log(`[ConnectionModeService] Failed: ${diagnostics.filter(d => !d.success).length}`);
    console.log(`[ConnectionModeService] Average failure time: ${avgDuration.toFixed(0)}ms`);
    console.log(`[ConnectionModeService] ---------------------------------------------------------------`);
    diagnostics.forEach((diag) => {
      const icon = diag.success ? '✅' : '❌';
      console.log(`[ConnectionModeService] ${icon} ${diag.stage}: ${diag.message} (${diag.duration}ms)`);
    });
    console.log(`[ConnectionModeService] ================================================================`);
    console.log(`[ConnectionModeService] Error Code: SERVER_UNREACHABLE`);

    // Log timing-based analysis
    if (avgDuration < 100) {
      console.log(`[ConnectionModeService] Analysis: Immediate rejections (<${avgDuration.toFixed(0)}ms) suggest firewall/antivirus blocking`);
    } else if (avgDuration > 5000) {
      console.log(`[ConnectionModeService] Analysis: Timeouts (avg ${(avgDuration/1000).toFixed(1)}s) suggest server not responding or network route blocked`);
    } else {
      console.log(`[ConnectionModeService] Analysis: Server may be down, blocking connections, or behind a firewall`);
    }

    console.log(`[ConnectionModeService] ==================== DIAGNOSTIC SESSION END ====================`);

    return {
      success: false,
      error: 'Cannot connect to server. Internet works but this specific server is unreachable.',
      errorCode: 'SERVER_UNREACHABLE',
      diagnostics,
    };
  }

  private isLocalAddress(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.16.') ||
        hostname.endsWith('.local')
      );
    } catch {
      return false;
    }
  }

  private async testHTTPS(url: string, stageName: string, disableCertValidation: boolean): Promise<DiagnosticResult> {
    const startTime = Date.now();
    try {
      console.log(`[ConnectionModeService] 🔗 ${stageName}: Attempting fetch to ${url}`);
      console.log(`[ConnectionModeService]    - Certificate validation: ${disableCertValidation ? 'DISABLED' : 'ENABLED'}`);

      const fetchOptions: any = {
        method: 'GET',
        connectTimeout: 10000,
      };

      if (disableCertValidation) {
        fetchOptions.danger = {
          acceptInvalidCerts: true,
          acceptInvalidHostnames: true,
        };
      }

      console.log(`[ConnectionModeService]    - Fetch options:`, JSON.stringify(fetchOptions));
      const response = await fetch(url, fetchOptions);
      const duration = Date.now() - startTime;

      console.log(`[ConnectionModeService] ✅ ${stageName}: Response received - HTTP ${response.status} (${duration}ms)`);

      if (response.ok) {
        return {
          stage: stageName,
          success: true,
          message: disableCertValidation
            ? 'Connected successfully when certificate validation disabled'
            : 'Successfully connected with full certificate validation',
          duration,
        };
      }

      return {
        stage: stageName,
        success: false,
        message: `Server returned HTTP ${response.status}`,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Enhanced error logging
      console.error(`[ConnectionModeService] ❌ ${stageName}: Request failed (${duration}ms)`);
      console.error(`[ConnectionModeService]    - Error type: ${error?.constructor?.name || typeof error}`);
      console.error(`[ConnectionModeService]    - Error message: ${error instanceof Error ? error.message : String(error)}`);

      // Log full error object structure for debugging
      if (error && typeof error === 'object') {
        console.error(`[ConnectionModeService]    - Error keys:`, Object.keys(error));
        console.error(`[ConnectionModeService]    - Error object:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      }

      // Categorize error type
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorLower = errorMsg.toLowerCase();

      let detailedMessage = `Failed: ${errorMsg}`;

      // Check for TLS version mismatch (TLS 1.0/1.1 not supported)
      if (errorLower.includes('peer is incompatible') ||
          errorLower.includes('protocol version') ||
          errorLower.includes('peerincompatible') ||
          (errorLower.includes('handshake') && (errorLower.includes('tls') || errorLower.includes('ssl')))) {
        detailedMessage = `TLS version not supported - Server appears to use TLS 1.0 or 1.1 (desktop app requires TLS 1.2+). Please upgrade your server's TLS configuration or use the web version.`;
      } else if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
        detailedMessage = `Timeout after ${duration}ms - server not responding`;
      } else if (errorLower.includes('certificate') || errorLower.includes('cert') || errorLower.includes('ssl') || errorLower.includes('tls')) {
        detailedMessage = `SSL/TLS error - ${errorMsg}`;
      } else if (errorLower.includes('connection refused') || errorLower.includes('econnrefused')) {
        detailedMessage = `Connection refused - server may not be running`;
      } else if (errorLower.includes('network') || errorLower.includes('dns') || errorLower.includes('enotfound')) {
        detailedMessage = `Network error - ${errorMsg}`;
      } else if (errorLower.includes('blocked') || errorLower.includes('filtered')) {
        detailedMessage = `Request blocked - possible firewall/antivirus`;
      } else if (duration < 100) {
        detailedMessage = `Immediate rejection (<${duration}ms) - likely blocked by firewall/antivirus`;
      }

      console.error(`[ConnectionModeService]    - Categorized as: ${detailedMessage}`);

      return {
        stage: stageName,
        success: false,
        message: detailedMessage,
        duration,
      };
    }
  }

  private async testHTTP(url: string, stageName: string): Promise<DiagnosticResult> {
    const startTime = Date.now();
    try {
      console.log(`[ConnectionModeService] 🔗 ${stageName}: Attempting fetch to ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        connectTimeout: 10000,
      });
      const duration = Date.now() - startTime;

      console.log(`[ConnectionModeService] ✅ ${stageName}: Response received - HTTP ${response.status} (${duration}ms)`);

      if (response.ok) {
        return {
          stage: stageName,
          success: true,
          message: 'Successfully connected using HTTP',
          duration,
        };
      }

      return {
        stage: stageName,
        success: false,
        message: `Server returned HTTP ${response.status}`,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Enhanced error logging
      console.error(`[ConnectionModeService] ❌ ${stageName}: Request failed (${duration}ms)`);
      console.error(`[ConnectionModeService]    - Error type: ${error?.constructor?.name || typeof error}`);
      console.error(`[ConnectionModeService]    - Error message: ${error instanceof Error ? error.message : String(error)}`);

      if (error && typeof error === 'object') {
        console.error(`[ConnectionModeService]    - Error object:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorLower = errorMsg.toLowerCase();

      let detailedMessage = `Failed: ${errorMsg}`;

      if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
        detailedMessage = `Timeout after ${duration}ms - server not responding`;
      } else if (duration < 100) {
        detailedMessage = `Immediate rejection (<${duration}ms) - likely blocked by firewall/antivirus`;
      }

      console.error(`[ConnectionModeService]    - Categorized as: ${detailedMessage}`);

      return {
        stage: stageName,
        success: false,
        message: detailedMessage,
        duration,
      };
    }
  }

  private async testWithLongTimeout(url: string): Promise<DiagnosticResult> {
    const startTime = Date.now();
    try {
      const response = await fetch(url, {
        method: 'GET',
        connectTimeout: 30000, // 30 seconds
      });
      const duration = Date.now() - startTime;

      if (response.ok) {
        return {
          stage: 'Stage 4: Extended timeout (30s)',
          success: true,
          message: `Connected after ${duration}ms (slow connection)`,
          duration,
        };
      }

      return {
        stage: 'Stage 4: Extended timeout (30s)',
        success: false,
        message: `Server returned HTTP ${response.status}`,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        stage: 'Stage 4: Extended timeout (30s)',
        success: false,
        message: `Failed: ${errorMsg}`,
        duration,
      };
    }
  }

  private async testStage5_ExternalConnectivity(): Promise<DiagnosticResult> {
    const startTime = Date.now();
    try {
      console.log(`[ConnectionModeService] 🌐 Stage 5A: Testing external connectivity (google.com)`);

      // Test connectivity to a reliable external service
      const response = await fetch('https://www.google.com', {
        method: 'HEAD',
        connectTimeout: 5000,
      });
      const duration = Date.now() - startTime;

      console.log(`[ConnectionModeService] ✅ Stage 5A: External connectivity confirmed - HTTP ${response.status} (${duration}ms)`);

      if (response.ok || response.status === 301 || response.status === 302) {
        return {
          stage: 'Stage 5A: External (google.com)',
          success: true,
          message: 'Internet connectivity confirmed via google.com',
          duration,
        };
      }

      return {
        stage: 'Stage 5A: External (google.com)',
        success: false,
        message: `Unexpected response from google.com: ${response.status}`,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[ConnectionModeService] ❌ Stage 5A: External connectivity test failed (${duration}ms)`);
      console.error(`[ConnectionModeService]    - Error:`, error);

      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        stage: 'Stage 5A: External (google.com)',
        success: false,
        message: `Failed: ${errorMsg}`,
        duration,
      };
    }
  }

  private async testAlternativeEndpoint(): Promise<DiagnosticResult> {
    const startTime = Date.now();
    try {
      console.log(`[ConnectionModeService] 🌐 Stage 5B: Testing alternative endpoint (cloudflare.com)`);

      const response = await fetch('https://1.1.1.1', {
        method: 'HEAD',
        connectTimeout: 5000,
      });
      const duration = Date.now() - startTime;

      console.log(`[ConnectionModeService] ✅ Stage 5B: Alternative endpoint success - HTTP ${response.status} (${duration}ms)`);

      if (response.ok || response.status === 301 || response.status === 302 || response.status === 403) {
        return {
          stage: 'Stage 5B: External (cloudflare)',
          success: true,
          message: 'Alternative endpoint (1.1.1.1) reachable',
          duration,
        };
      }

      return {
        stage: 'Stage 5B: External (cloudflare)',
        success: false,
        message: `Unexpected response: ${response.status}`,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[ConnectionModeService] ❌ Stage 5B: Alternative endpoint failed (${duration}ms)`);
      console.error(`[ConnectionModeService]    - Error:`, error);

      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        stage: 'Stage 5B: External (cloudflare)',
        success: false,
        message: `Failed: ${errorMsg}`,
        duration,
      };
    }
  }

  private async testHTTPExternal(): Promise<DiagnosticResult> {
    const startTime = Date.now();
    try {
      console.log(`[ConnectionModeService] 🌐 Stage 5C: Testing HTTP external endpoint (httpbin.org)`);

      // Try HTTP (not HTTPS) to see if TLS/SSL is the issue
      const response = await fetch('http://httpbin.org/status/200', {
        method: 'GET',
        connectTimeout: 5000,
      });
      const duration = Date.now() - startTime;

      console.log(`[ConnectionModeService] ✅ Stage 5C: HTTP endpoint success - HTTP ${response.status} (${duration}ms)`);

      if (response.ok) {
        return {
          stage: 'Stage 5C: External HTTP (no TLS)',
          success: true,
          message: 'HTTP (unencrypted) connectivity works',
          duration,
        };
      }

      return {
        stage: 'Stage 5C: External HTTP (no TLS)',
        success: false,
        message: `Unexpected response: ${response.status}`,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[ConnectionModeService] ❌ Stage 5C: HTTP external failed (${duration}ms)`);
      console.error(`[ConnectionModeService]    - Error:`, error);

      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        stage: 'Stage 5C: External HTTP (no TLS)',
        success: false,
        message: `Failed: ${errorMsg}`,
        duration,
      };
    }
  }

  private async testStage6_DNSResolution(hostname: string): Promise<DiagnosticResult> {
    const startTime = Date.now();
    try {
      console.log(`[ConnectionModeService] 🔍 Stage 6: Testing DNS resolution for ${hostname}`);

      // Try to resolve DNS by making a HEAD request to the base domain
      // If DNS fails, we'll get an immediate error
      const testUrl = `https://${hostname}`;
      await fetch(testUrl, {
        method: 'HEAD',
        connectTimeout: 3000,
      });
      const duration = Date.now() - startTime;

      console.log(`[ConnectionModeService] ✅ Stage 6: DNS resolved successfully (${duration}ms)`);

      return {
        stage: 'Stage 6: DNS resolution',
        success: true,
        message: `DNS resolution successful for ${hostname}`,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorLower = errorMsg.toLowerCase();

      console.error(`[ConnectionModeService] ❌ Stage 6: DNS test failed (${duration}ms)`);
      console.error(`[ConnectionModeService]    - Error:`, errorMsg);

      // Check if it's a DNS-specific error
      if (errorLower.includes('dns') || errorLower.includes('enotfound') || errorLower.includes('getaddrinfo')) {
        return {
          stage: 'Stage 6: DNS resolution',
          success: false,
          message: `DNS lookup failed - cannot resolve ${hostname}`,
          duration,
        };
      }

      // If we got here, DNS might be working but connection failed for other reasons
      return {
        stage: 'Stage 6: DNS resolution',
        success: false,
        message: `DNS test inconclusive: ${errorMsg}`,
        duration,
      };
    }
  }

  private async testWithHEADMethod(url: string): Promise<DiagnosticResult> {
    const startTime = Date.now();
    try {
      console.log(`[ConnectionModeService] 🔗 Stage 7: Testing with HEAD method`);

      const response = await fetch(url, {
        method: 'HEAD',
        connectTimeout: 10000,
      });
      const duration = Date.now() - startTime;

      console.log(`[ConnectionModeService] ✅ Stage 7: HEAD method success - HTTP ${response.status} (${duration}ms)`);

      if (response.ok) {
        return {
          stage: 'Stage 7: HEAD method',
          success: true,
          message: 'HEAD method works (GET does not)',
          duration,
        };
      }

      return {
        stage: 'Stage 7: HEAD method',
        success: false,
        message: `HEAD method returned ${response.status}`,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[ConnectionModeService] ❌ Stage 7: HEAD method failed (${duration}ms)`);

      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        stage: 'Stage 7: HEAD method',
        success: false,
        message: `Failed: ${errorMsg}`,
        duration,
      };
    }
  }

  private async testWithBrowserUserAgent(url: string): Promise<DiagnosticResult> {
    const startTime = Date.now();
    try {
      console.log(`[ConnectionModeService] 🔗 Stage 8: Testing with browser User-Agent`);

      // Try with a standard browser User-Agent instead of Tauri's default
      const response = await fetch(url, {
        method: 'GET',
        connectTimeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        },
      });
      const duration = Date.now() - startTime;

      console.log(`[ConnectionModeService] ✅ Stage 8: Browser User-Agent success - HTTP ${response.status} (${duration}ms)`);

      if (response.ok) {
        return {
          stage: 'Stage 8: Browser User-Agent',
          success: true,
          message: 'Works with browser User-Agent (blocked with desktop UA)',
          duration,
        };
      }

      return {
        stage: 'Stage 8: Browser User-Agent',
        success: false,
        message: `Browser UA returned ${response.status}`,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[ConnectionModeService] ❌ Stage 8: Browser User-Agent failed (${duration}ms)`);

      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        stage: 'Stage 8: Browser User-Agent',
        success: false,
        message: `Failed: ${errorMsg}`,
        duration,
      };
    }
  }


  async isFirstLaunch(): Promise<boolean> {
    try {
      const result = await invoke<boolean>('is_first_launch');
      return result;
    } catch (error) {
      console.error('Failed to check first launch:', error);
      return false;
    }
  }

  async resetSetupCompletion(): Promise<void> {
    if (this.currentConfig?.lock_connection_mode) {
      return;
    }
    try {
      await invoke('reset_setup_completion');
      console.log('Setup completion flag reset successfully');
    } catch (error) {
      console.error('Failed to reset setup completion:', error);
      throw error;
    }
  }
}

export const connectionModeService = ConnectionModeService.getInstance();
