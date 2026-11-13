import { useEffect, useState } from "react";
import { absoluteWithBasePath } from "@editor/constants/app";
import {
  connectCallbackPath,
  fetchRedirectUris,
  type CloudProvider,
} from "@editor/services/connectedAccountsService";

let serverUris: Promise<Record<CloudProvider, string>> | null = null;

function loadServerUris(): Promise<Record<CloudProvider, string>> {
  serverUris ??= fetchRedirectUris().catch((error: unknown) => {
    serverUris = null;
    throw error;
  });
  return serverUris;
}

export function useConnectRedirectUri(provider: CloudProvider): string {
  const [uri, setUri] = useState(() =>
    absoluteWithBasePath(connectCallbackPath(provider)),
  );
  useEffect(() => {
    let active = true;
    loadServerUris()
      .then((uris) => {
        if (active && uris[provider]) setUri(uris[provider]);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [provider]);
  return uri;
}
