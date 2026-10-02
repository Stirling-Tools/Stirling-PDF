import { OPEN_SIGN_IN_EVENT } from "@app/constants/signInEvents";

/** Local mode has no processor: signing in to Stirling Cloud or a server is the way in. */
export function requestProcessorSignup(): void {
  window.dispatchEvent(
    new CustomEvent(OPEN_SIGN_IN_EVENT, { detail: { locked: false } }),
  );
}
