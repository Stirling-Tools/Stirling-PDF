package stirling.software.proprietary.security.configuration;

import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer;

import stirling.software.common.util.RequestUriUtils;

/**
 * Anonymous access for a login-enabled chain. The page checks in {@link RequestUriUtils} decide by
 * string tests, so backend paths are claimed first with Spring's own path matcher, which reads the
 * path the way the dispatcher does. A request that would reach an {@code /api/**} or {@code
 * /actuator/**} handler then needs a login unless the anchored public list names it, however the
 * path is spelled and whatever the page checks make of it.
 */
public final class PublicRouteRules {

    private PublicRouteRules() {}

    public static void apply(
            AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
                    authz) {
        authz.requestMatchers(
                        req ->
                                RequestUriUtils.isPublicBackendEndpoint(
                                        req.getContextPath(), req.getRequestURI()))
                .permitAll()
                .requestMatchers("/api/**", "/actuator/**")
                .authenticated()
                .requestMatchers(
                        req -> {
                            String uri = req.getRequestURI();
                            String contextPath = req.getContextPath();
                            return RequestUriUtils.isStaticResource(contextPath, uri)
                                    || RequestUriUtils.isPublicAuthEndpoint(uri, contextPath)
                                    || RequestUriUtils.isFrontendRoute(contextPath, uri);
                        })
                .permitAll();
    }
}
