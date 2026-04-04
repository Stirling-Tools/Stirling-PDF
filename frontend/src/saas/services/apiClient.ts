import axios from 'axios';
import { getToken, refreshToken, clearAuthData } from '@app/auth/supabase';
import { handleHttpError } from '@app/services/httpErrorHandler';
import { alert } from '@app/components/toast';
import { openPlanSettings } from '@app/utils/appSettings';

// Global credit update callback - will be set by the AuthProvider
let globalCreditUpdateCallback: ((credits: number) => void) | null = null;

// Function to set the global credit update callback
export const setGlobalCreditUpdateCallback = (callback: (credits: number) => void) => {
  globalCreditUpdateCallback = callback;
};

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  responseType: 'json',
});

const LOW_CREDIT_THRESHOLD = 10;
function notifyLowCredits(credits: number) {
  const title = 'Credit balance low';
  const body = `You have ${credits} credits remaining.`;
  alert({
    alertType: 'warning',
    title,
    body,
    buttonText: 'Top up',
    buttonCallback: () => openPlanSettings(),
    isPersistentPopup: true,
    location: 'bottom-right'
  });
}

// Request interceptor to add JWT token to all requests
apiClient.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// List of endpoints that don't require authentication
const publicEndpoints = [
  '/api/v1/config/app-config',
  '/api/v1/info/status',
  '/api/v1/config/public-config',
  '/api/v1/config/endpoints-enabled',
];

// Response interceptor for handling token refresh and credit updates
apiClient.interceptors.response.use(
  (response) => {
    // Check for X-Credits-Remaining header and update credits automatically
    const creditsRemaining = response.headers['x-credits-remaining'];
    if (creditsRemaining && globalCreditUpdateCallback) {
      const credits = parseInt(creditsRemaining, 10);
      if (!isNaN(credits) && credits >= 0) {
        globalCreditUpdateCallback(credits);
        if (credits < LOW_CREDIT_THRESHOLD) {
          notifyLowCredits(credits);
        }
      }
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const isPublicEndpoint = publicEndpoints.some(endpoint =>
      originalRequest.url?.includes(endpoint)
    );

    // If we get a 401 and haven't already tried to refresh
    if (error.response?.status === 401 && !originalRequest._retry && !isPublicEndpoint) {
      originalRequest._retry = true;

      const newToken = await refreshToken();
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      }

      // Refresh failed — redirect to login
      clearAuthData();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    // For public endpoints with 401, just log and continue
    if (isPublicEndpoint && error.response?.status === 401) {
      console.debug('[API Client] 401 on public endpoint, continuing without auth:', originalRequest.url);
    }

    await handleHttpError(error);
    return Promise.reject(error);
  }
);

export default apiClient;
