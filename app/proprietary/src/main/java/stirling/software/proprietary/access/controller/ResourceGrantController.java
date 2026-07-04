package stirling.software.proprietary.access.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.access.model.AccessPermission;
import stirling.software.proprietary.access.model.PrincipalType;
import stirling.software.proprietary.access.model.ResourceGrant;
import stirling.software.proprietary.access.model.ResourceType;
import stirling.software.proprietary.access.service.ResourceAccessService;
import stirling.software.proprietary.security.model.User;

/** Admin endpoints to grant/revoke access to gated resources (the portal, integration configs). */
@RestController
@RequestMapping("/api/v1/admin/access")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@Tag(name = "Access Control", description = "Manage resource access grants (portal, integrations)")
public class ResourceGrantController {

    private final ResourceAccessService accessService;

    @GetMapping("/grants")
    public ResponseEntity<?> list(
            @RequestParam ResourceType resourceType,
            @RequestParam(required = false, defaultValue = "") String resourceId) {
        List<ResourceGrant> grants = accessService.listGrants(resourceType, resourceId);
        return ResponseEntity.ok(grants.stream().map(this::toDto).toList());
    }

    @PostMapping("/grants")
    public ResponseEntity<?> create(
            @RequestBody GrantRequest request, @AuthenticationPrincipal User admin) {
        if (request.resourceType() == null
                || request.principalType() == null
                || request.principalId() == null) {
            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "error",
                                    "resourceType, principalType and principalId are required"));
        }
        AccessPermission permission =
                request.permission() == null ? AccessPermission.USE : request.permission();
        // PORTAL is a singleton resource; its grants always target the whole type.
        String resourceId =
                request.resourceType() == ResourceType.PORTAL ? "" : request.resourceId();
        ResourceGrant grant =
                accessService.grant(
                        request.resourceType(),
                        resourceId,
                        request.principalType(),
                        request.principalId(),
                        permission,
                        admin);
        return ResponseEntity.ok(toDto(grant));
    }

    @DeleteMapping("/grants/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id) {
        accessService.revoke(id);
        return ResponseEntity.ok(Map.of("message", "Grant revoked"));
    }

    private Map<String, Object> toDto(ResourceGrant g) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", g.getId());
        m.put("resourceType", g.getResourceType());
        m.put("resourceId", g.getResourceId());
        m.put("principalType", g.getPrincipalType());
        m.put("principalId", g.getPrincipalId());
        m.put("permission", g.getPermission());
        m.put("createdAt", g.getCreatedAt());
        return m;
    }

    /** Request body for creating a grant. */
    public record GrantRequest(
            ResourceType resourceType,
            String resourceId,
            PrincipalType principalType,
            Long principalId,
            AccessPermission permission) {}
}
