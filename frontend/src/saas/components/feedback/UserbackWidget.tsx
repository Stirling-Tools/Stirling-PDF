import { useEffect, useRef } from "react";
import Userback from "@userback/widget";
import { useAuth } from "@app/auth/UseSession";

interface UserbackWidgetProps {
  token: string;
}

interface UserbackInstance {
  destroy: () => void;
}

export default function UserbackWidget({ token }: UserbackWidgetProps) {
  const { user } = useAuth();
  const userbackRef = useRef<UserbackInstance | null>(null);
  const initializingRef = useRef(false);

  useEffect(() => {
    if (!user || initializingRef.current) return;

    initializingRef.current = true;

    const initializeUserback = async () => {
      try {
        // Prepare user data options
        const userInfo: { name?: string; email?: string } = {};
        if (user.user_metadata?.full_name)
          userInfo.name = user.user_metadata.full_name;
        if (user.email) userInfo.email = user.email;

        const options = {
          user_data: {
            id: user.id,
            info: userInfo,
          },
        };

        // Initialize Userback
        userbackRef.current = await Userback(token, options);
      } finally {
        initializingRef.current = false;
      }
    };

    initializeUserback();

    // Cleanup function
    return () => {
      if (
        userbackRef.current &&
        typeof userbackRef.current.destroy === "function"
      ) {
        userbackRef.current.destroy();
      }
      initializingRef.current = false;
    };
  }, [user, token]);

  return null; // This component doesn't render anything visible
}
