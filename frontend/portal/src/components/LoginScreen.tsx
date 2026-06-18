import { SpringLoginPanel } from "@shared/auth";
import { useTheme } from "@portal/contexts/ThemeContext";
import markLight from "@shared/assets/stirling-mark-light.svg";
import markDark from "@shared/assets/stirling-mark-dark.svg";
import "@portal/components/LoginScreen.css";

/**
 * Full-screen login shown by the auth gate when no session is present. Drives
 * the shared Spring login panel; on success the gate re-evaluates and either
 * reveals the portal (admin) or redirects to the editor (non-admin).
 */
export function LoginScreen() {
  const { theme } = useTheme();
  return (
    <div className="portal-login">
      <div className="portal-login__card">
        <img
          className="portal-login__mark"
          src={theme === "dark" ? markDark : markLight}
          alt="Stirling"
        />
        <SpringLoginPanel
          labels={{ subtitle: "Sign in to the Stirling admin portal" }}
        />
      </div>
    </div>
  );
}
