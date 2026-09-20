package stirling.software.saas.accountlink;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
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
import stirling.software.saas.accountlink.InstanceAiGatewayService.StreamedReply;
import stirling.software.saas.payg.cap.RequiresFeature;
import stirling.software.saas.payg.model.FeatureGate;

/**
 * The AI engine, as a linked self-hosted server sees it.
 *
 * <p>Mounted under {@code /api/v1/instance/**} deliberately: that is the only prefix the device
 * credential authenticates on, so this needs no change to the credential filter's scope and a
 * leaked device secret still cannot reach a user-facing route.
 *
 * <p>The instance sends the same engine paths it would send its own container, so nothing in the
 * proprietary AI code has to know which mode it is in beyond the base URL and the auth headers.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/instance/ai")
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
@Hidden
@Tag(name = "Instance AI")
// Puts a linked instance's cloud AI behind the same plan gate a SaaS user's AI sits behind, so a
// team without AI cannot reach it by linking a server. It gates without charging: the charge
// interceptor short-circuits on routes with no multipart input, which leaves InstanceAiUsageService
// the single meter and keeps one action from billing twice.
@RequiresFeature(FeatureGate.AI_SUPPORT)
public class InstanceAiController {

    private final InstanceAiGatewayService gateway;
    private final InstanceAiUsageService usageService;
    private final boolean sharingEnabled;

    @Autowired
    public InstanceAiController(
            InstanceAiGatewayService gateway,
            InstanceAiUsageService usageService,
            @Value("${stirling.cloud-ai.sharing-enabled:false}") boolean sharingEnabled) {
        this.gateway = gateway;
        this.usageService = usageService;
        this.sharingEnabled = sharingEnabled;
    }

    /** Sharing on, for tests and callers that are not wiring the property. */
    InstanceAiController(InstanceAiGatewayService gateway, InstanceAiUsageService usageService) {
        this(gateway, usageService, true);
    }

    /**
     * What a linked instance may ask without being forwarded anywhere: whether this deployment
     * shares its AI at all, and whether the engine behind it is answering.
     *
     * <p>Deliberately outside the sharing gate. An instance that is refused needs to be able to
     * tell "switched off here" from "cloud is down", and a gated status endpoint could say neither.
     */
    @GetMapping("/status")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public InstanceAiStatus status() {
        return new InstanceAiStatus(sharingEnabled, sharingEnabled && gateway.engineReachable());
    }

    /** Answer to {@code GET /api/v1/instance/ai/status}. */
    public record InstanceAiStatus(boolean sharingEnabled, boolean engineReachable) {}

    @GetMapping("/**")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public ResponseEntity<?> get(
            HttpServletRequest request,
            Authentication auth,
            @RequestHeader(value = "X-User-Id", required = false) String instanceUserId)
            throws IOException, InterruptedException {
        return proxy("GET", request, auth, instanceUserId, null);
    }

    @PostMapping("/**")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public ResponseEntity<?> post(
            HttpServletRequest request,
            Authentication auth,
            @RequestHeader(value = "X-User-Id", required = false) String instanceUserId,
            @RequestBody(required = false) String body)
            throws IOException, InterruptedException {
        return proxy("POST", request, auth, instanceUserId, body);
    }

    @DeleteMapping("/**")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public ResponseEntity<?> delete(
            HttpServletRequest request,
            Authentication auth,
            @RequestHeader(value = "X-User-Id", required = false) String instanceUserId)
            throws IOException, InterruptedException {
        return proxy("DELETE", request, auth, instanceUserId, null);
    }

    private ResponseEntity<?> proxy(
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
            // Not a fault: this deployment simply does not lend its engine out. Said plainly so
            // the instance's own settings page can show it rather than reporting the cloud down.
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body("Stirling Cloud AI sharing is not enabled on this deployment.");
        }

        String enginePath = enginePathOf(request);
        if (InstanceAiGatewayService.isStreaming(enginePath)) {
            return streamed(method, enginePath, body, token, instanceUserId);
        }
        EngineReply reply =
                gateway.forward(method, enginePath, body, token.getInstanceId(), instanceUserId);

        // Bill only work that succeeded, and only once the engine has actually done it.
        if (reply.status() < 400) {
            usageService.recordCall(token.getTeamId(), token.getInstanceId(), enginePath);
        }
        return ResponseEntity.status(reply.status())
                .contentType(MediaType.APPLICATION_JSON)
                .body(reply.body());
    }

    /**
     * Copies the engine's response through as it arrives. Billing happens up front here rather than
     * after the body: the status is known before the first frame, and holding the charge until the
     * stream closes would lose it whenever a client disconnects mid-run.
     */
    private ResponseEntity<?> streamed(
            String method,
            String enginePath,
            String body,
            LinkedInstanceAuthenticationToken token,
            String instanceUserId)
            throws IOException, InterruptedException {
        StreamedReply reply =
                gateway.forwardStreaming(
                        method, enginePath, body, token.getInstanceId(), instanceUserId);
        if (reply.status() < 400) {
            usageService.recordCall(token.getTeamId(), token.getInstanceId(), enginePath);
        }
        StreamingResponseBody stream =
                out -> {
                    try (var in = reply.body()) {
                        in.transferTo(out);
                        out.flush();
                    }
                };
        return ResponseEntity.status(reply.status())
                .contentType(MediaType.APPLICATION_NDJSON)
                .body(stream);
    }

    /** Strips this controller's own prefix, leaving the engine path the instance asked for. */
    private static String enginePathOf(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String context = request.getContextPath();
        String path =
                context != null && !context.isEmpty() && uri.startsWith(context)
                        ? uri.substring(context.length())
                        : uri;
        return path.substring("/api/v1/instance/ai".length());
    }
}
