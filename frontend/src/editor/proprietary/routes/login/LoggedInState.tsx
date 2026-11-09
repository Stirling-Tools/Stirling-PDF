import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingFallback } from "@editor/components/shared/LoadingFallback";
import { takePendingDestination } from "@editor/services/pendingDestination";
import { resolveLandingPath } from "@editor/utils/loginLanding";

export default function LoggedInState() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    // A signed-in visitor on the login page has just finished an auth detour, so the place they
    // set out for (the Enterprise page's trial, say) comes before the default landing.
    const remembered = takePendingDestination();
    void (remembered ? Promise.resolve(remembered) : resolveLandingPath()).then(
      (path) => {
        if (active) navigate(path, { replace: true });
      },
      () => {
        if (active) navigate("/", { replace: true });
      },
    );
    return () => {
      active = false;
    };
  }, [navigate]);

  return <LoadingFallback />;
}
