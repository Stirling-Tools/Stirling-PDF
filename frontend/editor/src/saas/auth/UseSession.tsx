import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import { supabase } from "@app/auth/supabase";
import type {
  Session,
  User as SupabaseUser,
  AuthError,
} from "@supabase/supabase-js";
import {
  CreditSummary,
  SubscriptionInfo,
  CreditCheckResult,
  ApiCredits,
} from "@app/types/credits";
import apiClient, {
  setGlobalCreditUpdateCallback,
} from "@app/services/apiClient";
import { synchronizeUserUpgrade } from "@app/services/userService";
import {
  syncOAuthAvatar,
  getProfilePictureMetadata,
  type ProfilePictureMetadata,
} from "@app/services/avatarSyncService";

// Extend Supabase User to include optional username for compatibility
export type User = SupabaseUser & { username?: string };

export interface TrialStatus {
  isTrialing: boolean;
  trialEnd: string;
  daysRemaining: number;
  hasPaymentMethod: boolean;
  hasScheduledSub: boolean;
  status: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  error: AuthError | null;
  creditBalance: number | null;
  subscription: SubscriptionInfo | null;
  creditSummary: CreditSummary | null;
  isPro: boolean | null;
  trialStatus: TrialStatus | null;
  profilePictureUrl: string | null;
  profilePictureMetadata: ProfilePictureMetadata | null;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  hasSufficientCredits: (requiredCredits: number) => CreditCheckResult;
  updateCredits: (newBalance: number) => void;
  refreshCredits: () => Promise<void>;
  refreshProStatus: () => Promise<void>;
  refreshTrialStatus: () => Promise<void>;
  refreshProfilePicture: () => Promise<void>;
  refreshProfilePictureMetadata: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  error: null,
  creditBalance: null,
  subscription: null,
  creditSummary: null,
  isPro: null,
  trialStatus: null,
  profilePictureUrl: null,
  profilePictureMetadata: null,
  signOut: async () => {},
  refreshSession: async () => {},
  hasSufficientCredits: () => ({
    hasSufficientCredits: false,
    currentBalance: 0,
    requiredCredits: 0,
  }),
  updateCredits: () => {},
  refreshCredits: async () => {},
  refreshProStatus: async () => {},
  refreshTrialStatus: async () => {},
  refreshProfilePicture: async () => {},
  refreshProfilePictureMetadata: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(
    null,
  );
  const [creditSummary, setCreditSummary] = useState<CreditSummary | null>(
    null,
  );
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(
    null,
  );
  const [profilePictureMetadata, setProfilePictureMetadata] =
    useState<ProfilePictureMetadata | null>(null);

  const fetchCredits = useCallback(
    async (sessionToUse?: Session | null) => {
      const currentSession = sessionToUse ?? session;

      if (!currentSession?.user) {
        console.debug("[Auth Debug] No user session, skipping credit fetch");
        setCreditBalance(null);
        setCreditSummary(null);
        setSubscription(null);
        return;
      }

      try {
        console.debug(
          "[Auth Debug] Fetching credits for user:",
          currentSession.user.id,
        );
        const response = await apiClient.get<ApiCredits>("/api/v1/credits");
        const apiCredits = response.data;

        // Map server payload to app CreditSummary
        const credits: CreditSummary = {
          currentCredits: apiCredits.totalAvailableCredits,
          maxCredits:
            apiCredits.weeklyCreditsAllocated + apiCredits.totalBoughtCredits,
          creditsUsed:
            apiCredits.weeklyCreditsAllocated -
            apiCredits.weeklyCreditsRemaining +
            (apiCredits.totalBoughtCredits - apiCredits.boughtCreditsRemaining),
          creditsRemaining: apiCredits.totalAvailableCredits,
          resetDate: apiCredits.weeklyResetDate,
          weeklyAllowance: apiCredits.weeklyCreditsAllocated,
        };

        setCreditSummary(credits);
        setCreditBalance(credits.creditsRemaining);

        const subscriptionInfo: SubscriptionInfo = {
          status: "active",
          tier: (credits.weeklyAllowance || 0) > 100 ? "premium" : "free",
          creditsPerWeek: credits.weeklyAllowance,
          maxCredits: credits.maxCredits,
        };
        setSubscription(subscriptionInfo);

        console.debug("[Auth Debug] Credits fetched successfully:", credits);
      } catch (error: unknown) {
        console.debug("[Auth Debug] Failed to fetch credits:", error);
        // Don't set error state for credit fetching failures to avoid disrupting auth flow
        // Credits might not be available in all deployments
        setCreditBalance(null);
        setCreditSummary(null);
        setSubscription(null);
      }
    },
    [session],
  );

  const refreshCredits = useCallback(async () => {
    await fetchCredits();
  }, [fetchCredits]);

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

  const fetchTrialStatus = useCallback(
    async (sessionToUse?: Session | null) => {
      const currentSession = sessionToUse ?? session;

      if (!currentSession?.user) {
        console.debug(
          "[Auth Debug] No user session, skipping trial status fetch",
        );
        setTrialStatus(null);
        return;
      }

      try {
        console.debug(
          "[Auth Debug] Fetching trial status for user:",
          currentSession.user.id,
        );
        const { data, error } = await supabase
          .from("billing_subscriptions")
          .select(
            "status, trial_end, has_payment_method, scheduled_subscription_id",
          )
          .in("status", ["trialing", "incomplete_expired", "canceled"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("[Auth Debug] Error fetching trial status:", error);
          setTrialStatus(null);
          return;
        }

        if (data?.trial_end) {
          const trialEnd = new Date(data.trial_end);
          const now = new Date();
          const daysRemaining = Math.ceil(
            (trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          );

          setTrialStatus({
            isTrialing: data.status === "trialing" && daysRemaining > 0,
            trialEnd: data.trial_end,
            daysRemaining: Math.max(0, daysRemaining),
            hasPaymentMethod: data.has_payment_method || false,
            hasScheduledSub: !!data.scheduled_subscription_id,
            status: data.status,
          });
          console.debug("[Auth Debug] Trial status fetched:", {
            status: data.status,
            daysRemaining: Math.max(0, daysRemaining),
            hasPaymentMethod: data.has_payment_method,
            isTrialing: data.status === "trialing" && daysRemaining > 0,
          });
        } else {
          setTrialStatus(null);
        }
      } catch (error: unknown) {
        console.debug("[Auth Debug] Failed to fetch trial status:", error);
        setTrialStatus(null);
      }
    },
    [session],
  );

  const refreshTrialStatus = useCallback(async () => {
    await fetchTrialStatus();
  }, [fetchTrialStatus]);

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
          setProfilePictureUrl(null);
        } else {
          setProfilePictureUrl(data.signedUrl);
          console.debug(
            "[Auth Debug] Profile picture URL fetched successfully",
          );
        }
      } catch (error: unknown) {
        console.debug("[Auth Debug] Failed to fetch profile picture:", error);
        setProfilePictureUrl(null);
      }
    },
    [session],
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

  const updateCredits = useCallback(
    (newBalance: number) => {
      console.debug("[Auth Debug] Updating credit balance:", {
        from: creditBalance,
        to: newBalance,
      });
      setCreditBalance(newBalance);
      // Also update the creditSummary if it exists
      if (creditSummary) {
        const updatedSummary: CreditSummary = {
          ...creditSummary,
          creditsRemaining: newBalance,
          currentCredits: newBalance,
        };
        setCreditSummary(updatedSummary);
      }
    },
    [creditSummary],
  );

  const hasSufficientCredits = useCallback(
    (requiredCredits: number): CreditCheckResult => {
      const currentBalance = creditBalance ?? 0;
      const hasSufficient = currentBalance >= requiredCredits;
      console.debug("[Auth Debug] Credit check:", {
        requiredCredits,
        currentBalance,
        hasSufficient,
      });

      return {
        hasSufficientCredits: hasSufficient,
        currentBalance,
        requiredCredits,
        shortfall: hasSufficient ? undefined : requiredCredits - currentBalance,
      };
    },
    [creditBalance],
  );

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

  // Set up global credit update callback
  useEffect(() => {
    setGlobalCreditUpdateCallback(updateCredits);
  }, [updateCredits]);

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

          // Fetch credits, pro status, trial status, profile picture metadata, and profile picture using the session from the response
          if (data.session?.user) {
            // Sync OAuth avatar in background
            syncOAuthAvatar(data.session.user).catch((err) => {
              console.debug(
                "[Auth Debug] Failed to sync OAuth avatar on init:",
                err,
              );
            });

            await fetchCredits(data.session);
            await fetchProStatus(data.session);
            await fetchTrialStatus(data.session);
            await fetchProfilePictureMetadata(data.session);

            // Small delay to allow avatar sync to complete if quick
            setTimeout(() => {
              fetchProfilePicture(data.session);
            }, 500);
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
            // Clear credit data, pro status, trial status, profile picture, and metadata on sign out
            setCreditBalance(null);
            setCreditSummary(null);
            setSubscription(null);
            setIsPro(null);
            setTrialStatus(null);
            setProfilePictureUrl(null);
            setProfilePictureMetadata(null);
          } else if (event === "SIGNED_IN") {
            console.debug("[Auth Debug] User signed in successfully");
            if (newSession?.user) {
              setLoading(true);

              // Sync OAuth avatar in background (don't block other fetches)
              syncOAuthAvatar(newSession.user).catch((err) => {
                console.debug("[Auth Debug] Failed to sync OAuth avatar:", err);
              });

              // Fetch user data in parallel
              Promise.all([
                fetchCredits(newSession),
                fetchProStatus(newSession),
                fetchTrialStatus(newSession),
                fetchProfilePictureMetadata(newSession),
              ]).then(() => {
                // Fetch profile picture AFTER sync has had time to complete
                // Use a small delay to allow avatar sync to finish if it's quick
                setTimeout(() => {
                  fetchProfilePicture(newSession).finally(() => {
                    setLoading(false);
                    console.debug(
                      "[Auth Debug] User data fully loaded after sign in",
                    );
                  });
                }, 500);
              });
            }
          } else if (event === "TOKEN_REFRESHED") {
            console.debug("[Auth Debug] Token refreshed");
            // Optionally refresh credits, pro status, trial status, profile picture metadata, and profile picture on token refresh
            if (newSession?.user) {
              Promise.all([
                fetchCredits(newSession),
                fetchProStatus(newSession),
                fetchTrialStatus(newSession),
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

                  // Refresh credits, pro status, trial status, profile picture metadata, and profile picture after upgrade
                  if (newSession?.user) {
                    return Promise.all([
                      fetchCredits(newSession),
                      fetchProStatus(newSession),
                      fetchTrialStatus(newSession),
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

  const value: AuthContextType = {
    session,
    user: session?.user ?? null,
    loading,
    error,
    creditBalance,
    subscription,
    creditSummary,
    isPro,
    trialStatus,
    profilePictureUrl,
    profilePictureMetadata,
    signOut,
    refreshSession,
    hasSufficientCredits,
    updateCredits,
    refreshCredits,
    refreshProStatus,
    refreshTrialStatus,
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
