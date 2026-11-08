import { useEffect } from "react";
import Userback from "@userback/widget";
import { useAuth } from "@editor/auth/UseSession";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import {
  getUserbackInstance,
  setUserbackInstance,
} from "@editor/components/feedback/userbackInstance";

const USERBACK_TOKEN = import.meta.env.VITE_USERBACK_TOKEN;

// Module-level because the loader is: every run shares its one pending load.
let liveRun: symbol | null = null;

/**
 * Loads Userback for the signed-in user with its own launcher hidden; the app's
 * feedback entry points open it through `useFeedback`.
 */
export default function UserbackWidget() {
  const { user } = useAuth();
  const { config } = useAppConfig();
  const feedbackEnabled = config?.enableFeedback === true;
  const userId = user?.id;
  const email = user?.email;
  const name: string | undefined = user?.user_metadata?.full_name;

  useEffect(() => {
    if (!feedbackEnabled || !USERBACK_TOKEN || !userId) return;
    const run = Symbol("userback run");
    liveRun = run;

    Userback(USERBACK_TOKEN, {
      autohide: true,
      user_data: { id: userId, info: { name, email } },
    })
      .then((instance) => {
        // Every run gets the same instance, so the newest run keeps it; with no
        // run left it would stay loaded with this user's details for the next sign-in.
        if (liveRun === run) setUserbackInstance(instance);
        else if (liveRun === null) instance.destroy();
      })
      .catch((error: unknown) => {
        console.warn(
          "Userback did not load; feedback opens the feedback page instead",
          error,
        );
      });

    return () => {
      if (liveRun === run) liveRun = null;
      getUserbackInstance()?.destroy();
      setUserbackInstance(null);
    };
  }, [feedbackEnabled, userId, email, name]);

  return null;
}
