import React, {
  createContext,
  useContext,
  useMemo,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import apiClient from "@app/services/apiClient";
import { getSimulatedAppConfig } from "@app/testing/serverExperienceSimulations";
import type { AppConfig, AppConfigBootstrapMode } from "@app/types/appConfig";
import { useJwtConfigSync } from "@app/hooks/useJwtConfigSync";
import { editorQk } from "@app/queries/keys";

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

function responseStatus(err: unknown): number | undefined {
  if (isAxiosError(err)) return err.response?.status;
  if (typeof err === "object" && err !== null && "response" in err) {
    return (err as { response?: { status?: number } }).response?.status;
  }
  return undefined;
}

async function fetchAppConfig(): Promise<AppConfig> {
  const testConfig = getSimulatedAppConfig();
  if (testConfig) return testConfig;

  try {
    const response = await apiClient.get<AppConfig>(
      "/api/v1/config/app-config",
      { suppressErrorToast: true, skipAuthRedirect: true } as any,
    );
    return response.data;
  } catch (err: unknown) {
    if (responseStatus(err) === 401) {
      return { enableLogin: true };
    }
    throw err;
  }
}

function extractErrorMessage(err: unknown): string | null {
  if (err instanceof Error) {
    if (isAxiosError(err)) {
      const serverMessage = (
        err.response?.data as { message?: string } | undefined
      )?.message;
      if (serverMessage) return serverMessage;
    }
    return err.message;
  }
  return null;
}

export interface AppConfigProviderProps {
  children: ReactNode;
  retryOptions?: AppConfigRetryOptions;
  initialConfig?: AppConfig | null;
  bootstrapMode?: AppConfigBootstrapMode;
  autoFetch?: boolean;
  onConfigLoaded?: (config: AppConfig) => void;
}

export const AppConfigProvider: React.FC<AppConfigProviderProps> = ({
  children,
  retryOptions,
  initialConfig = null,
  bootstrapMode = "blocking",
  autoFetch = true,
  onConfigLoaded,
}) => {
  const isBlockingMode = bootstrapMode === "blocking";
  const queryClient = useQueryClient();
  const maxRetries = retryOptions?.maxRetries ?? 0;
  const initialDelay = retryOptions?.initialDelay ?? 1000;
  const onConfigLoadedRef = React.useRef(onConfigLoaded);
  onConfigLoadedRef.current = onConfigLoaded;

  const refetch = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: editorQk.appConfig() }),
      queryClient.invalidateQueries({
        queryKey: editorQk.endpointsAvailability(),
      }),
    ]);
  }, [queryClient]);

  const { isAuthPage } = useJwtConfigSync(refetch);

  const query = useQuery({
    queryKey: editorQk.appConfig(),
    queryFn: fetchAppConfig,
    enabled: autoFetch && !isAuthPage,
    retry: (failureCount, error) => {
      const status = responseStatus(error);
      if (status && status < 500) return false;
      return failureCount < maxRetries;
    },
    retryDelay: (i) => initialDelay * Math.pow(2, Math.max(0, i)),
    ...(initialConfig
      ? { initialData: initialConfig, initialDataUpdatedAt: 0 }
      : {}),
  });

  useEffect(() => {
    if (query.data) onConfigLoadedRef.current?.(query.data);
  }, [query.data]);

  useEffect(() => {
    if (query.isError && query.error) {
      console.error(
        "[AppConfig] Failed to fetch app config after retries:",
        query.error,
      );
    }
  }, [query.isError, query.error]);

  const config: AppConfig | null = isAuthPage
    ? { enableLogin: true }
    : (query.data ?? (query.isError ? { enableLogin: true } : null));

  const loading =
    !isAuthPage &&
    autoFetch &&
    !query.isError &&
    (query.isLoading ||
      (isBlockingMode && query.isFetching && !query.isFetchedAfterMount));

  const error = query.isError ? extractErrorMessage(query.error) : null;

  const value = useMemo<AppConfigContextValue>(
    () => ({ config, loading, error, refetch }),
    [config, loading, error, refetch],
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
