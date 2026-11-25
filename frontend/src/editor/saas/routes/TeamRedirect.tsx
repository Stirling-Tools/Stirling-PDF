import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@editor/auth/UseSession";
import { LoadingFallback } from "@editor/components/shared/LoadingFallback";
import { rememberPendingDestination } from "@editor/services/pendingDestination";
import { TEAM_PATH } from "@editor/routes/teamPath";
import { TEAM_CHECKOUT_PATH } from "@editor/routes/teamCheckoutLink";

/**
 * Routes a Team buyer by who they are, so one link works for everyone: an account goes straight to
 * the checkout in Usage & Billing (which leaves an existing Team customer on billing), anyone else
 * signs in first and comes back here. A guest counts as signed out, since a guest session cannot
 * hold a subscription.
 */
export function TeamRedirect() {
  const { session, isAnonymous, loading } = useAuth();
  const { search } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (session && !isAnonymous) {
      navigate(TEAM_CHECKOUT_PATH, { replace: true });
      return;
    }
    const here = `${TEAM_PATH}${search}`;
    // Remembered as well as named: a sign-up's confirmation email cannot carry a `next`.
    rememberPendingDestination(here);
    navigate(`/login?next=${encodeURIComponent(here)}`, { replace: true });
  }, [loading, session, isAnonymous, search, navigate]);

  return <LoadingFallback />;
}
