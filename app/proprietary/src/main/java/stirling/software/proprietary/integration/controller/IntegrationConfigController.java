package stirling.software.proprietary.integration.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.integration.dto.IntegrationConfigRequest;
import stirling.software.proprietary.integration.dto.IntegrationConfigResponse;
import stirling.software.proprietary.integration.service.IntegrationConfigService;
import stirling.software.proprietary.security.model.User;

/** CRUD for S3/MCP/API integration configs. Secrets are never returned. */
@RestController
@RequestMapping("/api/v1/integrations")
@RequiredArgsConstructor
// Portal-exclusive: server-side portal-access boundary, not just isAuthenticated. Per-config
// ownership is still enforced in the service layer.
@PreAuthorize("@resourceAccess.canUsePortal()")
@Tag(name = "Integrations", description = "Manage S3/MCP/API integration configurations")
public class IntegrationConfigController {

    private final IntegrationConfigService service;

    @GetMapping
    public ResponseEntity<List<IntegrationConfigResponse>> list(
            @AuthenticationPrincipal User user) {
        requireUser(user);
        return ResponseEntity.ok(
                service.listVisible(user).stream().map(c -> service.toResponse(c, user)).toList());
    }

    @PostMapping
    public ResponseEntity<IntegrationConfigResponse> create(
            @RequestBody IntegrationConfigRequest request, @AuthenticationPrincipal User user) {
        requireUser(user);
        return ResponseEntity.ok(service.toResponse(service.create(request, user), user));
    }

    /**
     * What this caller may set up, so the UI offers the vendor presets and the free-form "custom
     * API" option only to those who can actually use them. The answer is computed here rather than
     * inferred client-side: hiding a button is presentation, and the service still refuses the call
     * regardless of what the client believed.
     */
    @GetMapping("/capabilities")
    public ResponseEntity<IntegrationCapabilitiesResponse> capabilities(
            @AuthenticationPrincipal User user) {
        requireUser(user);
        return ResponseEntity.ok(
                new IntegrationCapabilitiesResponse(service.canAuthorCustomApi(user)));
    }

    /**
     * @param customApi whether the caller may author a free-form API integration
     */
    public record IntegrationCapabilitiesResponse(boolean customApi) {}

    @GetMapping("/{id}")
    public ResponseEntity<IntegrationConfigResponse> get(
            @PathVariable Long id, @AuthenticationPrincipal User user) {
        requireUser(user);
        return ResponseEntity.ok(service.toResponse(service.getForUse(id, user), user));
    }

    @PutMapping("/{id}")
    public ResponseEntity<IntegrationConfigResponse> update(
            @PathVariable Long id,
            @RequestBody IntegrationConfigRequest request,
            @AuthenticationPrincipal User user) {
        requireUser(user);
        return ResponseEntity.ok(service.toResponse(service.update(id, request, user), user));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, @AuthenticationPrincipal User user) {
        requireUser(user);
        service.delete(id, user);
        return ResponseEntity.noContent().build();
    }

    private void requireUser(User user) {
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        }
    }
}
