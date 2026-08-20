package stirling.software.saas.legal;

import java.util.Optional;

import io.quarkus.arc.profile.IfBuildProfile;
import io.quarkus.security.Authenticated;
import io.swagger.v3.oas.annotations.Hidden;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.security.Authentication;
import stirling.software.common.security.SecurityContextHolder;
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
@ApplicationScoped
@Path("/api/v1/legal")
@IfBuildProfile("saas")
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
    @GET
    @Path("/{docId}")
    @Produces(MediaType.APPLICATION_JSON)
    @Authenticated
    public Response document(@PathParam("docId") String docId) {
        return registry.meta(docId)
                .map(
                        meta ->
                                Response.ok(
                                                new LegalDocumentResponse(
                                                        meta.id(),
                                                        meta.version(),
                                                        meta.versionLabel(),
                                                        meta.displayName(),
                                                        meta.effectiveDate(),
                                                        meta.status(),
                                                        registry.staticMarkdown(docId)))
                                        .build())
                .orElseGet(() -> Response.status(Response.Status.NOT_FOUND).build());
    }

    /**
     * Record a clickwrap consent (e.g. the EULA accepted at trial start or quote generation).
     * Best-effort - a teamless caller still returns 200 so the accompanying flow is never blocked.
     */
    @POST
    @Path("/consent")
    @Consumes(MediaType.APPLICATION_JSON)
    @Authenticated
    public Response consent(ConsentRequest request, HttpServletRequest http) {
        if (request == null || request.documentId() == null || request.context() == null) {
            return Response.status(Response.Status.BAD_REQUEST).build();
        }
        // Spring resolved the Authentication as a handler argument; JAX-RS has no such resolver, so
        // it comes off the security context the same way the other saas controllers read it.
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        Optional<TeamMembership> membership = primaryMembership(auth);
        Long teamId = membership.map(m -> m.getTeam().getId()).orElse(null);
        Long userId = membership.map(m -> m.getUser().getId()).orElse(null);
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
        return Response.ok().build();
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
