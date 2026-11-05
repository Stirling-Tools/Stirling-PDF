import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingFallback } from "@editor/components/shared/LoadingFallback";
import { resolveLandingPath } from "@editor/utils/loginLanding";

export default function LoggedInState() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    void resolveLandingPath().then(
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
