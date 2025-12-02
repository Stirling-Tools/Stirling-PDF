import { Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AppProviders } from "@app/components/AppProviders";
import { AppLayout } from "@app/components/AppLayout";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import Landing from "@app/routes/Landing";
import Login from "@app/routes/Login";
import Signup from "@app/routes/Signup";
import AuthCallback from "@app/routes/AuthCallback";
import InviteAccept from "@app/routes/InviteAccept";
import Onboarding from "@app/components/onboarding/Onboarding";

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
          <Onboarding />
        </AppLayout>
      </AppProviders>
    </Suspense>
  );
}
