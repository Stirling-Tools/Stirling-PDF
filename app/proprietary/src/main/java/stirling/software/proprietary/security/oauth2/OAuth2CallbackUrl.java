package stirling.software.proprietary.security.oauth2;

import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.proprietary.security.util.RedirectBaseUrl;

final class OAuth2CallbackUrl {

    private OAuth2CallbackUrl() {}

    static String resolve(HttpServletRequest request, String redirectBaseUrl, String frontendUrl) {
        Optional<String> landingBase = RedirectBaseUrl.landingBase(redirectBaseUrl, frontendUrl);
        String cookiePath = localCookiePath(request);
        // The SPA cookie path already includes the browser-side base path, so only add an origin.
        boolean usesCookiePath = !TauriOAuthUtils.isTauriState(request) && cookiePath != null;
        String pathPrefix =
                landingBase.isPresent() && !usesCookiePath ? "" : request.getContextPath();
        String redirectPath;
        if (TauriOAuthUtils.isTauriState(request)) {
            redirectPath = TauriOAuthUtils.defaultTauriCallbackPath(pathPrefix);
        } else if (cookiePath != null) {
            redirectPath = cookiePath;
        } else {
            redirectPath = TauriOAuthUtils.defaultCallbackPath(pathPrefix);
        }
        Optional<String> configuredBase =
                usesCookiePath ? landingBase.flatMap(RedirectBaseUrl::origin) : landingBase;
        return configuredBase.orElse("") + redirectPath;
    }

    private static String localCookiePath(HttpServletRequest request) {
        String cookiePath = TauriOAuthUtils.extractRedirectPathFromCookie(request);
        return cookiePath != null && TauriOAuthUtils.isLocalRedirectPath(cookiePath)
                ? cookiePath
                : null;
    }
}
