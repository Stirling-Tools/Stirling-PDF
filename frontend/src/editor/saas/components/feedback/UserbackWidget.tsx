import { useAuth } from "@editor/auth/UseSession";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useUserback } from "@editor/components/feedback/useUserback";

const USERBACK_TOKEN = import.meta.env.VITE_USERBACK_TOKEN;

/** Loads Userback for the signed-in user while the server has feedback on. */
export default function UserbackWidget() {
  const { user } = useAuth();
  const { config } = useAppConfig();
  const feedbackEnabled = config?.enableFeedback === true;
  const name: string | undefined = user?.user_metadata?.full_name;

  useUserback(
    USERBACK_TOKEN,
    feedbackEnabled && user ? { id: user.id, name, email: user.email } : null,
  );

  return null;
}
