import { Suspense } from "react";
import { AppProviders } from "@app/components/AppProviders";
import { AppLayout } from "@app/components/AppLayout";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import HomePage from "@app/pages/HomePage";
import OnboardingTour from "@app/components/onboarding/OnboardingTour";
import ParticipantCertificateSubmission from "@app/pages/ParticipantCertificateSubmission";

// Import global styles
import "@app/styles/tailwind.css";
import "@app/styles/cookieconsent.css";
import "@app/styles/index.css";

// Import file ID debugging helpers (development only)
import "@app/utils/fileIdSafety";

export default function App() {
  // Check for participant signing session URL parameters
  const queryParams = new URLSearchParams(window.location.search);
  const sessionId = queryParams.get('sessionId');
  const token = queryParams.get('token');

  // If both sessionId and token are present, show participant submission page
  if (sessionId && token) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <AppProviders>
          <AppLayout>
            <ParticipantCertificateSubmission
              sessionId={sessionId}
              token={token}
            />
          </AppLayout>
        </AppProviders>
      </Suspense>
    );
  }

  // Otherwise, show normal home page
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AppProviders>
        <AppLayout>
          <HomePage />
          <OnboardingTour />
        </AppLayout>
      </AppProviders>
    </Suspense>
  );
}
