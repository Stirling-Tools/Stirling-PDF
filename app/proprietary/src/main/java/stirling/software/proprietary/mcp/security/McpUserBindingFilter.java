package stirling.software.proprietary.mcp.security;

import java.io.IOException;
import java.util.Optional;
import java.util.UUID;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.mcp.McpAnalytics;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.SaveUserRequest;
import stirling.software.proprietary.security.service.UserService;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Binds an MCP-validated JWT to a provisioned Stirling user: optionally rejects subjects with no
 * enabled account, then rebinds the principal to the canonical Stirling username (scope authorities
 * only) so audit/metering attribute correctly.
 */
@Slf4j
public class McpUserBindingFilter extends OncePerRequestFilter {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final UserService userService;
    private final String usernameClaim;
    private final boolean requireExistingAccount;
    private final boolean autoProvisionUsers;

    public McpUserBindingFilter(
            UserService userService, String usernameClaim, boolean requireExistingAccount) {
        this(userService, usernameClaim, requireExistingAccount, false);
    }

    public McpUserBindingFilter(
            UserService userService,
            String usernameClaim,
            boolean requireExistingAccount,
            boolean autoProvisionUsers) {
        this.userService = userService;
        this.usernameClaim =
                (usernameClaim == null || usernameClaim.isBlank()) ? "sub" : usernameClaim;
        this.requireExistingAccount = requireExistingAccount;
        this.autoProvisionUsers = autoProvisionUsers;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        Authentication current = SecurityContextHolder.getContext().getAuthentication();

        // Only act on a JWT-authenticated request; everything else passes through.
        if (current instanceof JwtAuthenticationToken jwtAuth && jwtAuth.isAuthenticated()) {
            Jwt jwt = jwtAuth.getToken();
            if (Boolean.TRUE.equals(jwt.getClaimAsBoolean("is_anonymous"))) {
                reject(
                        response,
                        "Guest sessions can't connect apps. Sign in to Stirling PDF with your"
                                + " account, then connect again.");
                return;
            }
            String username = jwt.getClaimAsString(usernameClaim);

            if (username == null || username.isBlank()) {
                reject(
                        response,
                        "Token is missing the '"
                                + usernameClaim
                                + "' claim used to map to a"
                                + " Stirling user.");
                return;
            }

            // Prefer the canonical username from the account record; fall back to the claim when
            // binding is off.
            String boundUsername = username;
            if (requireExistingAccount) {
                // Supabase (SaaS) subjects are the stable account id; emails can change.
                Optional<User> account = bySupabaseId(jwt.getSubject());
                if (account.isEmpty()) {
                    // A name match linked to another Supabase id is someone else's (e.g. a reused
                    // email), so it must not bind.
                    account =
                            userService
                                    .findByUsernameIgnoreCase(username)
                                    .filter(u -> u.getSupabaseId() == null);
                }
                if (account.isEmpty() && autoProvisionUsers) {
                    account = autoProvision(username);
                }
                if (account.isEmpty() || !account.get().isEnabled()) {
                    log.warn(
                            "MCP access denied: no enabled Stirling account matches {}={}",
                            usernameClaim,
                            sanitizeForLog(username));
                    reject(response, denialMessage(username, account.isPresent()));
                    return;
                }
                boundUsername = account.get().getUsername();
            }

            // Rebind to the Stirling username, carrying only the OAuth scope authorities.
            UsernamePasswordAuthenticationToken bound =
                    new UsernamePasswordAuthenticationToken(
                            boundUsername, null, jwtAuth.getAuthorities());
            bound.setDetails(jwtAuth.getDetails());
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(bound);
            SecurityContextHolder.setContext(context);
            request.setAttribute(McpAnalytics.AUTH_METHOD_ATTRIBUTE, "oauth");
        }

        filterChain.doFilter(request, response);
    }

    private Optional<User> bySupabaseId(String subject) {
        if (subject == null) {
            return Optional.empty();
        }
        try {
            return userService.findBySupabaseId(UUID.fromString(subject));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    /** Names the claim and value: the usual cause is a claim value never provisioned. */
    private String denialMessage(String username, boolean accountExists) {
        String prefix =
                "No enabled Stirling account matches "
                        + usernameClaim
                        + "='"
                        + sanitizeForLog(username)
                        + "'.";
        if (accountExists) {
            return prefix + " The account exists but is disabled.";
        }
        return prefix
                + " Create that user, point mcp.auth.username-claim at a claim that matches an"
                + " existing username, or enable mcp.auth.auto-provision-users.";
    }

    /** Disabled on purpose: a valid IdP token must not become MCP access until an admin agrees. */
    private Optional<User> autoProvision(String username) {
        try {
            if (!userService.isUsernameValid(username)) {
                log.warn(
                        "MCP auto-provision skipped: '{}' is not a valid Stirling username",
                        sanitizeForLog(username));
                return Optional.empty();
            }
            userService.saveUserCore(
                    SaveUserRequest.builder()
                            .username(username)
                            .authenticationType(AuthenticationType.SSO)
                            .enabled(false)
                            .build());
            log.info(
                    "MCP auto-provisioned disabled account for '{}'; an admin must enable it",
                    sanitizeForLog(username));
            return userService.findByUsernameIgnoreCase(username);
        } catch (Exception e) {
            log.warn("MCP auto-provision failed for '{}'", sanitizeForLog(username), e);
            return Optional.empty();
        }
    }

    /** Strip CR/LF so a crafted claim value can't forge log lines. */
    private static String sanitizeForLog(String value) {
        return value == null ? null : value.replace('\r', ' ').replace('\n', ' ');
    }

    private void reject(HttpServletResponse response, String message) throws IOException {
        SecurityContextHolder.clearContext();
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        ObjectNode body = MAPPER.createObjectNode();
        body.put("error", "insufficient_account");
        body.put("message", message);
        response.getWriter().write(MAPPER.writeValueAsString(body));
    }
}
