import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@app/auth/UseSession";
import { readPendingConnect } from "@app/routes/pendingConnect";

/**
 * Sends a newly signed-in visitor back to the approval page they were pulled away
 * from.
 *
 * Mounted app-wide, not only in the auth callback: a confirmation email can land the
 * visitor anywhere in the app with a session, and only the ones below resolve the
 * request themselves.
 */
export function ResumePendingConnect() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const handled = useRef(false);

  useEffect(() => {
    if (loading || !session || handled.current) return;
    if (
      location.pathname === "/link" ||
      location.pathname === "/auth/callback"
    ) {
      return;
    }
    handled.current = true;
    const requestId = readPendingConnect();
    if (requestId) {
      navigate(`/link?request=${encodeURIComponent(requestId)}`, {
        replace: true,
      });
    }
  }, [loading, session, location.pathname, navigate]);

  return null;
}
