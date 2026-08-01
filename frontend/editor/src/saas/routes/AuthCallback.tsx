import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@app/auth/supabase";
import { Button } from "@app/ui/Button";
import { withBasePath } from "@app/constants/app";
import { markLoginLandingPending } from "@app/utils/loginLanding";
import { AuthShell } from "@app/auth/ui/AuthShell";
import ErrorMessage from "@app/auth/ui/ErrorMessage";
import { Spinner } from "@app/ui/Spinner";
import "@app/auth/ui/auth.css";
import loginHeader from "@app/assets/brand/modern-logo/LoginLightModeHeader.svg";

interface CallbackState {
  status: "processing" | "success" | "error";
  message: string;
  details?: Record<string, unknown>;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [state, setState] = useState<CallbackState>({
    status: "processing",
    message: "Processing authentication...",
  });

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");
        const next = url.searchParams.get("next") || "/";

        console.log("[Auth Callback Debug] URL parameters:", {
          hasCode: !!code,
          hasError: !!error,
          error,
          errorDescription,
          next,
          fullUrl: window.location.href,
        });

        // Handle OAuth errors
        if (error) {
          const errorMsg = errorDescription || error;
          console.error("[Auth Callback Debug] OAuth error:", {
            error,
            errorDescription,
          });

          setState({
            status: "error",
            message: `Authentication failed: ${errorMsg}`,
            details: { error, errorDescription },
          });

          // Redirect to login page after 3 seconds
          setTimeout(() => navigate("/login", { replace: true }), 3000);
          return;
        }

        // If PKCE/SSR-style code is present, exchange it for a session
        if (code) {
          console.log("[Auth Callback Debug] Exchanging code for session...");

          setState({
            status: "processing",
            message: "Exchanging authorization code...",
          });

          const { data, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.error(
              "[Auth Callback Debug] Code exchange error:",
              exchangeError,
            );

            setState({
              status: "error",
              message: `Failed to complete sign in: ${exchangeError.message}`,
              details: { exchangeError },
            });

            setTimeout(() => navigate("/login", { replace: true }), 3000);
            return;
          }

          console.log("[Auth Callback Debug] Code exchange successful:", {
            hasSession: !!data.session,
            userId: data.session?.user?.id,
            email: data.session?.user?.email,
          });

          setState({
            status: "success",
            message: "Sign in successful! Redirecting...",
            details: {
              userId: data.session?.user?.id,
              email: data.session?.user?.email,
              provider: data.session?.user?.app_metadata?.provider,
            },
          });
        } else {
          // No code present - might already be authenticated
          console.log(
            "[Auth Callback Debug] No code present, checking existing session...",
          );

          const { data: sessionData } = await supabase.auth.getSession();

          if (sessionData.session) {
            console.log("[Auth Callback Debug] Existing session found");
            setState({
              status: "success",
              message: "Already signed in! Redirecting...",
            });
          } else {
            console.log("[Auth Callback Debug] No session found");
            setState({
              status: "error",
              message: "No authentication data found",
            });
            setTimeout(() => navigate("/login", { replace: true }), 2000);
            return;
          }
        }

        // Redirect to the intended destination. Reject protocol-relative
        // "//host" values (same guard as Login's `next`) so a crafted callback
        // URL can't bounce the user off-origin after sign-in.
        const destination =
          next.startsWith("/") && !next.startsWith("//") ? next : "/";
        console.log("[Auth Callback Debug] Redirecting to:", destination);

        // Fresh OAuth / magic-link login with no explicit destination: let the
        // role-based landing redirect route team leads to the processor.
        if (destination === "/") markLoginLandingPending();

        setTimeout(() => navigate(destination, { replace: true }), 1500);
      } catch (err) {
        console.error("[Auth Callback Debug] Unexpected error:", err);

        setState({
          status: "error",
          message: `Unexpected error: ${err instanceof Error ? err.message : "Unknown error"}`,
          details: { error: err },
        });

        setTimeout(() => navigate("/login", { replace: true }), 3000);
      }
    };

    handleCallback();
  }, [navigate]);

  const getTitle = () => {
    switch (state.status) {
      case "processing":
        return "Signing you in";
      case "success":
        return "You're all set!";
      case "error":
        return "Authentication failed";
      default:
        return "Authentication";
    }
  };

  return (
    <AuthShell>
      <div className="auth-logo-block">
        <img
          src={loginHeader}
          alt="Stirling PDF"
          className="auth-logo-header auth-logo-header--light"
        />
        <img
          src={withBasePath("/modern-logo/LoginDarkModeHeader.svg")}
          alt="Stirling PDF"
          className="auth-logo-header auth-logo-header--dark"
        />
      </div>

      <h1 className="login-title" style={{ textAlign: "center" }}>
        {getTitle()}
      </h1>

      {state.status === "error" ? (
        <ErrorMessage error={state.message} />
      ) : (
        <p className="login-subtitle" style={{ textAlign: "center" }}>
          {state.message}
        </p>
      )}

      {state.status === "processing" && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            margin: "1rem 0",
          }}
        >
          <Spinner size="md" />
        </div>
      )}

      {state.status === "error" && (
        <div className="auth-section">
          <Button
            accent="danger"
            fullWidth
            onClick={() => navigate("/login", { replace: true })}
          >
            Back to login
          </Button>
        </div>
      )}

      {import.meta.env.DEV && state.details && (
        <details className="mt-6 text-left">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
            Debug Information
          </summary>
          <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto">
            {JSON.stringify(state.details, null, 2)}
          </pre>
        </details>
      )}
    </AuthShell>
  );
}
