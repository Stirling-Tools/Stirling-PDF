package stirling.software.SPDF.controller.api.ai;

import java.io.InputStream;
import java.net.http.HttpResponse;
import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;

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

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.ai.AiProxyService;

@RestController
@RequestMapping("/api/v1/ai")
@Slf4j
public class AiProxyController {

    private final AiProxyService aiProxyService;

    public AiProxyController(AiProxyService aiProxyService) {
        this.aiProxyService = aiProxyService;
    }

    @PostMapping({"/generate", "/generate/generate"})
    public ResponseEntity<StreamingResponseBody> generate(HttpServletRequest request) {
        return proxy("POST", "/api/generate", request, false);
    }

    @PostMapping(
            value = {"/generate_stream", "/generate/generate_stream"},
            produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> generateStream(HttpServletRequest request) {
        return proxy("POST", "/api/generate_stream", request, true);
    }

    @PostMapping("/intent/check")
    public ResponseEntity<StreamingResponseBody> intentCheck(HttpServletRequest request) {
        return proxy("POST", "/api/intent/check", request, false);
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

    @PostMapping("/import_template")
    public ResponseEntity<StreamingResponseBody> importTemplate(HttpServletRequest request) {
        return proxy("POST", "/api/import_template", request, false);
    }

    @GetMapping("/pdf-editor/document")
    public ResponseEntity<StreamingResponseBody> pdfEditorDocument(HttpServletRequest request) {
        return proxy("GET", "/api/pdf-editor/document", request, false);
    }

    @PostMapping("/pdf-editor/upload")
    public ResponseEntity<StreamingResponseBody> pdfEditorUpload(HttpServletRequest request) {
        return proxy("POST", "/api/pdf-editor/upload", request, false);
    }

    @GetMapping("/output/{filename}")
    public ResponseEntity<StreamingResponseBody> output(
            @PathVariable("filename") String filename, HttpServletRequest request) {
        return proxy("GET", "/output/" + filename, request, false);
    }

    @GetMapping("/health")
    public ResponseEntity<StreamingResponseBody> health(HttpServletRequest request) {
        return proxy("GET", "/health", request, false);
    }

    private ResponseEntity<StreamingResponseBody> proxy(
            String method, String path, HttpServletRequest request, boolean acceptEventStream) {
        try {
            HttpResponse<InputStream> response =
                    aiProxyService.forward(method, path, request, acceptEventStream);
            HttpHeaders headers = new HttpHeaders();
            copyHeader(response, headers, HttpHeaders.CONTENT_TYPE);
            copyHeader(response, headers, HttpHeaders.CACHE_CONTROL);
            copyHeader(response, headers, "X-Accel-Buffering");
            copyHeader(response, headers, HttpHeaders.CONTENT_DISPOSITION);
            copyHeader(response, headers, HttpHeaders.CONTENT_LENGTH);
            if (acceptEventStream && !headers.containsKey(HttpHeaders.CONTENT_TYPE)) {
                headers.set(HttpHeaders.CONTENT_TYPE, MediaType.TEXT_EVENT_STREAM_VALUE);
            }

            StreamingResponseBody body =
                    outputStream -> {
                        try (InputStream inputStream = response.body()) {
                            inputStream.transferTo(outputStream);
                        }
                    };
            HttpStatus status =
                    Optional.ofNullable(HttpStatus.resolve(response.statusCode()))
                            .orElse(HttpStatus.BAD_GATEWAY);
            return new ResponseEntity<>(body, headers, status);
        } catch (Exception exc) {
            log.error("AI proxy failed path={}", path, exc);
            StreamingResponseBody body =
                    outputStream ->
                            outputStream.write(
                                    "{\"error\":\"AI backend unavailable\"}".getBytes());
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            return new ResponseEntity<>(body, headers, HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    private void copyHeader(
            HttpResponse<?> response, HttpHeaders headers, String headerName) {
        response.headers().firstValue(headerName).ifPresent(value -> headers.set(headerName, value));
    }
}
