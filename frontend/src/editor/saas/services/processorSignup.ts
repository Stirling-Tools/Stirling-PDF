import type { PaygSignupRequiredDetail } from "@editor/services/paygErrorInterceptor";

/** Opens the shared Processor signup prompt while preserving the current editor session. */
export function requestProcessorSignup(): void {
  window.dispatchEvent(
    new CustomEvent<PaygSignupRequiredDetail>("payg:signupRequired", {
      detail: { category: "PROCESSOR" },
    }),
  );
}
