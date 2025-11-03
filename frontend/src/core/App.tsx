import { Suspense } from "react";
import { AppProviders } from "@app/components/AppProviders";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import HomePage from "@app/pages/HomePage";
import OnboardingTour from "@app/components/onboarding/OnboardingTour";

// Import global styles
import "@app/styles/tailwind.css";
import "@app/styles/cookieconsent.css";
import "@app/styles/index.css";

// Import file ID debugging helpers (development only)
import "@app/utils/fileIdSafety";

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AppProviders>
        <HomePage />
        <OnboardingTour />
      </AppProviders>
    </Suspense>
  );
}
