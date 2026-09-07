package stirling.software.saas.legal;

import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.security.UserTeamResolver;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Serves the versioned legal documents (EULA, SLA exhibit, subprocessors) for in-product viewing,
 * and records the lighter clickwrap consents. The enterprise agreement itself is served + signed
 * through the procurement controller, since it needs a quote to fill its Order Form.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/legal")
@Profile("saas")
@RequiredArgsConstructor
public class LegalController {

    private final LegalDocumentRegistry registry;
    private final LegalConsentService consents;
    private final UserTeamResolver userTeamResolver;
    private final UserRepository userRepository;

    /** A legal document rendered for viewing: registry metadata + the static markdown body. */
    public record LegalDocumentResponse(
            String docId,
            String version,
            String versionLabel,
            String displayName,
            String effectiveDate,
            String status,
            String markdown) {}

    public record ConsentRequest(String documentId, String context) {}

    /** Fetch a legal document's current version as markdown. 404 for an unknown document. */
    @GetMapping("/{docId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<LegalDocumentResponse> document(@PathVariable String docId) {
        return registry.meta(docId)
                .<ResponseEntity<LegalDocumentResponse>>map(
                        meta ->
                                ResponseEntity.ok(
                                        new LegalDocumentResponse(
                                                meta.id(),
                                                meta.version(),
                                                meta.versionLabel(),
                                                meta.displayName(),
                                                meta.effectiveDate(),
                                                meta.status(),
                                                registry.staticMarkdown(docId))))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * Record a clickwrap consent (e.g. the EULA accepted at trial start or quote generation).
     * Best-effort — a teamless caller still returns 200 so the accompanying flow is never blocked.
     */
    @PostMapping("/consent")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> consent(
            @RequestBody ConsentRequest request, Authentication auth, HttpServletRequest http) {
        if (request == null || request.documentId() == null || request.context() == null) {
            return ResponseEntity.badRequest().build();
        }
        Optional<User> caller = currentUser(auth);
        Long teamId = caller.flatMap(userTeamResolver::teamId).orElse(null);
        Long userId = caller.map(User::getId).orElse(null);
        // Best-effort for real: consent is audit metadata, not an authorisation gate, so a failed
        // write must not fail the trial start or quote generation this call accompanies. Previously
        // that only held because the caller happened to swallow the 500.
        try {
            consents.record(
                    teamId, userId, request.documentId(), request.context(), clientIp(http));
        } catch (RuntimeException e) {
            log.warn(
                    "[legal] consent not recorded doc={} context={}: {}",
                    request.documentId(),
                    request.context(),
                    e.getMessage());
        }
        return ResponseEntity.ok().build();
    }

    private Optional<User> currentUser(Authentication auth) {
        try {
            return Optional.of(AuthenticationUtils.getCurrentUser(auth, userRepository));
        } catch (SecurityException e) {
            return Optional.empty();
        }
    }

    /**
     * Best guess at the caller's address, for the audit record.
     *
     * <p>Informational only, and must stay that way: the first {@code X-Forwarded-For} hop is set
     * by the client, so a stored address is trivially spoofable and is not evidence of where a
     * consent or signature came from. Treat it as a hint when reconstructing events, never as
     * proof.
     */
    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
