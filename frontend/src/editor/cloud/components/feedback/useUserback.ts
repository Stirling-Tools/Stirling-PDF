import { useEffect } from "react";
import Userback from "@userback/widget";
import {
  getUserbackInstance,
  setUserbackInstance,
} from "@editor/components/feedback/userbackInstance";

export interface UserbackUser {
  id: string;
  name?: string;
  email?: string;
}

// Module-level because the loader is: every run shares its one pending load.
let liveRun: symbol | null = null;

/**
 * Loads Userback for `user` with its own launcher hidden, and unloads it when
 * the user goes or changes. Loads nothing without a token or a user. The app's
 * feedback entry points open it through `useFeedback`.
 */
export function useUserback(
  token: string | undefined,
  user: UserbackUser | null,
): void {
  const userId = user?.id;
  const name = user?.name;
  const email = user?.email;

  useEffect(() => {
    if (!token || !userId) return;
    const run = Symbol("userback run");
    liveRun = run;

    Userback(token, {
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
  }, [token, userId, name, email]);
}
