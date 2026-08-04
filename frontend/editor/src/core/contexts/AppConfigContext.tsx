import React, {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_APP_CONFIG, fetchAppConfig } from "@app/api/config";
import { qk } from "@app/query/keys";
import { CONFIG_STALE_TIME } from "@app/query/staleTime";
import type { AppConfig, AppConfigBootstrapMode } from "@app/types/appConfig";
import { useJwtConfigSync } from "@app/hooks/useJwtConfigSync";

export interface AppConfigRetryOptions {
  maxRetries?: number;
  initialDelay?: number;
}

export type { AppConfig, AppConfigBootstrapMode };

interface AppConfigContextValue {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const AppConfigContext = createContext<AppConfigContextValue | undefined>({
  config: null,
  loading: true,
  error: null,
  refetch: async () => {},
});

export interface AppConfigProviderProps {
  children: ReactNode;
  retryOptions?: AppConfigRetryOptions;
  initialConfig?: AppConfig | null;
  bootstrapMode?: AppConfigBootstrapMode;
  autoFetch?: boolean;
  onConfigLoaded?: (config: AppConfig) => void;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

function errorMessage(error: unknown): string {
  const axiosLike = error as {
    response?: { data?: { message?: string } };
    message?: string;
  };
  return (
    axiosLike?.response?.data?.message ||
    axiosLike?.message ||
    "Unknown error occurred"
  );
}

export const AppConfigProvider: React.FC<AppConfigProviderProps> = ({
  children,
  retryOptions,
  initialConfig = null,
  bootstrapMode = "blocking",
  autoFetch = true,
  onConfigLoaded,
}) => {
  const maxRetries = retryOptions?.maxRetries ?? 0;
  const initialDelay = retryOptions?.initialDelay ?? 1000;
  // Non-blocking mode treats initialConfig as good enough to render on.
  const seeded = Boolean(initialConfig) && bootstrapMode !== "blocking";

  const onConfigLoadedRef = React.useRef(onConfigLoaded);
  onConfigLoadedRef.current = onConfigLoaded;

  const queryClient = useQueryClient();
  const refetch = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: qk.appConfig() });
  }, [queryClient]);

  const { isAuthPage } = useJwtConfigSync(refetch);

  const { data, error, isPending } = useQuery({
    queryKey: qk.appConfig(),
    queryFn: fetchAppConfig,
    enabled: autoFetch && !isAuthPage,
    staleTime: CONFIG_STALE_TIME,
    // Network and 5xx only; failureCount is 0-based, so `<` gives maxRetries retries.
    retry: (failureCount, err) => {
      const status = statusOf(err);
      return (!status || status >= 500) && failureCount < maxRetries;
    },
    retryDelay: (attempt) => initialDelay * 2 ** attempt,
  });

  useEffect(() => {
    if (error) console.error("[AppConfig] Failed to fetch app config:", error);
  }, [error]);

  useEffect(() => {
    if (data) onConfigLoadedRef.current?.(data);
  }, [data]);

  const value = useMemo<AppConfigContextValue>(
    () => ({
      config:
        data ??
        initialConfig ??
        (isAuthPage || error ? DEFAULT_APP_CONFIG : null),
      // A disabled query stays isPending, so the enabled cases are explicit.
      loading: isAuthPage || seeded ? false : autoFetch ? isPending : true,
      error: error ? errorMessage(error) : null,
      refetch,
    }),
    [
      data,
      error,
      isPending,
      initialConfig,
      isAuthPage,
      seeded,
      autoFetch,
      refetch,
    ],
  );

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
};

export function useAppConfig(): AppConfigContextValue {
  const context = useContext(AppConfigContext);
  if (context === undefined) {
    throw new Error("useAppConfig must be used within AppConfigProvider");
  }
  return context;
}
