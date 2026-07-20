import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { supabase } from "@app/auth/supabase";
import type {
  Session,
  User as SupabaseUser,
  AuthError,
} from "@supabase/supabase-js";
import { synchronizeUserUpgrade } from "@app/services/userService";
import {
  syncOAuthAvatar,
  getProfilePictureMetadata,
  getProviderAvatarUrl,
  type ProfilePictureMetadata,
} from "@app/services/avatarSyncService";

// Extend Supabase User to include optional username for compatibility
export type User = SupabaseUser & { username?: string };

/**
 * Derive a display name from the Supabase user. Prefers the OAuth-provided
 * full_name / name, then the email. Anonymous users get the localised
 * "Guest" placeholder (SaaS's chosen label for guest sessions); returns
 * null only when there is no user object at all so consumers can pick
 * their own fallback.
 *
 * Exported for unit testing.
 */
export function deriveDisplayName(
  user: User | null | undefined,
  t: TFunction,
): string | null {
  if (!user) return null;
  if (user.is_anonymous) return t("auth.displayName.guest", "Guest");
  const metadata = user.user_metadata as
    | { full_name?: string; name?: string }
    | undefined;
  return (
    user.username || metadata?.full_name || metadata?.name || user.email || null
  );
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  /**
   * Human-readable name to show in the UI for the current session.
   * - A real identity (full_name / name / email) when the user is signed in.
   * - The localised "Guest" placeholder for anonymous (Supabase
   *   `is_anonymous`) sessions - SaaS's chosen label, see deriveDisplayName.
   * - null only when there is no user object at all (signed-out), so
   *   consumers can fall back to whatever makes sense.
   */
  displayName: string | null;
  /** Whether the current session is an anonymous (Supabase `is_anonymous`) guest. */
  isAnonymous: boolean;
  loading: boolean;
  error: AuthError | null;
  isPro: boolean | null;
  profilePictureUrl: string | null;
  profilePictureMetadata: ProfilePictureMetadata | null;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  refreshProStatus: () => Promise<void>;
  refreshProfilePicture: () => Promise<void>;
  refreshProfilePictureMetadata: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  displayName: null,
  isAnonymous: false,
  loading: true,
  error: null,
  isPro: null,
  profilePictureUrl: null,
  profilePictureMetadata: null,
  signOut: async () => {},
  refreshSession: async () => {},
  refreshProStatus: async () => {},
  refreshProfilePicture: async () => {},
  refreshProfilePictureMetadata: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(
    null,
  );
  const [profilePictureMetadata, setProfilePictureMetadata] =
    useState<ProfilePictureMetadata | null>(null);

  const fetchProStatus = useCallback(
    async (sessionToUse?: Session | null) => {
      const currentSession = sessionToUse ?? session;

      if (!currentSession?.user) {
        console.debug(
          "[Auth Debug] No user session, skipping pro status fetch",
        );
        setIsPro(null);
        return;
      }

      try {
        console.debug(
          "[Auth Debug] Fetching pro status for user:",
          currentSession.user.id,
        );
        const { data: proStatus, error } = await supabase.rpc("is_pro");

        if (error) {
          console.error("[Auth Debug] Error checking Pro status:", error);
          setIsPro(false); // Default to false if there's an error
        } else {
          const isProUser = Boolean(proStatus);
          setIsPro(isProUser);
          console.debug("[Auth Debug] Pro status fetched:", isProUser);
        }
      } catch (error: unknown) {
        console.debug("[Auth Debug] Failed to fetch pro status:", error);
        setIsPro(false); // Default to false if there's an error
      }
    },
    [session],
  );

  const refreshProStatus = useCallback(async () => {
    await fetchProStatus();
  }, [fetchProStatus]);

  // Provider photo as interim fallback when the bucket copy is missing —
  // skipped when the user explicitly chose upload/removal (source "upload").
  const providerAvatarFallback = useCallback(
    async (user: SupabaseUser): Promise<string | null> => {
      try {
        const metadata = await getProfilePictureMetadata(user.id);
        if (metadata?.source === "upload") return null;
        return getProviderAvatarUrl(user);
      } catch {
        return getProviderAvatarUrl(user);
      }
    },
    [],
  );

  const fetchProfilePicture = useCallback(
    async (sessionToUse?: Session | null) => {
      const currentSession = sessionToUse ?? session;

      if (!currentSession?.user) {
        console.debug(
          "[Auth Debug] No user session, skipping profile picture fetch",
        );
        setProfilePictureUrl(null);
        return;
      }

      try {
        const PROFILE_BUCKET = "profile-pictures";
        const profilePath = `${currentSession.user.id}/avatar`;

        console.debug(
          "[Auth Debug] Fetching profile picture for user:",
          currentSession.user.id,
        );
        const { data, error } = await supabase.storage
          .from(PROFILE_BUCKET)
          .createSignedUrl(profilePath, 60 * 60);

        if (error) {
          // Profile picture not found is expected for users without uploads
          console.debug(
            "[Auth Debug] Profile picture not available:",
            error.message,
          );
          setProfilePictureUrl(
            await providerAvatarFallback(currentSession.user),
          );
        } else {
          setProfilePictureUrl(data.signedUrl);
          console.debug(
            "[Auth Debug] Profile picture URL fetched successfully",
          );
        }
      } catch (error: unknown) {
        console.debug("[Auth Debug] Failed to fetch profile picture:", error);
        setProfilePictureUrl(await providerAvatarFallback(currentSession.user));
      }
    },
    [session, providerAvatarFallback],
  );

  const refreshProfilePicture = useCallback(async () => {
    await fetchProfilePicture();
  }, [fetchProfilePicture]);

  const fetchProfilePictureMetadata = useCallback(
    async (sessionToUse?: Session | null) => {
      const currentSession = sessionToUse ?? session;

      if (!currentSession?.user) {
        console.debug(
          "[Auth Debug] No user session, skipping profile picture metadata fetch",
        );
        setProfilePictureMetadata(null);
        return;
      }

      try {
        console.debug(
          "[Auth Debug] Fetching profile picture metadata for user:",
          currentSession.user.id,
        );
        const metadata = await getProfilePictureMetadata(
          currentSession.user.id,
        );
        setProfilePictureMetadata(metadata);
        console.debug(
          "[Auth Debug] Profile picture metadata fetched:",
          metadata,
        );
      } catch (error: unknown) {
        console.debug(
          "[Auth Debug] Failed to fetch profile picture metadata:",
          error,
        );
        setProfilePictureMetadata(null);
      }
    },
    [session],
  );

  const refreshProfilePictureMetadata = useCallback(async () => {
    await fetchProfilePictureMetadata();
  }, [fetchProfilePictureMetadata]);

  const refreshSession = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.auth.refreshSession();

      if (error) {
        console.error("[Auth Debug] Session refresh error:", error);
        setError(error);
        setSession(null);
      } else {
        console.debug("[Auth Debug] Session refreshed successfully");
        setSession(data.session);
      }
    } catch (err) {
      console.error(
        "[Auth Debug] Unexpected error during session refresh:",
        err,
      );
      setError(err as AuthError);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setError(null);
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("[Auth Debug] Sign out error:", error);
        setError(error);
      } else {
        console.debug("[Auth Debug] Signed out successfully");
        setSession(null);
      }
    } catch (err) {
      console.error("[Auth Debug] Unexpected error during sign out:", err);
      setError(err as AuthError);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Load current session on first mount
    const initializeAuth = async () => {
      try {
        console.debug("[Auth Debug] Initializing auth...");
        const { data, error } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error("[Auth Debug] Initial session error:", error);
          setError(error);
        } else {
          console.debug("[Auth Debug] Initial session loaded:", {
            hasSession: !!data.session,
            userId: data.session?.user?.id,
            email: data.session?.user?.email,
          });
          setSession(data.session);

          // Fetch pro status, profile picture metadata, and profile picture using the session from the response
          if (data.session?.user) {
            // Sync OAuth avatar in background; fetch the picture once the
            // sync settles instead of guessing with a fixed delay.
            syncOAuthAvatar(data.session.user)
              .catch((err) => {
                console.debug(
                  "[Auth Debug] Failed to sync OAuth avatar on init:",
                  err,
                );
                return false;
              })
              .then(() => fetchProfilePicture(data.session));

            await fetchProStatus(data.session);
            await fetchProfilePictureMetadata(data.session);
          }
        }
      } catch (err) {
        console.error(
          "[Auth Debug] Unexpected error during auth initialization:",
          err,
        );
        if (mounted) {
          setError(err as AuthError);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;

      console.debug("[Auth Debug] Auth state change:", {
        event,
        hasSession: !!newSession,
        userId: newSession?.user?.id,
        email: newSession?.user?.email,
        timestamp: new Date().toISOString(),
      });

      // Don't run supabase calls inside this callback; schedule them
      setTimeout(() => {
        if (mounted) {
          setSession(newSession);
          setError(null);

          // Additional handling for specific events
          if (event === "SIGNED_OUT") {
            console.debug("[Auth Debug] User signed out, clearing session");
            // Clear pro status, profile picture, and metadata on sign out
            setIsPro(null);
            setProfilePictureUrl(null);
            setProfilePictureMetadata(null);
          } else if (event === "SIGNED_IN") {
            console.debug("[Auth Debug] User signed in successfully");
            if (newSession?.user) {
              // Note: we deliberately do NOT toggle `loading` here. Supabase
              // also fires SIGNED_IN on tab visibility / token-refresh wakeups
              // (per its docs: "SIGNED_IN is fired when a user signs in OR
              // when the access token is refreshed"), and gating the UI on
              // `loading` would unmount Landing -> HomePage every time the
              // user switches tabs back. Initial-mount loading is handled by
              // `initializeAuth` above; downstream fetches expose their own
              // null/loading states.

              // Sync OAuth avatar in background (don't block other fetches)
              const avatarSync = syncOAuthAvatar(newSession.user).catch(
                (err) => {
                  console.debug(
                    "[Auth Debug] Failed to sync OAuth avatar:",
                    err,
                  );
                  return false;
                },
              );

              // Fetch user data in parallel
              Promise.all([
                fetchProStatus(newSession),
                fetchProfilePictureMetadata(newSession),
              ]).then(() => {
                // Fetch the picture once the avatar sync settles.
                avatarSync.then(() => {
                  fetchProfilePicture(newSession).finally(() => {
                    console.debug(
                      "[Auth Debug] User data fully loaded after sign in",
                    );
                  });
                });
              });
            }
          } else if (event === "TOKEN_REFRESHED") {
            console.debug("[Auth Debug] Token refreshed");
            // Optionally refresh pro status, profile picture metadata, and profile picture on token refresh
            if (newSession?.user) {
              Promise.all([
                fetchProStatus(newSession),
                fetchProfilePictureMetadata(newSession),
                fetchProfilePicture(newSession),
              ]).then(() => {
                console.debug(
                  "[Auth Debug] User data refreshed after token refresh",
                );
              });
            }
          } else if (event === "USER_UPDATED") {
            console.debug("[Auth Debug] User updated");

            // Check if this is a pending OAuth upgrade completion
            const pendingUpgrade = sessionStorage.getItem("pendingUpgrade");
            const upgradeProvider = sessionStorage.getItem("upgradeProvider");

            if (
              pendingUpgrade &&
              newSession?.user &&
              newSession.user.is_anonymous === false
            ) {
              console.debug(
                "[Auth Debug] Processing pending OAuth upgrade:",
                upgradeProvider,
              );

              // Clear the flags first to prevent loops
              sessionStorage.removeItem("pendingUpgrade");
              sessionStorage.removeItem("upgradeProvider");

              // Synchronize with backend
              synchronizeUserUpgrade(upgradeProvider || undefined)
                .then(() => {
                  console.debug(
                    "[Auth Debug] User upgrade synchronized successfully",
                  );

                  // Refresh pro status, profile picture metadata, and profile picture after upgrade
                  if (newSession?.user) {
                    return Promise.all([
                      fetchProStatus(newSession),
                      fetchProfilePictureMetadata(newSession),
                      fetchProfilePicture(newSession),
                    ]);
                  }
                })
                .then(() => {
                  console.debug(
                    "[Auth Debug] User data refreshed after upgrade",
                  );
                })
                .catch((err) => {
                  console.error(
                    "[Auth Debug] Failed to synchronize user upgrade:",
                    err,
                  );
                });
            }
          }
        }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const { t } = useTranslation();
  const user = session?.user ?? null;
  const value: AuthContextType = {
    session,
    user,
    displayName: deriveDisplayName(user, t),
    isAnonymous: Boolean(user?.is_anonymous),
    loading,
    error,
    isPro,
    profilePictureUrl,
    profilePictureMetadata,
    signOut,
    refreshSession,
    refreshProStatus,
    refreshProfilePicture,
    refreshProfilePictureMetadata,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}

// Debug hook to expose auth state for debugging
export function useAuthDebug() {
  const auth = useAuth();

  useEffect(() => {
    console.debug("[Auth Debug] Current auth state:", {
      hasSession: !!auth.session,
      hasUser: !!auth.user,
      loading: auth.loading,
      hasError: !!auth.error,
      userId: auth.user?.id,
      email: auth.user?.email,
      provider: auth.user?.app_metadata?.provider,
    });
  }, [auth.session, auth.user, auth.loading, auth.error]);

  return auth;
}
