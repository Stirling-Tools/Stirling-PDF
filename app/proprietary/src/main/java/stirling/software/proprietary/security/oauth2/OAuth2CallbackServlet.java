package stirling.software.proprietary.security.oauth2;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.inject.Inject;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.SaveUserRequest;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;

/**
 * OAuth2 / OIDC authorization-code callback. Implemented as a Jakarta {@code @WebServlet} (not
 * JAX-RS) because quarkus-undertow's default servlet owns the {@code /login/*} prefix and
 * intercepts the extension-less callback path before RESTEasy can route it (a registered servlet
 * takes precedence over the default servlet). The authorize/initiation side lives in {@link
 * OAuth2LoginController}; this finishes the flow and issues the application JWT (set as the {@code
 * stirling_jwt} cookie the {@link
 * stirling.software.proprietary.security.identity.JwtBearerAuthenticationMechanism} reads).
 */
@Slf4j
@WebServlet(urlPatterns = "/login/oauth2/code/*")
public class OAuth2CallbackServlet extends HttpServlet {

    private static final String REG_ID = "keycloak";

    @ConfigProperty(name = "security.oauth2.enabled", defaultValue = "false")
    boolean oauth2Enabled;

    @ConfigProperty(name = "security.oauth2.client.keycloak.issuer")
    Optional<String> issuer;

    @ConfigProperty(name = "security.oauth2.client.keycloak.clientId")
    Optional<String> clientId;

    @ConfigProperty(name = "security.oauth2.client.keycloak.clientSecret")
    Optional<String> clientSecret;

    @ConfigProperty(name = "security.oauth2.client.keycloak.useAsUsername", defaultValue = "email")
    String useAsUsername;

    @Inject UserService userService;
    @Inject TeamService teamService;
    @Inject JwtServiceInterface jwtService;
    @Inject ApplicationProperties applicationProperties;

    private final HttpClient http = HttpClient.newHttpClient();
    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        if (!isConfigured()) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        String error = request.getParameter("error");
        if (error != null) {
            log.warn("OAuth2 callback error: {}", error);
            redirectToLogin(request, response, "oauth2_error");
            return;
        }
        String code = request.getParameter("code");
        if (code == null || code.isBlank()) {
            redirectToLogin(request, response, "missing_code");
            return;
        }
        try {
            Map<String, Object> token = exchangeCode(code, redirectUri(request));
            Map<String, Object> claims = fetchUserInfo((String) token.get("access_token"));
            Object usernameClaim = claims.get(useAsUsername);
            if (usernameClaim == null) {
                log.error(
                        "OAuth2 userinfo missing '{}' claim; got {}",
                        useAsUsername,
                        claims.keySet());
                redirectToLogin(request, response, "no_username");
                return;
            }
            String username = usernameClaim.toString();
            User user = findOrCreateUser(username);
            if (user == null) {
                redirectToLogin(request, response, "registration_blocked");
                return;
            }
            String jwt =
                    jwtService.generateToken(
                            username,
                            Map.of(
                                    "authType", AuthenticationType.OAUTH2.toString(),
                                    "role", user.getRolesAsString()));
            response.addCookie(jwtCookie(jwt, request));
            response.sendRedirect(baseUrl(request) + "/");
        } catch (Exception e) {
            log.error("OAuth2 callback failed", e);
            redirectToLogin(request, response, "oauth2_failed");
        }
    }

    private boolean isConfigured() {
        return oauth2Enabled
                && issuer.isPresent()
                && clientId.isPresent()
                && clientSecret.isPresent();
    }

    private Map<String, Object> exchangeCode(String code, String redirectUri) throws Exception {
        String form =
                "grant_type=authorization_code"
                        + "&code="
                        + enc(code)
                        + "&redirect_uri="
                        + enc(redirectUri)
                        + "&client_id="
                        + enc(clientId.get())
                        + "&client_secret="
                        + enc(clientSecret.get());
        HttpRequest req =
                HttpRequest.newBuilder(URI.create(issuer.get() + "/protocol/openid-connect/token"))
                        .header("Content-Type", "application/x-www-form-urlencoded")
                        .header("Accept", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(form))
                        .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) {
            throw new IllegalStateException(
                    "Token endpoint returned " + res.statusCode() + ": " + res.body());
        }
        return parseJson(res.body());
    }

    private Map<String, Object> fetchUserInfo(String accessToken) throws Exception {
        HttpRequest req =
                HttpRequest.newBuilder(
                                URI.create(issuer.get() + "/protocol/openid-connect/userinfo"))
                        .header("Authorization", "Bearer " + accessToken)
                        .header("Accept", "application/json")
                        .GET()
                        .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) {
            throw new IllegalStateException("Userinfo endpoint returned " + res.statusCode());
        }
        return parseJson(res.body());
    }

    private User findOrCreateUser(String username) {
        Optional<User> existing = userService.findByUsernameIgnoreCase(username);
        if (existing.isPresent()) {
            return existing.get();
        }
        if (!applicationProperties.getSecurity().getOauth2().getAutoCreateUser()) {
            log.warn("OAuth2 user '{}' not found and autoCreateUser is disabled", username);
            return null;
        }
        try {
            userService.saveUserCore(
                    SaveUserRequest.builder()
                            .username(username)
                            .authenticationType(AuthenticationType.OAUTH2)
                            .ssoProvider(REG_ID)
                            .team(teamService.getOrCreateDefaultTeam())
                            .build());
            log.info("Auto-created OAuth2 user: {}", username);
            return userService.findByUsernameIgnoreCase(username).orElse(null);
        } catch (Exception e) {
            log.error("Failed to auto-create OAuth2 user '{}'", username, e);
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseJson(String body) throws IOException {
        return mapper.readValue(body, Map.class);
    }

    private String redirectUri(HttpServletRequest request) {
        return baseUrl(request) + "/login/oauth2/code/" + REG_ID;
    }

    private Cookie jwtCookie(String jwt, HttpServletRequest request) {
        Cookie cookie = new Cookie("stirling_jwt", jwt);
        cookie.setPath("/");
        cookie.setHttpOnly(true);
        // Secure when the request arrived over HTTPS (production); left off for the http localhost
        // test deployments so the SSO cookie round-trips there.
        cookie.setSecure(request.isSecure());
        cookie.setAttribute("SameSite", "Lax");
        return cookie;
    }

    private String baseUrl(HttpServletRequest request) {
        String backendUrl = applicationProperties.getSystem().getBackendUrl();
        if (backendUrl != null && !backendUrl.isBlank()) {
            return backendUrl.replaceAll("/+$", "");
        }
        String scheme = request.getScheme();
        int port = request.getServerPort();
        String host = request.getServerName();
        boolean defaultPort =
                (scheme.equals("http") && port == 80) || (scheme.equals("https") && port == 443);
        return scheme + "://" + host + (defaultPort ? "" : ":" + port);
    }

    private void redirectToLogin(
            HttpServletRequest request, HttpServletResponse response, String reason)
            throws IOException {
        response.sendRedirect(baseUrl(request) + "/login?error=" + enc(reason));
    }

    private static String enc(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
