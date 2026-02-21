import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import apiClient from "@app/services/apiClient";
import { useAppConfig } from "@app/contexts/AppConfigContext";

interface PluginResponse {
  id: string;
  icon: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  frontendUrl?: string;
  frontendLabel?: string;
  iconPath?: string;
  hasFrontend?: boolean;
  backendEndpoints?: string[];
  minHostVersion: string;
  iconUrl?: string;
  jarCreatedAt?: string;
}

export interface PluginInfo {
  icon: ReactNode;
  id: string;
  name: string;
  description: string;
  version?: string;
  author?: string;
  hasFrontend: boolean;
  frontendUrl?: string;
  frontendLabel?: string;
  iconPath?: string;
  backendEndpoints: string[];
  minHostVersion: string;
  iconUrl?: string;
  jarCreatedAt?: string;
}

interface PluginRegistryState {
  plugins: PluginInfo[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const PluginRegistryContext = createContext<PluginRegistryState | undefined>(undefined);

const buildFrontendUrl = (response: PluginResponse): string | undefined => {
  if (!response.frontendUrl) {
    return undefined;
  }
  return response.frontendUrl;
};

const buildIconUrl = (path?: string, baseUrl?: string): string | undefined => {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  const normalizedBase =
    baseUrl?.replace(/\/+$/, "") || (typeof window !== "undefined" ? window.location.origin.replace(/\/+$/, "") : "");
  if (!normalizedBase) return path;
  return `${normalizedBase}${path.startsWith("/") ? path : `/${path}`}`;
};

const buildPluginInfo = (response: PluginResponse, baseUrl?: string): PluginInfo => {
  const frontendBase = response.frontendUrl
    ? new URL(response.frontendUrl).origin
    : baseUrl;

  return {
    id: response.id,
    icon: response.icon,
    name: response.name,
    description: response.description || "",
    version: response.version,
    author: response.author,
    hasFrontend: Boolean(response.hasFrontend),
    frontendUrl: buildFrontendUrl(response),
    frontendLabel: response.frontendLabel,
    iconPath: response.iconPath,
    backendEndpoints: response.backendEndpoints ?? [],
    minHostVersion: response.minHostVersion,
    iconUrl: buildIconUrl(response.iconPath, frontendBase),
    jarCreatedAt: response.jarCreatedAt,
  };
};

export const PluginRegistryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading: configLoading, config } = useAppConfig();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<PluginResponse[]>("/api/v1/config/plugins");
      const normalized = response.data
        .map((plugin) => buildPluginInfo(plugin, config?.baseUrl))
        .sort((a, b) => a.name.localeCompare(b.name));
      setPlugins(normalized);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setPlugins([]);
        setError(null);
      } else {
        const message = err?.response?.data?.message || err?.message || "Unable to load plugins";
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!configLoading) {
      if (typeof window === "undefined") {
        void fetchPlugins();
        return;
      }

      const path = window.location.pathname;
      const isAuthPage =
        path.includes("/login") || path.includes("/signup") || path.includes("/auth/callback") || path.includes("/invite/");

      if (!isAuthPage) {
        void fetchPlugins();
      }
    }
  }, [configLoading, fetchPlugins]);

  const value = useMemo(
    () => ({
      plugins,
      loading,
      error,
      refresh: fetchPlugins,
    }),
    [plugins, loading, error, fetchPlugins],
  );

  return <PluginRegistryContext.Provider value={value}>{children}</PluginRegistryContext.Provider>;
};

export const usePluginRegistry = () => {
  const context = useContext(PluginRegistryContext);

  if (context) {
    return context;
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn("[PluginRegistryContext] usePluginRegistry called outside PluginRegistryProvider - returning fallback state");
  }

  return {
    plugins: [],
    loading: false,
    error: null,
    refresh: async () => {},
  };
};
