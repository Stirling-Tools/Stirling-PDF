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

import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
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
    private final TeamMembershipRepository memberRepo;
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
        Optional<TeamMembership> membership = primaryMembership(auth);
        Long teamId = membership.map(m -> m.getTeam().getId()).orElse(null);
        Long userId = membership.map(m -> m.getUser().getId()).orElse(null);
        consents.record(teamId, userId, request.documentId(), request.context(), clientIp(http));
        return ResponseEntity.ok().build();
    }

    private Optional<TeamMembership> primaryMembership(Authentication auth) {
        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            return Optional.empty();
        }
        return memberRepo.findPrimaryMembership(user.getId()).stream().findFirst();
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
