package stirling.software.proprietary.connectedaccount;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.microsoft.GraphEndpoints;
import stirling.software.proprietary.security.model.User;

/**
 * Users' own connected Microsoft and Google accounts: connect, list, disconnect, and hand the
 * editor a short-lived access token for its file pickers. The callback is public (the provider
 * redirects a plain browser navigation, which carries no Stirling token) and is guarded instead by
 * the sealed state and the browser-binding cookie set by {@code connect}.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/connected-accounts")
@RequiredArgsConstructor
@Tag(name = "Connected accounts", description = "Users' own OneDrive, SharePoint and Google Drive")
public class ConnectedAccountController {

    static final String CALLBACK_PATH = "/api/v1/connected-accounts/callback/";
    private static final String NONCE_COOKIE = "stirling_connect_nonce";
    // Entra issues every personal Microsoft account from this one tenant.
    private static final String PERSONAL_MICROSOFT_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";
    private static final Set<String> SHAREPOINT_HOST_SUFFIXES =
            Set.of(".sharepoint.com", ".sharepoint.us", ".sharepoint.de", ".sharepoint.cn");

    private final ConnectedAccountService service;
    private final ApplicationProperties applicationProperties;
    private final GraphEndpoints graphEndpoints;

    @GetMapping
    public ConnectedAccountsResponse list(@AuthenticationPrincipal User user) {
        requireUser(user);
        return new ConnectedAccountsResponse(
                Map.of(
                        CloudProvider.MICROSOFT.id(),
                        service.isAvailable(CloudProvider.MICROSOFT),
                        CloudProvider.GOOGLE.id(),
                        service.isAvailable(CloudProvider.GOOGLE)),
                service.list(user).stream().map(ConnectedAccountController::view).toList());
    }

    @PostMapping("/{provider}/connect")
    public ResponseEntity<Map<String, String>> connect(
            @PathVariable String provider, @AuthenticationPrincipal User user) {
        requireUser(user);
        CloudProvider cloud = provider(provider);
        if (!service.isAvailable(cloud)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, provider + " account connections are not set up");
        }
        String base = publicBaseUrl();
        ConnectedAccountService.ConnectStart start =
                service.startConnect(user, cloud, base + CALLBACK_PATH + cloud.id());
        ResponseCookie cookie =
                ResponseCookie.from(NONCE_COOKIE, start.nonce())
                        .httpOnly(true)
                        .secure(base.startsWith("https"))
                        .sameSite("Lax")
                        .path("/")
                        .maxAge(ConnectedAccountService.STATE_LIFETIME)
                        .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(Map.of("authorizationUrl", start.authorizationUrl()));
    }

    @GetMapping(value = "/callback/{provider}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> callback(
            @PathVariable String provider,
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error,
            @RequestParam(name = "error_description", required = false) String errorDescription,
            @CookieValue(name = NONCE_COOKIE, required = false) String nonce) {
        ResponseCookie clearNonce =
                ResponseCookie.from(NONCE_COOKIE, "").path("/").maxAge(Duration.ZERO).build();
        String status;
        String message;
        try {
            CloudProvider cloud = provider(provider);
            if (error != null) {
                status = "access_denied".equals(error) ? "cancelled" : "error";
                message = errorDescription != null ? errorDescription : error;
            } else if (code == null || state == null) {
                status = "error";
                message = "The sign-in response was incomplete.";
            } else {
                ConnectedAccount account = service.completeConnect(cloud, state, code, nonce);
                status = "connected";
                message = "Connected " + (account.getEmail() == null ? "" : account.getEmail());
            }
        } catch (IllegalArgumentException | IllegalStateException | IOException e) {
            log.warn("Connecting a {} account failed: {}", provider, e.getMessage());
            status = "error";
            message = e.getMessage();
        } catch (ResponseStatusException e) {
            status = "error";
            message = e.getReason();
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, clearNonce.toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(MediaType.TEXT_HTML)
                .body(
                        callbackPage(
                                provider,
                                status,
                                message,
                                publicBaseUrl() + "/settings/connectedAccounts"));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> disconnect(
            @PathVariable long id, @AuthenticationPrincipal User user) {
        requireUser(user);
        try {
            service.disconnect(user, id);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        }
        return ResponseEntity.noContent().build();
    }

    /**
     * A short-lived access token for the caller's own account, for the editor's pickers. {@code
     * resource} is {@code graph} or a SharePoint origin for Microsoft, and {@code drive} for
     * Google; anything else is refused so the endpoint cannot mint tokens for arbitrary APIs. The
     * Graph token is read-only: writing stays on the server, so a token leaked from the browser
     * cannot change the user's files. The Google token is not narrowed and carries the connected
     * Drive scope.
     */
    @PostMapping("/{id}/access-token")
    public AccessTokenResponse accessToken(
            @PathVariable long id,
            @RequestBody AccessTokenRequest request,
            @AuthenticationPrincipal User user) {
        requireUser(user);
        ConnectedAccount account =
                service.findOwned(user, id)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        List<String> scopes = scopesFor(account.cloudProvider(), request.resource());
        try {
            return new AccessTokenResponse(service.accessToken(id, scopes));
        } catch (AccountReconnectRequiredException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage());
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, e.getMessage());
        }
    }

    private List<String> scopesFor(CloudProvider provider, String resource) {
        if (resource == null || resource.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "resource is required");
        }
        if (provider == CloudProvider.GOOGLE) {
            if (!"drive".equals(resource)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unsupported resource");
            }
            return List.of();
        }
        if ("graph".equals(resource)) {
            return List.of(MicrosoftOAuthClient.BROWSER_SCOPE);
        }
        URI uri;
        try {
            uri = URI.create(resource);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unsupported resource");
        }
        String origin = uri.getScheme() + "://" + uri.getAuthority();
        if (!isSharePoint(uri) && !origin.equals(graphOrigin())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unsupported resource");
        }
        return List.of(origin + "/.default");
    }

    private static boolean isSharePoint(URI uri) {
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        return "https".equals(uri.getScheme())
                && SHAREPOINT_HOST_SUFFIXES.stream().anyMatch(host::endsWith);
    }

    /** The configured Graph host also serves the picker when pointed at a test double. */
    private String graphOrigin() {
        URI graph = URI.create(graphEndpoints.graphUrl());
        return graph.getScheme() + "://" + graph.getAuthority();
    }

    private String publicBaseUrl() {
        String configured = applicationProperties.getSystem().getFrontendUrl();
        if (configured != null && !configured.isBlank()) {
            return configured.endsWith("/")
                    ? configured.substring(0, configured.length() - 1)
                    : configured;
        }
        return ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
    }

    private static CloudProvider provider(String id) {
        try {
            return CloudProvider.fromId(id);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        }
    }

    private static void requireUser(User user) {
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
    }

    static AccountView view(ConnectedAccount account) {
        return new AccountView(
                account.getId(),
                account.getProvider(),
                account.getEmail(),
                account.getDisplayName(),
                account.getStatus(),
                PERSONAL_MICROSOFT_TENANT.equals(account.getTenantId()),
                account.getLastError(),
                account.getCreatedAt());
    }

    /**
     * Tells the opener how the connect ended, then closes; a page that is not a pop-up (a browser
     * that opened it as a tab) stays open with a link back instead. The message carries no token or
     * code, only a status, so posting it to any origin leaks nothing; the editor re-reads the
     * account list from the API rather than trusting the message.
     */
    static String callbackPage(String provider, String status, String message, String returnUrl) {
        String safeMessage = escape(message == null ? "" : message);
        String payload =
                "{\"source\":\"stirling-connected-account\",\"provider\":\""
                        + jsString(provider)
                        + "\",\"status\":\""
                        + jsString(status)
                        + "\"}";
        String heading =
                "connected".equals(status)
                        ? "Account connected"
                        : "cancelled".equals(status) ? "Sign-in cancelled" : "Couldn't connect";
        return "<!doctype html><html><head><meta charset=\"utf-8\"><title>"
                + heading
                + "</title><meta name=\"viewport\" content=\"width=device-width\"></head>"
                + "<body style=\"font-family:system-ui,sans-serif;padding:32px\"><h1"
                + " style=\"font-size:20px\">"
                + heading
                + "</h1><p>"
                + safeMessage
                + "</p><p><a href=\""
                + escape(returnUrl)
                + "\">Back to Stirling</a></p><script>(function(){try{if(window.opener){"
                + "window.opener.postMessage("
                + payload
                + ",'*');"
                + ("connected".equals(status) ? "setTimeout(function(){window.close();},400);" : "")
                + "}}catch(e){}})();</script></body></html>";
    }

    private static String escape(String text) {
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private static String jsString(String text) {
        return text.replaceAll("[^a-z_]", "");
    }

    public record ConnectedAccountsResponse(
            Map<String, Boolean> providers, List<AccountView> accounts) {}

    public record AccountView(
            Long id,
            String provider,
            String email,
            String displayName,
            String status,
            boolean personal,
            String lastError,
            LocalDateTime createdAt) {}

    public record AccessTokenRequest(String resource) {}

    public record AccessTokenResponse(String accessToken) {}
}
