package stirling.software.saas.ai.controller;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.quarkus.arc.profile.IfBuildProfile;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.ai.model.AiCreateSession;
import stirling.software.saas.ai.model.AiCreateSessionStatus;
import stirling.software.saas.ai.service.AiCreateSessionService;
import stirling.software.saas.payg.cap.RequiresFeature;
import stirling.software.saas.payg.model.FeatureGate;

@ApplicationScoped
@IfBuildProfile("saas")
@Path("/api/v1/ai/create/internal")
@Tag(name = "AI")
@Hidden
@RequiredArgsConstructor
@RequiresFeature(FeatureGate.AI_SUPPORT)
@Slf4j
public class AiCreateInternalController {

    private final AiCreateSessionService sessionService;
    // Inlined: Stirling's parent build uses Jackson 3 (tools.jackson), no Jackson 2 ObjectMapper
    // bean in the context. Stateless usage, so a fresh instance per controller is fine.
    private final ObjectMapper objectMapper = new ObjectMapper();

    @GET
    @Path("/sessions/{sessionId}")
    public Response getSession(@PathParam("sessionId") String sessionId) {
        log.info("AI create internal getSession sessionId={}", sessionId);
        AiCreateSession session = sessionService.getSession(sessionId);
        return Response.ok(toResponse(session)).build();
    }

    @POST
    @Path("/sessions/{sessionId}/update")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response updateSession(
            @PathParam("sessionId") String sessionId, UpdateSessionRequest request) {
        log.info("AI create internal updateSession sessionId={}", sessionId);
        String outlineConstraintsPayload = null;
        if (request.outlineConstraints() != null) {
            try {
                outlineConstraintsPayload =
                        objectMapper.writeValueAsString(request.outlineConstraints());
            } catch (JsonProcessingException exc) {
                throw new WebApplicationException(
                        "Invalid outline constraints payload", exc, Response.Status.BAD_REQUEST);
            }
        }
        String draftSectionsPayload = null;
        if (request.draftSections() != null) {
            try {
                draftSectionsPayload = objectMapper.writeValueAsString(request.draftSections());
            } catch (JsonProcessingException exc) {
                throw new WebApplicationException(
                        "Invalid draft sections payload", exc, Response.Status.BAD_REQUEST);
            }
        }
        AiCreateSession session =
                sessionService.applyInternalUpdate(
                        sessionId,
                        request.outlineText(),
                        request.outlineFilename(),
                        request.outlineApproved(),
                        outlineConstraintsPayload,
                        draftSectionsPayload,
                        request.polishedLatex(),
                        request.pdfUrl(),
                        request.docType(),
                        request.templateId(),
                        request.status());
        return Response.ok(toResponse(session)).build();
    }

    public record UpdateSessionRequest(
            String outlineText,
            String outlineFilename,
            Boolean outlineApproved,
            Map<String, Object> outlineConstraints,
            List<AiCreateController.DraftSection> draftSections,
            String polishedLatex,
            String pdfUrl,
            String docType,
            String templateId,
            AiCreateSessionStatus status) {}

    private AiCreateController.AiCreateSessionResponse toResponse(AiCreateSession session) {
        return new AiCreateController.AiCreateSessionResponse(
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

    private List<AiCreateController.DraftSection> parseDraftSections(String payload) {
        if (payload == null || payload.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(
                    payload,
                    objectMapper
                            .getTypeFactory()
                            .constructCollectionType(
                                    List.class, AiCreateController.DraftSection.class));
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
