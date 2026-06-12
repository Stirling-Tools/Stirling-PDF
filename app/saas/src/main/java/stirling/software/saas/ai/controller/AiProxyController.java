package stirling.software.saas.ai.controller;

import java.io.InputStream;
import java.net.http.HttpResponse;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.StreamingOutput;

import io.quarkus.arc.profile.IfBuildProfile;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.security.Authentication;
import stirling.software.common.security.SecurityContextHolder;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.ai.service.AiProxyService;
import stirling.software.saas.service.CreditService;
import stirling.software.saas.service.TeamCreditService;
import stirling.software.saas.util.AuthenticationUtils;
import stirling.software.saas.util.CreditHeaderUtils;

@ApplicationScoped
@IfBuildProfile("saas")
@Path("/api/v1/ai")
@Tag(name = "AI")
@Hidden
@Slf4j
public class AiProxyController {

    private final AiProxyService aiProxyService;
    private final CreditService creditService;
    private final TeamCreditService teamCreditService;
    private final UserRepository userRepository;
    private final CreditHeaderUtils creditHeaderUtils;

    public AiProxyController(
            AiProxyService aiProxyService,
            CreditService creditService,
            TeamCreditService teamCreditService,
            UserRepository userRepository,
            CreditHeaderUtils creditHeaderUtils) {
        this.aiProxyService = aiProxyService;
        this.creditService = creditService;
        this.teamCreditService = teamCreditService;
        this.userRepository = userRepository;
        this.creditHeaderUtils = creditHeaderUtils;
    }

    @POST
    @Path("/generate_section")
    public Response generateSection(HttpServletRequest request) {
        return proxy("POST", "/api/generate_section", request, false, false);
    }

    @POST
    @Path("/generate_all_sections")
    public Response generateAllSections(HttpServletRequest request) {
        return proxy("POST", "/api/generate_all_sections", request, false, false);
    }

    @POST
    @Path("/intent/check")
    public Response intentCheck(HttpServletRequest request) {
        return proxy("POST", "/api/intent/check", request, false, false);
    }

    @POST
    @Path("/chat/route")
    public Response chatRoute(HttpServletRequest request) {
        return proxy("POST", "/api/chat/route", request, false, true);
    }

    @POST
    @Path("/chat/create-smart-folder")
    public Response createSmartFolder(HttpServletRequest request) {
        return proxy("POST", "/api/chat/create-smart-folder", request, false, true);
    }

    @POST
    @Path("/chat/info")
    public Response chatInfo(HttpServletRequest request) {
        return proxy("POST", "/api/chat/info", request, false, true);
    }

    @POST
    @Path("/pdf/answer")
    public Response pdfAnswer(HttpServletRequest request) {
        return proxy("POST", "/api/pdf/answer", request, false, false);
    }

    @POST
    @Path("/progressive_render")
    public Response progressiveRender(HttpServletRequest request) {
        return proxy("POST", "/api/progressive_render", request, false, false);
    }

    @GET
    @Path("/versions/{userId}")
    public Response versions(
            @PathParam("userId") String userId, HttpServletRequest request) {
        return proxy("GET", "/api/versions/" + userId, request, false, false);
    }

    @GET
    @Path("/style/{userId}")
    public Response style(@PathParam("userId") String userId, HttpServletRequest request) {
        return proxy("GET", "/api/style/" + userId, request, false, false);
    }

    @POST
    @Path("/style/{userId}")
    public Response updateStyle(
            @PathParam("userId") String userId, HttpServletRequest request) {
        return proxy("POST", "/api/style/" + userId, request, false, false);
    }

    @POST
    @Path("/import_template")
    public Response importTemplate(HttpServletRequest request) {
        return proxy("POST", "/api/import_template", request, false, false);
    }

    @POST
    @Path("/edit/sessions")
    public Response createEditSession(HttpServletRequest request) {
        return proxy("POST", "/api/edit/sessions", request, false, false);
    }

    @POST
    @Path("/edit/sessions/{sessionId}/messages")
    public Response editSessionMessage(
            @PathParam("sessionId") String sessionId, HttpServletRequest request) {
        return proxy("POST", "/api/edit/sessions/" + sessionId + "/messages", request, false, true);
    }

    @POST
    @Path("/edit/sessions/{sessionId}/attachments")
    public Response editSessionAttachment(
            @PathParam("sessionId") String sessionId, HttpServletRequest request) {
        return proxy(
                "POST", "/api/edit/sessions/" + sessionId + "/attachments", request, false, false);
    }

    @POST
    @Path("/edit/sessions/{sessionId}/run")
    @Produces(MediaType.SERVER_SENT_EVENTS)
    public Response runEditSession(
            @PathParam("sessionId") String sessionId, HttpServletRequest request) {
        return proxy("POST", "/api/edit/sessions/" + sessionId + "/run", request, true, false);
    }

    @GET
    @Path("/pdf-editor/document")
    public Response pdfEditorDocument(HttpServletRequest request) {
        return proxy("GET", "/api/pdf-editor/document", request, false, false);
    }

    @POST
    @Path("/pdf-editor/upload")
    public Response pdfEditorUpload(HttpServletRequest request) {
        return proxy("POST", "/api/pdf-editor/upload", request, false, false);
    }

    // TODO: Migration required - Spring's "/output/**" wildcard mapping has no direct JAX-RS
    // equivalent; using a {path:.*} regex template to capture the trailing path segments.
    @GET
    @Path("/output/{path:.*}")
    public Response output(HttpServletRequest request) {
        String requestUri = request.getRequestURI();
        String prefix = request.getContextPath() + "/api/v1/ai/output/";
        String path = requestUri.startsWith(prefix) ? requestUri.substring(prefix.length()) : "";
        return proxy("GET", "/output/" + path, request, false, false);
    }

    // Health endpoint at /api/v1/ai/health is owned by the proprietary AiEngineController; both
    // proxy to the same backing AI engine. No need for credit-aware wrapping on a health probe.

    /**
     * Proxy method that optionally adds credit headers.
     *
     * @param method HTTP method
     * @param path API path
     * @param request The incoming request
     * @param acceptEventStream Whether to accept event stream responses
     * @param includeCreditsHeader Whether to add credit balance header
     */
    private Response proxy(
            String method,
            String path,
            HttpServletRequest request,
            boolean acceptEventStream,
            boolean includeCreditsHeader) {
        try {
            // Forward to AI backend
            HttpResponse<InputStream> aiResponse =
                    aiProxyService.forward(method, path, request, acceptEventStream);

            int statusCode = aiResponse.statusCode();
            if (statusCode < 100 || statusCode > 599) {
                statusCode = Response.Status.BAD_GATEWAY.getStatusCode();
            }

            StreamingOutput body =
                    outputStream -> {
                        try (InputStream inputStream = aiResponse.body()) {
                            inputStream.transferTo(outputStream);
                        }
                    };

            Response.ResponseBuilder builder = Response.status(statusCode).entity(body);
            boolean hasContentType =
                    copyHeader(aiResponse, builder, "Content-Type");
            copyHeader(aiResponse, builder, "Cache-Control");
            copyHeader(aiResponse, builder, "X-Accel-Buffering");
            copyHeader(aiResponse, builder, "Content-Disposition");
            copyHeader(aiResponse, builder, "Content-Length");
            if (acceptEventStream && !hasContentType) {
                builder.header("Content-Type", MediaType.SERVER_SENT_EVENTS);
            }

            // Add credit headers if requested (after AI processing completes)
            if (includeCreditsHeader) {
                addCreditHeaders(builder);
            }

            return builder.build();
        } catch (Exception exc) {
            log.error("AI proxy failed path={}", path, exc);
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
        if (headerName == null || headerName.isBlank()) {
            return false;
        }
        Optional<String> value =
                response.headers()
                        .firstValue(headerName)
                        .filter(v -> v != null && !v.isBlank())
                        .filter(v -> !v.contains("\r") && !v.contains("\n"));
        if (value.isPresent()) {
            try {
                builder.header(headerName, value.get());
                return true;
            } catch (IllegalArgumentException exc) {
                log.warn("Skipping invalid header {}: {}", headerName, value.get());
            }
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
                log.debug("[AI-PROXY] No authentication found, skipping credit header");
                return;
            }

            User user = AuthenticationUtils.getCurrentUser(auth, userRepository);
            int remainingCredits =
                    creditHeaderUtils.getRemainingCredits(user, creditService, teamCreditService);
            if (remainingCredits >= 0) {
                builder.header("X-Credits-Remaining", Integer.toString(remainingCredits));
                log.warn("[AI-PROXY] Added X-Credits-Remaining header: {}", remainingCredits);
            }
            builder.header("X-Credit-Source", "AI_TOOL_CALL");
        } catch (Exception e) {
            log.error("[AI-PROXY] Failed to add credit header: {}", e.getMessage(), e);
        }
    }
}
