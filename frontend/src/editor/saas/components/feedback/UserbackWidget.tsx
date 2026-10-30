import { useEffect } from "react";
import Userback from "@userback/widget";
import { useAuth } from "@editor/auth/UseSession";
import {
  getUserbackInstance,
  setUserbackInstance,
} from "@editor/components/feedback/userbackInstance";

const USERBACK_TOKEN = import.meta.env.VITE_USERBACK_TOKEN;

/**
 * Loads Userback for the signed-in user with its own launcher hidden; the app's
 * feedback entry points open it through `useFeedback`.
 */
export default function UserbackWidget() {
  const { user } = useAuth();
  const userId = user?.id;
  const email = user?.email;
  const name: string | undefined = user?.user_metadata?.full_name;

  useEffect(() => {
    if (!USERBACK_TOKEN || !userId) return;
    // A cancelled run leaves the instance alone: the loader hands every caller
    // the same pending promise, so the run that replaced this one stores it.
    let cancelled = false;

    Userback(USERBACK_TOKEN, {
      autohide: true,
      user_data: { id: userId, info: { name, email } },
    })
      .then((instance) => {
        if (!cancelled) setUserbackInstance(instance);
      })
      .catch((error: unknown) => {
        console.warn(
          "Userback did not load; feedback opens the feedback page instead",
          error,
        );
      });

    return () => {
      cancelled = true;
      getUserbackInstance()?.destroy();
      setUserbackInstance(null);
    };
  }, [userId, email, name]);

  return null;
}
