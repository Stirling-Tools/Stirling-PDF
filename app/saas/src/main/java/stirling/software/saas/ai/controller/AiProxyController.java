package stirling.software.saas.ai.controller;

import java.io.InputStream;
import java.net.http.HttpResponse;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.ai.service.AiProxyService;
import stirling.software.saas.payg.cap.RequiresFeature;
import stirling.software.saas.payg.model.FeatureGate;

@RestController
@Profile("saas")
@RequestMapping("/api/v1/ai")
@RequiresFeature(FeatureGate.AI_SUPPORT)
@Tag(name = "AI")
@Hidden
@Slf4j
public class AiProxyController {

    private final AiProxyService aiProxyService;

    public AiProxyController(AiProxyService aiProxyService) {
        this.aiProxyService = aiProxyService;
    }

    @PostMapping("/generate_section")
    public ResponseEntity<StreamingResponseBody> generateSection(HttpServletRequest request) {
        return proxy("POST", "/api/generate_section", request, false);
    }

    @PostMapping("/generate_all_sections")
    public ResponseEntity<StreamingResponseBody> generateAllSections(HttpServletRequest request) {
        return proxy("POST", "/api/generate_all_sections", request, false);
    }

    @PostMapping("/intent/check")
    public ResponseEntity<StreamingResponseBody> intentCheck(HttpServletRequest request) {
        return proxy("POST", "/api/intent/check", request, false);
    }

    @PostMapping("/chat/route")
    public ResponseEntity<StreamingResponseBody> chatRoute(HttpServletRequest request) {
        return proxy("POST", "/api/chat/route", request, false);
    }

    @PostMapping("/chat/create-smart-folder")
    public ResponseEntity<StreamingResponseBody> createSmartFolder(HttpServletRequest request) {
        return proxy("POST", "/api/chat/create-smart-folder", request, false);
    }

    @PostMapping("/chat/info")
    public ResponseEntity<StreamingResponseBody> chatInfo(HttpServletRequest request) {
        return proxy("POST", "/api/chat/info", request, false);
    }

    @PostMapping("/pdf/answer")
    public ResponseEntity<StreamingResponseBody> pdfAnswer(HttpServletRequest request) {
        return proxy("POST", "/api/pdf/answer", request, false);
    }

    @PostMapping("/progressive_render")
    public ResponseEntity<StreamingResponseBody> progressiveRender(HttpServletRequest request) {
        return proxy("POST", "/api/progressive_render", request, false);
    }

    @GetMapping("/versions/{userId}")
    public ResponseEntity<StreamingResponseBody> versions(
            @PathVariable("userId") String userId, HttpServletRequest request) {
        return proxy("GET", "/api/versions/" + userId, request, false);
    }

    @GetMapping("/style/{userId}")
    public ResponseEntity<StreamingResponseBody> style(
            @PathVariable("userId") String userId, HttpServletRequest request) {
        return proxy("GET", "/api/style/" + userId, request, false);
    }

    @PostMapping("/style/{userId}")
    public ResponseEntity<StreamingResponseBody> updateStyle(
            @PathVariable("userId") String userId, HttpServletRequest request) {
        return proxy("POST", "/api/style/" + userId, request, false);
    }

    @PostMapping("/import_template")
    public ResponseEntity<StreamingResponseBody> importTemplate(HttpServletRequest request) {
        return proxy("POST", "/api/import_template", request, false);
    }

    @PostMapping("/edit/sessions")
    public ResponseEntity<StreamingResponseBody> createEditSession(HttpServletRequest request) {
        return proxy("POST", "/api/edit/sessions", request, false);
    }

    @PostMapping("/edit/sessions/{sessionId}/messages")
    public ResponseEntity<StreamingResponseBody> editSessionMessage(
            @PathVariable("sessionId") String sessionId, HttpServletRequest request) {
        return proxy("POST", "/api/edit/sessions/" + sessionId + "/messages", request, false);
    }

    @PostMapping("/edit/sessions/{sessionId}/attachments")
    public ResponseEntity<StreamingResponseBody> editSessionAttachment(
            @PathVariable("sessionId") String sessionId, HttpServletRequest request) {
        return proxy("POST", "/api/edit/sessions/" + sessionId + "/attachments", request, false);
    }

    @PostMapping(
            value = "/edit/sessions/{sessionId}/run",
            produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> runEditSession(
            @PathVariable("sessionId") String sessionId, HttpServletRequest request) {
        return proxy("POST", "/api/edit/sessions/" + sessionId + "/run", request, true);
    }

    @GetMapping("/pdf-editor/document")
    public ResponseEntity<StreamingResponseBody> pdfEditorDocument(HttpServletRequest request) {
        return proxy("GET", "/api/pdf-editor/document", request, false);
    }

    @PostMapping("/pdf-editor/upload")
    public ResponseEntity<StreamingResponseBody> pdfEditorUpload(HttpServletRequest request) {
        return proxy("POST", "/api/pdf-editor/upload", request, false);
    }

    @GetMapping("/output/**")
    public ResponseEntity<StreamingResponseBody> output(HttpServletRequest request) {
        String requestUri = request.getRequestURI();
        String prefix = request.getContextPath() + "/api/v1/ai/output/";
        String path = requestUri.startsWith(prefix) ? requestUri.substring(prefix.length()) : "";
        return proxy("GET", "/output/" + path, request, false);
    }

    // Health endpoint at /api/v1/ai/health is owned by the proprietary AiEngineController; both
    // proxy to the same backing AI engine. No need for credit-aware wrapping on a health probe.

    /**
     * Proxy method.
     *
     * @param method HTTP method
     * @param path API path
     * @param request The incoming request
     * @param acceptEventStream Whether to accept event stream responses
     */
    private ResponseEntity<StreamingResponseBody> proxy(
            String method, String path, HttpServletRequest request, boolean acceptEventStream) {
        try {
            // Forward to AI backend
            HttpResponse<InputStream> aiResponse =
                    aiProxyService.forward(method, path, request, acceptEventStream);

            // Build response headers
            HttpHeaders headers = new HttpHeaders();
            copyHeader(aiResponse, headers, HttpHeaders.CONTENT_TYPE);
            copyHeader(aiResponse, headers, HttpHeaders.CACHE_CONTROL);
            copyHeader(aiResponse, headers, "X-Accel-Buffering");
            copyHeader(aiResponse, headers, HttpHeaders.CONTENT_DISPOSITION);
            copyHeader(aiResponse, headers, HttpHeaders.CONTENT_LENGTH);
            if (acceptEventStream && !headers.containsHeader(HttpHeaders.CONTENT_TYPE)) {
                headers.set(HttpHeaders.CONTENT_TYPE, MediaType.TEXT_EVENT_STREAM_VALUE);
            }

            StreamingResponseBody body =
                    outputStream -> {
                        try (InputStream inputStream = aiResponse.body()) {
                            inputStream.transferTo(outputStream);
                        }
                    };
            HttpStatus status =
                    Optional.ofNullable(HttpStatus.resolve(aiResponse.statusCode()))
                            .orElse(HttpStatus.BAD_GATEWAY);
            return new ResponseEntity<>(body, headers, status);
        } catch (Exception exc) {
            log.error("AI proxy failed path={}", path, exc);
            StreamingResponseBody body =
                    outputStream ->
                            outputStream.write("{\"error\":\"AI backend unavailable\"}".getBytes());
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            return new ResponseEntity<>(body, headers, HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    private void copyHeader(HttpResponse<?> response, HttpHeaders headers, String headerName) {
        if (headerName == null || headerName.isBlank()) {
            return;
        }
        response.headers()
                .firstValue(headerName)
                .filter(value -> value != null && !value.isBlank())
                .filter(value -> !value.contains("\r") && !value.contains("\n"))
                .ifPresent(
                        value -> {
                            try {
                                headers.set(headerName, value);
                            } catch (IllegalArgumentException exc) {
                                log.warn("Skipping invalid header {}: {}", headerName, value);
                            }
                        });
    }
}
