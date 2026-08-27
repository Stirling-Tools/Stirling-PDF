import React, {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useCallback,
  useState,
  ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_APP_CONFIG, fetchAppConfig } from "@app/api/config";
import { setProcessorEnabled } from "@app/services/processorEnabled";
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
  // Auth pages skip the fetch until sign-in asks for one.
  const [signedIn, setSignedIn] = useState(false);
  // fetchQuery, not refetchQueries: the latter skips a disabled query, and
  // enabling one whose cache is still fresh doesn't fetch either. Sign-in has
  // to force the request — a pre-login 401 leaves a cached default behind.
  const refetch = useCallback(async () => {
    setSignedIn(true);
    await queryClient.fetchQuery({
      queryKey: qk.appConfig(),
      queryFn: fetchAppConfig,
      staleTime: 0,
    });
  }, [queryClient]);

  const { isAuthPage } = useJwtConfigSync(refetch);
  const fetching = autoFetch && (!isAuthPage || signedIn);

  const { data, error, isFetching } = useQuery({
    queryKey: qk.appConfig(),
    queryFn: fetchAppConfig,
    enabled: fetching,
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

  // fetchAppConfig publishes this too; repeat it for the seeded path, which
  // never fetches.
  useEffect(() => {
    if (!data && initialConfig)
      setProcessorEnabled(initialConfig.processorEnabled === true);
  }, [data, initialConfig]);

  const value = useMemo<AppConfigContextValue>(
    () => ({
      config:
        data ??
        initialConfig ??
        (isAuthPage || error ? DEFAULT_APP_CONFIG : null),
      // "Config not settled yet": in flight, or never going to be fetched at
      // all. isFetching rather than isPending because a pre-login 401 resolves
      // to the default config, so isPending is already false by the time the
      // post-sign-in fetch runs — and consumers key effects on the flip.
      loading: seeded
        ? false
        : !autoFetch
          ? true
          : fetching
            ? isFetching
            : false,
      error: error ? errorMessage(error) : null,
      refetch,
    }),
    [
      data,
      error,
      isFetching,
      initialConfig,
      isAuthPage,
      seeded,
      autoFetch,
      fetching,
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
