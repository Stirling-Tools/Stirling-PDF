package stirling.software.proprietary.security.saml2;

import java.io.IOException;
import java.util.Map;
import java.util.Optional;

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
 * SAML2 SP login initiation ({@code GET /saml2/authenticate/{registrationId}} - builds + signs an
 * AuthnRequest and redirects to the IdP) and Assertion Consumer Service ({@code POST
 * /login/saml2/sso/{registrationId}} - validates the IdP SAMLResponse and logs the user in by
 * issuing the application JWT cookie). Servlets (not JAX-RS) so quarkus-undertow routes the
 * extension-less, {@code /login/*}-prefixed paths reliably.
 */
@Slf4j
@WebServlet(urlPatterns = {"/saml2/authenticate/*", "/login/saml2/sso/*"})
public class SamlSpServlet extends HttpServlet {

    private static final String REG_ID = "keycloak";

    @Inject Saml2Service samlService;
    @Inject UserService userService;
    @Inject TeamService teamService;
    @Inject JwtServiceInterface jwtService;
    @Inject ApplicationProperties applicationProperties;

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        if (!samlService.isReady()) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND, "SAML2 is not enabled");
            return;
        }
        try {
            String relayState = request.getParameter("RelayState");
            response.sendRedirect(samlService.buildAuthnRequestRedirectUrl(relayState));
        } catch (Exception e) {
            log.error("Failed to build SAML AuthnRequest", e);
            redirectToLogin(request, response, "saml_request_failed");
        }
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        if (!samlService.isReady()) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND, "SAML2 is not enabled");
            return;
        }
        String samlResponse = request.getParameter("SAMLResponse");
        if (samlResponse == null || samlResponse.isBlank()) {
            redirectToLogin(request, response, "missing_saml_response");
            return;
        }
        try {
            String username = samlService.validateResponseAndGetUsername(samlResponse);
            User user = findOrCreateUser(username);
            if (user == null) {
                redirectToLogin(request, response, "registration_blocked");
                return;
            }
            String jwt =
                    jwtService.generateToken(
                            username,
                            Map.of(
                                    "authType", AuthenticationType.SSO.toString(),
                                    "role", user.getRolesAsString()));
            response.addCookie(jwtCookie(jwt, request));
            response.sendRedirect(baseUrl(request) + "/");
        } catch (Exception e) {
            log.error("SAML ACS validation failed", e);
            redirectToLogin(request, response, "saml_validation_failed");
        }
    }

    private User findOrCreateUser(String username) {
        Optional<User> existing = userService.findByUsernameIgnoreCase(username);
        if (existing.isPresent()) {
            return existing.get();
        }
        if (!samlService.getConfig().autoCreateUser()) {
            log.warn("SAML user '{}' not found and autoCreateUser is disabled", username);
            return null;
        }
        try {
            userService.saveUserCore(
                    SaveUserRequest.builder()
                            .username(username)
                            .authenticationType(AuthenticationType.SSO)
                            .ssoProvider(REG_ID)
                            .team(teamService.getOrCreateDefaultTeam())
                            .build());
            log.info("Auto-created SAML user: {}", username);
            return userService.findByUsernameIgnoreCase(username).orElse(null);
        } catch (Exception e) {
            log.error("Failed to auto-create SAML user '{}'", username, e);
            return null;
        }
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
        boolean defaultPort =
                (scheme.equals("http") && port == 80) || (scheme.equals("https") && port == 443);
        return scheme + "://" + request.getServerName() + (defaultPort ? "" : ":" + port);
    }

    private void redirectToLogin(
            HttpServletRequest request, HttpServletResponse response, String reason)
            throws IOException {
        response.sendRedirect(
                baseUrl(request)
                        + "/login?error="
                        + java.net.URLEncoder.encode(
                                reason, java.nio.charset.StandardCharsets.UTF_8));
    }
}
