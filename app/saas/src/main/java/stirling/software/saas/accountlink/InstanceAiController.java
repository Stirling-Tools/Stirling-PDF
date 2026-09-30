package stirling.software.saas.accountlink;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.accountlink.InstanceAiGatewayService.EngineReply;
import stirling.software.saas.payg.cap.RequiresFeature;
import stirling.software.saas.payg.model.FeatureGate;

/**
 * The AI engine as a linked self-hosted server sees it. Mounted under {@code /api/v1/instance}, the
 * only prefix the device credential authenticates on, so a leaked one reaches nothing user-facing.
 */
@Slf4j
@RestController
@RequestMapping(InstanceAiController.PREFIX)
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
@Hidden
@Tag(name = "Instance AI")
// Same plan gate as SaaS AI. The charge interceptor skips routes without multipart input, so
// InstanceAiUsageService stays the only meter.
@RequiresFeature(FeatureGate.AI_SUPPORT)
public class InstanceAiController {

    static final String PREFIX = "/api/v1/instance/ai";

    private final InstanceAiGatewayService gateway;
    private final InstanceAiUsageService usageService;
    private final boolean sharingEnabled;

    public InstanceAiController(
            InstanceAiGatewayService gateway,
            InstanceAiUsageService usageService,
            @Value("${stirling.cloud-ai.sharing-enabled:false}") boolean sharingEnabled) {
        this.gateway = gateway;
        this.usageService = usageService;
        this.sharingEnabled = sharingEnabled;
    }

    /** Answers even with sharing off, so an instance can tell switched off from down. */
    @GetMapping("/status")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public InstanceAiStatus status() {
        return new InstanceAiStatus(sharingEnabled, sharingEnabled && gateway.engineReachable());
    }

    public record InstanceAiStatus(boolean sharingEnabled, boolean engineReachable) {}

    @GetMapping("/**")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public ResponseEntity<StreamingResponseBody> get(
            HttpServletRequest request,
            Authentication auth,
            @RequestHeader(value = "X-User-Id", required = false) String instanceUserId)
            throws IOException, InterruptedException {
        return proxy("GET", request, auth, instanceUserId, null);
    }

    @PostMapping("/**")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public ResponseEntity<StreamingResponseBody> post(
            HttpServletRequest request,
            Authentication auth,
            @RequestHeader(value = "X-User-Id", required = false) String instanceUserId,
            @RequestBody(required = false) String body)
            throws IOException, InterruptedException {
        return proxy("POST", request, auth, instanceUserId, body);
    }

    @DeleteMapping("/**")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public ResponseEntity<StreamingResponseBody> delete(
            HttpServletRequest request,
            Authentication auth,
            @RequestHeader(value = "X-User-Id", required = false) String instanceUserId)
            throws IOException, InterruptedException {
        return proxy("DELETE", request, auth, instanceUserId, null);
    }

    // Declared as StreamingResponseBody because Spring picks the writer from the declared type;
    // behind ResponseEntity<?> a streamed reply fell through to the converters and answered 500.
    private ResponseEntity<StreamingResponseBody> proxy(
            String method,
            HttpServletRequest request,
            Authentication auth,
            String instanceUserId,
            String body)
            throws IOException, InterruptedException {
        if (!(auth instanceof LinkedInstanceAuthenticationToken token)) {
            // hasRole already guarantees this; never leak a non-instance principal into the owner.
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (!sharingEnabled) {
            byte[] message =
                    "Stirling Cloud AI sharing is not enabled on this deployment."
                            .getBytes(StandardCharsets.UTF_8);
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body(out -> out.write(message));
        }
        String enginePath = enginePathOf(request);
        EngineReply reply =
                gateway.forward(
                        method,
                        enginePath,
                        request.getQueryString(),
                        body,
                        token.getInstanceId(),
                        instanceUserId);
        // Billed on the status, before the body, so a client leaving mid-stream is still charged.
        if (reply.status() < 400) {
            recordCallQuietly(token, enginePath);
        }
        return ResponseEntity.status(reply.status())
                .header(HttpHeaders.CONTENT_TYPE, reply.contentType())
                .body(out -> copy(reply.body(), out));
    }

    // Flushed per chunk so orchestrator progress frames arrive as the engine emits them.
    private static void copy(InputStream in, OutputStream out) throws IOException {
        try (in) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                out.flush();
            }
        }
    }

    /** Never fails the call: the engine already did the work, so a lost row is a billing gap. */
    private void recordCallQuietly(LinkedInstanceAuthenticationToken token, String enginePath) {
        try {
            usageService.recordCall(token.getTeamId(), token.getInstanceId(), enginePath);
        } catch (RuntimeException e) {
            log.warn(
                    "Cloud AI usage not recorded for instance {} on {}",
                    token.getInstanceId(),
                    enginePath,
                    e);
        }
    }

    private static String enginePathOf(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String context = request.getContextPath();
        String path =
                context != null && !context.isEmpty() && uri.startsWith(context)
                        ? uri.substring(context.length())
                        : uri;
        return path.substring(PREFIX.length());
    }
}
