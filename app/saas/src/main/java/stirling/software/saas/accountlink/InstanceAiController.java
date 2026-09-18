package stirling.software.saas.accountlink;

import java.io.IOException;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.accountlink.InstanceAiGatewayService.EngineReply;

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
public class InstanceAiController {

    private final InstanceAiGatewayService gateway;
    private final InstanceAiUsageService usageService;

    public InstanceAiController(
            InstanceAiGatewayService gateway, InstanceAiUsageService usageService) {
        this.gateway = gateway;
        this.usageService = usageService;
    }

    @GetMapping("/**")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public ResponseEntity<String> get(
            HttpServletRequest request,
            Authentication auth,
            @RequestHeader(value = "X-User-Id", required = false) String instanceUserId)
            throws IOException, InterruptedException {
        return proxy("GET", request, auth, instanceUserId, null);
    }

    @PostMapping("/**")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public ResponseEntity<String> post(
            HttpServletRequest request,
            Authentication auth,
            @RequestHeader(value = "X-User-Id", required = false) String instanceUserId,
            @RequestBody(required = false) String body)
            throws IOException, InterruptedException {
        return proxy("POST", request, auth, instanceUserId, body);
    }

    private ResponseEntity<String> proxy(
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

        String enginePath = enginePathOf(request);
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
