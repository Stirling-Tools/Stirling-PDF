import { supabase } from "@app/auth/supabase";
import { absoluteWithBasePath } from "@app/constants/app";

export const useAuthService = () => {
  const signUp = async (email: string, password: string, name?: string) => {
    console.log("[Signup] Creating account for:", email);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        emailRedirectTo: absoluteWithBasePath("/auth/callback"),
        data: { full_name: name },
      },
    });

    if (error) {
      console.error("[Signup] Sign up error:", error);
      throw new Error(error.message);
    }

    if (data.user) {
      console.log("[Signup] Sign up successful:", data.user);
      return {
        user: data.user,
        session: data.session,
        requiresEmailConfirmation: data.user && !data.session,
      };
    }

    throw new Error("Unknown error occurred during signup");
  };

  const signInWithProvider = async (
    provider: "github" | "google" | "apple" | "azure",
  ) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: absoluteWithBasePath("/auth/callback") },
    });

    if (error) {
      throw new Error(error.message);
    }
  };

  return {
    signUp,
    signInWithProvider,
  };
};
