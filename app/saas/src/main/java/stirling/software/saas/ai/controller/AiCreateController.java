package stirling.software.saas.ai.controller;

import java.io.InputStream;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.quarkus.arc.profile.IfBuildProfile;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.StreamingOutput;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.security.Authentication;
import stirling.software.common.security.SecurityContextHolder;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.ai.model.AiCreateSession;
import stirling.software.saas.ai.repository.AiCreateSessionRepository;
import stirling.software.saas.ai.service.AiCreateProxyService;
import stirling.software.saas.ai.service.AiCreateSessionService;
import stirling.software.saas.service.CreditService;
import stirling.software.saas.service.TeamCreditService;
import stirling.software.saas.util.AuthenticationUtils;
import stirling.software.saas.util.CreditHeaderUtils;

@ApplicationScoped
@IfBuildProfile("saas")
@Path("/api/v1/ai/create")
@Tag(name = "AI")
@Hidden
@RequiredArgsConstructor
@Slf4j
public class AiCreateController {

    private final AiCreateSessionService sessionService;
    private final AiCreateProxyService proxyService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final CreditService creditService;
    private final TeamCreditService teamCreditService;
    private final UserRepository userRepository;
    private final CreditHeaderUtils creditHeaderUtils;

    @POST
    @Path("/sessions")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response createSession(CreateSessionRequest request) {
        if (request.prompt() == null || request.prompt().isBlank()) {
            throw new WebApplicationException("Prompt is required", Response.Status.BAD_REQUEST);
        }
        AiCreateSession session =
                sessionService.createSession(
                        request.prompt(),
                        request.docType(),
                        request.templateId(),
                        request.templateTex(),
                        request.previewTex());
        log.info(
                "AI create session created sessionId={} userId={} docType={} templateId={}",
                session.getSessionId(),
                session.getUserId(),
                session.getDocType(),
                session.getTemplateId());
        return Response.ok(new CreateSessionResponse(session.getSessionId())).build();
    }

    @DELETE
    @Path("/sessions/{sessionId}")
    public Response deleteSession(@PathParam("sessionId") String sessionId) {
        sessionService.deleteSessionForCurrentUser(sessionId);
        return Response.noContent().build();
    }

    // TODO: Migration required - @Transactional(readOnly = true): jakarta.transaction.Transactional
    // has no readOnly attribute; using a plain transaction. Configure read-only semantics at the
    // persistence layer if needed.
    @GET
    @Path("/sessions/{sessionId}")
    @Transactional
    public Response getSession(@PathParam("sessionId") String sessionId) {
        AiCreateSession session = sessionService.getSessionForCurrentUser(sessionId);
        return Response.ok(toResponse(session)).build();
    }

    // TODO: Migration required - @Transactional(readOnly = true): jakarta.transaction.Transactional
    // has no readOnly attribute; using a plain transaction.
    @GET
    @Path("/sessions")
    @Transactional
    public Response listSessions(
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("10") int size,
            @QueryParam("includeDrafts") @DefaultValue("false") boolean includeDrafts) {
        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, Math.min(size, 50));
        List<AiCreateSessionRepository.AiCreateSessionSummaryProjection> sessions =
                sessionService.listSessionSummariesForCurrentUser(
                        safePage, safeSize, includeDrafts);
        return Response.ok(sessions.stream().map(this::toSummary).toList()).build();
    }

    @POST
    @Path("/sessions/{sessionId}/outline")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response updateOutline(
            @PathParam("sessionId") String sessionId, OutlineRequest request) {
        if (request.outlineText() == null) {
            throw new WebApplicationException(
                    "Outline text is required", Response.Status.BAD_REQUEST);
        }
        // Allow empty string to indicate "use AI-generated outline"
        String constraintsPayload = null;
        if (request.constraints() != null) {
            try {
                constraintsPayload = objectMapper.writeValueAsString(request.constraints());
            } catch (JsonProcessingException exc) {
                throw new WebApplicationException(
                        "Invalid constraints payload", exc, Response.Status.BAD_REQUEST);
            }
        }
        AiCreateSession session =
                sessionService.updateOutline(
                        sessionId,
                        request.outlineText(),
                        request.outlineFilename(),
                        constraintsPayload);
        return Response.ok(toResponse(session)).build();
    }

    @POST
    @Path("/sessions/{sessionId}/reprompt")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response reprompt(@PathParam("sessionId") String sessionId, RepromptRequest request) {
        if (request.prompt() == null || request.prompt().isBlank()) {
            throw new WebApplicationException("Prompt is required", Response.Status.BAD_REQUEST);
        }
        AiCreateSession session = sessionService.reprompt(sessionId, request.prompt());
        return Response.ok(toResponse(session)).build();
    }

    @POST
    @Path("/sessions/{sessionId}/draft")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response updateDraft(@PathParam("sessionId") String sessionId, DraftRequest request) {
        if (request.draftSections() == null) {
            throw new WebApplicationException(
                    "Draft sections are required", Response.Status.BAD_REQUEST);
        }
        // Allow empty list to indicate "use AI-generated sections"
        String payload;
        try {
            payload = objectMapper.writeValueAsString(request.draftSections());
        } catch (JsonProcessingException exc) {
            throw new WebApplicationException(
                    "Invalid draft sections payload", exc, Response.Status.BAD_REQUEST);
        }
        AiCreateSession session = sessionService.updateDraftSections(sessionId, payload);
        return Response.ok(toResponse(session)).build();
    }

    @POST
    @Path("/sessions/{sessionId}/template")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response updateTemplate(
            @PathParam("sessionId") String sessionId, TemplateRequest request) {
        if ((request.docType() == null || request.docType().isBlank())
                && (request.templateId() == null || request.templateId().isBlank())) {
            throw new WebApplicationException(
                    "docType or templateId is required", Response.Status.BAD_REQUEST);
        }
        AiCreateSession session =
                sessionService.updateTemplate(sessionId, request.docType(), request.templateId());
        return Response.ok(toResponse(session)).build();
    }

    @POST
    @Path("/sessions/{sessionId}/fields")
    public Response fillFields(
            @PathParam("sessionId") String sessionId, HttpServletRequest request) {
        sessionService.getSessionForCurrentUser(sessionId);
        log.info("AI create fillFields sessionId={}", sessionId);
        return proxy(
                "POST", "/api/create/sessions/" + sessionId + "/fields", request, false, false);
    }

    @GET
    @Path("/sessions/{sessionId}/stream")
    @Produces(MediaType.SERVER_SENT_EVENTS)
    public Response stream(@PathParam("sessionId") String sessionId, HttpServletRequest request) {
        sessionService.getSessionForCurrentUser(sessionId);
        return proxy(
                "GET",
                "/api/create/sessions/" + sessionId + "/stream",
                request,
                true,
                true); // Add credits header: frontend endpoint that triggers AI
    }

    private Response proxy(
            String method,
            String path,
            HttpServletRequest request,
            boolean acceptEventStream,
            boolean includeCreditsHeader) {
        try {
            HttpResponse<InputStream> response =
                    proxyService.forward(method, path, request, acceptEventStream);

            int statusCode = response.statusCode();
            if (statusCode < 100 || statusCode > 599) {
                statusCode = Response.Status.BAD_GATEWAY.getStatusCode();
            }

            StreamingOutput body =
                    outputStream -> {
                        try (InputStream inputStream = response.body()) {
                            inputStream.transferTo(outputStream);
                        }
                    };

            Response.ResponseBuilder builder = Response.status(statusCode).entity(body);
            boolean hasContentType = copyHeader(response, builder, "Content-Type");
            copyHeader(response, builder, "Cache-Control");
            copyHeader(response, builder, "X-Accel-Buffering");
            copyHeader(response, builder, "Content-Disposition");
            copyHeader(response, builder, "Content-Length");
            if (acceptEventStream && !hasContentType) {
                builder.header("Content-Type", MediaType.SERVER_SENT_EVENTS);
            }

            // Add credit headers if requested
            if (includeCreditsHeader) {
                addCreditHeaders(builder);
            }

            return builder.build();
        } catch (Exception exc) {
            log.error("AI create proxy failed path={}", path, exc);
            StreamingOutput body =
                    outputStream ->
                            outputStream.write("{\"error\":\"AI backend unavailable\"}".getBytes());
            return Response.status(Response.Status.SERVICE_UNAVAILABLE)
                    .entity(body)
                    .header("Content-Type", MediaType.APPLICATION_JSON)
                    .build();
        }
    }

    /** Copies a single header onto the response builder; returns true if a value was copied. */
    private boolean copyHeader(
            HttpResponse<?> response, Response.ResponseBuilder builder, String headerName) {
        Optional<String> value = response.headers().firstValue(headerName);
        if (value.isPresent()) {
            builder.header(headerName, value.get());
            return true;
        }
        return false;
    }

    /**
     * Add credit headers to the response builder.
     *
     * @param builder The response builder to add credit information to
     */
    private void addCreditHeaders(Response.ResponseBuilder builder) {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth == null || !auth.isAuthenticated()) {
                log.debug("[AI-CREATE] No authentication found, skipping credit header");
                return;
            }

            User user = AuthenticationUtils.getCurrentUser(auth, userRepository);
            int remainingCredits =
                    creditHeaderUtils.getRemainingCredits(user, creditService, teamCreditService);
            if (remainingCredits >= 0) {
                builder.header("X-Credits-Remaining", Integer.toString(remainingCredits));
                log.warn("[AI-CREATE] Added X-Credits-Remaining header: {}", remainingCredits);
            }
        } catch (Exception e) {
            log.error("[AI-CREATE] Failed to add credit header: {}", e.getMessage(), e);
        }
    }

    public record CreateSessionRequest(
            String prompt,
            String docType,
            String templateId,
            String templateTex,
            String previewTex) {}

    public record CreateSessionResponse(String sessionId) {}

    public record OutlineRequest(
            String outlineText, String outlineFilename, Map<String, Object> constraints) {}

    public record RepromptRequest(String prompt) {}

    public record DraftRequest(List<DraftSection> draftSections) {}

    public record DraftSection(String label, String value) {}

    public record TemplateRequest(String docType, String templateId) {}

    public record AiCreateSessionResponse(
            String sessionId,
            String userId,
            String docType,
            String templateId,
            String templateTex,
            String previewTex,
            String promptInitial,
            String promptLatest,
            String outlineText,
            String outlineFilename,
            boolean outlineApproved,
            Map<String, Object> outlineConstraints,
            List<DraftSection> draftSections,
            String polishedLatex,
            String pdfUrl,
            Instant createdAt,
            Instant updatedAt,
            String status) {}

    public record AiCreateSessionSummary(
            String sessionId,
            String docType,
            String templateId,
            String promptLatest,
            String promptInitial,
            String status,
            String pdfUrl,
            Instant createdAt,
            Instant updatedAt) {}

    private AiCreateSessionResponse toResponse(AiCreateSession session) {
        return new AiCreateSessionResponse(
                session.getSessionId(),
                session.getUserId(),
                session.getDocType(),
                session.getTemplateId(),
                session.getTemplateTex(),
                session.getPreviewTex(),
                session.getPromptInitial(),
                session.getPromptLatest(),
                session.getOutlineText(),
                session.getOutlineFilename(),
                session.isOutlineApproved(),
                parseOutlineConstraints(session.getOutlineConstraints()),
                parseDraftSections(session.getDraftSections()),
                session.getPolishedLatex(),
                session.getPdfUrl(),
                session.getCreatedAt(),
                session.getUpdatedAt(),
                session.getStatus() != null ? session.getStatus().name() : null);
    }

    private AiCreateSessionSummary toSummary(AiCreateSession session) {
        return new AiCreateSessionSummary(
                session.getSessionId(),
                session.getDocType(),
                session.getTemplateId(),
                session.getPromptLatest(),
                session.getPromptInitial(),
                session.getStatus() != null ? session.getStatus().name() : null,
                session.getPdfUrl(),
                session.getCreatedAt(),
                session.getUpdatedAt());
    }

    private AiCreateSessionSummary toSummary(
            AiCreateSessionRepository.AiCreateSessionSummaryProjection session) {
        return new AiCreateSessionSummary(
                session.getSessionId(),
                session.getDocType(),
                session.getTemplateId(),
                session.getPromptLatest(),
                session.getPromptInitial(),
                session.getStatus() != null ? session.getStatus().name() : null,
                session.getPdfUrl(),
                session.getCreatedAt(),
                session.getUpdatedAt());
    }

    private List<DraftSection> parseDraftSections(String payload) {
        if (payload == null || payload.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(
                    payload,
                    objectMapper
                            .getTypeFactory()
                            .constructCollectionType(List.class, DraftSection.class));
        } catch (JsonProcessingException exc) {
            log.warn("Failed to parse draft sections payload", exc);
            return null;
        }
    }

    private Map<String, Object> parseOutlineConstraints(String payload) {
        if (payload == null || payload.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(
                    payload,
                    objectMapper
                            .getTypeFactory()
                            .constructMapType(Map.class, String.class, Object.class));
        } catch (JsonProcessingException exc) {
            log.warn("Failed to parse outline constraints payload", exc);
            return null;
        }
    }
}
