import { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";

interface AuthenticatedRouteProps {
    isAuthenticated: boolean;
    children?: ReactNode;  // Accepting children
}


function isAuthenticated() {
    if (import.meta.env.VITE_USE_AUTH == "True") {
        // TODO: if user is set in localstorage and is valid (either by time or by checking online) return true
        return false;
    }
    return true;
}

function AuthenticatedRoute({}: {}): JSX.Element {
    return isAuthenticated() ? <Outlet /> : <Navigate to="/auth/login" />;
};

export default AuthenticatedRoute;