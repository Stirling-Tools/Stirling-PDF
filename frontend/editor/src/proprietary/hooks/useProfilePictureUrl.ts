/**
 * The signed-in user's avatar. A module store, not a context, so the sidebar and account section
 * share one object URL without threading a provider through every flavor's app tree.
 */
import { useEffect, useSyncExternalStore } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { fetchOwnProfilePicture } from "@app/services/profilePictureService";

let currentUrl: string | null = null;
let loadPromise: Promise<void> | null = null;
let loaded = false;
/** Bumped by every refresh so an in-flight load can't overwrite a newer result. */
let generation = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): string | null {
  return currentUrl;
}

function setUrl(next: string | null): void {
  // Object URLs pin the blob in memory until revoked.
  if (currentUrl && currentUrl !== next) URL.revokeObjectURL(currentUrl);
  currentUrl = next;
  emit();
}

function load(): Promise<void> {
  if (!loadPromise) {
    const token = generation;
    loadPromise = fetchOwnProfilePicture()
      .then((url) => {
        if (token !== generation) {
          // A refresh superseded us; drop the stale blob rather than showing it.
          if (url) URL.revokeObjectURL(url);
          return;
        }
        setUrl(url);
        loaded = true;
      })
      .catch(() => {
        // Transient: leave `loaded` false so the next mount tries again rather than showing
        // initials for the rest of the session.
      })
      .finally(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
}

/** Re-read the avatar after an upload or removal, so every consumer updates at once. */
export async function refreshOwnProfilePicture(): Promise<void> {
  generation += 1;
  loaded = false;
  loadPromise = null;
  await load();
}

export function useProfilePictureUrl(): string | null {
  const { config } = useAppConfig();
  const loginEnabled = config?.enableLogin === true;

  useEffect(() => {
    // Without login there is no user to have an avatar, and the endpoint would 401.
    if (!loginEnabled || loaded) return;
    void load();
  }, [loginEnabled]);

  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
