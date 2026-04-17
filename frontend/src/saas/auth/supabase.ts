import { createClient } from "@supabase/supabase-js";

// Debug helper to log Supabase configuration
const debugConfig = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  console.log("[Supabase Debug] Configuration:", {
    url: url ? "✓ URL configured" : "✗ URL missing",
    key: key ? "✓ Key configured" : "✗ Key missing",
    urlValue: url || "undefined",
    keyValue: key ? `${key.substring(0, 20)}...` : "undefined",
  });

  return { url, key };
};

const config = debugConfig();

if (!config.url) {
  throw new Error("Missing VITE_SUPABASE_URL environment variable");
}

if (!config.key) {
  throw new Error(
    "Missing VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY environment variable",
  );
}

export const supabase = createClient(config.url, config.key, {
  auth: {
    persistSession: true, // keep session in localStorage
    autoRefreshToken: true,
    detectSessionInUrl: true, // helpful on first load after redirect
    // debug: import.meta.env.DEV, // Enable debug logs in development
  },
});

// Debug helper for auth events
export const debugAuthEvents = () => {
  supabase.auth.onAuthStateChange((event, session) => {
    console.log("[Supabase Debug] Auth state change:", {
      event,
      hasSession: !!session,
      userId: session?.user?.id,
      email: session?.user?.email,
      provider: session?.user?.app_metadata?.provider,
      timestamp: new Date().toISOString(),
    });
  });
};

// Debug auth events can be manually enabled by calling debugAuthEvents()
// Commented out to prevent excessive logging on every page load
// if (import.meta.env.DEV) {
//   debugAuthEvents()
// }

// Anonymous authentication functions
export const signInAnonymously = async () => {
  try {
    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) {
      console.error("[Supabase] Anonymous sign-in error:", error);
      throw error;
    }

    console.log("[Supabase] Anonymous sign-in successful:", {
      userId: data.user?.id,
      isAnonymous: data.user?.is_anonymous,
    });

    return { data, error };
  } catch (error) {
    console.error("[Supabase] Anonymous sign-in failed:", error);
    throw error;
  }
};

// Account linking functions
export const linkEmailIdentity = async (email: string, password?: string) => {
  try {
    const updateData: { email: string; password?: string } = { email };
    if (password) {
      updateData.password = password;
    }

    const { data, error } = await supabase.auth.updateUser(updateData);

    if (error) {
      console.error("[Supabase] Email linking error:", error);
      throw error;
    }

    // Refresh session to get updated token with new user metadata
    const { error: refreshError } = await supabase.auth.refreshSession();

    if (refreshError) {
      console.warn(
        "[Supabase] Session refresh after email linking failed:",
        refreshError,
      );
      // Don't throw - linking was successful, refresh is just for consistency
    } else {
      console.log("[Supabase] Session refreshed after email linking");
    }

    console.log("[Supabase] Email linked successfully:", {
      email,
      userId: data.user?.id,
    });

    return { data, error };
  } catch (error) {
    console.error("[Supabase] Email linking failed:", error);
    throw error;
  }
};

export const linkOAuthIdentity = async (
  provider: "google" | "github" | "apple" | "azure",
  redirectTo?: string,
) => {
  try {
    const { data, error } = await supabase.auth.linkIdentity({
      provider: provider,
      options: redirectTo ? { redirectTo } : undefined,
    });

    if (error) {
      console.error("[Supabase] OAuth linking error:", error);
      throw error;
    }

    console.log("[Supabase] OAuth identity linked successfully:", {
      provider,
      redirectTo,
      url: data.url,
    });

    return { data, error };
  } catch (error) {
    console.error("[Supabase] OAuth linking failed:", error);
    throw error;
  }
};

// Helper function to check if user is anonymous
export const isUserAnonymous = (user: { is_anonymous?: boolean }) => {
  return user?.is_anonymous === true;
};

// Get current user session
export const getCurrentUser = async () => {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      console.error("[Supabase] Get user error:", error);
      throw error;
    }

    return user;
  } catch (error) {
    console.error("[Supabase] Get user failed:", error);
    throw error;
  }
};
