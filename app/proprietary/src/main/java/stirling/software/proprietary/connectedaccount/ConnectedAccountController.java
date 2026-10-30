package stirling.software.proprietary.connectedaccount;

import java.io.IOException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.User;

@Slf4j
@RestController
@RequestMapping("/api/v1/connected-accounts")
@RequiredArgsConstructor
@Tag(name = "Connected accounts", description = "Users' own OneDrive, SharePoint and Google Drive")
public class ConnectedAccountController {

    static final String CALLBACK_PATH = "/api/v1/connected-accounts/callback/";
    private static final String NONCE_COOKIE = "stirling_connect_nonce";
    private static final String CONNECT_FAILED = "The account could not be connected.";
    private static final String PERSONAL_MICROSOFT_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";

    private final ConnectedAccountService service;
    private final ApplicationProperties applicationProperties;

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
        String providerId = "unknown";
        String status;
        String message;
        try {
            CloudProvider cloud = provider(provider);
            providerId = cloud.id();
            if (error != null) {
                status = "access_denied".equals(error) ? "cancelled" : "error";
                message =
                        "cancelled".equals(status)
                                ? "Sign-in was cancelled."
                                : "The provider refused the sign-in.";
                log.info(
                        "{} sign-in refused: {} {}",
                        providerId,
                        forLog(error),
                        forLog(errorDescription));
            } else if (code == null || state == null) {
                status = "error";
                message = "The sign-in response was incomplete.";
            } else {
                ConnectedAccount account = service.completeConnect(cloud, state, code, nonce);
                status = "connected";
                message = "Connected " + (account.getEmail() == null ? "" : account.getEmail());
            }
        } catch (IllegalArgumentException | IllegalStateException | IOException e) {
            log.warn("Connecting a {} account failed: {}", providerId, forLog(e.getMessage()));
            status = "error";
            message = CONNECT_FAILED;
        } catch (ResponseStatusException e) {
            status = "error";
            message = CONNECT_FAILED;
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, clearNonce.toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(MediaType.TEXT_HTML)
                .body(
                        callbackPage(
                                providerId,
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

    private String publicBaseUrl() {
        String configured = applicationProperties.getSystem().getFrontendUrl();
        if (configured != null && !configured.isBlank()) {
            return configured.endsWith("/")
                    ? configured.substring(0, configured.length() - 1)
                    : configured;
        }
        return ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
    }

    private static String forLog(String value) {
        return value == null ? "" : value.replaceAll("[\\r\\n\\t]", "_");
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
}
