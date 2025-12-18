import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { AppProviders } from "@app/components/AppProviders";
import { AppLayout } from "@app/components/AppLayout";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";

// Lazy-load auth routes - only loaded when user navigates to them
const Landing = lazy(() => import("@app/routes/Landing"));
const Login = lazy(() => import("@app/routes/Login"));
const Signup = lazy(() => import("@app/routes/Signup"));
const AuthCallback = lazy(() => import("@app/routes/AuthCallback"));
const InviteAccept = lazy(() => import("@app/routes/InviteAccept"));

// Lazy-load Onboarding - only shown once for first-time users
const Onboarding = lazy(() => import("@app/components/onboarding/Onboarding"));

// Import global styles
import "@app/styles/tailwind.css";
import "@app/styles/cookieconsent.css";
import "@app/styles/index.css";
import "@app/styles/auth-theme.css";

// Import file ID debugging helpers (development only)
import "@app/utils/fileIdSafety";

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AppProviders>
        <AppLayout>
          <Routes>
            {/* Auth routes - no nested providers needed */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/invite/:token" element={<InviteAccept />} />

            {/* Main app routes - Landing handles auth logic */}
            <Route path="/*" element={<Landing />} />
          </Routes>
          <Suspense fallback={null}>
            <Onboarding />
          </Suspense>
        </AppLayout>
      </AppProviders>
    </Suspense>
  );
}
