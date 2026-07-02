/**
 * Shared, provider-agnostic auth used by both the editor and the portal.
 *
 * Hosts configure a backend once at startup:
 * - Spring:   configureSpringAuth({ http, basePath, platform }) then render
 *             <AuthProvider mode="spring">.
 * - Supabase: configureSupabase({ url, key }) then render
 *             <AuthProvider mode="supabase">.
 *
 * Consumers read state via useAuth(); guards (RequireAuth/RequireAdmin) gate UI.
 */

// Contract + helpers
export * from "@shared/auth/types";
export { isAdminRole } from "@shared/auth/roles";
export { AuthContext, useAuth } from "@shared/auth/context";

// Unified provider + guards
export {
  AuthProvider,
  type AuthProviderProps,
} from "@shared/auth/AuthProvider";
export {
  RequireAuth,
  type RequireAuthProps,
} from "@shared/auth/guards/RequireAuth";
export {
  RequireAdmin,
  type RequireAdminProps,
} from "@shared/auth/guards/RequireAdmin";
export {
  RequirePortalAccess,
  type RequirePortalAccessProps,
} from "@shared/auth/guards/RequirePortalAccess";

// Spring backend
export {
  configureSpringAuth,
  getSpringAuthConfig,
  type SpringAuthConfig,
} from "@shared/auth/config";
export {
  type PlatformBridge,
  type PlatformSessionUser,
  defaultPlatformBridge,
} from "@shared/auth/spring/platformBridge";
export {
  createDefaultHttpClient,
  getStoredToken,
  setStoredToken,
  clearStoredToken,
  JWT_STORAGE_KEY,
} from "@shared/auth/httpClient";
export {
  SpringAuthProvider,
  deriveDisplayName,
} from "@shared/auth/spring/UseSession";
export {
  springAuth,
  setPostLoginRedirectPath,
  consumePostLoginRedirectPath,
  isSafePostLoginRedirect,
  POST_LOGIN_REDIRECT_STORAGE_KEY,
  getCurrentUser,
  isUserAnonymous,
  createAnonymousUser,
  createAnonymousSession,
} from "@shared/auth/spring/springAuthClient";
export type { OAuthProvider } from "@shared/auth/spring/oauthTypes";

// Supabase backend is intentionally NOT re-exported here: doing so would pull
// @supabase/supabase-js into every barrel consumer (e.g. the portal in Spring
// mode). Supabase-mode hosts import directly from the subpath:
//   import { configureSupabase } from "@shared/auth/supabase/supabaseClient";
// The unified <AuthProvider mode="supabase"> lazy-loads the provider on demand.

// Login UI components live under @shared/auth/ui/* and are imported directly
// (default exports), e.g. `import OAuthButtons from "@shared/auth/ui/OAuthButtons"`.
// They use react-i18next, so hosts must initialise i18next.
