import { Navigate } from "react-router-dom";

/**
 * Desktop override of the /login route.
 * The legacy web login page must never appear in desktop builds — authentication
 * is handled exclusively through the DesktopOnboardingModal and SignInModal.
 * Any navigation to /login (e.g. from Spring Boot auth redirects) is intercepted
 * here and immediately redirected to /.
 * The sign-in modal is opened by the desktop httpErrorHandler before navigation
 * occurs, so no additional dispatch is needed here.
 */
export default function Login() {
  return <Navigate to="/" replace />;
}
